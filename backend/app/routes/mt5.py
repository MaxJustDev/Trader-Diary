from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db, SessionLocal
from app.models.accounts import Account
from app.models.equity_snapshot import EquitySnapshot
from app.services.mt5_service import MT5Service
from app.services.encryption import decrypt_password
from app.websocket import manager
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Global MT5 service instance
mt5_service = MT5Service()
connected_account_id = None

# How often to persist an equity snapshot (seconds)
SNAPSHOT_INTERVAL = 60


class ConnectRequest(BaseModel):
    account_id: int


class ClosePositionRequest(BaseModel):
    ticket: int


@router.post("/connect")
async def connect_mt5(request: ConnectRequest, db: Session = Depends(get_db)):
    """Connect to MT5 account. Shuts down any existing connection first."""
    global connected_account_id
    account_id = request.account_id

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        password = decrypt_password(account.password)
    except ValueError:
        raise HTTPException(status_code=500, detail="Failed to decrypt password")

    # Smart connect: only shutdown if switching to a different terminal
    new_path = account.mt5_path or mt5_service.default_exe_path()
    if mt5_service.is_initialized and mt5_service.current_path == new_path:
        logger.info("Same terminal path, skipping re-init — re-login only")
    elif mt5_service.is_initialized:
        logger.info("Different terminal path, full shutdown + re-init")
        mt5_service.shutdown()

    if mt5_service.login(int(account.account_id), password, account.server, path=account.mt5_path):
        connected_account_id = account_id
        info = mt5_service.get_account_info()

        # Update stored account data
        if info:
            account.mt5_name = info.get("name", "")
            account.balance = info.get("balance")
            account.equity = info.get("equity")
            account.profit = info.get("profit")
            db.commit()

        return {
            "success": True,
            "account_id": account.account_id,
            "info": info,
        }
    else:
        raise HTTPException(status_code=400, detail="Failed to connect to MT5")


@router.post("/disconnect")
async def disconnect_mt5():
    """Disconnect from current MT5 account with full shutdown."""
    global connected_account_id

    if not connected_account_id:
        return {"message": "No account connected"}

    mt5_service.shutdown()
    connected_account_id = None

    return {"message": "Disconnected successfully"}


@router.get("/status")
async def get_status():
    """Get MT5 connection status"""
    return {
        "connected": mt5_service.is_initialized,
        "account_id": connected_account_id,
    }


@router.post("/close-position")
async def close_position(request: ClosePositionRequest):
    """Close a single open position by ticket. Must be connected to MT5."""
    if not mt5_service.is_initialized or not connected_account_id:
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    result = mt5_service.close_position(request.ticket)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Close failed"))

    return result


@router.post("/close-all-positions")
async def close_all_positions():
    """Close all open positions on the connected MT5 account."""
    if not mt5_service.is_initialized or not connected_account_id:
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    positions = mt5_service.get_positions()
    if not positions:
        return {"closed": 0, "failed": 0, "results": []}

    results = []
    for pos in positions:
        res = mt5_service.close_position(pos["ticket"])
        results.append({"ticket": pos["ticket"], "symbol": pos["symbol"], **res})

    closed = sum(1 for r in results if r.get("success"))
    return {"closed": closed, "failed": len(results) - closed, "results": results}


@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time MT5 data streaming.
    - Persists equity snapshots every 60s.
    - Resets daily_open_equity at the start of each trading day.
    """
    await manager.connect(websocket)
    last_snapshot_time = 0.0

    try:
        while True:
            if mt5_service.is_initialized and connected_account_id:
                info = mt5_service.get_account_info()
                positions = mt5_service.get_positions()
                now = asyncio.get_event_loop().time()

                if info:
                    # Persist equity snapshot every SNAPSHOT_INTERVAL seconds
                    if (now - last_snapshot_time) >= SNAPSHOT_INTERVAL:
                        _save_snapshot(connected_account_id, info)
                        last_snapshot_time = now

                    # Reset daily baseline if trading day changed
                    _maybe_reset_daily_open(connected_account_id, info)

                data = {
                    "type": "update",
                    "connected_account_id": connected_account_id,
                    "account_info": info,
                    "positions": positions,
                    "timestamp": datetime.now().isoformat(),
                }

                await manager.send_personal_message(json.dumps(data), websocket)

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


def _save_snapshot(account_db_id: int, info: dict):
    """Persist an equity snapshot to the database."""
    try:
        db = SessionLocal()
        snapshot = EquitySnapshot(
            account_db_id=account_db_id,
            balance=info.get("balance", 0),
            equity=info.get("equity", 0),
            profit=info.get("profit"),
        )
        db.add(snapshot)
        db.commit()
    except Exception as e:
        logger.warning("Failed to save equity snapshot: %s", e)
    finally:
        db.close()


def _maybe_reset_daily_open(account_db_id: int, info: dict):
    """If it's a new trading day, update daily_open_equity on the account."""
    today = datetime.now().strftime("%Y-%m-%d")
    try:
        from app.models.accounts import Account
        db = SessionLocal()
        account = db.query(Account).filter(Account.id == account_db_id).first()
        if account and account.daily_open_date != today:
            account.daily_open_equity = info.get("equity", info.get("balance", 0))
            account.daily_open_date = today
            db.commit()
            logger.info("Daily open equity reset for account %s: %.2f", account_db_id, account.daily_open_equity)
    except Exception as e:
        logger.warning("Failed to reset daily open equity: %s", e)
    finally:
        db.close()
