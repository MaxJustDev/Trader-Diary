from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
import json
from app.database import get_db
from app.models.funds import Fund, FundProgram, FundPhaseRule
from app.schemas import FundCreate, FundResponse, FundFromTemplateRequest
from app.services.fund_templates import load_templates

router = APIRouter()

# Keep the FUND_TEMPLATES name for backward compatibility with downstream code
FUND_TEMPLATES = load_templates()


def _create_fund_from_data(data: dict, db: Session) -> Fund:
    """Create a Fund with all programs and phase rules from a dict."""
    # Serialize account_name_patterns to JSON if present
    patterns = data.get("account_name_patterns")
    patterns_json = json.dumps(patterns) if patterns and isinstance(patterns, list) else None

    fund = Fund(
        fund_name=data["fund_name"],
        server_pattern=data["server_pattern"],
        name_format=data.get("name_format"),
        account_name_patterns=patterns_json,
    )
    db.add(fund)
    db.flush()

    for prog_data in data["programs"]:
        program = FundProgram(
            fund_id=fund.id,
            program_name=prog_data["program_name"],
            min_trading_days=prog_data.get("min_trading_days"),
            max_margin_pct=prog_data.get("max_margin_pct"),
            payout_days=prog_data.get("payout_days"),
            payout_type=prog_data.get("payout_type"),
            best_day_rule_pct=prog_data.get("best_day_rule_pct"),
            min_profit_days=prog_data.get("min_profit_days"),
            profit_day_threshold_pct=prog_data.get("profit_day_threshold_pct"),
            max_risk_per_trade_pct=prog_data.get("max_risk_per_trade_pct"),
        )
        db.add(program)
        db.flush()

        for rule_data in prog_data["phase_rules"]:
            rule = FundPhaseRule(
                program_id=program.id,
                phase_name=rule_data["phase_name"],
                phase_order=rule_data["phase_order"],
                profit_target=rule_data.get("profit_target"),
                daily_drawdown=rule_data["daily_drawdown"],
                max_drawdown=rule_data["max_drawdown"],
                drawdown_type=rule_data.get("drawdown_type", "static"),
            )
            db.add(rule)

    db.commit()
    db.refresh(fund)
    return fund


@router.get("/", response_model=List[FundResponse])
async def get_funds(db: Session = Depends(get_db)):
    """Get all funds with programs and phase rules"""
    funds = (
        db.query(Fund)
        .options(joinedload(Fund.programs).joinedload(FundProgram.phase_rules))
        .all()
    )
    return funds


@router.post("/refresh-templates")
async def refresh_templates(db: Session = Depends(get_db)):
    """Upsert all hard-coded templates into the DB (delete existing + recreate)."""
    updated = []
    errors = []
    for key, data in FUND_TEMPLATES.items():
        try:
            existing = db.query(Fund).filter(Fund.fund_name == data["fund_name"]).first()
            if existing:
                db.delete(existing)
                db.flush()
            _create_fund_from_data(data, db)
            updated.append(data["fund_name"])
        except Exception as e:
            errors.append({"fund": data["fund_name"], "error": str(e)})
            db.rollback()
    return {"updated": updated, "errors": errors}


@router.post("/from-template", response_model=FundResponse)
async def create_fund_from_template(
    request: FundFromTemplateRequest, db: Session = Depends(get_db)
):
    """Create a fund from a template"""
    template = FUND_TEMPLATES.get(request.template_key)
    if not template:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template: {request.template_key}. Available: {list(FUND_TEMPLATES.keys())}",
        )

    existing = db.query(Fund).filter(Fund.fund_name == template["fund_name"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Fund already exists")

    fund = _create_fund_from_data(template, db)

    # Re-query with joins for full response
    fund = (
        db.query(Fund)
        .options(joinedload(Fund.programs).joinedload(FundProgram.phase_rules))
        .filter(Fund.id == fund.id)
        .first()
    )
    return fund


@router.post("/", response_model=FundResponse)
async def create_fund(fund_data: FundCreate, db: Session = Depends(get_db)):
    """Create new fund with programs and phase rules"""
    existing = db.query(Fund).filter(Fund.fund_name == fund_data.fund_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Fund already exists")

    data = fund_data.model_dump()
    fund = _create_fund_from_data(data, db)

    fund = (
        db.query(Fund)
        .options(joinedload(Fund.programs).joinedload(FundProgram.phase_rules))
        .filter(Fund.id == fund.id)
        .first()
    )
    return fund


@router.delete("/{fund_id}")
async def delete_fund(fund_id: int, db: Session = Depends(get_db)):
    """Delete fund and all its programs/rules"""
    fund = db.query(Fund).filter(Fund.id == fund_id).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    db.delete(fund)
    db.commit()

    return {"message": "Fund deleted successfully"}
