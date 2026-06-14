#!/usr/bin/env bash
# TraderDiary Linux setup — installs Wine + MT5 + Python deps for the Atom box.
# Idempotent: safe to re-run. Run as a normal user with sudo available.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
WINEARCH="${WINEARCH:-win64}"
MT5_SETUP_URL="${MT5_SETUP_URL:-https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe}"
export WINEPREFIX WINEARCH

echo "==> [1/6] APT packages (wine, xvfb, python venv, qrencode)"
sudo dpkg --add-architecture i386 || true
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    wine wine64 wine32 winbind xvfb xauth \
    python3 python3-venv python3-pip \
    qrencode wget ca-certificates

echo "==> [2/6] Wine prefix at $WINEPREFIX"
sudo mkdir -p "$WINEPREFIX"
sudo chown "$USER":"$USER" "$(dirname "$WINEPREFIX")" "$WINEPREFIX"
# Headless prefix init.
DISPLAY=:99 xvfb-run -a wineboot --init || true

echo "==> [3/6] Download + silent-install MT5 under Wine"
TMP_EXE="$(mktemp --suffix=.exe)"
wget -q -O "$TMP_EXE" "$MT5_SETUP_URL"
# /auto runs the MetaTrader installer unattended.
DISPLAY=:99 xvfb-run -a wine "$TMP_EXE" /auto || true
rm -f "$TMP_EXE"
echo "    NOTE: if the silent install did not complete, run once interactively:"
echo "      WINEPREFIX=$WINEPREFIX DISPLAY=:99 xvfb-run -a wine \"$TMP_EXE\""

echo "==> [4/6] Windows Python + MetaTrader5 inside Wine"
"$REPO_ROOT/deploy/linux/install-wine-python.sh"

echo "==> [5/6] Linux venv + backend deps"
cd "$REPO_ROOT/backend"
python3 -m venv venv
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "==> [6/6] Frontend static export"
if [ -d "$REPO_ROOT/frontend/out" ]; then
    echo "    frontend/out already present — skipping build."
    echo "    (Build on a dev machine and copy frontend/out here to avoid"
    echo "     compiling on the Atom.)"
elif command -v npm >/dev/null 2>&1; then
    cd "$REPO_ROOT/frontend"
    npm install
    npm run build
else
    echo "    npm not found and frontend/out missing."
    echo "    Build frontend/out on a dev machine and copy it here."
fi

echo
echo "Setup complete. Next:"
echo "  1. cp deploy/linux/.env.linux.example backend/.env  && edit ENCRYPTION_KEY"
echo "  2. ./deploy/linux/install.sh   # install + enable systemd services"
echo "  3. ./deploy/linux/status.sh    # health + LAN URL/QR"
