#!/usr/bin/env bash
# Start the FastAPI app bound to the LAN. Used by the traderdiary systemd unit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT/backend"
. venv/bin/activate

if [ -f .env ]; then set -a; . .env; set +a; fi
HOST="${SERVER_HOST:-0.0.0.0}"
PORT="${SERVER_PORT:-8001}"

echo "==> TraderDiary API on $HOST:$PORT"
exec python -m uvicorn app.main:app --host "$HOST" --port "$PORT" --workers 1
