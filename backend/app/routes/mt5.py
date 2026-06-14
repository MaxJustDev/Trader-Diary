from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.accounts import Account
from app.models.funds import FundProgram
from app.services.mt5_auth import login_account
from app.services.mt5_singleton import (
    mt5_service,
    get_connected_account_id,
    set_connected_account_id,
)
from app.websocket import manager
import asyncio
import json
import logging
from app.utils.async_helpers import run_mt5, run_db
from app.services.mt5_provider import mt5 as _mt5

logger = logging.getLogger(__name__)

router = APIRouter()

from app.config import (
    SNAPSHOT_INTERVAL_SECONDS,
    TRAIL_CHECK_INTERVAL_SECONDS,
    WS_TICK_INTERVAL_SECONDS,
    WS_RECONNECT_FAILURE_THRESHOLD,
)

from app.services.mt5_streaming import (
    TRAILING_STOPS,
    save_snapshot,
    maybe_reset_daily_open,
    check_trailing_stops,
    attempt_reconnect,
)


class ConnectRequest(BaseModel):
    account_id: int


class ClosePositionRequest(BaseModel):
    ticket: int


class ModifyPositionRequest(BaseModel):
    ticket: int
    sl: float
    tp: float


class PartialCloseRequest(BaseModel):
    ticket: int
    volume: float


class TrailingStopRequest(BaseModel):
    ticket: int
    trail_pips: float


@router.post("/connect")
async def connect_mt5(request: ConnectRequest, db: Session = Depends(get_db)):
    """Connect to MT5 account. Shuts down any existing connection first."""
    account_id = request.account_id

    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Smart connect: only shutdown if switching to a different terminal
    new_path = account.mt5_path or mt5_service.default_exe_path()
    needs_shutdown = mt5_service.is_initialized and mt5_service.current_path != new_path
    same_terminal = mt5_service.is_initialized and mt5_service.current_path == new_path

    def _sync_connect():
        if needs_shutdown:
            logger.info("Different terminal path, full shutdown + re-init")
            mt5_service.shutdown()
        elif same_terminal:
            logger.info("Same terminal path, skipping re-init — re-login only")
        success = login_account(account, mt5_service)
        if not success:
            return None
        return mt5_service.get_account_info()

    info = await run_mt5(_sync_connect)
    if info is None:
        raise HTTPException(status_code=400, detail="Failed to connect to MT5")

    set_connected_account_id(account_id)

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


@router.post("/disconnect")
async def disconnect_mt5():
    """Disconnect from current MT5 account with full shutdown."""
    if not get_connected_account_id():
        return {"message": "No account connected"}

    await run_mt5(mt5_service.shutdown)
    set_connected_account_id(None)

    return {"message": "Disconnected successfully"}


@router.get("/status")
async def get_status():
    """Get MT5 connection status"""
    return {
        "connected": mt5_service.is_initialized,
        "account_id": get_connected_account_id(),
    }


@router.post("/close-position")
async def close_position(request: ClosePositionRequest):
    """Close a single open position by ticket. Must be connected to MT5."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    result = await run_mt5(mt5_service.close_position, request.ticket)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Close failed"))

    return result


@router.post("/modify-position")
async def modify_position(request: ModifyPositionRequest):
    """Modify SL/TP on an existing open position."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    result = await run_mt5(mt5_service.modify_position, request.ticket, request.sl, request.tp)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Modify failed"))

    return result


@router.post("/partial-close")
async def partial_close(request: PartialCloseRequest):
    """Close a partial volume of an open position."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    result = await run_mt5(mt5_service.partial_close, request.ticket, request.volume)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Partial close failed"))

    return result


@router.post("/trailing-stop/set")
async def set_trailing_stop(request: TrailingStopRequest):
    """Activate a trailing stop for an open position (in-memory, checked every 5s on stream)."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    def _sync_set_trail():
        positions = mt5_service.get_positions()
        pos = next((p for p in positions if p["ticket"] == request.ticket), None)
        if not pos:
            return None
        info = _mt5.symbol_info(pos["symbol"])
        digits = info.digits if info else 5
        pip_size = 10 ** (-digits) * (10 if digits in (3, 5) else 1)
        TRAILING_STOPS[request.ticket] = {
            "trail_pips": request.trail_pips,
            "symbol": pos["symbol"],
            "type": pos["type"],
            "digits": digits,
            "pip_size": pip_size,
            "best_price": pos["price_open"],
        }
        return True

    found = await run_mt5(_sync_set_trail)
    if not found:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"ticket": request.ticket, "trail_pips": request.trail_pips, "active": True}


@router.delete("/trailing-stop/{ticket}")
async def remove_trailing_stop(ticket: int):
    """Remove a trailing stop."""
    TRAILING_STOPS.pop(ticket, None)
    return {"ticket": ticket, "active": False}


@router.get("/trailing-stop/list")
async def list_trailing_stops():
    """List all active trailing stops."""
    return [{"ticket": k, **v} for k, v in TRAILING_STOPS.items()]


@router.get("/risk-status")
async def get_risk_status(db: Session = Depends(get_db)):
    """Live drawdown status for the connected account (uses live MT5 equity)."""
    if not get_connected_account_id() or not mt5_service.is_initialized:
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    account = (
        db.query(Account)
        .filter(Account.id == get_connected_account_id())
        .options(joinedload(Account.fund_program).joinedload(FundProgram.phase_rules))
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    info = await run_mt5(mt5_service.get_account_info)
    equity = info.get("equity", 0) if info else (account.equity or 0)
    balance = info.get("balance", 0) if info else (account.balance or 0)

    starting_balance = account.starting_balance or balance
    daily_starting = account.daily_open_equity or balance

    daily_loss = max(0.0, daily_starting - equity)
    daily_loss_pct = round((daily_loss / daily_starting * 100) if daily_starting > 0 else 0, 2)

    max_loss = max(0.0, starting_balance - equity)
    max_loss_pct = round((max_loss / starting_balance * 100) if starting_balance > 0 else 0, 2)

    daily_dd_limit = 0.0
    max_dd_limit = 0.0
    if account.fund_program and account.current_phase:
        phase_rule = next(
            (r for r in account.fund_program.phase_rules if r.phase_name == account.current_phase),
            None,
        )
        if phase_rule:
            daily_dd_limit = phase_rule.daily_drawdown
            max_dd_limit = phase_rule.max_drawdown

    return {
        "equity": equity,
        "balance": balance,
        "starting_balance": starting_balance,
        "daily_starting": daily_starting,
        "daily_loss_pct": daily_loss_pct,
        "daily_dd_limit": daily_dd_limit,
        "max_loss_pct": max_loss_pct,
        "max_dd_limit": max_dd_limit,
    }


@router.get("/symbols")
async def search_symbols(search: str = ""):
    """Search available MT5 symbols. Requires an active connection."""
    if not mt5_service.is_initialized:
        raise HTTPException(status_code=400, detail="MT5 not connected")

    symbols = await run_mt5(_mt5.symbols_get, search) if search else await run_mt5(_mt5.symbols_get)
    if not symbols:
        return []
    return [s.name for s in symbols[:60]]


@router.get("/history")
async def get_mt5_history(days: int = 30):
    """Pull closed deals directly from MT5 terminal for the last N days."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    from datetime import timedelta
    date_from = datetime.now() - timedelta(days=days)
    deals = await run_mt5(_mt5.history_deals_get, date_from, datetime.now())
    if deals is None:
        return []

    result = []
    for d in deals:
        # Only include actual buy/sell deals, not balance/credit/bonus ops
        if d.type not in (_mt5.DEAL_TYPE_BUY, _mt5.DEAL_TYPE_SELL):
            continue
        result.append({
            "ticket": d.ticket,
            "order": d.order,
            "time": datetime.fromtimestamp(d.time).isoformat(),
            "symbol": d.symbol,
            "type": "BUY" if d.type == _mt5.DEAL_TYPE_BUY else "SELL",
            "volume": d.volume,
            "price": d.price,
            "sl": d.sl,
            "tp": d.tp,
            "profit": d.profit,
            "commission": d.commission,
            "swap": d.swap,
            "comment": d.comment,
        })
    return result


@router.get("/server-time")
async def get_server_time():
    """Get broker server time vs local time."""
    if not mt5_service.is_initialized:
        raise HTTPException(status_code=400, detail="MT5 not connected")

    def _sync_probe():
        probe_symbols = []
        if mt5_service._server_time_symbol:
            probe_symbols.append(mt5_service._server_time_symbol)
        for sym in ("EURUSD", "GBPUSD", "USDJPY", "XAUUSD"):
            if sym not in probe_symbols:
                probe_symbols.append(sym)
        for sym in probe_symbols:
            tick = _mt5.symbol_info_tick(sym)
            if tick:
                mt5_service._server_time_symbol = sym
                server_ts = tick.time
                local_ts = int(datetime.utcnow().timestamp())
                return {
                    "server_time": datetime.utcfromtimestamp(server_ts).isoformat() + "Z",
                    "local_time": datetime.utcnow().isoformat() + "Z",
                    "offset_seconds": server_ts - local_ts,
                }
        return {"server_time": None, "local_time": datetime.utcnow().isoformat() + "Z", "offset_seconds": 0}

    return await run_mt5(_sync_probe)


@router.post("/close-all-positions")
async def close_all_positions():
    """Close all open positions on the connected MT5 account."""
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="No MT5 account connected")

    def _sync_close_all():
        positions = mt5_service.get_positions()
        if not positions:
            return {"closed": 0, "failed": 0, "results": []}
        results = []
        for pos in positions:
            res = mt5_service.close_position(pos["ticket"])
            results.append({"ticket": pos["ticket"], "symbol": pos["symbol"], **res})
        closed = sum(1 for r in results if r.get("success"))
        return {"closed": closed, "failed": len(results) - closed, "results": results}

    return await run_mt5(_sync_close_all)


@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time MT5 data streaming.
    - Persists equity snapshots every 60s.
    - Resets daily_open_equity at the start of each trading day.
    - Auto-reconnects if connection goes stale.
    """
    await manager.connect(websocket)
    last_snapshot_time = 0.0
    last_trail_time = 0.0
    consecutive_failures = 0

    try:
        while True:
            if mt5_service.is_initialized and get_connected_account_id():
                info = await run_mt5(mt5_service.get_account_info)
                positions = await run_mt5(mt5_service.get_positions)
                now = asyncio.get_event_loop().time()

                if info:
                    consecutive_failures = 0
                    if TRAILING_STOPS and (now - last_trail_time) >= TRAIL_CHECK_INTERVAL_SECONDS:
                        await run_mt5(check_trailing_stops, positions or [])
                        last_trail_time = now

                    if (now - last_snapshot_time) >= SNAPSHOT_INTERVAL_SECONDS:
                        await run_db(save_snapshot, get_connected_account_id(), info)
                        last_snapshot_time = now

                    await run_db(maybe_reset_daily_open, get_connected_account_id(), info)
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= WS_RECONNECT_FAILURE_THRESHOLD:
                        logger.warning("MT5 stream: %d consecutive failures, attempting reconnect...", consecutive_failures)
                        await attempt_reconnect(get_connected_account_id())
                        consecutive_failures = 0

                data = {
                    "type": "update",
                    "connected_account_id": get_connected_account_id(),
                    "account_info": info,
                    "positions": positions,
                    "timestamp": datetime.now().isoformat(),
                }

                await manager.send_personal_message(json.dumps(data), websocket)

            await asyncio.sleep(WS_TICK_INTERVAL_SECONDS)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning("WS stream error: %s", e)
        manager.disconnect(websocket)
