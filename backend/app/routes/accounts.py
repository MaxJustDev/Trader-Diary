from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.accounts import Account
from app.models.funds import Fund, FundProgram
from app.schemas import AccountCreate, AccountUpdate, AccountResponse
from app.services.mt5_service import MT5Service
from app.services.encryption import encrypt_password, decrypt_password

router = APIRouter()


@router.get("/", response_model=List[AccountResponse])
async def get_accounts(db: Session = Depends(get_db)):
    """Get all accounts"""
    accounts = db.query(Account).all()
    return accounts


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: int, db: Session = Depends(get_db)):
    """Get account by ID"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/", response_model=AccountResponse)
async def create_account(account_data: AccountCreate, db: Session = Depends(get_db)):
    """Create new account with auto-detection from server pattern.
    Only 3 fields required: account_id, password, server.
    account_type, fund_program_id, and current_phase are auto-detected."""
    existing = db.query(Account).filter(Account.account_id == account_data.account_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists")

    # Auto-detect fund from server pattern
    account_type = account_data.account_type or "personal"
    fund_program_id = account_data.fund_program_id
    current_phase = account_data.current_phase

    if not fund_program_id:
        funds = db.query(Fund).all()
        for fund in funds:
            if fund.server_pattern.lower() in account_data.server.lower():
                account_type = "fund"
                if fund.programs:
                    # Pick first program
                    program = fund.programs[0]
                    fund_program_id = program.id
                    # Pick first phase (lowest phase_order)
                    if not current_phase and program.phase_rules:
                        first_phase = min(program.phase_rules, key=lambda r: r.phase_order)
                        current_phase = first_phase.phase_name
                break

    encrypted = encrypt_password(account_data.password)

    account = Account(
        account_id=account_data.account_id,
        password=encrypted,
        server=account_data.server,
        account_type=account_type,
        fund_program_id=fund_program_id,
        current_phase=current_phase,
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    return account


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    account_data: AccountUpdate,
    db: Session = Depends(get_db),
):
    """Update account"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account_data.password:
        account.password = encrypt_password(account_data.password)

    if account_data.current_phase is not None:
        account.current_phase = account_data.current_phase

    if account_data.fund_program_id is not None:
        account.fund_program_id = account_data.fund_program_id

    db.commit()
    db.refresh(account)

    return account


@router.delete("/{account_id}")
async def delete_account(account_id: int, db: Session = Depends(get_db)):
    """Delete account"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    db.delete(account)
    db.commit()

    return {"message": "Account deleted successfully"}


@router.post("/refresh-all")
async def refresh_all_accounts(db: Session = Depends(get_db)):
    """Refresh data for all accounts"""
    accounts = db.query(Account).all()
    mt5 = MT5Service()
    results = []

    for account in accounts:
        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server):
                info = mt5.get_account_info()
                positions = mt5.get_positions()

                results.append({
                    "id": account.id,
                    "account_id": account.account_id,
                    "balance": info["balance"] if info else 0,
                    "equity": info["equity"] if info else 0,
                    "margin": info["margin_free"] if info else 0,
                    "profit": info["profit"] if info else 0,
                    "positions_count": len(positions),
                    "status": "success",
                })

                mt5.logout()
            else:
                results.append({
                    "id": account.id,
                    "account_id": account.account_id,
                    "status": "failed",
                    "error": "Login failed",
                })
        except Exception as e:
            results.append({
                "id": account.id,
                "account_id": account.account_id,
                "status": "error",
                "error": str(e),
            })

    return {"results": results}
