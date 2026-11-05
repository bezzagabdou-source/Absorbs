#!/usr/bin/env bash
# =============================================================================
# Next.js dashboard launcher (GitHub Codespaces / local dev)
# -----------------------------------------------------------------------------
# Starts the mobile-first OpenCode dashboard on 0.0.0.0:$DASHBOARD_PORT
# (default 3000) in the background and waits for /api/opencode/status.
#
# Usage:
#   bash scripts/opencode/start-dashboard.sh
#   DASHBOARD_MODE=start bash scripts/opencode/start-dashboard.sh   # prod build
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${DASHBOARD_PORT:-3000}"
HOST="${DASHBOARD_HOST:-0.0.0.0}"
MODE="${DASHBOARD_MODE:-dev}"
RUN_DIR="${OPENCODE_RUN_DIR:-$ROOT_DIR/.opencode}"
LOG_DIR="${OPENCODE_LOG_DIR:-$RUN_DIR/logs}"
PID_FILE="${OPENCODE_DASHBOARD_PID_FILE:-$RUN_DIR/dashboard.pid}"
LOG_FILE="${OPENCODE_DASHBOARD_LOG_FILE:-$LOG_DIR/dashboard.log}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/opencode/status"
READY_TIMEOUT="${DASHBOARD_READY_TIMEOUT:-120}"

mkdir -p "$LOG_DIR"
cd "$ROOT_DIR"

log() { printf '[dashboard] %s\n' "$*"; }
err() { printf '[dashboard] ERROR: %s\n' "$*" >&2; }

status_code() {
  node -e '
    fetch(process.argv[1], { signal: AbortSignal.timeout(2500) })
      .then((r) => process.stdout.write(String(r.status)))
      .catch(() => process.stdout.write("000"));
  ' "$HEALTH_URL"
}

if [[ "$(status_code)" == "200" ]]; then
  log "dashboard already running on http://127.0.0.1:${PORT}"
  exit 0
fi

if [[ "$MODE" == "start" ]]; then
  log "starting production dashboard (npm run start) on ${HOST}:${PORT}"
  nohup npm run start -- --port "$PORT" --hostname "$HOST" >> "$LOG_FILE" 2>&1 &
else
  log "starting dev dashboard (npm run dev) on ${HOST}:${PORT}"
  nohup npm run dev -- --port "$PORT" --hostname "$HOST" >> "$LOG_FILE" 2>&1 &
fi
printf '%s\n' "$!" > "$PID_FILE"

for _ in $(seq 1 $((READY_TIMEOUT * 2))); do
  if [[ "$(status_code)" == "200" ]]; then
    log "dashboard is ready on http://127.0.0.1:${PORT}"
    log "log: ${LOG_FILE}"
    exit 0
  fi
  if [[ -f "$PID_FILE" ]] && ! kill -0 "$(cat "$PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
    err "dashboard process exited during startup. Last log lines:"
    tail -n 30 "$LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 0.5
done

err "dashboard did not become ready within ${READY_TIMEOUT}s. Last log lines:"
tail -n 30 "$LOG_FILE" >&2 || true
exit 1
