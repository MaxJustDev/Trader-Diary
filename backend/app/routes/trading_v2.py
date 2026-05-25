"""Multi-process trading routes (Batch F Phase 4).

Mounted at `/api/trading/v2`. Uses the worker pool — every per-account MT5
call goes to its dedicated worker, so a batch trade across N accounts
runs N calls in parallel (asyncio.gather) instead of serially.

The position sizer + rule checker still run in the master (they need
the DB and are pure Python). MT5 reads/writes (symbol info, ticks,
order_send) go through `pool.call`.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.accounts import Account
from app.models.trade_record import TradeRecord
from app.schemas import (
    BatchTradeRequest,
    PositionCalculateRequest,
    SymbolCheckRequest,
)
from app.services.position_sizer import PositionSizer
from app.services.rule_checker import RuleChecker
from app.services.symbol_resolver import parse_aliases, resolve_symbol
from app.services.worker_pool import WorkerError, WorkerNotRunning, pool
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Tiny adapter so PositionSizer can use pre-fetched worker data ─────────────
class _PreFetchedMT5:
    """Stand-in for MT5Service that returns data fetched ahead via worker.call."""

    def __init__(self, symbol_info: dict[str, Any] | None, tick: dict[str, float] | None) -> None:
        self._symbol_info = symbol_info
        self._tick = tick

    def get_symbol_info(self, _symbol: str) -> dict[str, Any] | None:
        return self._symbol_info

    def get_tick_price(self, _symbol: str) -> dict[str, float] | None:
        return self._tick

    def calculate_margin(self, _symbol: str, _volume: float, _order_type: str) -> float | None:
        # Validate-margin path: caller fetches margin_free from worker and
        # compares directly; we skip server-side calculate_margin for v2.
        return None


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _ensure_worker(account_db_id: int) -> bool:
    """Spawn a worker for the account if not already active. Returns True on ready."""
    if pool.is_active(account_db_id):
        return True
    try:
        await pool.spawn(account_db_id)
        # Ping to confirm bootstrap finished. Bootstrap may take a few seconds.
        await pool.call(account_db_id, "ping", timeout=15.0)
        return True
    except Exception as e:
        logger.warning("ensure_worker failed for account %d: %s", account_db_id, e)
        return False


def _save_trade_record(
    db: Session,
    account: Account,
    symbol: str,
    direction: str,
    calc: dict,
    success: bool,
    order_ticket: Any = None,
    error_msg: str | None = None,
) -> None:
    try:
        record = TradeRecord(
            account_db_id=account.id,
            account_login=account.account_id,
            symbol=symbol,
            direction=direction,
            lot_size=calc.get("lot_size", 0) if calc else 0,
            entry_price=calc.get("entry_price") if calc else None,
            sl_price=calc.get("sl_price") if calc else None,
            tp_price=calc.get("tp_price") if calc else None,
            sl_pips=calc.get("sl_pips") if calc else None,
            tp_pips=calc.get("tp_pips") if calc else None,
            risk_pct=calc.get("risk_pct") if calc else None,
            risk_amount=calc.get("risk_amount") if calc else None,
            reward_amount=calc.get("reward_amount") if calc else None,
            rr_ratio=calc.get("rr_ratio") if calc else None,
            order_ticket=order_ticket,
            success=success,
            error_msg=error_msg,
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.warning("Failed to save trade record for %s: %s", account.account_id, e)
        db.rollback()


def _reset_daily_equity_if_needed(account: Account, live_equity: float, live_balance: float, db: Session) -> None:
    today_str = datetime.utcnow().date().isoformat()
    if account.daily_open_date == today_str:
        return
    if live_balance > 0:
        current_peak = account.peak_eod_balance or account.starting_balance or 0.0
        if live_balance > current_peak:
            account.peak_eod_balance = live_balance
    account.daily_open_equity = live_equity
    account.daily_open_date = today_str
    db.add(account)
    db.commit()
    db.refresh(account)


# ── /check-symbol — parallel availability check ───────────────────────────────
@router.post("/check-symbol")
async def check_symbol_v2(request: SymbolCheckRequest, db: Session = Depends(get_db)):
    """Per-account symbol availability with broker-variant resolution.

    Each account runs the symbol resolver in parallel. The response includes
    the resolved symbol name (which may differ from `request.symbol`) and a
    list of alternatives the UI can show if the user wants to pick manually.
    """
    accounts = db.query(Account).filter(Account.id.in_(request.account_ids)).all()
    account_map = {a.id: a for a in accounts}

    async def check_one(account: Account) -> dict:
        ok = await _ensure_worker(account.id)
        if not ok:
            return {
                "account_id": account.account_id,
                "id": account.id,
                "available": False,
                "resolved_symbol": None,
                "confidence": "not_found",
                "alternatives": [],
                "tick": None,
            }
        aliases = parse_aliases(account.symbol_aliases)
        result = await resolve_symbol(pool, account.id, request.symbol, aliases)
        tick = None
        if result.available and result.resolved:
            try:
                tick = await pool.call(account.id, "get_tick_price", {"symbol": result.resolved})
            except (WorkerError, WorkerNotRunning, asyncio.TimeoutError) as e:
                logger.warning("get_tick_price failed account=%d: %s", account.id, e)
        return {
            "account_id": account.account_id,
            "id": account.id,
            "available": result.available,
            "resolved_symbol": result.resolved,
            "confidence": result.confidence,
            "alternatives": result.alternatives,
            "tick": tick,
        }

    results = await asyncio.gather(
        *[check_one(account_map[aid]) for aid in request.account_ids if aid in account_map]
    )

    tick = next((r["tick"] for r in results if r["tick"] is not None), None)
    out = [{k: v for k, v in r.items() if k != "tick"} for r in results]
    return {"results": out, "tick": tick}


# ── /calculate-position — parallel sizing across accounts ─────────────────────
@router.post("/calculate-position")
async def calculate_position_v2(request: PositionCalculateRequest, db: Session = Depends(get_db)):
    """Per-account EA sizing + rule check. All workers in parallel."""
    accounts = (
        db.query(Account).filter(Account.id.in_(request.account_ids)).all()
    )
    account_map = {a.id: a for a in accounts}
    checker = RuleChecker(db)

    async def calc_one(account: Account) -> dict:
        if not await _ensure_worker(account.id):
            return {"account_id": account.account_id, "error": "worker not ready"}
        aliases = parse_aliases(account.symbol_aliases)
        resolved = await resolve_symbol(pool, account.id, request.symbol, aliases)
        if not resolved.available or not resolved.resolved:
            return {
                "account_id": account.account_id,
                "error": "symbol not available on this account",
                "alternatives": resolved.alternatives,
            }
        symbol = resolved.resolved
        try:
            info, sym_info, tick = await asyncio.gather(
                pool.call(account.id, "get_account_info"),
                pool.call(account.id, "get_symbol_info", {"symbol": symbol}),
                pool.call(account.id, "get_tick_price", {"symbol": symbol}),
            )
        except (WorkerError, WorkerNotRunning, asyncio.TimeoutError) as e:
            return {"account_id": account.account_id, "error": f"worker call failed: {e}"}

        if not info:
            return {"account_id": account.account_id, "error": "no account_info"}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        sizer = PositionSizer(_PreFetchedMT5(sym_info, tick))
        calc = sizer.calculate(
            balance=info["balance"],
            symbol=symbol,
            direction=request.direction,
            sl_price=request.sl_price,
            risk_type=request.risk_type,
            risk_value=request.risk_value,
            tp_price=request.tp_price,
        )

        # Margin check by comparing required margin estimate vs margin_free.
        # For v2 we just check that account has positive margin_free.
        margin_ok = info.get("margin_free", 0.0) > 0

        risk_amount = calc.get("risk_amount", 0.0) or 0.0
        reward_amount = calc.get("reward_amount", 0.0) or 0.0
        rule_status = checker.get_pre_trade_status(
            account=account,
            proposed_risk_amount=risk_amount,
            proposed_reward_amount=reward_amount,
        )

        return {
            "account_id": account.account_id,
            "balance": info["balance"],
            "resolved_symbol": symbol,
            "confidence": resolved.confidence,
            "calculation": calc,
            "margin_ok": margin_ok,
            "rule_status": rule_status,
        }

    results = await asyncio.gather(
        *[calc_one(account_map[aid]) for aid in request.account_ids if aid in account_map]
    )
    return {"results": results}


# ── /execute-batch — parallel order placement ─────────────────────────────────
@router.post("/execute-batch")
async def execute_batch_v2(request: BatchTradeRequest, db: Session = Depends(get_db)):
    """Place identical orders on N accounts IN PARALLEL via worker pool.

    Total latency ≈ slowest single account's roundtrip + small overhead,
    NOT sum across accounts.
    """
    accounts = (
        db.query(Account).filter(Account.id.in_(request.account_ids)).all()
    )
    account_map = {a.id: a for a in accounts}
    checker = RuleChecker(db)

    # Phase 1: prepare in parallel
    async def prepare_one(account: Account) -> dict:
        if not await _ensure_worker(account.id):
            return {"ready": False, "account": account, "account_id": account.account_id, "error": "worker not ready", "calc": None}
        aliases = parse_aliases(account.symbol_aliases)
        resolved = await resolve_symbol(pool, account.id, request.symbol, aliases)
        if not resolved.available or not resolved.resolved:
            return {
                "ready": False,
                "account": account,
                "account_id": account.account_id,
                "error": "symbol not available on this account",
                "calc": None,
                "alternatives": resolved.alternatives,
            }
        symbol = resolved.resolved
        try:
            info, sym_info, tick = await asyncio.gather(
                pool.call(account.id, "get_account_info"),
                pool.call(account.id, "get_symbol_info", {"symbol": symbol}),
                pool.call(account.id, "get_tick_price", {"symbol": symbol}),
            )
        except (WorkerError, WorkerNotRunning, asyncio.TimeoutError) as e:
            return {"ready": False, "account": account, "account_id": account.account_id, "error": f"worker call failed: {e}", "calc": None}

        if not info:
            return {"ready": False, "account": account, "account_id": account.account_id, "error": "no account_info", "calc": None}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        sizer = PositionSizer(_PreFetchedMT5(sym_info, tick))
        calc = sizer.calculate(
            balance=info["balance"],
            symbol=symbol,
            direction=request.direction,
            sl_price=request.sl_price,
            risk_type=request.risk_type,
            risk_value=request.risk_value,
            tp_price=request.tp_price,
        )

        if account.account_type == "fund" and account.fund_program_id:
            risk_amount = calc.get("risk_amount", 0.0) or 0.0
            rule_result = checker.get_pre_trade_status(
                account=account,
                proposed_risk_amount=risk_amount,
            )
            if rule_result.get("blocked"):
                reasons = rule_result.get("block_reasons", [])
                error_msg = f"Blocked: {' | '.join(reasons)}"
                return {
                    "ready": False,
                    "blocked": True,
                    "account": account,
                    "account_id": account.account_id,
                    "calc": calc,
                    "error": error_msg,
                }

        margin_ok = info.get("margin_free", 0.0) > 0
        return {
            "ready": True,
            "account": account,
            "account_id": account.account_id,
            "resolved_symbol": symbol,
            "calc": calc,
            "margin_ok": margin_ok,
        }

    prepared = await asyncio.gather(
        *[prepare_one(account_map[aid]) for aid in request.account_ids if aid in account_map]
    )

    blocked = [p for p in prepared if p.get("blocked")]
    failed_margin = [p for p in prepared if p.get("ready") and not p.get("margin_ok")]
    ready = [p for p in prepared if p.get("ready") and p.get("margin_ok")]

    # Persist blocked records up-front
    for p in blocked:
        _save_trade_record(db, p["account"], request.symbol, request.direction, p["calc"], False, error_msg=p["error"])

    if failed_margin:
        raise HTTPException(
            status_code=400,
            detail=f"{len(failed_margin)} account(s) don't have enough margin",
        )

    # Phase 2: parallel execution
    async def execute_one(p: dict) -> dict:
        account = p["account"]
        calc = p["calc"]
        symbol = p.get("resolved_symbol") or request.symbol
        try:
            result = await pool.call(account.id, "place_market_order", {
                "symbol": symbol,
                "volume": calc["lot_size"],
                "order_type": request.direction,
                "sl": calc.get("sl_price", 0.0),
                "tp": calc.get("tp_price", 0.0),
                "comment": "TraderDiary Batch v2",
            }, timeout=15.0)
        except (WorkerError, WorkerNotRunning, asyncio.TimeoutError) as e:
            result = {"success": False, "error": f"worker call failed: {e}"}

        success = result.get("success", False)
        order_ticket = result.get("order")
        _save_trade_record(
            db, account, request.symbol, request.direction, calc,
            success=success, order_ticket=order_ticket, error_msg=result.get("error"),
        )
        return {
            "account_id": account.account_id,
            "resolved_symbol": symbol,
            "success": success,
            "order": order_ticket,
            "error": result.get("error"),
        }

    execution_results = await asyncio.gather(*[execute_one(p) for p in ready])

    blocked_results = [
        {"account_id": p["account_id"], "success": False, "blocked": True, "error": p["error"]}
        for p in blocked
    ]
    all_results = blocked_results + execution_results

    successful = sum(1 for r in all_results if r.get("success"))
    return {
        "total": len(all_results),
        "successful": successful,
        "blocked": len(blocked_results),
        "failed": len(all_results) - successful - len(blocked_results),
        "results": all_results,
    }
