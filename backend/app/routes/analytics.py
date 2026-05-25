from fastapi import APIRouter, Depends, HTTPException  # noqa: F401 (HTTPException used below)
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
from app.services.rule_checker import RuleChecker
import MetaTrader5 as _mt5
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


def _serialize_trade(t: TradeRecord) -> dict:
    return {
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
        "notes": t.notes,
        "tags": t.tags,
        "close_price": t.close_price,
        "realized_pnl": t.realized_pnl,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        "executed_at": t.executed_at.isoformat() if t.executed_at else None,
    }


@router.post("/sync-realized-pnl")
async def sync_realized_pnl(db: Session = Depends(get_db)):
    """Match closed MT5 deals to trade records by order ticket and fill realized_pnl."""
    from app.services.mt5_singleton import mt5_service, get_connected_account_id
    if not mt5_service.is_initialized or not get_connected_account_id():
        raise HTTPException(status_code=400, detail="MT5 must be connected to sync P&L")

    # Pull all trade records that have an order ticket but no realized_pnl yet
    pending = (
        db.query(TradeRecord)
        .filter(TradeRecord.order_ticket.isnot(None), TradeRecord.realized_pnl.is_(None))
        .all()
    )
    if not pending:
        return {"synced": 0, "message": "Nothing to sync"}

    # Fetch last 365 days of MT5 history
    date_from = datetime.now() - timedelta(days=365)
    deals = _mt5.history_deals_get(date_from, datetime.now())
    if deals is None:
        raise HTTPException(status_code=500, detail="Failed to fetch MT5 deal history")

    # Build lookup: order → list of OUT deals (closing deals)
    from collections import defaultdict as _ddict
    order_to_deal: dict = _ddict(list)
    for d in deals:
        # DEAL_ENTRY_OUT = 1 (closing deal)
        if hasattr(d, "entry") and d.entry == 1:
            order_to_deal[d.order].append(d)

    synced = 0
    for trade in pending:
        closing_deals = order_to_deal.get(trade.order_ticket, [])
        if not closing_deals:
            continue
        # Sum profit across all closing deals for this order (partial closes)
        total_pnl = sum(d.profit + getattr(d, "commission", 0) + getattr(d, "swap", 0) for d in closing_deals)
        last_deal = max(closing_deals, key=lambda d: d.time)
        trade.realized_pnl = round(total_pnl, 2)
        trade.close_price = last_deal.price
        trade.closed_at = datetime.fromtimestamp(last_deal.time)
        synced += 1

    db.commit()
    return {"synced": synced, "total_pending": len(pending)}


class TradeNoteUpdate(BaseModel):
    notes: str


@router.patch("/trade/{trade_id}/note")
async def update_trade_note(trade_id: int, data: TradeNoteUpdate, db: Session = Depends(get_db)):
    """Update the notes field on a trade record."""
    trade = db.query(TradeRecord).filter(TradeRecord.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade.notes = data.notes.strip()
    db.commit()
    return {"id": trade_id, "notes": trade.notes}


class TradeTagsUpdate(BaseModel):
    tags: str  # comma-separated


@router.patch("/trade/{trade_id}/tags")
async def update_trade_tags(trade_id: int, data: TradeTagsUpdate, db: Session = Depends(get_db)):
    """Update the tags field on a trade record."""
    trade = db.query(TradeRecord).filter(TradeRecord.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade.tags = data.tags.strip()
    db.commit()
    return {"id": trade_id, "tags": trade.tags}


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
            "trades": [_serialize_trade(t) for t in day_trades],
        })

    return {"days": journal_days}


@router.get("/trade-history")
async def get_trade_history(account_id: Optional[int] = None, limit: int = 200, db: Session = Depends(get_db)):
    """Get trade records. Optionally filter by account DB id."""
    query = db.query(TradeRecord)
    if account_id is not None:
        query = query.filter(TradeRecord.account_db_id == account_id)
    trades = query.order_by(TradeRecord.executed_at.desc()).limit(limit).all()

    return {"trades": [_serialize_trade(t) for t in trades]}
