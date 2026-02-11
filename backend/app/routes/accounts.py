from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
from app.database import get_db
from app.models.accounts import Account
from app.models.funds import Fund, FundProgram
from app.schemas import AccountCreate, AccountUpdate, AccountResponse
from app.services.mt5_service import MT5Service
from app.services.mt5_terminal import create_terminal_copy, delete_terminal_copy
from app.services.encryption import encrypt_password, decrypt_password
from app.services.phase_detector import detect_phase, parse_starting_balance

router = APIRouter()
logger = logging.getLogger(__name__)


def _find_fund_by_server(server: str, funds: list) -> Optional[Fund]:
    """Find matching fund from server name."""
    for fund in funds:
        if fund.server_pattern.lower() in server.lower():
            return fund
    return None


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
    account_type, fund_program_id, and current_phase are auto-detected.
    Also logs into MT5 to read account name and detect phase."""
    existing = db.query(Account).filter(Account.account_id == account_data.account_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists")

    # Always try to match fund from server pattern
    funds = db.query(Fund).all()
    matched_fund = _find_fund_by_server(account_data.server, funds)

    # Set account type and defaults based on fund match
    if matched_fund:
        account_type = "fund"
        fund_program_id = None
        current_phase = None
        if matched_fund.programs:
            program = matched_fund.programs[0]
            fund_program_id = program.id
            if program.phase_rules:
                first_phase = min(program.phase_rules, key=lambda r: r.phase_order)
                current_phase = first_phase.phase_name
    else:
        account_type = account_data.account_type or "personal"
        fund_program_id = account_data.fund_program_id
        current_phase = account_data.current_phase

    encrypted = encrypt_password(account_data.password)

    # Create a dedicated MT5 terminal copy for this account
    try:
        mt5_path = create_terminal_copy(account_data.account_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    account = Account(
        account_id=account_data.account_id,
        password=encrypted,
        server=account_data.server,
        account_type=account_type,
        fund_program_id=fund_program_id,
        current_phase=current_phase,
        mt5_path=mt5_path,
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    # Try to login to MT5 to read account name and auto-detect phase
    mt5 = MT5Service()
    try:
        if mt5.login(int(account_data.account_id), account_data.password, account_data.server, path=mt5_path):
            info = mt5.get_account_info()
            if info:
                mt5_name = info.get("name", "")
                account.mt5_name = mt5_name
                account.balance = info.get("balance")
                account.equity = info.get("equity")
                account.profit = info.get("profit")

                # Auto-set starting_balance from MT5 name, fallback to balance
                parsed_bal = parse_starting_balance(mt5_name) if mt5_name else None
                account.starting_balance = parsed_bal or info.get("balance")

                # Try phase detection if we have a matched fund
                if matched_fund and mt5_name:
                    detected = detect_phase(mt5_name, matched_fund)
                    if detected:
                        for prog in matched_fund.programs:
                            if prog.program_name == detected["program_name"]:
                                account.fund_program_id = prog.id
                                account.current_phase = detected["phase_name"]
                                logger.info(
                                    "Auto-detected phase for %s: %s / %s",
                                    account_data.account_id,
                                    detected["program_name"],
                                    detected["phase_name"],
                                )
                                break

                db.commit()
                db.refresh(account)
    except Exception as e:
        logger.warning("MT5 phase detection failed for %s: %s", account_data.account_id, e)
    finally:
        mt5.shutdown()

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

    if account_data.starting_balance is not None:
        account.starting_balance = account_data.starting_balance

    if account_data.next_payout_date is not None:
        account.next_payout_date = account_data.next_payout_date

    db.commit()
    db.refresh(account)

    return account


@router.delete("/{account_id}")
async def delete_account(account_id: int, db: Session = Depends(get_db)):
    """Delete account and its dedicated MT5 terminal folder"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Clean up the per-account MT5 terminal copy
    try:
        delete_terminal_copy(account.account_id)
    except Exception as e:
        logger.warning("Failed to delete terminal folder for %s: %s", account.account_id, e)

    db.delete(account)
    db.commit()

    return {"message": "Account deleted successfully"}


@router.post("/refresh-all")
async def refresh_all_accounts(db: Session = Depends(get_db)):
    """Init all accounts: login to MT5 one by one, fetch data, detect phase, save to DB."""
    accounts = db.query(Account).all()
    if not accounts:
        return {"results": []}

    funds = db.query(Fund).all()
    mt5 = MT5Service()
    results = []

    for account in accounts:
        try:
            password = decrypt_password(account.password)
            matched_fund = _find_fund_by_server(account.server, funds)

            # Shutdown before each account to ensure clean state
            mt5.shutdown()

            if mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
                info = mt5.get_account_info()
                positions = mt5.get_positions()

                if info:
                    account.mt5_name = info.get("name", "")
                    account.balance = info.get("balance")
                    account.equity = info.get("equity")
                    account.profit = info.get("profit")

                    # Auto-populate starting_balance if not set
                    if not account.starting_balance:
                        parsed_bal = parse_starting_balance(account.mt5_name) if account.mt5_name else None
                        account.starting_balance = parsed_bal or info.get("balance")

                    if matched_fund and account.mt5_name:
                        detected = detect_phase(account.mt5_name, matched_fund)
                        if detected:
                            for prog in matched_fund.programs:
                                if prog.program_name == detected["program_name"]:
                                    account.fund_program_id = prog.id
                                    account.current_phase = detected["phase_name"]
                                    break

                    db.commit()

                results.append({
                    "id": account.id,
                    "account_id": account.account_id,
                    "mt5_name": account.mt5_name,
                    "balance": info["balance"] if info else 0,
                    "equity": info["equity"] if info else 0,
                    "profit": info["profit"] if info else 0,
                    "positions_count": len(positions),
                    "current_phase": account.current_phase,
                    "status": "success",
                })
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

    mt5.shutdown()

    return {"results": results}
