from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from collections import defaultdict
from datetime import datetime, timedelta
from app.database import get_db
from app.models.accounts import Account
from app.models.funds import FundProgram, FundPhaseRule
from app.models.equity_snapshot import EquitySnapshot
from app.models.trade_record import TradeRecord
from app.services.mt5_service import MT5Service
from app.services.encryption import decrypt_password
from app.services.rule_checker import RuleChecker
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/summary")
async def get_summary(db: Session = Depends(get_db)):
    """Get analytics summary for all accounts (uses DB-stored values for speed)."""
    accounts = db.query(Account).all()

    total_balance = 0
    total_equity = 0
    total_profit = 0
    fund_accounts = 0
    personal_accounts = 0

    for account in accounts:
        total_balance += account.balance or 0
        total_equity += account.equity or 0
        total_profit += account.profit or 0
        if account.account_type == "fund":
            fund_accounts += 1
        else:
            personal_accounts += 1

    return {
        "total_accounts": len(accounts),
        "fund_accounts": fund_accounts,
        "personal_accounts": personal_accounts,
        "total_balance": round(total_balance, 2),
        "total_equity": round(total_equity, 2),
        "total_profit": round(total_profit, 2),
    }


def _status_label(current_pct: float, limit_pct: float) -> str:
    """Return ok / warning / violated based on usage vs limit."""
    if current_pct >= limit_pct:
        return "violated"
    if limit_pct > 0 and current_pct >= limit_pct * 0.8:
        return "warning"
    return "ok"


@router.get("/fund-status")
async def get_fund_status(db: Session = Depends(get_db)):
    """Get fund rule status for all fund accounts (no MT5 login, uses DB values)."""
    accounts = (
        db.query(Account)
        .filter(Account.account_type == "fund", Account.fund_program_id.isnot(None))
        .options(
            joinedload(Account.fund_program).joinedload(FundProgram.fund),
            joinedload(Account.fund_program).joinedload(FundProgram.phase_rules),
        )
        .all()
    )

    checker = RuleChecker(db)
    results = []

    for account in accounts:
        balance = account.balance or 0
        equity = account.equity or 0
        starting_balance = account.starting_balance or balance

        # Use tracked daily_open_equity if available, fall back to balance
        daily_starting_equity = account.daily_open_equity if account.daily_open_equity else balance

        rules = checker.check_account_rules(
            account_type=account.account_type,
            fund_program_id=account.fund_program_id,
            current_phase=account.current_phase,
            balance=balance,
            equity=equity,
            starting_balance=starting_balance,
            daily_starting_equity=daily_starting_equity,
        )

        profit_info = {"achieved": False, "target": None, "current": 0, "progress": 0}
        if account.fund_program_id and account.current_phase:
            profit_info = checker.check_profit_target(
                fund_program_id=account.fund_program_id,
                current_phase=account.current_phase,
                starting_balance=starting_balance,
                current_equity=equity,
            )

        # Use pre-loaded relationships (no N+1)
        fund_name = None
        program_name = None
        daily_drawdown_limit = 0
        max_drawdown_limit = 0

        program = account.fund_program
        if program:
            program_name = program.program_name
            if program.fund:
                fund_name = program.fund.fund_name

            # Find matching phase rule
            phase_rule = None
            if account.current_phase:
                phase_rule = next(
                    (r for r in program.phase_rules if r.phase_name == account.current_phase),
                    None,
                )
            if not phase_rule and program.phase_rules:
                phase_rule = min(program.phase_rules, key=lambda r: r.phase_order)

            if phase_rule:
                daily_drawdown_limit = phase_rule.daily_drawdown
                max_drawdown_limit = phase_rule.max_drawdown

        daily_loss_pct = rules.get("daily_loss_pct", 0)
        max_loss_pct = rules.get("max_loss_pct", 0)

        results.append({
            "account_id": account.id,
            "account_login": account.account_id,
            "mt5_name": account.mt5_name,
            "fund_name": fund_name,
            "program_name": program_name,
            "current_phase": account.current_phase,
            "balance": balance,
            "equity": equity,
            "starting_balance": starting_balance,
            "next_payout_date": account.next_payout_date,
            "daily_loss_pct": daily_loss_pct,
            "daily_drawdown_limit": daily_drawdown_limit,
            "daily_status": _status_label(daily_loss_pct, daily_drawdown_limit),
            "max_loss_pct": max_loss_pct,
            "max_drawdown_limit": max_drawdown_limit,
            "max_dd_status": _status_label(max_loss_pct, max_drawdown_limit),
            "drawdown_type": rules.get("drawdown_type", "static"),
            "profit_pct": profit_info.get("current", 0),
            "profit_target": profit_info.get("target"),
            "profit_progress": profit_info.get("progress", 0),
            "profit_achieved": profit_info.get("achieved", False),
            "locked": rules.get("locked", False),
            "violations": rules.get("violations", []),
            "best_day_pct": rules.get("best_day_pct"),
            "best_day_limit": rules.get("best_day_limit"),
        })

    return {"accounts": results}


class AccountAnalyticsUpdate(BaseModel):
    next_payout_date: Optional[str] = None
    starting_balance: Optional[float] = None


@router.patch("/account/{account_id}")
async def update_account_analytics(
    account_id: int,
    data: AccountAnalyticsUpdate,
    db: Session = Depends(get_db),
):
    """Lightweight update for next_payout_date and starting_balance only."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if data.next_payout_date is not None:
        account.next_payout_date = data.next_payout_date
    if data.starting_balance is not None:
        account.starting_balance = data.starting_balance

    db.commit()
    db.refresh(account)

    return {"message": "Updated", "id": account.id}


@router.get("/equity-curve")
async def get_equity_curve(account_id: Optional[int] = None, limit: int = 500, db: Session = Depends(get_db)):
    """Get equity curve snapshots. Optionally filter by account DB id."""
    query = db.query(EquitySnapshot)
    if account_id is not None:
        query = query.filter(EquitySnapshot.account_db_id == account_id)
    snapshots = query.order_by(EquitySnapshot.recorded_at.asc()).limit(limit).all()

    data = [
        {
            "time": s.recorded_at.isoformat() if s.recorded_at else None,
            "balance": s.balance,
            "equity": s.equity,
            "profit": s.profit,
            "account_db_id": s.account_db_id,
        }
        for s in snapshots
    ]
    return {"data": data}


@router.get("/journal")
async def get_journal(
    account_id: Optional[int] = None,
    days: int = 90,
    db: Session = Depends(get_db),
):
    """Get trading journal grouped by day. Returns JournalDay objects with trade + balance data."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Trade records
    trade_query = db.query(TradeRecord).filter(TradeRecord.executed_at >= cutoff)
    if account_id is not None:
        trade_query = trade_query.filter(TradeRecord.account_db_id == account_id)
    all_trades = trade_query.order_by(TradeRecord.executed_at.asc()).all()

    # Equity snapshots for balance_change
    snap_query = db.query(EquitySnapshot).filter(EquitySnapshot.recorded_at >= cutoff)
    if account_id is not None:
        snap_query = snap_query.filter(EquitySnapshot.account_db_id == account_id)
    all_snaps = snap_query.order_by(EquitySnapshot.recorded_at.asc()).all()

    # Group snapshots by day → list of balance floats (already asc)
    snap_by_day: dict = defaultdict(list)
    for s in all_snaps:
        if s.recorded_at:
            snap_by_day[s.recorded_at.date().isoformat()].append(s.balance)

    # Group trades by day
    trade_by_day: dict = defaultdict(list)
    for t in all_trades:
        if t.executed_at:
            trade_by_day[t.executed_at.date().isoformat()].append(t)

    # All active days (newest first)
    all_days = sorted(
        set(list(snap_by_day.keys()) + list(trade_by_day.keys())),
        reverse=True,
    )

    journal_days = []
    for day in all_days:
        day_trades = trade_by_day.get(day, [])
        day_snaps = snap_by_day.get(day, [])

        symbols = list(dict.fromkeys(t.symbol for t in day_trades))
        rr_vals = [t.rr_ratio for t in day_trades if t.rr_ratio and t.rr_ratio > 0]
        total_risk = sum((t.risk_amount or 0) for t in day_trades if t.success)

        if len(day_snaps) >= 2:
            balance_change: Optional[float] = round(day_snaps[-1] - day_snaps[0], 2)
        elif len(day_snaps) == 1:
            balance_change = 0.0
        else:
            balance_change = None

        journal_days.append({
            "date": day,
            "trade_count": len(day_trades),
            "success_count": sum(1 for t in day_trades if t.success),
            "symbols": symbols,
            "buy_count": sum(1 for t in day_trades if t.direction == "BUY"),
            "sell_count": sum(1 for t in day_trades if t.direction == "SELL"),
            "total_lots": round(sum(t.lot_size for t in day_trades), 2),
            "total_risk": round(total_risk, 2),
            "avg_rr": round(sum(rr_vals) / len(rr_vals), 2) if rr_vals else None,
            "balance_change": balance_change,
            "trades": [
                {
                    "id": t.id,
                    "account_login": t.account_login,
                    "symbol": t.symbol,
                    "direction": t.direction,
                    "lot_size": t.lot_size,
                    "entry_price": t.entry_price,
                    "sl_price": t.sl_price,
                    "tp_price": t.tp_price,
                    "sl_pips": t.sl_pips,
                    "tp_pips": t.tp_pips,
                    "risk_pct": t.risk_pct,
                    "risk_amount": t.risk_amount,
                    "reward_amount": t.reward_amount,
                    "rr_ratio": t.rr_ratio,
                    "order_ticket": t.order_ticket,
                    "success": t.success,
                    "error_msg": t.error_msg,
                    "executed_at": t.executed_at.isoformat() if t.executed_at else None,
                }
                for t in day_trades
            ],
        })

    return {"days": journal_days}


@router.get("/trade-history")
async def get_trade_history(account_id: Optional[int] = None, limit: int = 200, db: Session = Depends(get_db)):
    """Get trade records. Optionally filter by account DB id."""
    query = db.query(TradeRecord)
    if account_id is not None:
        query = query.filter(TradeRecord.account_db_id == account_id)
    trades = query.order_by(TradeRecord.executed_at.desc()).limit(limit).all()

    data = [
        {
            "id": t.id,
            "account_login": t.account_login,
            "symbol": t.symbol,
            "direction": t.direction,
            "lot_size": t.lot_size,
            "entry_price": t.entry_price,
            "sl_price": t.sl_price,
            "tp_price": t.tp_price,
            "sl_pips": t.sl_pips,
            "tp_pips": t.tp_pips,
            "risk_pct": t.risk_pct,
            "risk_amount": t.risk_amount,
            "reward_amount": t.reward_amount,
            "rr_ratio": t.rr_ratio,
            "order_ticket": t.order_ticket,
            "success": t.success,
            "error_msg": t.error_msg,
            "executed_at": t.executed_at.isoformat() if t.executed_at else None,
        }
        for t in trades
    ]
    return {"trades": data}
