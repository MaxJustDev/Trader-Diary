#!/usr/bin/env bash
# Install + enable the systemd units (autostart on boot). Re-runnable.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
UNIT_SRC="$REPO_ROOT/deploy/linux/systemd"
UNIT_DST="/etc/systemd/system"

for unit in traderdiary-bridge.service traderdiary.service; do
    echo "==> Installing $unit"
    sed -e "s|__USER__|$USER_NAME|g" -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
        "$UNIT_SRC/$unit" | sudo tee "$UNIT_DST/$unit" >/dev/null
done

sudo systemctl daemon-reload
sudo systemctl enable --now traderdiary-bridge.service
sudo systemctl enable --now traderdiary.service

echo "Installed + started. Check: ./deploy/linux/status.sh"
