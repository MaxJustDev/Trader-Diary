#!/usr/bin/env bash
# Start Xvfb, the Wine MT5 terminal, then the bridge server (foreground).
# Used by the traderdiary-bridge systemd service.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
DISPLAY_NUM="${DISPLAY:-:99}"
export WINEPREFIX DISPLAY="$DISPLAY_NUM"

# Load .env (MT5_BRIDGE_PORT etc.) if present.
if [ -f "$REPO_ROOT/backend/.env" ]; then
    set -a; . "$REPO_ROOT/backend/.env"; set +a
fi

echo "==> Starting Xvfb on $DISPLAY"
Xvfb "$DISPLAY" -screen 0 1024x768x16 &
XVFB_PID=$!
sleep 2

TERMINAL_EXE="$(find "$WINEPREFIX/drive_c" -name terminal64.exe 2>/dev/null | head -n1 || true)"
if [ -n "$TERMINAL_EXE" ]; then
    echo "==> Launching MT5 terminal under Wine: $TERMINAL_EXE"
    wine "$TERMINAL_EXE" /portable &
    sleep 8
else
    echo "WARN: terminal64.exe not found under $WINEPREFIX/drive_c — install MT5 first."
fi

cleanup() { kill "$XVFB_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Starting bridge server (wine python)"
exec wine python "$REPO_ROOT/deploy/linux/bridge_server.py"
