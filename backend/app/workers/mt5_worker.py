"""Standalone MT5 worker process. One process per account.

Run via:
    python -m app.workers.mt5_worker <account_db_id>

Communication is JSON-RPC over stdin/stdout (one JSON object per line).
Stderr is reserved for human-readable logs.

Lifecycle:
1. Boot: read account from SQLite, decrypt password, auto-launch terminal,
   init MT5 with backoff, log in, verify connection.
2. Main loop: read RPC requests, dispatch to handlers, write responses.
3. Tick thread: every 1s emit a `tick` event with account_info + positions.
4. Watchdog thread: every 5s check connection; on drop, reconnect + emit
   `health` events.
5. Shutdown on `shutdown` RPC, SIGTERM, or stdin EOF.

The worker NEVER reads the master's mind. The master spawns it, sends requests,
reads events. The worker has no global state shared with the master.
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import threading
import time
from typing import Any

# Loading .env up front so ENCRYPTION_KEY is available before importing services.
import dotenv

if "DOTENV_LOADED" not in os.environ:
    from app.database import get_base_dir  # noqa: E402

    dotenv.load_dotenv(os.path.join(get_base_dir(), ".env"))
    os.environ["DOTENV_LOADED"] = "1"

from app.services.mt5_provider import mt5  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.accounts import Account  # noqa: E402
from app.services.encryption import decrypt_password  # noqa: E402
from app.workers import protocol as p  # noqa: E402
from app.workers.mt5_health import (  # noqa: E402
    Watchdog,
    init_with_backoff,
    launch_terminal_if_needed,
    verify_login_connected,
)
from app.services.stealth import apply_stealth  # noqa: E402

# ── Logging to stderr (stdout is reserved for the protocol) ──────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker:%(process)d] %(levelname)s %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


# ── Globals (worker-process-local; isolated from master) ──────────────────────
_account: Account | None = None
_stop_event = threading.Event()
_stdout_lock = threading.Lock()


def _emit(line: str) -> None:
    """Write a single protocol line to stdout, thread-safe + flushed."""
    with _stdout_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def _send_response(req_id: str, result: Any) -> None:
    _emit(p.encode_response(req_id, result))


def _send_error(req_id: str, code: str, message: str) -> None:
    _emit(p.encode_error(req_id, code, message))


def _send_event(name: str, data: dict[str, Any]) -> None:
    _emit(p.encode_event(name, data))


# ── Bootstrap ─────────────────────────────────────────────────────────────────
def _load_account(account_db_id: int) -> Account:
    db = SessionLocal()
    try:
        acc = db.query(Account).filter(Account.id == account_db_id).first()
        if not acc:
            raise SystemExit(f"account_db_id={account_db_id} not found")
        # Pull all needed attributes while session is open so we can detach.
        db.expunge(acc)
        return acc
    finally:
        db.close()


def _do_login_and_verify() -> bool:
    """Sync login flow used at boot and by the watchdog on reconnect."""
    assert _account is not None
    password = decrypt_password(_account.password)
    if not mt5.login(int(_account.account_id), password, _account.server):
        logger.warning("mt5.login() failed: %s", mt5.last_error())
        return False
    if not verify_login_connected():
        logger.warning("post-login verify failed (account_info() None or terminal not connected)")
        return False
    return True


def _full_reconnect() -> bool:
    """Re-init + re-login. Called by the watchdog."""
    assert _account is not None
    if not init_with_backoff(_account.mt5_path):
        return False
    return _do_login_and_verify()


def _bootstrap(account_db_id: int) -> None:
    global _account
    _account = _load_account(account_db_id)
    logger.info("Loaded account %s (login=%s, path=%s)", _account.id, _account.account_id, _account.mt5_path)

    if _account.mt5_path:
        if not launch_terminal_if_needed(_account.mt5_path):
            raise SystemExit("Failed to launch terminal")

    if not init_with_backoff(_account.mt5_path):
        raise SystemExit("MT5 initialization exhausted attempts")

    if not _do_login_and_verify():
        raise SystemExit("MT5 login failed or connection unverified")

    logger.info("Worker ready for account_db_id=%d", account_db_id)


# ── RPC handlers ──────────────────────────────────────────────────────────────
def _handle_ping(_params: dict[str, Any]) -> str:
    return "pong"


def _handle_get_account_info(_params: dict[str, Any]) -> dict[str, Any] | None:
    info = mt5.account_info()
    if info is None:
        return None
    return {
        "login": info.login,
        "name": info.name,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "margin_free": info.margin_free,
        "margin_level": info.margin_level,
        "profit": info.profit,
        "currency": info.currency,
    }


def _handle_get_positions(_params: dict[str, Any]) -> list[dict[str, Any]]:
    positions = mt5.positions_get()
    if positions is None:
        return []
    from datetime import datetime as _dt

    return [
        {
            "ticket": pos.ticket,
            "symbol": pos.symbol,
            "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
            "volume": pos.volume,
            "price_open": pos.price_open,
            "sl": pos.sl,
            "tp": pos.tp,
            "profit": pos.profit,
            "time": _dt.fromtimestamp(pos.time).isoformat(),
        }
        for pos in positions
    ]


def _handle_symbols_search(params: dict[str, Any]) -> list[str]:
    """Return up to `limit` symbol names matching the optional glob pattern.

    Used by the symbol resolver to find broker-specific variants (e.g.
    EURUSD.m, XAU/USD) when the requested symbol isn't an exact match.
    """
    query = (params.get("query") or params.get("q") or "").strip()
    limit = int(params.get("limit", 50))
    if query:
        # MT5 group filter accepts globbing — wrap query for substring match.
        syms = mt5.symbols_get(group=f"*{query}*")
    else:
        syms = mt5.symbols_get()
    if syms is None:
        return []
    return [s.name for s in syms[:limit]]


def _handle_get_symbol_info(params: dict[str, Any]) -> dict[str, Any] | None:
    symbol = params.get("symbol")
    if not symbol:
        raise ValueError("symbol required")
    info = mt5.symbol_info(symbol)
    if info is None:
        return None
    return {
        "symbol": info.name,
        "point": info.point,
        "digits": info.digits,
        "trade_contract_size": info.trade_contract_size,
        "volume_min": info.volume_min,
        "volume_max": info.volume_max,
        "volume_step": info.volume_step,
    }


def _handle_get_tick_price(params: dict[str, Any]) -> dict[str, float] | None:
    symbol = params.get("symbol")
    if not symbol:
        raise ValueError("symbol required")
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return None
    return {"bid": tick.bid, "ask": tick.ask, "last": tick.last}


def _filling_mode(symbol: str) -> int:
    info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_IOC
    filling = info.filling_mode
    if filling & 2:
        return mt5.ORDER_FILLING_IOC
    if filling & 1:
        return mt5.ORDER_FILLING_FOK
    return mt5.ORDER_FILLING_RETURN


def _handle_place_market_order(params: dict[str, Any]) -> dict[str, Any]:
    symbol = params["symbol"]
    volume = float(params["volume"])
    order_type = str(params["order_type"]).upper()
    sl = float(params.get("sl", 0.0))
    tp = float(params.get("tp", 0.0))
    comment = params.get("comment", "TraderDiary")

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return {"success": False, "error": f"no tick for {symbol}"}

    price = tick.ask if order_type == "BUY" else tick.bid
    type_order = mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL

    request = apply_stealth({
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": type_order,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": 20,
        "magic": 234000,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(symbol),
    })
    result = mt5.order_send(request)
    if result is None:
        return {"success": False, "error": "order_send returned None"}
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        return {
            "success": False,
            "error": f"retcode {result.retcode}: {result.comment}",
        }
    return {
        "success": True,
        "order": result.order,
        "volume": result.volume,
        "price": result.price,
    }


def _handle_close_position(params: dict[str, Any]) -> dict[str, Any]:
    ticket = int(params["ticket"])
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        return {"success": False, "error": f"position #{ticket} not found"}
    pos = positions[0]
    close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        return {"success": False, "error": f"no tick for {pos.symbol}"}
    price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
    result = mt5.order_send({
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": pos.symbol,
        "volume": pos.volume,
        "type": close_type,
        "position": ticket,
        "price": price,
        "deviation": 20,
        "magic": 234000,
        "comment": "TraderDiary Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(pos.symbol),
    })
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "error": f"close failed: {result.comment if result else 'order_send None'}"}
    return {"success": True, "order": result.order, "volume": result.volume, "price": result.price}


def _handle_modify_position(params: dict[str, Any]) -> dict[str, Any]:
    ticket = int(params["ticket"])
    sl = float(params.get("sl", 0.0))
    tp = float(params.get("tp", 0.0))
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        return {"success": False, "error": f"position #{ticket} not found"}
    pos = positions[0]
    result = mt5.order_send({
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": pos.symbol,
        "position": ticket,
        "sl": sl,
        "tp": tp,
    })
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "error": f"modify failed: {result.comment if result else 'order_send None'}"}
    return {"success": True, "ticket": ticket, "sl": sl, "tp": tp}


def _handle_shutdown(_params: dict[str, Any]) -> str:
    _stop_event.set()
    return "ok"


_HANDLERS: dict[str, Any] = {
    "ping": _handle_ping,
    "get_account_info": _handle_get_account_info,
    "get_positions": _handle_get_positions,
    "get_symbol_info": _handle_get_symbol_info,
    "symbols_search": _handle_symbols_search,
    "get_tick_price": _handle_get_tick_price,
    "place_market_order": _handle_place_market_order,
    "close_position": _handle_close_position,
    "modify_position": _handle_modify_position,
    "shutdown": _handle_shutdown,
}


# ── Tick stream ───────────────────────────────────────────────────────────────
def _tick_loop() -> None:
    """Background thread: emit a 'tick' event every 1s with account + positions."""
    while not _stop_event.wait(1.0):
        try:
            info = _handle_get_account_info({})
            positions = _handle_get_positions({})
            from datetime import datetime as _dt

            _send_event("tick", {
                "account_info": info,
                "positions": positions,
                "ts": _dt.utcnow().isoformat() + "Z",
            })
        except Exception as e:
            logger.warning("tick loop error: %s", e)


# ── Main loop ─────────────────────────────────────────────────────────────────
def _main_loop() -> None:
    """Read JSON-RPC requests from stdin until EOF or shutdown event."""
    for raw in sys.stdin:
        if _stop_event.is_set():
            break
        line = raw.strip()
        if not line:
            continue
        try:
            req = p.decode_request(line)
        except ValueError as e:
            _send_error("0", p.ERR_PARSE, str(e))
            continue

        handler = _HANDLERS.get(req.method)
        if handler is None:
            _send_error(req.id, p.ERR_METHOD_NOT_FOUND, f"unknown method: {req.method}")
            continue

        try:
            result = handler(req.params)
            _send_response(req.id, result)
        except ValueError as e:
            _send_error(req.id, p.ERR_INVALID_PARAMS, str(e))
        except Exception as e:
            logger.exception("handler raised")
            _send_error(req.id, p.ERR_INTERNAL, f"{type(e).__name__}: {e}")


def _on_health_event(event_name: str, data: dict[str, Any]) -> None:
    _send_event("health", {"state": event_name, **data})


def _setup_signal_handlers() -> None:
    def _handler(_signum, _frame):
        logger.info("received signal, shutting down")
        _stop_event.set()

    signal.signal(signal.SIGTERM, _handler)
    signal.signal(signal.SIGINT, _handler)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m app.workers.mt5_worker <account_db_id>", file=sys.stderr)
        return 2

    try:
        account_db_id = int(sys.argv[1])
    except ValueError:
        print(f"invalid account_db_id: {sys.argv[1]}", file=sys.stderr)
        return 2

    _setup_signal_handlers()

    try:
        _bootstrap(account_db_id)
    except SystemExit as e:
        logger.error("Bootstrap failed: %s", e)
        # Emit one final health event so the master knows what happened.
        _send_event("health", {"state": "bootstrap_failed", "message": str(e)})
        return 1

    # Tell the master we're ready.
    _send_event("health", {"state": "ready"})

    # Start the tick + watchdog threads.
    tick_thread = threading.Thread(target=_tick_loop, name="mt5-tick", daemon=True)
    tick_thread.start()

    watchdog = Watchdog(reconnect=_full_reconnect, on_event=_on_health_event)
    watchdog.start()

    try:
        _main_loop()
    finally:
        logger.info("Worker shutting down")
        watchdog.stop()
        _stop_event.set()
        tick_thread.join(timeout=2.0)
        try:
            mt5.shutdown()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
