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
LLM_STATE="unknown"   # llm=ok|fail from the self-test, published in the status
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

# the chat page must come back through the tunnel with the right title
site_ok() {
  [ -n "$URL" ] || return 1
  curl -s -m 25 "$URL/" 2>/dev/null | grep -q "Nexus Chat"
}

publish() {
  local verify="$1"
  [ -n "$URL" ] || return 1
  local host state desc web
  host="${URL#https://}"
  if site_ok; then web=ok; else web=down; fi
  # green only when the site and the API answer; the llm flag is informational
  if [ "$verify" = "200" ] && [ "$web" = "ok" ]; then state=success; else state=failure; fi
  desc="api=$verify web=$web llm=$LLM_STATE ${host}"
  # only touch the API when something actually changed
  [ "${LAST_DESC:-}" = "$desc" ] && return 0
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
      echo "| chat site | $web |"
      echo "| llm self-test | $LLM_STATE |"
      echo "| updated | $(date -u +%H:%M:%S) utc |"
    } > "$GITHUB_STEP_SUMMARY"
  fi
  LAST_PUBLISHED="$URL"
  LAST_STATE="$state"
  LAST_DESC="$desc"
}

# asks the runner side server for a real answer, prints "SELFTEST llm=ok|fail ..."
run_selftest() {
  local line
  line="$(SELFTEST_EXTRA_ROUND=1 timeout 330 node "$WS/scripts/opencode-selftest.mjs" --upstream "http://127.0.0.1:$upstream_port" --timeout 45 2>>"$OUT/selftest.log" | grep '^SELFTEST' | tail -1)"
  [ -n "$line" ] || line="SELFTEST llm=fail error=\"no output\""
  echo "$(date -u +%H:%M:%S) $line" | tee -a "$OUT/selftest.log"
  case "$line" in
    *llm=ok*)   LLM_STATE="ok" ;;
    *)          LLM_STATE="fail" ;;
  esac
  # full selftest line as its own status, so the reason travels with it
  local detail
  detail="$(printf '%s' "${line#SELFTEST }" | tr -cd 'A-Za-z0-9=._/: -' | cut -c1-135)"
  if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_SHA:-}" ]; then
    curl -sS -m 20 -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" \
      -d "{\"state\":\"$([ "$LLM_STATE" = ok ] && echo success || echo failure)\",\"context\":\"opencode/llm\",\"description\":\"$detail\"}" \
      -o /dev/null -w 'llm status api: %{http_code}\n' || true
  fi
}

# ---------------- provider credentials ----------------
# opencode enables a provider automatically when its API key is present in the env.
# The workflow forwards these from repository secrets, so nothing is baked in here.
provider_env() {
  local found=""
  for v in OPENROUTER_API_KEY GROQ_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY            DEEPSEEK_API_KEY XAI_API_KEY CEREBRAS_API_KEY TOGETHER_API_KEY; do
    if [ -n "${!v:-}" ]; then found="$found ${v%%_API_KEY}"; fi
  done
  if [ -n "$found" ]; then
    log "provider keys detected:$found"
  else
    log "no provider keys in env -> only keyless providers (opencode free tier) can answer"
  fi
}

# ---------------- boot ----------------
log "booting stack in $WS"
provider_env
start_upstream || { log "giving up"; exit 1; }
start_gateway  || { log "giving up"; exit 1; }
start_tunnel   || { log "tunnel down, will retry in the loop"; }

verify="000"
for _ in $(seq 1 10); do
  if public_ok; then verify="200"; break; fi
  sleep 5
done
publish "$verify"
run_selftest
publish "$verify"

# ---------------- supervise ----------------
fails=0
ticks=0
while true; do
  sleep 30
  ticks=$((ticks + 1))

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

  # re-prove the LLM path every ~10 minutes, and keep the status fresh
  if [ $((ticks % 20)) -eq 0 ]; then
    run_selftest
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
