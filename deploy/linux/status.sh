#!/usr/bin/env bash
# Health check: services active? bridge reachable? app responding? Prints the
# LAN URL + a QR code so a phone can scan it.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -f "$REPO_ROOT/backend/.env" ]; then set -a; . "$REPO_ROOT/backend/.env"; set +a; fi
PORT="${SERVER_PORT:-8001}"
BRIDGE_PORT="${MT5_BRIDGE_PORT:-8765}"

echo "== systemd =="
systemctl is-active traderdiary-bridge.service && echo "bridge: active" || echo "bridge: NOT active"
systemctl is-active traderdiary.service && echo "app: active" || echo "app: NOT active"

echo "== bridge port $BRIDGE_PORT =="
if (exec 3<>"/dev/tcp/127.0.0.1/$BRIDGE_PORT") 2>/dev/null; then
    echo "bridge: reachable"
    exec 3>&- 3<&-
else
    echo "bridge: NOT reachable"
fi

echo "== app =="
if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 \
        && echo "app: responding" || echo "app: NOT responding"
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
URL="http://${LAN_IP:-127.0.0.1}:$PORT"
echo
echo "Open on phone or PC (same network):"
echo "  $URL"
if command -v qrencode >/dev/null 2>&1; then
    qrencode -t ANSIUTF8 "$URL"
fi
