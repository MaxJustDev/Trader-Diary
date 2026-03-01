from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
import json
from app.database import get_db
from app.models.funds import Fund, FundProgram, FundPhaseRule
from app.schemas import FundCreate, FundResponse, FundFromTemplateRequest

router = APIRouter()

# Full fund templates based on Template_Propfirm.md
# account_name_patterns: checked in order against MT5 account name, first match wins
# Each pattern: {"contains": "substring", "program": "program_name", "phase": "phase_name"}
FUND_TEMPLATES = {
    "FTMO": {
        "fund_name": "FTMO",
        "server_pattern": "FTMO-Server",

        "name_format": None,  # FTMO uses contains-based matching
        "account_name_patterns": [
            # 1-Phase program
            {"contains": "FTMO 1Step Challenge", "program": "1 Phase", "phase": "Phase 1"},
            {"contains": "FTMO 1Step Trader", "program": "1 Phase", "phase": "Funded"},
            # 2-Phase program
            {"contains": "Verification", "program": "2 Phase", "phase": "Phase 2"},
            {"contains": "Challenge", "program": "2 Phase", "phase": "Phase 1"},
            {"contains": "FTMO Trader", "program": "2 Phase", "phase": "Funded"},
            {"contains": "Trader", "program": "2 Phase", "phase": "Funded"},
        ],
        "programs": [
            {
                "program_name": "1 Phase",
                "payout_days": 14,
                "payout_type": "fixed",
                "best_day_rule_pct": 50.0,
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 10.0,
                        "daily_drawdown": 3.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "eod_trailing",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 2,
                        "profit_target": None,
                        "daily_drawdown": 3.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "eod_trailing",
                    },
                ],
            },
            {
                "program_name": "2 Phase",
                "min_trading_days": 4,
                "payout_days": 14,
                "payout_type": "fixed",
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 10.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Phase 2",
                        "phase_order": 2,
                        "profit_target": 5.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 3,
                        "profit_target": None,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                ],
            },
        ],
    },
    "The5ers": {
        "fund_name": "The5ers",
        "server_pattern": "FivePercentOnline-Real",

        # MT5 account name format: "{phase_code}-{balance} {trader_name}"
        # e.g. "FHS-7.5K Manh Ngo", "HG1-10K Manh Ngo", "BC1-5K Manh Ngo"
        "name_format": "{phase}-{bal} {name}",
        "account_name_patterns": [
            # High Stakes Funding (2-step) — HS1, HS2, FHS
            {"contains": "FHS", "program": "High Stakes", "phase": "Funded"},
            {"contains": "HS2", "program": "High Stakes", "phase": "Phase 2"},
            {"contains": "HS1", "program": "High Stakes", "phase": "Phase 1"},
            # Hyper Growth (1-step) — HG1, FHG
            {"contains": "FHG", "program": "Hyper Growth", "phase": "Funded"},
            {"contains": "HG1", "program": "Hyper Growth", "phase": "Phase 1"},
            # Bootcamp (3-step) — BC1, BC2, BC3, FBC
            {"contains": "FBC", "program": "Bootcamp", "phase": "Funded"},
            {"contains": "BC3", "program": "Bootcamp", "phase": "Phase 3"},
            {"contains": "BC2", "program": "Bootcamp", "phase": "Phase 2"},
            {"contains": "BC1", "program": "Bootcamp", "phase": "Phase 1"},
        ],
        "programs": [
            # ── High Stakes Funding Program ──────────────────────────────
            # 2-step evaluation. Leverage 1:100. Assets: FX, Metals, Indices, Oil, Crypto.
            # Profitable day = ≥0.5% gain of initial balance (midnight formula).
            # Daily loss = 5% of higher of start-of-day balance OR equity (static).
            # Scaling target: 10% per milestone. Profit split: 80% → 100%.
            {
                "program_name": "High Stakes",
                "min_profit_days": 3,
                "profit_day_threshold_pct": 0.5,
                "payout_days": 14,
                "payout_type": "on_demand",
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 8.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Phase 2",
                        "phase_order": 2,
                        "profit_target": 5.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 3,
                        "profit_target": 10.0,   # 10% per scaling milestone
                        "daily_drawdown": 5.0,
                        "max_drawdown": 10.0,
                        "drawdown_type": "static",
                    },
                ],
            },
            # ── Hyper Growth Program ─────────────────────────────────────
            # 1-step evaluation. Leverage 1:30. Assets: FX, Metals, Indices, Crypto.
            # NO daily stop-loss — uses Daily Pause (3%) instead (resets at 00:00, does NOT terminate).
            # Stop Out (6% below initial balance) = permanent termination.
            # No minimum trading days. News trading allowed (no bracket strategies).
            # Scaling: 10% gain doubles account. Max capital $4,000,000.
            {
                "program_name": "Hyper Growth",
                "payout_days": 14,
                "payout_type": "on_demand",
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 10.0,
                        "daily_drawdown": 3.0,   # Daily Pause — pauses trading, resets daily
                        "max_drawdown": 6.0,     # Stop Out — permanent termination
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 2,
                        "profit_target": 10.0,   # 10% per scaling milestone
                        "daily_drawdown": 3.0,
                        "max_drawdown": 6.0,
                        "drawdown_type": "static",
                    },
                ],
            },
            # ── Bootcamp Program ─────────────────────────────────────────
            # 3-step evaluation. Leverage 1:30.
            # Eval plans: $5K→$20K funded / $10K→$100K funded / $15K→$250K funded.
            # MANDATORY: stop-loss on every position, max 2% risk per trade.
            # 5 violations (no SL or >2% risk) = account termination.
            # Funded: 3% Daily Pause, 4% max loss, 5% scaling target.
            # Max $4,000,000. Profit split up to 100%.
            {
                "program_name": "Bootcamp",
                "payout_days": 14,
                "payout_type": "on_demand",
                "max_risk_per_trade_pct": 2.0,   # HARD RULE: max 2% risk per trade, SL mandatory
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 6.0,
                        "daily_drawdown": 5.0,   # Max loss (no separate daily limit in eval)
                        "max_drawdown": 5.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Phase 2",
                        "phase_order": 2,
                        "profit_target": 6.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 5.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Phase 3",
                        "phase_order": 3,
                        "profit_target": 6.0,
                        "daily_drawdown": 5.0,
                        "max_drawdown": 5.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 4,
                        "profit_target": 5.0,    # 5% per scaling milestone
                        "daily_drawdown": 3.0,   # Daily Pause
                        "max_drawdown": 4.0,
                        "drawdown_type": "static",
                    },
                ],
            },
        ],
    },
    "Fortrades": {
        "fund_name": "Fortrades",
        "server_pattern": "FTTrading-Server",

        "name_format": "{bal} - {type} - {phase}",
        "account_name_patterns": [
            # Fortrades MT5 name format: "$6K - Fast - Phase 1"
            # Phase is the last segment after " - "
            {"contains": "Funded", "program": "1 Phase", "phase": "Funded"},
            {"contains": "FT Trader", "program": "1 Phase", "phase": "Funded"},
            {"contains": "Phase 1", "program": "1 Phase", "phase": "Phase 1"},
            {"contains": "Challenge", "program": "1 Phase", "phase": "Phase 1"},
            {"contains": "Evaluation", "program": "1 Phase", "phase": "Phase 1"},
        ],
        "programs": [
            {
                "program_name": "1 Phase",
                "min_trading_days": 3,
                "max_margin_pct": 40.0,
                "payout_days": 14,
                "payout_type": "fixed",
                "phase_rules": [
                    {
                        "phase_name": "Phase 1",
                        "phase_order": 1,
                        "profit_target": 9.0,
                        "daily_drawdown": 3.0,
                        "max_drawdown": 6.0,
                        "drawdown_type": "static",
                    },
                    {
                        "phase_name": "Funded",
                        "phase_order": 2,
                        "profit_target": None,
                        "daily_drawdown": 3.0,
                        "max_drawdown": 6.0,
                        "drawdown_type": "static",
                    },
                ],
            },
        ],
    },
}


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
    for key, data in FUND_TEMPLATES.items():
        existing = db.query(Fund).filter(Fund.fund_name == data["fund_name"]).first()
        if existing:
            db.delete(existing)
            db.flush()
        _create_fund_from_data(data, db)
        updated.append(data["fund_name"])
    return {"updated": updated}


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
