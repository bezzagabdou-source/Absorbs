#!/usr/bin/env bash
# opencode-supervisor.sh
#
# Runs the whole stack for the OpenCode Mobile app on a GitHub runner:
#   opencode server (127.0.0.1:8081)  ->  CORS/SSE gateway (0.0.0.0:8080)  ->  cloudflare quick tunnel
#
# Every 30s it health-checks all three and heals whatever died. When the tunnel is
# replaced it publishes the new public host as a commit status (`opencode/url`) so the
# endpoint is always discoverable through the GitHub API.
#
# env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID (all provided by Actions)
set -u

WS="${GITHUB_WORKSPACE:-$(pwd)}"
OUT=/tmp/tunnel
mkdir -p "$OUT"
touch "$OUT/cf.log" "$OUT/oc.log" "$OUT/gw.log"

upstream_port=8081
gateway_port=8080
URL=""
LAST_PUBLISHED=""

log() { echo "$(date -u +%H:%M:%S) $*"; }

start_upstream() {
  pkill -f "opencode serve --hostname 127.0.0.1 --port $upstream_port" 2>/dev/null || true
  sleep 1
  opencode serve --hostname 127.0.0.1 --port "$upstream_port" --print-logs >>"$OUT/oc.log" 2>&1 &
  for _ in $(seq 1 40); do
    if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$upstream_port/config"; then
      log "upstream ready on :$upstream_port"
      return 0
    fi
    sleep 1
  done
  log "upstream FAILED to start"; return 1
}

start_gateway() {
  pkill -f "opencode-gateway.mjs" 2>/dev/null || true
  sleep 1
  node "$WS/scripts/opencode-gateway.mjs" \
    --listen "0.0.0.0:$gateway_port" --upstream "127.0.0.1:$upstream_port" >>"$OUT/gw.log" 2>&1 &
  for _ in $(seq 1 20); do
    if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$gateway_port/config"; then
      log "gateway ready on :$gateway_port"
      return 0
    fi
    sleep 1
  done
  log "gateway FAILED to start"; return 1
}

start_tunnel() {
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 1
  : > "$OUT/cf.log"
  cloudflared tunnel --url "http://127.0.0.1:$gateway_port" \
    --no-autoupdate --protocol http2 --loglevel info >>"$OUT/cf.log" 2>&1 &
  URL=""
  for _ in $(seq 1 40); do
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$OUT/cf.log" | head -1 || true)"
    [ -n "$URL" ] && break
    sleep 2
  done
  if [ -z "$URL" ]; then
    log "tunnel FAILED to get a hostname"; tail -15 "$OUT/cf.log"; return 1
  fi
  log "tunnel ready: $URL"
  return 0
}

public_ok() {
  [ -n "$URL" ] || return 1
  local code
  code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL/config" || true)"
  [ "$code" = "200" ]
}

publish() {
  local verify="$1"
  [ -n "$URL" ] || return 1
  [ "$URL" = "$LAST_PUBLISHED" ] && [ "$verify" = "200" ] && return 0
  local host state desc
  host="${URL#https://}"
  if [ "$verify" = "200" ]; then state=success; else state=failure; fi
  desc="$host http=$verify"
  printf 'URL=%s\nHTTP=%s\n' "$URL" "$verify" > "$OUT/connect.txt"
  log "publishing $desc"
  if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_SHA:-}" ]; then
    curl -sS -m 20 -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" \
      -d "{\"state\":\"$state\",\"context\":\"opencode/url\",\"description\":\"$desc\",\"target_url\":\"$URL\"}" \
      -o /dev/null -w 'status api: %{http_code}\n' || true
  fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### OpenCode server"
      echo ""
      echo "| field | value |"
      echo "|---|---|"
      echo "| URL | \`$URL\` |"
      echo "| Password | (none) |"
      echo "| public /config | $verify |"
      echo "| updated | $(date -u +%H:%M:%S) utc |"
    } > "$GITHUB_STEP_SUMMARY"
  fi
  LAST_PUBLISHED="$URL"
}

# ---------------- boot ----------------
log "booting stack in $WS"
start_upstream || { log "giving up"; exit 1; }
start_gateway  || { log "giving up"; exit 1; }
start_tunnel   || { log "tunnel down, will retry in the loop"; }

verify="000"
for _ in $(seq 1 10); do
  if public_ok; then verify="200"; break; fi
  sleep 5
done
publish "$verify"

# ---------------- supervise ----------------
fails=0
while true; do
  sleep 30

  if ! curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$upstream_port/config"; then
    log "upstream unhealthy -> restart"
    start_upstream || true
    start_gateway || true
  elif ! curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$gateway_port/config"; then
    log "gateway unhealthy -> restart"
    start_gateway || true
  fi

  if ! pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    log "cloudflared process gone -> new tunnel"
    start_tunnel && { verify="000"; for _ in $(seq 1 10); do public_ok && { verify="200"; break; }; sleep 5; done; publish "$verify"; }
    continue
  fi

  if public_ok; then
    fails=0
    publish 200
  else
    fails=$((fails + 1))
    log "public check failed ($fails/3)"
    if [ "$fails" -ge 3 ]; then
      log "tunnel looks dead -> replacing it"
      verify="000"
      if start_tunnel; then
        for _ in $(seq 1 10); do public_ok && { verify="200"; break; }; sleep 5; done
      fi
      publish "$verify"
      fails=0
    fi
  fi
done
