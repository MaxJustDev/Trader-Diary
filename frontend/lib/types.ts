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
    updated_at?: string;
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

// Per-account symbol resolution (Batch G)
export type SymbolConfidence = "exact" | "user_alias" | "suffix" | "fuzzy" | "not_found";

export interface SymbolCheckV2Account {
    account_id: string;     // MT5 login string
    id: number;             // DB primary key
    available: boolean;
    resolved_symbol: string | null;
    confidence: SymbolConfidence;
    alternatives: string[];
}

export interface SymbolCheckV2Response {
    results: SymbolCheckV2Account[];
    tick: { bid: number; ask: number; last: number } | null;
}

// Multi-process v2 stream — tagged by account_db_id, broadcasts from N workers
export interface MT5StreamV2Tick {
    account_db_id: number;
    event: 'tick';
    data: {
        account_info: MT5AccountInfo | null;
        positions: MT5Position[];
        ts: string;
    };
}

export interface MT5StreamV2Health {
    account_db_id: number;
    event: 'health';
    data: {
        state: 'ready' | 'bootstrap_failed' | 'disconnected' | 'reconnecting' | 'recovered' | 'reconnect_failed' | 'exited';
        message?: string;
        connected?: boolean;
        returncode?: number | null;
    };
}

export interface MT5StreamV2Status {
    account_db_id: null;
    event: 'status';
    data: { active_account_ids: number[] };
}

export type MT5StreamV2Message = MT5StreamV2Tick | MT5StreamV2Health | MT5StreamV2Status;

// Per-account live snapshot built by useMT5StreamV2 from incoming ticks
export interface AccountStreamState {
    account_db_id: number;
    accountInfo: MT5AccountInfo | null;
    positions: MT5Position[];
    equityHistory: EquityDataPoint[];
    lastTickAt: number;          // Date.now() at most recent tick
    health: 'ready' | 'disconnected' | 'reconnecting' | 'bootstrap_failed' | 'exited' | 'unknown';
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
    best_day_pct?: number | null;
    best_day_limit?: number | null;
}

/**
 * Pre-trade fund rule status returned by calculate-position.
 * Only populated for fund accounts — personal accounts get level="ok" with null headroom.
 */
export interface PreTradeStatus {
    level: "ok" | "warning" | "blocked";
    blocked: boolean;
    block_reasons: string[];
    warnings: string[];
    // Daily DD
    daily_loss_amount?: number;
    daily_loss_pct?: number;
    daily_dd_limit_pct?: number;
    daily_dd_limit_amount?: number;
    daily_room_amount?: number;
    daily_room_pct?: number;
    // Max DD
    max_loss_amount?: number;
    max_loss_pct?: number;
    max_dd_limit_pct?: number;
    max_dd_limit_amount?: number;
    max_room_amount?: number;
    effective_baseline?: number;
    drawdown_type?: string;
    // Best day
    today_pnl?: number;
    best_day_limit_pct?: number | null;
    best_day_limit_amount?: number | null;
    best_day_room?: number | null;
    // Trade projection
    risk_amount?: number;
    would_breach_daily_if_sl?: boolean;
    would_breach_max_if_sl?: boolean;
    daily_room_after_sl?: number;
    max_room_after_sl?: number;
    phase?: string | null;
}

export interface FundTemplate {
    fund_name: string;
    server_pattern: string;
    name_format?: string;
    programs: FundTemplateProgram[];
}
