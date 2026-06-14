#!/usr/bin/env bash
# Install a Windows Python inside the Wine prefix and pip-install MetaTrader5.
set -euo pipefail

WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
PYWIN_VER="${PYWIN_VER:-3.10.11}"
PYWIN_URL="https://www.python.org/ftp/python/${PYWIN_VER}/python-${PYWIN_VER}-amd64.exe"
export WINEPREFIX

TMP_EXE="$(mktemp --suffix=.exe)"
echo "    Downloading Windows Python ${PYWIN_VER}"
wget -q -O "$TMP_EXE" "$PYWIN_URL"
echo "    Installing Windows Python under Wine (silent)"
DISPLAY=:99 xvfb-run -a wine "$TMP_EXE" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 || true
rm -f "$TMP_EXE"

echo "    pip install MetaTrader5 (inside Wine python)"
DISPLAY=:99 xvfb-run -a wine python -m pip install --upgrade pip || true
DISPLAY=:99 xvfb-run -a wine python -m pip install MetaTrader5 || true
echo "    Wine python ready. Verify with:"
echo "      WINEPREFIX=$WINEPREFIX wine python -c \"import MetaTrader5; print(MetaTrader5.__version__)\""
