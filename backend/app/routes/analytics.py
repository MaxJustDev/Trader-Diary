from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.accounts import Account
from app.services.mt5_service import MT5Service
from app.services.encryption import decrypt_password
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/summary")
async def get_summary(db: Session = Depends(get_db)):
    """Get analytics summary for all accounts"""
    accounts = db.query(Account).all()
    mt5 = MT5Service()
    mt5.initialize()

    total_balance = 0
    total_equity = 0
    total_profit = 0
    total_positions = 0
    errors = []

    for account in accounts:
        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server):
                info = mt5.get_account_info()
                positions = mt5.get_positions()

                if info:
                    total_balance += info["balance"]
                    total_equity += info["equity"]
                    total_profit += info["profit"]
                    total_positions += len(positions)

                mt5.logout()
        except Exception as e:
            logger.warning("Failed to fetch data for account %s: %s", account.account_id, e)
            errors.append({"account_id": account.account_id, "error": str(e)})

    mt5.shutdown()

    return {
        "total_accounts": len(accounts),
        "total_balance": round(total_balance, 2),
        "total_equity": round(total_equity, 2),
        "total_profit": round(total_profit, 2),
        "total_positions": total_positions,
        "errors": errors,
    }


@router.get("/equity-curve")
async def get_equity_curve():
    """Get equity curve data (placeholder for MVP)"""
    return {"data": []}


@router.get("/trade-history")
async def get_trade_history():
    """Get trade history (placeholder for MVP)"""
    return {"trades": []}
