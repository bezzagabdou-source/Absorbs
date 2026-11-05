#!/usr/bin/env bash
# =============================================================================
# OpenCode server launcher (GitHub Codespaces / local dev)
# -----------------------------------------------------------------------------
# Starts `opencode serve` on 0.0.0.0:$OPENCODE_PORT (default 4000) in the
# background, protects it with HTTP Basic auth, and waits for /global/health.
#
# Usage:
#   bash scripts/opencode/start-opencode.sh            # start (idempotent)
#   bash scripts/opencode/start-opencode.sh --restart  # stop + start
#   bash scripts/opencode/start-opencode.sh --stop     # stop
#   bash scripts/opencode/start-opencode.sh --status   # print status
#
# Auth:
#   - If OPENCODE_SERVER_PASSWORD is set, it is used (and persisted for the
#     Next.js proxy in .opencode/server-auth.json).
#   - Otherwise an existing .opencode/server-auth.json password is reused, or a
#     new random one is generated. The password is never printed.
#
# Files (all gitignored):
#   .opencode/opencode.pid
#   .opencode/server-auth.json   (chmod 600, read by the Next.js API proxy)
#   .opencode/logs/opencode.log
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${OPENCODE_PORT:-4000}"
HOST="${OPENCODE_HOST:-0.0.0.0}"
PROJECT_DIR="${OPENCODE_DIR:-$ROOT_DIR}"
RUN_DIR="${OPENCODE_RUN_DIR:-$ROOT_DIR/.opencode}"
LOG_DIR="${OPENCODE_LOG_DIR:-$RUN_DIR/logs}"
PID_FILE="${OPENCODE_PID_FILE:-$RUN_DIR/opencode.pid}"
AUTH_FILE="${OPENCODE_AUTH_FILE:-$RUN_DIR/server-auth.json}"
LOG_FILE="${OPENCODE_LOG_FILE:-$LOG_DIR/opencode.log}"
USERNAME="${OPENCODE_SERVER_USERNAME:-opencode}"
HEALTH_TIMEOUT="${OPENCODE_HEALTH_TIMEOUT:-45}"
HEALTH_URL="http://127.0.0.1:${PORT}/global/health"

mkdir -p "$LOG_DIR"

log() { printf '[opencode] %s\n' "$*"; }
err() { printf '[opencode] ERROR: %s\n' "$*" >&2; }

# -----------------------------------------------------------------------------
# Health probe. Echoes the HTTP status code (000 = no connection).
# arg1: "auth" to send basic auth, "noauth" to probe anonymously.
# -----------------------------------------------------------------------------
health_status() {
  local mode="${1:-auth}"
  local user=""
  local pass=""
  if [[ "$mode" == "auth" ]]; then
    user="$USERNAME"
    pass="$PASSWORD"
  fi
  USER="$user" PASS="$pass" URL="$HEALTH_URL" node -e '
    const headers = {};
    if (process.env.USER) {
      headers.Authorization = "Basic " + Buffer.from(process.env.USER + ":" + process.env.PASS).toString("base64");
    }
    fetch(process.env.URL, { headers, signal: AbortSignal.timeout(2500) })
      .then((r) => process.stdout.write(String(r.status)))
      .catch(() => process.stdout.write("000"));
  '
}

# -----------------------------------------------------------------------------
# Resolve the password (env > persisted file > generate).
# -----------------------------------------------------------------------------
resolve_password() {
  local env_password="${OPENCODE_SERVER_PASSWORD:-}"
  if [[ -n "$env_password" ]]; then
    printf '%s' "$env_password"
    return 0
  fi
  if [[ -f "$AUTH_FILE" ]]; then
    local stored
    stored="$(node -e '
      try {
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        if (j && typeof j.password === "string" && j.password.length > 0) process.stdout.write(j.password);
      } catch {}
    ' "$AUTH_FILE")"
    if [[ -n "$stored" ]]; then
      printf '%s' "$stored"
      return 0
    fi
  fi
  node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))'
}

persist_auth() {
  PORT="$PORT" USERNAME="$USERNAME" PASSWORD="$PASSWORD" AUTH_FILE="$AUTH_FILE" node -e '
    const fs = require("fs");
    const payload = {
      username: process.env.USERNAME,
      password: process.env.PASSWORD,
      port: Number(process.env.PORT),
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(require("path").dirname(process.env.AUTH_FILE), { recursive: true });
    fs.writeFileSync(process.env.AUTH_FILE, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
  '
  chmod 600 "$AUTH_FILE" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Stop the running server (PID file first, then a precise pkill fallback).
# -----------------------------------------------------------------------------
stop_server() {
  local pid=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "stopping pid $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "opencode serve --port ${PORT}" 2>/dev/null || true
  fi
  local i
  for i in $(seq 1 30); do
    if [[ "$(health_status noauth)" == "000" ]]; then
      return 0
    fi
    sleep 0.5
  done
  log "warning: port ${PORT} is still answering after stop"
}

# -----------------------------------------------------------------------------
# Start the server and wait until it is healthy.
# -----------------------------------------------------------------------------
start_server() {
  if ! command -v opencode >/dev/null 2>&1; then
    err "opencode is not installed. Run: npm install -g opencode-ai"
    return 1
  fi

  log "starting opencode serve on ${HOST}:${PORT} (project: ${PROJECT_DIR})"
  (
    cd "$PROJECT_DIR"
    export OPENCODE_SERVER_PASSWORD="$PASSWORD"
    export OPENCODE_SERVER_USERNAME="$USERNAME"
    nohup opencode serve --port "$PORT" --hostname "$HOST" --print-logs >> "$LOG_FILE" 2>&1 &
    printf '%s\n' "$!" > "$PID_FILE"
  )

  local i
  for i in $(seq 1 $((HEALTH_TIMEOUT * 2))); do
    local code
    code="$(health_status auth)"
    if [[ "$code" == "200" ]]; then
      log "server is healthy on http://127.0.0.1:${PORT}"
      log "auth: username '${USERNAME}' (password stored in ${AUTH_FILE})"
      log "log:  ${LOG_FILE}"
      return 0
    fi
    if [[ "$code" == "401" ]]; then
      err "server answered 401 — the persisted password does not match"
      return 1
    fi
    if [[ -f "$PID_FILE" ]] && ! kill -0 "$(cat "$PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
      err "server process exited during startup. Last log lines:"
      tail -n 25 "$LOG_FILE" >&2 || true
      return 1
    fi
    sleep 0.5
  done

  err "server did not become healthy within ${HEALTH_TIMEOUT}s. Last log lines:"
  tail -n 25 "$LOG_FILE" >&2 || true
  return 1
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
PASSWORD="$(resolve_password)"
persist_auth

ACTION="${1:-start}"

case "$ACTION" in
  start | --start)
    auth_code="$(health_status auth)"
    if [[ "$auth_code" == "200" ]]; then
      log "server already running and healthy on port ${PORT}"
      exit 0
    fi
    noauth_code="$(health_status noauth)"
    if [[ "$noauth_code" == "200" ]]; then
      log "server is running without auth — restarting with basic auth"
      stop_server
      start_server
      exit $?
    fi
    if [[ "$auth_code" == "401" || "$noauth_code" == "401" ]]; then
      err "a server is already running on port ${PORT} with a different password."
      err "run: bash scripts/opencode/start-opencode.sh --restart"
      exit 1
    fi
    start_server
    ;;
  restart | --restart)
    log "restarting server on port ${PORT}"
    stop_server
    start_server
    ;;
  stop | --stop)
    log "stopping server on port ${PORT}"
    stop_server
    ;;
  status | --status)
    if [[ "$(health_status auth)" == "200" ]]; then
      log "status: healthy (http://127.0.0.1:${PORT})"
      exit 0
    fi
    log "status: not reachable (http://127.0.0.1:${PORT})"
    exit 1
    ;;
  *)
    err "unknown action: $ACTION (use start | restart | stop | status)"
    exit 2
    ;;
esac
