"""Multi-process MT5 routes (Batch F Phase 2+).

Mounted at `/api/mt5/v2`. Coexists with the legacy `/api/mt5/*` endpoints in
`routes/mt5.py` for now. Will replace them after Phase 3 (frontend reshape).

Differences from v1:
- /connect/{account_db_id} — spawns a per-account worker process; multiple
  accounts can be active simultaneously.
- /disconnect/{account_db_id} — kills only that account's worker.
- /status — list of active workers, not single connected_account_id.
- /stream — WebSocket broadcasting events from ALL active workers, tagged
  with account_db_id.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.services.worker_pool import WorkerError, WorkerLimitReached, WorkerNotRunning, pool

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/connect/{account_db_id}")
async def connect(account_db_id: int):
    """Spawn a worker process for the given account if not already running."""
    try:
        await pool.spawn(account_db_id)
    except WorkerLimitReached as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception("spawn failed for account_db_id=%d", account_db_id)
        raise HTTPException(status_code=500, detail=f"spawn failed: {e}")

    # Best-effort confirmation: try a ping with a small timeout. Worker may
    # still be in MT5 bootstrap; return active=True regardless and surface
    # any bootstrap_failed via the WS stream.
    try:
        await pool.call(account_db_id, "ping", timeout=5.0)
        ready = True
    except (WorkerError, WorkerNotRunning, asyncio.TimeoutError):
        ready = False

    return {
        "account_db_id": account_db_id,
        "spawned": True,
        "ready": ready,
    }


@router.post("/disconnect/{account_db_id}")
async def disconnect(account_db_id: int):
    """Kill the worker process for the given account."""
    if not pool.is_active(account_db_id):
        return {"account_db_id": account_db_id, "active": False, "message": "not active"}
    await pool.kill(account_db_id)
    return {"account_db_id": account_db_id, "active": False}


@router.get("/status")
async def status():
    """List active worker account ids."""
    return {
        "active_account_ids": sorted(pool.active_account_ids()),
        "count": len(pool.active_account_ids()),
    }


@router.post("/call/{account_db_id}/{method}")
async def call_worker(account_db_id: int, method: str, params: dict | None = None):
    """Generic RPC bridge — useful for ad-hoc commands and debugging.

    For production trade execution, use the higher-level routes in
    `routes/trading.py` once they're migrated (Phase 4).
    """
    try:
        result = await pool.call(account_db_id, method, params or {}, timeout=10.0)
    except WorkerNotRunning:
        raise HTTPException(status_code=409, detail="worker not running")
    except WorkerError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="worker call timed out")
    return {"account_db_id": account_db_id, "method": method, "result": result}


@router.websocket("/stream")
async def stream(websocket: WebSocket):
    """Broadcast events from all worker processes to the connected client.

    Message format on the wire:
        {"account_db_id": <int>, "event": "tick" | "health", "data": {...}}
    """
    await websocket.accept()
    queue = await pool.subscribe()
    try:
        # Send an immediate snapshot of currently-active accounts.
        await websocket.send_text(json.dumps({
            "event": "status",
            "data": {"active_account_ids": sorted(pool.active_account_ids())},
        }))
        while True:
            account_db_id, event = await queue.get()
            payload = {"account_db_id": account_db_id, **event}
            await websocket.send_text(json.dumps(payload))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("v2 stream error: %s", e)
    finally:
        await pool.unsubscribe(queue)
