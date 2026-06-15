# syntax=docker/dockerfile:1
#
# TraderDiary web layer (FastAPI API + PREBUILT Next.js static export) for Dokploy.
# The Dokploy host is low-RAM (the reason MAX_ACTIVE_ACCOUNTS=1); building Next.js
# there OOMs. So the frontend is built off-box and committed as frontend/out — this
# image just serves it. Rebuild with `cd frontend && npm run build` and recommit
# after frontend changes. See deploy/dokploy/README.md.
#
# MT5 runs under Wine on the host as a systemd bridge; this container talks to it
# over TCP (MT5_BRIDGE_HOST).

FROM python:3.10-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/backend \
    PIP_NO_CACHE_DIR=1 \
    TRADERDIARY_MT5_BACKEND=bridge \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8001

WORKDIR /app/backend

# MetaTrader5 is a Windows-only wheel and is NEVER imported in bridge mode
# (mt5_provider.use_bridge() is true on Linux). Strip it before install so the
# pip resolve doesn't fail on Linux.
COPY backend/requirements.txt ./requirements.txt
RUN grep -ivE '^[[:space:]]*MetaTrader5' requirements.txt > requirements.linux.txt \
 && pip install -r requirements.linux.txt

# Backend source
COPY backend/ ./

# Prebuilt frontend (committed) → the path app/main.py expects:
# <app dir>/../../frontend/out
COPY frontend/out /app/frontend/out

# SQLite DB + runtime files are CWD-relative (database.py get_base_dir()).
# Run from /data so a mounted volume persists the DB across redeploys.
RUN mkdir -p /data
WORKDIR /data

EXPOSE 8001

# index.html (static mount) proves the API process + frontend are both up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/',timeout=3).status==200 else 1)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
