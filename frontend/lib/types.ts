export interface FundPhaseRule {
    id: number;
    program_id: number;
    phase_name: string;
    phase_order: number;
    profit_target: number | null;
    daily_drawdown: number;
    max_drawdown: number;
    drawdown_type: 'static' | 'eod_trailing';
}

export interface FundProgram {
    id: number;
    fund_id: number;
    program_name: string;
    min_trading_days: number | null;
    max_margin_pct: number | null;
    payout_days: number | null;
    payout_type: string | null;
    best_day_rule_pct: number | null;
    min_profit_days: number | null;
    profit_day_threshold_pct: number | null;
    phase_rules: FundPhaseRule[];
}

export interface Fund {
    id: number;
    fund_name: string;
    server_pattern: string;
    name_format?: string;
    account_name_patterns?: string;
    programs: FundProgram[];
}

export interface Account {
    id: number;
    account_id: string;
    server: string;
    account_type: 'fund' | 'personal';
    fund_program_id?: number;
    current_phase?: string;
    mt5_name?: string;
    balance?: number;
    equity?: number;
    profit?: number;
    starting_balance?: number;
    next_payout_date?: string;
}

export interface TradeRequest {
    symbol: string;
    direction: 'BUY' | 'SELL';
    sl_price: number;
    tp_price?: number;
    risk_type: 'pct' | 'fixed';
    risk_value: number;
    account_ids: number[];
}

export interface PositionCalculation {
    lot_size: number;
    entry_price: number;
    sl_price: number;
    tp_price: number;
    sl_pips: number;
    tp_pips: number;
    risk_pct: number;
    risk_amount: number;
    reward_amount: number;
    rr_ratio: number;
}

// MT5 WebSocket types
export interface MT5AccountInfo {
    login: number;
    name: string;
    balance: number;
    equity: number;
    margin: number;
    margin_free: number;
    margin_level: number;
    profit: number;
    currency: string;
}

export interface MT5Position {
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    price_open: number;
    sl: number;
    tp: number;
    profit: number;
    time: string;
}

export interface MT5StreamMessage {
    type: 'update';
    connected_account_id: number;
    account_info: MT5AccountInfo | null;
    positions: MT5Position[];
    timestamp: string;
}

export interface EquityDataPoint {
    time: string;
    balance: number;
    equity: number;
}

// Template types (returned by GET /api/funds/templates)
export interface FundTemplatePhaseRule {
    phase_name: string;
    phase_order: number;
    profit_target: number | null;
    daily_drawdown: number;
    max_drawdown: number;
    drawdown_type: string;
}

export interface FundTemplateProgram {
    program_name: string;
    min_trading_days?: number;
    max_margin_pct?: number;
    payout_days?: number;
    payout_type?: string;
    best_day_rule_pct?: number;
    min_profit_days?: number;
    profit_day_threshold_pct?: number;
    phase_rules: FundTemplatePhaseRule[];
}

export interface FundAccountAnalytics {
    account_id: number;
    account_login: string;
    mt5_name?: string;
    fund_name?: string;
    program_name?: string;
    current_phase?: string;
    balance: number;
    equity: number;
    starting_balance: number;
    next_payout_date?: string;
    daily_loss_pct: number;
    daily_drawdown_limit: number;
    daily_status: 'ok' | 'warning' | 'violated';
    max_loss_pct: number;
    max_drawdown_limit: number;
    max_dd_status: 'ok' | 'warning' | 'violated';
    drawdown_type: string;
    profit_pct: number;
    profit_target: number | null;
    profit_progress: number;
    profit_achieved: boolean;
    locked: boolean;
    violations: string[];
}

export interface FundTemplate {
    fund_name: string;
    server_pattern: string;
    name_format?: string;
    programs: FundTemplateProgram[];
}
