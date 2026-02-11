from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.accounts import Account
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


class ConnectRequest(BaseModel):
    account_id: int


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
        # Same terminal — just re-login (fast, ~50ms)
        logger.info("Same terminal path, skipping re-init — re-login only")
    elif mt5_service.is_initialized:
        # Different terminal — full shutdown required
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


@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time MT5 data streaming"""
    await manager.connect(websocket)

    try:
        while True:
            if mt5_service.is_initialized and connected_account_id:
                info = mt5_service.get_account_info()
                positions = mt5_service.get_positions()

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
