from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models.accounts import Account
from app.models.funds import FundProgram, FundPhaseRule
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
        .all()
    )

    checker = RuleChecker(db)
    results = []

    for account in accounts:
        balance = account.balance or 0
        equity = account.equity or 0
        starting_balance = account.starting_balance or balance

        # Use balance as proxy for daily_starting_equity
        rules = checker.check_account_rules(
            account_type=account.account_type,
            fund_program_id=account.fund_program_id,
            current_phase=account.current_phase,
            balance=balance,
            equity=equity,
            starting_balance=starting_balance,
            daily_starting_equity=balance,
        )

        profit_info = {"achieved": False, "target": None, "current": 0, "progress": 0}
        if account.fund_program_id and account.current_phase:
            profit_info = checker.check_profit_target(
                fund_program_id=account.fund_program_id,
                current_phase=account.current_phase,
                starting_balance=starting_balance,
                current_equity=equity,
            )

        # Get fund/program display names
        fund_name = None
        program_name = None
        daily_drawdown_limit = 0
        max_drawdown_limit = 0
        if account.fund_program_id:
            program = (
                db.query(FundProgram)
                .filter(FundProgram.id == account.fund_program_id)
                .first()
            )
            if program:
                program_name = program.program_name
                if program.fund:
                    fund_name = program.fund.fund_name
                # Get phase rule limits
                phase_rule = None
                if account.current_phase:
                    phase_rule = (
                        db.query(FundPhaseRule)
                        .filter(
                            FundPhaseRule.program_id == program.id,
                            FundPhaseRule.phase_name == account.current_phase,
                        )
                        .first()
                    )
                if not phase_rule:
                    phase_rule = (
                        db.query(FundPhaseRule)
                        .filter(FundPhaseRule.program_id == program.id)
                        .order_by(FundPhaseRule.phase_order)
                        .first()
                    )
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
            # Daily loss
            "daily_loss_pct": daily_loss_pct,
            "daily_drawdown_limit": daily_drawdown_limit,
            "daily_status": _status_label(daily_loss_pct, daily_drawdown_limit),
            # Max drawdown
            "max_loss_pct": max_loss_pct,
            "max_drawdown_limit": max_drawdown_limit,
            "max_dd_status": _status_label(max_loss_pct, max_drawdown_limit),
            "drawdown_type": rules.get("drawdown_type", "static"),
            # Profit target
            "profit_pct": profit_info.get("current", 0),
            "profit_target": profit_info.get("target"),
            "profit_progress": profit_info.get("progress", 0),
            "profit_achieved": profit_info.get("achieved", False),
            # Overall
            "locked": rules.get("locked", False),
            "violations": rules.get("violations", []),
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
async def get_equity_curve():
    """Get equity curve data (placeholder for MVP)"""
    return {"data": []}


@router.get("/trade-history")
async def get_trade_history():
    """Get trade history (placeholder for MVP)"""
    return {"trades": []}
