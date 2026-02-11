from pydantic import BaseModel
from typing import Optional, List


# --- Phase Rule Schemas ---

class FundPhaseRuleCreate(BaseModel):
    phase_name: str
    phase_order: int
    profit_target: Optional[float] = None
    daily_drawdown: float
    max_drawdown: float
    drawdown_type: str = "static"


class FundPhaseRuleResponse(BaseModel):
    id: int
    program_id: int
    phase_name: str
    phase_order: int
    profit_target: Optional[float]
    daily_drawdown: float
    max_drawdown: float
    drawdown_type: str

    class Config:
        from_attributes = True


# --- Program Schemas ---

class FundProgramCreate(BaseModel):
    program_name: str
    min_trading_days: Optional[int] = None
    max_margin_pct: Optional[float] = None
    payout_days: Optional[int] = None
    payout_type: Optional[str] = None
    best_day_rule_pct: Optional[float] = None
    min_profit_days: Optional[int] = None
    profit_day_threshold_pct: Optional[float] = None
    phase_rules: List[FundPhaseRuleCreate]


class FundProgramResponse(BaseModel):
    id: int
    fund_id: int
    program_name: str
    min_trading_days: Optional[int]
    max_margin_pct: Optional[float]
    payout_days: Optional[int]
    payout_type: Optional[str]
    best_day_rule_pct: Optional[float]
    min_profit_days: Optional[int]
    profit_day_threshold_pct: Optional[float]
    phase_rules: List[FundPhaseRuleResponse] = []

    class Config:
        from_attributes = True


# --- Fund Schemas ---

class FundCreate(BaseModel):
    fund_name: str
    server_pattern: str
    name_format: Optional[str] = None
    programs: List[FundProgramCreate]


class FundResponse(BaseModel):
    id: int
    fund_name: str
    server_pattern: str
    name_format: Optional[str] = None
    account_name_patterns: Optional[str] = None  # JSON string
    programs: List[FundProgramResponse] = []

    class Config:
        from_attributes = True


# --- Account Schemas ---

class AccountCreate(BaseModel):
    account_id: str
    password: str
    server: str
    account_type: Optional[str] = None  # auto-detected from server pattern
    fund_program_id: Optional[int] = None
    current_phase: Optional[str] = None


class AccountUpdate(BaseModel):
    password: Optional[str] = None
    current_phase: Optional[str] = None
    fund_program_id: Optional[int] = None
    starting_balance: Optional[float] = None
    next_payout_date: Optional[str] = None


class AccountResponse(BaseModel):
    id: int
    account_id: str
    server: str
    account_type: str
    fund_program_id: Optional[int]
    current_phase: Optional[str]
    mt5_path: Optional[str] = None
    mt5_name: Optional[str] = None
    balance: Optional[float] = None
    equity: Optional[float] = None
    profit: Optional[float] = None
    starting_balance: Optional[float] = None
    next_payout_date: Optional[str] = None

    class Config:
        from_attributes = True


# --- Trading Schemas ---

class SymbolCheckRequest(BaseModel):
    symbol: str
    account_ids: List[int]


class PositionCalculateRequest(BaseModel):
    symbol: str
    direction: str          # "BUY" or "SELL"
    sl_price: float         # absolute SL price
    tp_price: Optional[float] = None  # absolute TP price
    risk_type: str = "pct"  # "pct" or "fixed"
    risk_value: float       # % of balance or fixed $ amount
    account_ids: List[int]


class BatchTradeRequest(BaseModel):
    symbol: str
    direction: str
    sl_price: float
    tp_price: Optional[float] = None
    risk_type: str = "pct"
    risk_value: float
    account_ids: List[int]


# --- Template Schema ---

class FundFromTemplateRequest(BaseModel):
    template_key: str
