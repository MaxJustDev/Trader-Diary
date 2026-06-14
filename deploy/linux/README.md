# TraderDiary on a Linux server (Wine)

Run TraderDiary as an always-on local server. MT5 runs under Wine; you open the
UI from a phone or PC on the same network.

> **Hardware reality:** on a low-RAM box (e.g. ~1.5 GiB free) this runs **one
> active account at a time** — a Wine MT5 terminal is RAM-heavy. The cap is set
> by `MAX_ACTIVE_ACCOUNTS` (default 1 on Linux).

## Quick start

```bash
git clone <repo> && cd TraderDiary
./deploy/linux/setup.sh                       # Wine + MT5 + Python deps
cp deploy/linux/.env.linux.example backend/.env
#   edit backend/.env → set ENCRYPTION_KEY (see comment in the file)
./deploy/linux/install.sh                      # systemd autostart
./deploy/linux/status.sh                       # health + LAN URL + QR
```

Open the printed `http://<server-ip>:8001` (or scan the QR) on your phone.

## Pieces

| File | Role |
|------|------|
| `setup.sh` | Install Wine, MT5 (silent), Wine-python + MetaTrader5, Linux venv, frontend |
| `install-wine-python.sh` | Windows Python + `pip install MetaTrader5` inside Wine |
| `bridge_server.py` | Runs under Wine python; hosts MT5, answers JSON over TCP :8765 |
| `start-bridge.sh` | Xvfb + Wine MT5 terminal + bridge server |
| `start-app.sh` | FastAPI on `0.0.0.0:8001` |
| `systemd/*.service` | Autostart on boot, restart on crash, memory caps |
| `status.sh` | Health check + LAN URL + QR |

## How it works

```
phone/PC ─LAN─> FastAPI :8001 ─> WorkerPool ─> mt5_provider(BridgeClient)
                                                  └─TCP :8765─> bridge_server (Wine) ─> MetaTrader5
```

The same Python code runs on Windows with the native MetaTrader5 module; the
`mt5_provider` seam swaps in the bridge client only on Linux.

## Troubleshooting

- **`bridge: NOT reachable`** → MT5 not installed/running under Wine. Re-run the
  install step interactively (see `setup.sh` note) and confirm:
  `WINEPREFIX=/opt/traderdiary/wine wine python -c "import MetaTrader5; print('ok')"`.
- **Slow / OOM** → keep `LOW_RESOURCE_MODE=1`; trim the MT5 Market Watch to only
  symbols you trade; the bridge unit's `MemoryMax` will restart Wine if it leaks.
- **Can't reach from phone** → confirm `SERVER_HOST=0.0.0.0` and open port 8001
  in the firewall (`sudo ufw allow 8001`).
- **MT5 won't run on this CPU at all** → fallback: run MT5 + `bridge_server.py`
  on a cheap Windows box/VM and point `MT5_BRIDGE_HOST` at it; the Linux box
  then only serves the UI.

## Updating the frontend

Building Next.js on a weak Atom is slow. Build on a dev machine
(`cd frontend && npm run build`) and copy `frontend/out/` to the server.
