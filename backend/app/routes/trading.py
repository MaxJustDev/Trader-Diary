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
from app.services.encryption import decrypt_password
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


def _check_symbol_on_account(mt5: MT5Service, account: Account, password: str, symbol: str) -> dict:
    """Sync per-account check used by check_symbol. Returns {available, tick_or_none}."""
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
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
    password: str,
    request: "PositionCalculateRequest",
    db: Session,
) -> dict:
    """Sync per-account calc used by calculate_position. Returns the per-account result dict."""
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
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

    # Decrypt once per account up front
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    # Preserve client-requested order
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue

        outcome = await run_mt5(
            _check_symbol_on_account, mt5, account, pw_cache[account.id], request.symbol
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
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    results = []
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue
        result = await run_mt5(
            _calculate_for_account, mt5, sizer, checker, account, pw_cache[account.id], request, db
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
    accounts_data = []  # ready to execute
    blocked_results = []  # fund rule violations — reported but not executed

    for account_id in request.account_ids:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            continue

        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
                info = mt5.get_account_info()

                if info:
                    # Keep daily equity tracker accurate before rule check
                    _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

                    # ── Position calc ──────────────────────────────────────────
                    calc = sizer.calculate(
                        balance=info["balance"],
                        symbol=request.symbol,
                        direction=request.direction,
                        sl_price=request.sl_price,
                        risk_type=request.risk_type,
                        risk_value=request.risk_value,
                        tp_price=request.tp_price,
                    )

                    # ── Full fund rule hard-block (DD + per-trade risk cap) ────
                    # Run AFTER calc so we have the actual risk_amount to check.
                    if account.account_type == "fund" and account.fund_program_id:
                        risk_amount = calc.get("risk_amount", 0.0) or 0.0
                        rule_result = checker.get_pre_trade_status(
                            account=account,
                            proposed_risk_amount=risk_amount,
                        )
                        if rule_result.get("blocked"):
                            reasons = rule_result.get("block_reasons", [])
                            error_msg = f"Blocked: {' | '.join(reasons)}"
                            _save_trade_record(
                                db=db,
                                account=account,
                                symbol=request.symbol,
                                direction=request.direction,
                                calc=calc,
                                success=False,
                                error_msg=error_msg,
                            )
                            blocked_results.append({
                                "account_id": account.account_id,
                                "success": False,
                                "blocked": True,
                                "error": error_msg,
                            })
                            mt5.logout()
                            continue  # skip this account

                    # ── Margin check ───────────────────────────────────────────
                    margin_ok = True
                    if not calc.get("error") and calc.get("lot_size", 0) > 0:
                        margin_ok = sizer.validate_margin(
                            request.symbol,
                            calc["lot_size"],
                            request.direction,
                            info["margin_free"],
                        )

                    accounts_data.append({
                        "account": account,
                        "password": password,
                        "calc": calc,
                        "margin_ok": margin_ok,
                    })

                mt5.logout()
        except Exception as e:
            accounts_data.append({
                "account": account,
                "error": str(e),
                "margin_ok": False,
            })

    # Margin check: only for non-blocked accounts
    failed_margin = [acc for acc in accounts_data if not acc.get("margin_ok")]
    if failed_margin:
        mt5.shutdown()
        raise HTTPException(
            status_code=400,
            detail=f"{len(failed_margin)} account(s) don't have enough margin",
        )

    results = list(blocked_results)  # start with blocked accounts in results

    for acc_data in accounts_data:
        account = acc_data["account"]
        calc = acc_data["calc"]

        try:
            if mt5.login(int(account.account_id), acc_data["password"], account.server, path=account.mt5_path):
                result = mt5.place_market_order(
                    symbol=request.symbol,
                    volume=calc["lot_size"],
                    order_type=request.direction,
                    sl=calc["sl_price"],
                    tp=calc["tp_price"],
                    comment="TraderDiary Batch",
                )

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

                mt5.logout()
        except Exception as e:
            _save_trade_record(
                db=db,
                account=account,
                symbol=request.symbol,
                direction=request.direction,
                calc=calc,
                success=False,
                error_msg=str(e),
            )
            results.append({
                "account_id": account.account_id,
                "success": False,
                "error": str(e),
            })

    mt5.shutdown()

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
