from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.accounts import Account
from app.schemas import PositionCalculateRequest, BatchTradeRequest, SymbolCheckRequest
from app.services.mt5_service import MT5Service
from app.services.position_sizer import PositionSizer
from app.services.encryption import decrypt_password

router = APIRouter()


@router.post("/check-symbol")
async def check_symbol(
    request: SymbolCheckRequest,
    db: Session = Depends(get_db),
):
    """Check symbol availability across multiple accounts, return tick price from first available"""
    mt5 = MT5Service()
    results = []
    tick = None

    for account_id in request.account_ids:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            continue

        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
                symbol_info = mt5.get_symbol_info(request.symbol)
                available = symbol_info is not None

                # Get tick price from the first available account
                if available and tick is None:
                    tick = mt5.get_tick_price(request.symbol)

                results.append({
                    "account_id": account.account_id,
                    "id": account.id,
                    "available": available,
                })
                mt5.logout()
            else:
                results.append({
                    "account_id": account.account_id,
                    "id": account.id,
                    "available": False,
                })
        except Exception:
            results.append({
                "account_id": account.account_id,
                "id": account.id,
                "available": False,
            })

    mt5.shutdown()

    return {
        "results": results,
        "tick": tick,
    }


@router.post("/calculate-position")
async def calculate_position(
    request: PositionCalculateRequest,
    db: Session = Depends(get_db),
):
    """Calculate position size (lot) for multiple accounts using EA-style sizing"""
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    results = []

    for account_id in request.account_ids:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            continue

        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
                info = mt5.get_account_info()

                if info:
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

                    results.append({
                        "account_id": account.account_id,
                        "balance": info["balance"],
                        "calculation": calc,
                        "margin_ok": margin_ok,
                    })

                mt5.logout()
        except Exception as e:
            results.append({
                "account_id": account.account_id,
                "error": str(e),
            })

    mt5.shutdown()

    return {"results": results}


@router.post("/execute-batch")
async def execute_batch(
    request: BatchTradeRequest,
    db: Session = Depends(get_db),
):
    """Execute batch orders on multiple accounts"""
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    accounts_data = []

    for account_id in request.account_ids:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            continue

        try:
            password = decrypt_password(account.password)

            if mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
                info = mt5.get_account_info()

                if info:
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

    failed_margin = [acc for acc in accounts_data if not acc.get("margin_ok")]
    if failed_margin:
        mt5.shutdown()
        raise HTTPException(
            status_code=400,
            detail=f"{len(failed_margin)} account(s) don't have enough margin",
        )

    results = []

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

                results.append({
                    "account_id": account.account_id,
                    "success": result.get("success", False),
                    "order": result.get("order"),
                    "error": result.get("error"),
                })

                mt5.logout()
        except Exception as e:
            results.append({
                "account_id": account.account_id,
                "success": False,
                "error": str(e),
            })

    mt5.shutdown()

    successful = sum(1 for r in results if r.get("success"))

    return {
        "total": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "results": results,
    }
