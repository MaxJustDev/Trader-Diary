from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.accounts import Account
from app.models.trade_record import TradeRecord
from app.schemas import PositionCalculateRequest, BatchTradeRequest, SymbolCheckRequest
from app.services.mt5_service import MT5Service
from app.services.position_sizer import PositionSizer
from app.services.rule_checker import RuleChecker
from app.services.mt5_auth import login_account
import logging
from app.utils.async_helpers import run_mt5, run_db

router = APIRouter()
logger = logging.getLogger(__name__)


def _reset_daily_equity_if_needed(account: Account, live_equity: float, live_balance: float, db: Session) -> None:
    """
    If the broker day has rolled over (UTC date changed), update daily_open_equity
    and advance peak_eod_balance for trailing DD calculation.

    Most prop-firm platforms reset the trading day at midnight broker time (UTC+2).
    We approximate using UTC midnight — close enough for most firms.
    """
    today_str = datetime.utcnow().date().isoformat()
    if account.daily_open_date == today_str:
        return  # Already reset today

    # New day: record yesterday's closing balance as potential new peak for EOD trailing DD.
    # We use `balance` (closed equity) rather than `equity` (includes open positions)
    # because EOD balance is measured after all positions are closed.
    if live_balance > 0:
        current_peak = account.peak_eod_balance or account.starting_balance or 0.0
        if live_balance > current_peak:
            account.peak_eod_balance = live_balance

    account.daily_open_equity = live_equity
    account.daily_open_date = today_str
    db.add(account)
    db.commit()
    db.refresh(account)


def _check_symbol_on_account(mt5: MT5Service, account: Account, symbol: str) -> dict:
    """Sync per-account check used by check_symbol. Returns {available, tick_or_none}."""
    try:
        if not login_account(account, mt5):
            return {"available": False, "tick": None}
        symbol_info = mt5.get_symbol_info(symbol)
        available = symbol_info is not None
        tick = mt5.get_tick_price(symbol) if available else None
        mt5.logout()
        return {"available": available, "tick": tick}
    except Exception:
        return {"available": False, "tick": None}


def _calculate_for_account(
    mt5: MT5Service,
    sizer: PositionSizer,
    checker: RuleChecker,
    account: Account,
    request: "PositionCalculateRequest",
    db: Session,
) -> dict:
    """Sync per-account calc used by calculate_position. Returns the per-account result dict."""
    try:
        if not login_account(account, mt5):
            return {"account_id": account.account_id, "error": "login failed"}

        info = mt5.get_account_info()
        if not info:
            mt5.logout()
            return {"account_id": account.account_id, "error": "no account_info"}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        calc = sizer.calculate(
            balance=info["balance"],
            symbol=request.symbol,
            direction=request.direction,
            sl_price=request.sl_price,
            risk_type=request.risk_type,
            risk_value=request.risk_value,
            tp_price=request.tp_price,
        )

        margin_ok = True
        if not calc.get("error") and calc.get("lot_size", 0) > 0:
            margin_ok = sizer.validate_margin(
                request.symbol,
                calc["lot_size"],
                request.direction,
                info["margin_free"],
            )

        risk_amount = calc.get("risk_amount", 0.0) or 0.0
        reward_amount = calc.get("reward_amount", 0.0) or 0.0
        rule_status = checker.get_pre_trade_status(
            account=account,
            proposed_risk_amount=risk_amount,
            proposed_reward_amount=reward_amount,
        )

        mt5.logout()
        return {
            "account_id": account.account_id,
            "balance": info["balance"],
            "calculation": calc,
            "margin_ok": margin_ok,
            "rule_status": rule_status,
        }
    except Exception as e:
        return {"account_id": account.account_id, "error": str(e)}


def _prepare_for_execution(
    mt5: MT5Service,
    sizer: PositionSizer,
    checker: RuleChecker,
    account: Account,
    request: "BatchTradeRequest",
    db: Session,
) -> dict:
    """Per-account pre-trade phase: login, calc, fund rule check, margin check.

    Returns dict with one of these shapes:
      - {"ready": True, "account": ..., "calc": ..., "margin_ok": bool}
      - {"ready": False, "blocked": True, "account_id": ..., "error": ..., "calc": ..., "account": ...}
      - {"ready": False, "error": str, "account_id": ..., "account": ..., "calc": None}
    """
    try:
        if not login_account(account, mt5):
            return {"ready": False, "error": "login failed", "account_id": account.account_id, "account": account, "calc": None}

        info = mt5.get_account_info()
        if not info:
            mt5.logout()
            return {"ready": False, "error": "no account_info", "account_id": account.account_id, "account": account, "calc": None}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        calc = sizer.calculate(
            balance=info["balance"],
            symbol=request.symbol,
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
                mt5.logout()
                return {
                    "ready": False,
                    "blocked": True,
                    "account_id": account.account_id,
                    "account": account,
                    "calc": calc,
                    "error": error_msg,
                }

        margin_ok = True
        if not calc.get("error") and calc.get("lot_size", 0) > 0:
            margin_ok = sizer.validate_margin(
                request.symbol,
                calc["lot_size"],
                request.direction,
                info["margin_free"],
            )

        mt5.logout()
        return {
            "ready": True,
            "account": account,
            "calc": calc,
            "margin_ok": margin_ok,
        }
    except Exception as e:
        return {"ready": False, "error": str(e), "account_id": account.account_id, "account": account, "calc": None}


def _execute_single_trade(
    mt5: MT5Service,
    account: Account,
    calc: dict,
    request: "BatchTradeRequest",
) -> dict:
    """Per-account order phase: login + place_market_order. Returns the MT5 result dict."""
    try:
        if not login_account(account, mt5):
            return {"success": False, "error": "login failed"}
        result = mt5.place_market_order(
            symbol=request.symbol,
            volume=calc["lot_size"],
            order_type=request.direction,
            sl=calc["sl_price"],
            tp=calc["tp_price"],
            comment="TraderDiary Batch",
        )
        mt5.logout()
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/check-symbol")
async def check_symbol(
    request: SymbolCheckRequest,
    db: Session = Depends(get_db),
):
    """Check symbol availability across multiple accounts, return tick price from first available."""
    mt5 = MT5Service()
    results = []
    tick = None

    # One DB hit instead of N
    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}

    # Preserve client-requested order
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue

        outcome = await run_mt5(
            _check_symbol_on_account, mt5, account, request.symbol
        )

        if tick is None and outcome["tick"] is not None:
            tick = outcome["tick"]

        results.append({
            "account_id": account.account_id,
            "id": account.id,
            "available": outcome["available"],
        })

    await run_mt5(mt5.shutdown)

    return {"results": results, "tick": tick}


@router.post("/calculate-position")
async def calculate_position(
    request: PositionCalculateRequest,
    db: Session = Depends(get_db),
):
    """
    Calculate position size for multiple accounts using EA-style sizing.
    Also runs pre-trade fund-rule validation and returns rule_status per account.
    """
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    checker = RuleChecker(db)

    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}

    results = []
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue
        result = await run_mt5(
            _calculate_for_account, mt5, sizer, checker, account, request, db
        )
        results.append(result)

    await run_mt5(mt5.shutdown)
    return {"results": results}


@router.post("/execute-batch")
async def execute_batch(
    request: BatchTradeRequest,
    db: Session = Depends(get_db),
):
    """
    Execute batch orders on multiple accounts and persist trade records.

    Fund accounts that currently violate drawdown/best-day rules are HARD BLOCKED:
    they are skipped and a failed trade record is saved with the violation reason.
    """
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    checker = RuleChecker(db)

    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}

    # Phase 1: per-account pre-trade prep
    prepared = []
    blocked_results = []
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue
        outcome = await run_mt5(
            _prepare_for_execution, mt5, sizer, checker, account, request, db
        )

        if outcome.get("blocked"):
            _save_trade_record(
                db=db,
                account=outcome["account"],
                symbol=request.symbol,
                direction=request.direction,
                calc=outcome["calc"],
                success=False,
                error_msg=outcome["error"],
            )
            blocked_results.append({
                "account_id": outcome["account_id"],
                "success": False,
                "blocked": True,
                "error": outcome["error"],
            })
            continue

        if outcome.get("ready"):
            prepared.append(outcome)
        # else: silent skip on login/info failure (matches prior behavior)

    # Margin gate
    failed_margin = [p for p in prepared if not p.get("margin_ok")]
    if failed_margin:
        await run_mt5(mt5.shutdown)
        raise HTTPException(
            status_code=400,
            detail=f"{len(failed_margin)} account(s) don't have enough margin",
        )

    # Phase 2: execute orders
    results = list(blocked_results)
    for entry in prepared:
        account = entry["account"]
        calc = entry["calc"]
        result = await run_mt5(_execute_single_trade, mt5, account, calc, request)

        success = result.get("success", False)
        order_ticket = result.get("order")

        _save_trade_record(
            db=db,
            account=account,
            symbol=request.symbol,
            direction=request.direction,
            calc=calc,
            success=success,
            order_ticket=order_ticket,
            error_msg=result.get("error"),
        )

        results.append({
            "account_id": account.account_id,
            "success": success,
            "order": order_ticket,
            "error": result.get("error"),
        })

    await run_mt5(mt5.shutdown)

    successful = sum(1 for r in results if r.get("success"))
    blocked_count = len(blocked_results)

    return {
        "total": len(results),
        "successful": successful,
        "blocked": blocked_count,
        "failed": len(results) - successful - blocked_count,
        "results": results,
    }


def _save_trade_record(
    db: Session,
    account: Account,
    symbol: str,
    direction: str,
    calc: dict,
    success: bool,
    order_ticket=None,
    error_msg=None,
):
    """Persist a trade record to the database."""
    try:
        record = TradeRecord(
            account_db_id=account.id,
            account_login=account.account_id,
            symbol=symbol,
            direction=direction,
            lot_size=calc.get("lot_size", 0),
            entry_price=calc.get("entry_price"),
            sl_price=calc.get("sl_price"),
            tp_price=calc.get("tp_price"),
            sl_pips=calc.get("sl_pips"),
            tp_pips=calc.get("tp_pips"),
            risk_pct=calc.get("risk_pct"),
            risk_amount=calc.get("risk_amount"),
            reward_amount=calc.get("reward_amount"),
            rr_ratio=calc.get("rr_ratio"),
            order_ticket=order_ticket,
            success=success,
            error_msg=error_msg,
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.warning("Failed to save trade record for %s: %s", account.account_id, e)
        db.rollback()
