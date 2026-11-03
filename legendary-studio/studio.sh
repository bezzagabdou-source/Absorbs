#!/usr/bin/env bash
# Launch the browser studio on 0.0.0.0:8000 (preview-friendly).
set -euo pipefail
cd "$(dirname "$0")"
PY=".venv/bin/python"
if [ ! -x "$PY" ]; then echo "⚠️  نفّذ ./setup.sh أولاً"; exit 1; fi
exec "$PY" studio_server.py --host 0.0.0.0 --port "${PORT:-8000}"
