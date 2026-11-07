#!/usr/bin/env bash
# Starts the opencode headless server on port 8080 so the mobile app can connect.
# Runs automatically every time the Codespace starts (postStartCommand).
set -u

export PATH="$PATH:$(npm prefix -g 2>/dev/null)/bin:/usr/local/share/npm-global/bin"

# default password if the Codespace secret is missing
export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-nexus-opencode-change-me}"

LOG="/tmp/opencode-server.log"

pkill -f "opencode serve" 2>/dev/null || true
sleep 1

if ! command -v opencode >/dev/null 2>&1; then
  echo "[start-opencode] installing opencode..."
  npm install -g opencode-ai@latest >>"$LOG" 2>&1
fi

# 0.0.0.0 is required: GitHub's port forwarder reaches the server from the container network
nohup opencode serve --hostname 0.0.0.0 --port 8080 --print-logs >>"$LOG" 2>&1 &

for i in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://127.0.0.1:8080/config"; then
    echo "[start-opencode] opencode server is up on :8080 (password from OPENCODE_SERVER_PASSWORD)"
    exit 0
  fi
  sleep 1
done

echo "[start-opencode] server did not answer, see $LOG"
exit 1
