"""Background streaming helpers for the MT5 WebSocket loop.

The WS endpoint in `routes/mt5.py` dispatches these through `run_db` /
`run_mt5` so the asyncio event loop stays responsive. Functions here are
sync by contract — callers do the async wrapping.

`TRAILING_STOPS` is the live registry of active trailing stops. Mutated by
the WS loop (`check_trailing_stops`) and the `/trailing-stop/set` /
`/trailing-stop/{ticket}` endpoints.
"""
from datetime import datetime
import logging

import MetaTrader5 as _mt5

from app.database import SessionLocal
from app.models.accounts import Account
from app.models.equity_snapshot import EquitySnapshot
from app.services.mt5_singleton import mt5_service
from app.services.mt5_auth import login_account
from app.utils.async_helpers import run_mt5

logger = logging.getLogger(__name__)

# ticket -> {trail_pips, symbol, type, digits, pip_size, best_price}
TRAILING_STOPS: dict = {}


def save_snapshot(account_db_id: int, info: dict) -> None:
    """Persist an equity snapshot to the database."""
    db = SessionLocal()
    try:
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


def maybe_reset_daily_open(account_db_id: int, info: dict) -> None:
    """If it's a new trading day, update daily_open_equity on the account."""
    today = datetime.now().strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        account = db.query(Account).filter(Account.id == account_db_id).first()
        if account and account.daily_open_date != today:
            account.daily_open_equity = info.get("equity", info.get("balance", 0))
            account.daily_open_date = today
            db.commit()
            logger.info(
                "Daily open equity reset for account %s: %.2f",
                account_db_id,
                account.daily_open_equity,
            )
    except Exception as e:
        logger.warning("Failed to reset daily open equity: %s", e)
    finally:
        db.close()


def check_trailing_stops(positions: list) -> None:
    """Update SL on active trailing stops when price moves favorably."""
    if not TRAILING_STOPS:
        return
    pos_map = {p["ticket"]: p for p in positions}
    for ticket, ts in list(TRAILING_STOPS.items()):
        pos = pos_map.get(ticket)
        if not pos:
            TRAILING_STOPS.pop(ticket, None)
            continue

        symbol = ts["symbol"]
        pip_size = ts["pip_size"]
        trail_distance = ts["trail_pips"] * pip_size
        current_sl = pos.get("sl") or 0
        tp = pos.get("tp") or 0

        if pos["type"] == "BUY":
            tick = _mt5.symbol_info_tick(symbol)
            if not tick:
                continue
            bid = tick.bid
            new_sl = round(bid - trail_distance, ts["digits"])
            if new_sl > current_sl + pip_size * 0.5:
                result = mt5_service.modify_position(ticket, new_sl, tp)
                if result.get("success"):
                    ts["best_price"] = bid
                    logger.info("Trail: #%d BUY SL -> %.5f (bid=%.5f)", ticket, new_sl, bid)
        else:  # SELL
            tick = _mt5.symbol_info_tick(symbol)
            if not tick:
                continue
            ask = tick.ask
            new_sl = round(ask + trail_distance, ts["digits"])
            if current_sl == 0 or new_sl < current_sl - pip_size * 0.5:
                result = mt5_service.modify_position(ticket, new_sl, tp)
                if result.get("success"):
                    ts["best_price"] = ask
                    logger.info("Trail: #%d SELL SL -> %.5f (ask=%.5f)", ticket, new_sl, ask)


async def attempt_reconnect(account_db_id: int) -> None:
    """Re-login to MT5 using stored credentials when stream goes stale."""

    def _do_reconnect() -> bool:
        db = SessionLocal()
        try:
            account = db.query(Account).filter(Account.id == account_db_id).first()
            if not account:
                return False
            return login_account(account, mt5_service)
        finally:
            db.close()

    try:
        success = await run_mt5(_do_reconnect)
        if success:
            logger.info("Auto-reconnect succeeded for account %s", account_db_id)
        else:
            logger.warning("Auto-reconnect failed for account %s", account_db_id)
    except Exception as e:
        logger.warning("Auto-reconnect error: %s", e)
