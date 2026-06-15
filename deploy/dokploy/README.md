# TraderDiary on Dokploy (hybrid)

Dokploy runs Docker on Linux. The MT5 part is Windows-only and runs under Wine,
which does **not** containerize cleanly. So we split the app:

```
phone/PC ─> Dokploy container [FastAPI API + static frontend] ─TCP:8765─> HOST [systemd: Wine + MT5 + bridge_server.py]
```

- **Web layer** (this `Dockerfile` / `docker-compose.yml`) runs in Dokploy.
- **MT5 + Wine bridge** runs natively on the same host via the existing
  `deploy/linux/` scripts — just the *bridge* service, not the app service.

> **One account at a time.** The bridge hosts a single MT5 connection and
> serializes calls (`deploy/linux/bridge_server.py`). On this Linux/Wine path
> `MAX_ACTIVE_ACCOUNTS` is 1. True parallel multi-account needs Windows or
> multiple bridge instances (not built yet).

---

## Step 1 — Install Wine + MT5 + the bridge on the host

SSH into the Dokploy host and clone the repo (a path Dokploy is not managing,
e.g. `/opt/traderdiary-bridge`):

```bash
git clone <repo> /opt/traderdiary-bridge
cd /opt/traderdiary-bridge
./deploy/linux/setup.sh
```

`setup.sh` steps 1–4 install Wine, MT5 (silent), Wine-python, and the
`MetaTrader5` module inside Wine — that's all the bridge needs. Steps 5–6 build
a Linux venv + frontend for the *host-run* app, which the hybrid does **not**
use; if those steps error, ignore them (the bridge essentials already ran).

If the silent MT5 install didn't complete, run it once interactively as the
guide in `deploy/linux/README.md` shows, then confirm:

```bash
WINEPREFIX=/opt/traderdiary/wine wine python -c "import MetaTrader5; print('ok')"
```

### Bridge env + bind address

The container reaches the bridge over TCP, so the bridge must bind an interface
the container can see (not just `127.0.0.1`):

```bash
cp deploy/linux/.env.linux.example backend/.env
```

Edit `backend/.env`:

```ini
ENCRYPTION_KEY=<same key you will set in Dokploy>   # must match the container
MT5_BRIDGE_HOST=0.0.0.0                              # bind all interfaces
MT5_BRIDGE_PORT=8765
```

Install **only the bridge** systemd unit (not the app unit):

```bash
REPO=/opt/traderdiary-bridge
sed -e "s|__USER__|$USER|g" -e "s|__REPO_ROOT__|$REPO|g" \
    "$REPO/deploy/linux/systemd/traderdiary-bridge.service" \
  | sudo tee /etc/systemd/system/traderdiary-bridge.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now traderdiary-bridge.service
sudo systemctl status traderdiary-bridge.service --no-pager
```

### Lock down port 8765 (important)

Binding `0.0.0.0:8765` exposes MT5 control to your whole LAN — anyone who
reaches it can place trades. Restrict it to Docker containers only:

```bash
# Allow the Docker bridge subnet, deny everyone else.
sudo ufw allow from 172.16.0.0/12 to any port 8765 proto tcp
sudo ufw deny 8765/tcp
```

(Adjust the subnet if your Docker networks differ — check `docker network inspect bridge`.)

---

## Step 2 — Create the app in Dokploy

1. **Create → Compose** (Docker Compose), point it at this repo + branch.
   Compose path: `docker-compose.yml` (repo root).
2. **Environment tab** — paste the values from
   [`deploy/dokploy/.env.example`](./.env.example). At minimum set
   `ENCRYPTION_KEY` (the *same* key as the host `backend/.env`).
3. **Deploy.** Dokploy builds the image (frontend export + Python deps) and
   starts the `web` service.
4. **Access** — either keep the published `8001:8001` and open
   `http://<host-ip>:8001`, or add a **Domain** in Dokploy routing to container
   port `8001` (Traefik handles TLS + the WebSocket upgrade for `/api/mt5/stream`).

---

## Verify

```bash
# Bridge reachable from inside the web container:
docker exec -it <web-container> python -c \
  "import socket; s=socket.create_connection(('host.docker.internal',8765),3); print('bridge ok')"
```

Then open the UI, add an account, connect. If it connects and streams equity,
the chain (container → host bridge → Wine MT5) works.

---

## Gotchas

- **`ENCRYPTION_KEY` mismatch** between host `backend/.env` and Dokploy →
  saved passwords won't decrypt. Keep them identical.
- **`bridge ok` fails** → bridge not bound to `0.0.0.0`, ufw blocking the Docker
  subnet, or MT5 not running under Wine. Check `systemctl status
  traderdiary-bridge` and the troubleshooting in `deploy/linux/README.md`.
- **DB persistence** → lives in the `traderdiary_data` volume. Use the in-app
  Backup/Restore (analytics header) or `docker volume` for backups.
- **Updating the frontend** is automatic here (rebuilt in the image on each
  Dokploy deploy) — unlike the pure-systemd path.
```
