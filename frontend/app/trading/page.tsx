"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { useAccountStore } from "@/lib/store";
import { PreTradeStatus } from "@/lib/types";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { CheckCircle2, XCircle, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import SessionClock from "@/components/ui/SessionClock";
import PriceAlertsPanel from "@/components/ui/PriceAlertsPanel";
import TradePresets from "@/components/trading/TradePresets";

const TradingViewWidget = dynamic(
    () => import("@/components/charts/TradingViewWidget"),
    { ssr: false }
);

type RiskType = "pct" | "fixed";

interface SymbolAvailability {
    [accountId: number]: boolean;
}

interface TickPrice {
    bid: number;
    ask: number;
}

export default function TradingPage() {
    const { accounts, setAccounts } = useAccountStore();
    const [symbol, setSymbol] = useState("EURUSD");
    const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
    const [slPrice, setSlPrice] = useState<number | "">("");
    const [tpPrice, setTpPrice] = useState<number | "">("");
    const [riskType, setRiskType] = useState<RiskType>("pct");
    const [riskValue, setRiskValue] = useState(1);
    const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
    const [availability, setAvailability] = useState<SymbolAvailability>({});
    const [checkingSymbol, setCheckingSymbol] = useState(false);
    const [symbolChecked, setSymbolChecked] = useState(false);
    const [tick, setTick] = useState<TickPrice | null>(null);
    const [preview, setPreview] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [showExecuteConfirm, setShowExecuteConfirm] = useState(false);
    const [execResults, setExecResults] = useState<any[] | null>(null);
    const [tickUpdatedAt, setTickUpdatedAt] = useState<Date | null>(null);
    const [symbolSuggestions, setSymbolSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const symbolInputRef = useRef<HTMLInputElement>(null);

    const [chartSymbol, setChartSymbol] = useState(symbol);
    const checkAbortRef = useRef<AbortController | null>(null);

    const checkSymbolAvailability = useCallback(async (sym: string, accs: typeof accounts) => {
        if (!sym.trim() || accs.length === 0) {
            setAvailability({});
            setSymbolChecked(false);
            setSelectedAccounts([]);
            setTick(null);
            return;
        }

        checkAbortRef.current?.abort();
        const controller = new AbortController();
        checkAbortRef.current = controller;

        setCheckingSymbol(true);
        setPreview(null);
        try {
            const result = await apiClient.trading.checkSymbol({
                symbol: sym.trim(),
                account_ids: accs.map((a) => a.id),
            });

            if (controller.signal.aborted) return;

            const avail: SymbolAvailability = {};
            const autoSelected: number[] = [];
            for (const item of result.results) {
                avail[item.id] = item.available;
                if (item.available) {
                    autoSelected.push(item.id);
                }
            }
            setAvailability(avail);
            setSelectedAccounts(autoSelected);
            setSymbolChecked(true);
            setTick(result.tick || null);
            if (result.tick) setTickUpdatedAt(new Date());
        } catch {
            if (controller.signal.aborted) return;
            setAvailability({});
            setSymbolChecked(false);
            setSelectedAccounts([]);
            setTick(null);
        } finally {
            if (!controller.signal.aborted) {
                setCheckingSymbol(false);
            }
        }
    }, []);

    useEffect(() => {
        setAvailability({});
        setSymbolChecked(false);
        setSelectedAccounts([]);
        setPreview(null);
        setTick(null);

        const timer = setTimeout(() => {
            setChartSymbol(symbol);
            checkSymbolAvailability(symbol, accounts);
        }, 800);
        return () => clearTimeout(timer);
    }, [symbol, accounts, checkSymbolAvailability]);

    useEffect(() => {
        if (!symbolChecked || accounts.length === 0) return;
        const interval = setInterval(() => {
            checkSymbolAvailability(symbol, accounts);
        }, 30000);
        return () => clearInterval(interval);
    }, [symbolChecked, symbol, accounts, checkSymbolAvailability]);

    // Symbol autocomplete: search when typing (only if MT5 is connected)
    useEffect(() => {
        if (!symbol.trim() || symbol.length < 2) { setSymbolSuggestions([]); return; }
        const timer = setTimeout(async () => {
            try {
                const results = await apiClient.mt5.searchSymbols(symbol);
                setSymbolSuggestions(results.filter((s) => s !== symbol));
            } catch {
                setSymbolSuggestions([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [symbol]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
                e.preventDefault();
                symbolInputRef.current?.focus();
                symbolInputRef.current?.select();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        const loadAccounts = async () => {
            try {
                const data = await apiClient.accounts.getAll();
                setAccounts(data);
            } catch (error) {
                console.error("Failed to load accounts:", error);
            }
        };
        loadAccounts();
    }, [setAccounts]);

    const handleCalculate = async () => {
        if (selectedAccounts.length === 0) {
            toast.error("Please select at least one account");
            return;
        }
        if (!slPrice) {
            toast.error("Please enter a Stop Loss price");
            return;
        }

        setLoading(true);
        try {
            const result = await apiClient.trading.calculatePosition({
                symbol: symbol.trim(),
                direction,
                sl_price: slPrice,
                tp_price: tpPrice || null,
                risk_type: riskType,
                risk_value: riskValue,
                account_ids: selectedAccounts,
            });
            setPreview(result);
        } catch (error: any) {
            toast.error(`Failed to calculate: ${error.message ?? "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = () => {
        if (!preview) return;
        setShowExecuteConfirm(true);
    };

    // Accounts that are blocked by fund rules in the current preview
    const blockedAccountIds = useMemo((): Set<string> => {
        if (!preview?.results) return new Set();
        return new Set(
            preview.results
                .filter((r: any) => r.rule_status?.blocked)
                .map((r: any) => r.account_id as string)
        );
    }, [preview]);

    // Non-blocked accounts with a valid calculation
    const executableAccountIds = useMemo((): number[] => {
        if (!preview?.results) return [];
        const blockedLogins = blockedAccountIds;
        return selectedAccounts.filter(id => {
            const acct = accounts.find(a => a.id === id);
            if (!acct) return false;
            if (blockedLogins.has(acct.account_id)) return false;
            const res = preview.results.find((r: any) => r.account_id === acct.account_id);
            return res && res.calculation && !res.calculation.error;
        });
    }, [preview, selectedAccounts, accounts, blockedAccountIds]);

    const doExecute = async () => {
        setShowExecuteConfirm(false);
        setExecuting(true);
        setExecResults(null);
        try {
            const result = await apiClient.trading.executeBatch({
                symbol: symbol.trim(),
                direction,
                sl_price: slPrice,
                tp_price: tpPrice || null,
                risk_type: riskType,
                risk_value: riskValue,
                account_ids: executableAccountIds,  // blocked accounts excluded
            });
            setExecResults(result.results ?? []);
            if (result.successful === result.total) {
                toast.success(`All ${result.total} order(s) executed successfully`);
            } else if (result.successful > 0) {
                toast.warning(`${result.successful}/${result.total} orders executed — some failed`);
            } else {
                toast.error(`All ${result.total} order(s) failed to execute`);
            }
            setPreview(null);
        } catch (error: any) {
            toast.error(`Failed to execute batch: ${error.message ?? "Unknown error"}`);
        } finally {
            setExecuting(false);
        }
    };

    const tickAge = useMemo(() => {
        if (!tickUpdatedAt) return null;
        const diffS = Math.floor((Date.now() - tickUpdatedAt.getTime()) / 1000);
        if (diffS < 5) return "just now";
        if (diffS < 60) return `${diffS}s ago`;
        return `${Math.floor(diffS / 60)}m ago`;
    }, [tickUpdatedAt, tick]);

    const availableAccounts = accounts.filter((a) => availability[a.id] === true);
    const unavailableAccounts = accounts.filter((a) => availability[a.id] === false);

    const inputClass = "flex-1 p-3 bg-white/[0.06] border border-white/[0.10] rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600";
    const quickBtnClass = "px-3 py-1 text-xs bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg font-mono text-slate-400 transition-all";

    return (
        <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
            <div style={{ marginBottom: "24px" }}>
                <div className="section-label" style={{ marginBottom: "4px" }}>Trading Journal</div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: 0, letterSpacing: "-0.01em" }}>
                    Position Sizer
                </h1>
            </div>

            {/* Symbol Bar + Chart */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", marginBottom: "24px", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase" }}>Symbol</label>
                    <div style={{ position: "relative", flex: 1, maxWidth: "240px" }}>
                        <input
                            ref={symbolInputRef}
                            type="text"
                            value={symbol}
                            onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            onKeyDown={(e) => { if (e.key === "Escape") setShowSuggestions(false); }}
                            className="input-diary"
                            style={{ width: "100%", fontSize: "16px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
                            placeholder="EURUSD"
                            disabled={loading}
                        />
                        <kbd style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)", pointerEvents: "none" }}>
                            /
                        </kbd>
                        {showSuggestions && symbolSuggestions.length > 0 && (
                            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#0d1117", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", zIndex: 100, maxHeight: "240px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                {symbolSuggestions.map((s) => (
                                    <div
                                        key={s}
                                        onMouseDown={() => { setSymbol(s); setShowSuggestions(false); }}
                                        style={{ padding: "8px 12px", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", color: "#f0f4f8", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {checkingSymbol && (
                        <span style={{ fontSize: "12px", color: "var(--cyan)", animation: "fade-in 0.2s" }}>Checking...</span>
                    )}
                    {symbolChecked && !checkingSymbol && (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {availableAccounts.length}/{accounts.length} available
                        </span>
                    )}
                    {tick && !checkingSymbol && (
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}>
                            {tickAge && <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'Sora', sans-serif" }}>{tickAge}</span>}
                            <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>Bid</span>
                            <button
                                onClick={() => setSlPrice(tick.bid)}
                                style={{ color: "var(--rose)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
                                title="Click to set as SL"
                                aria-label="Use bid price as stop loss"
                            >
                                {tick.bid}
                            </button>
                            <span style={{ color: "var(--text-dim)" }}>|</span>
                            <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>Ask</span>
                            <button
                                onClick={() => setTpPrice(tick.ask)}
                                style={{ color: "var(--emerald)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
                                title="Click to set as TP"
                                aria-label="Use ask price as take profit"
                            >
                                {tick.ask}
                            </button>
                        </div>
                    )}
                </div>
                <div style={{ height: 500 }}>
                    <TradingViewWidget symbol={chartSymbol} />
                </div>
            </div>

            {/* Session Clock + Price Alerts row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <SessionClock />
                <PriceAlertsPanel symbol={symbol} tick={tick} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" }}>
                {/* Position Sizer Form */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "22px 24px" }} aria-busy={loading}>
                    <div className="section-label" style={{ marginBottom: "16px" }}>Position Sizer</div>
                    <TradePresets
                        current={{ symbol, direction, risk_type: riskType, risk_value: riskValue }}
                        onLoad={(p) => { setSymbol(p.symbol); setDirection(p.direction); setRiskType(p.risk_type); setRiskValue(p.risk_value); }}
                    />

                    <div className="space-y-4">
                        {/* Direction */}
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">Direction</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDirection("BUY")}
                                    className={`p-3 rounded-lg font-medium transition-all ${direction === "BUY"
                                        ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                        : "bg-white/[0.06] hover:bg-emerald-500/[0.10] border border-white/[0.10] hover:border-emerald-500/[0.30] text-slate-400 hover:text-emerald-300"
                                    }`}
                                >
                                    BUY
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDirection("SELL")}
                                    className={`p-3 rounded-lg font-medium transition-all ${direction === "SELL"
                                        ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/20"
                                        : "bg-white/[0.06] hover:bg-red-500/[0.10] border border-white/[0.10] hover:border-red-500/[0.30] text-slate-400 hover:text-red-300"
                                    }`}
                                >
                                    SELL
                                </button>
                            </div>
                        </div>

                        {/* SL Price */}
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">Stop Loss (price)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.00001"
                                    value={slPrice}
                                    onChange={(e) => setSlPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                    className={inputClass}
                                    placeholder="e.g. 1.08500"
                                    disabled={loading}
                                />
                                {tick && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setSlPrice(tick.bid)}
                                            className={`${quickBtnClass} hover:bg-red-500/[0.10] hover:border-red-500/[0.30] hover:text-red-300`}
                                            title="Use current Bid price"
                                            aria-label="Use bid price as stop loss"
                                        >
                                            Bid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSlPrice(tick.ask)}
                                            className={`${quickBtnClass} hover:bg-red-500/[0.10] hover:border-red-500/[0.30] hover:text-red-300`}
                                            title="Use current Ask price"
                                            aria-label="Use ask price as stop loss"
                                        >
                                            Ask
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TP Price */}
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">Take Profit (price)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.00001"
                                    value={tpPrice}
                                    onChange={(e) => setTpPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                    className={inputClass}
                                    placeholder="e.g. 1.09500 (optional)"
                                    disabled={loading}
                                />
                                {tick && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setTpPrice(tick.bid)}
                                            className={`${quickBtnClass} hover:bg-emerald-500/[0.10] hover:border-emerald-500/[0.30] hover:text-emerald-300`}
                                            title="Use current Bid price"
                                            aria-label="Use bid price as take profit"
                                        >
                                            Bid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTpPrice(tick.ask)}
                                            className={`${quickBtnClass} hover:bg-emerald-500/[0.10] hover:border-emerald-500/[0.30] hover:text-emerald-300`}
                                            title="Use current Ask price"
                                            aria-label="Use ask price as take profit"
                                        >
                                            Ask
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Risk Type Toggle */}
                        <div>
                            <label className="block mb-2 font-medium text-slate-300">Risk</label>
                            <div className="flex gap-2">
                                <div className="grid grid-cols-2 gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg p-1 w-40 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setRiskType("pct")}
                                        disabled={loading}
                                        className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${riskType === "pct"
                                            ? "bg-blue-500/[0.20] text-blue-300 border border-blue-500/[0.30]"
                                            : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
                                        }`}
                                    >
                                        %
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRiskType("fixed")}
                                        disabled={loading}
                                        className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${riskType === "fixed"
                                            ? "bg-blue-500/[0.20] text-blue-300 border border-blue-500/[0.30]"
                                            : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
                                        }`}
                                    >
                                        $
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    step={riskType === "pct" ? "0.1" : "1"}
                                    min="0"
                                    value={riskValue}
                                    onChange={(e) => setRiskValue(parseFloat(e.target.value) || 0)}
                                    className={inputClass}
                                    placeholder={riskType === "pct" ? "1.0" : "100"}
                                    disabled={loading}
                                />
                            </div>
                            <p className="text-xs text-slate-600 mt-1">
                                {riskType === "pct"
                                    ? "Risk as % of account balance"
                                    : "Fixed $ amount risk per trade"}
                            </p>
                        </div>

                        {/* Account Selection */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-medium text-slate-300">Accounts</label>
                                {checkingSymbol && (
                                    <span className="text-xs text-blue-400 animate-pulse">checking...</span>
                                )}
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto bg-white/[0.03] border border-white/[0.10] rounded-lg p-3">
                                {accounts.length === 0 ? (
                                    <p className="text-slate-600 text-center py-2">No accounts available</p>
                                ) : !symbolChecked ? (
                                    <p className="text-slate-600 text-center py-2 text-sm">
                                        {checkingSymbol ? "Checking symbol availability..." : "Enter a symbol to check availability"}
                                    </p>
                                ) : (
                                    <>
                                        {availableAccounts.map((account) => (
                                            <label
                                                key={account.id}
                                                className="flex items-center p-2 hover:bg-white/[0.04] rounded cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAccounts.includes(account.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedAccounts([...selectedAccounts, account.id]);
                                                        } else {
                                                            setSelectedAccounts(selectedAccounts.filter((id) => id !== account.id));
                                                        }
                                                    }}
                                                    className="mr-3 w-4 h-4"
                                                    disabled={loading}
                                                />
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2 flex-shrink-0" />
                                                <span className="font-mono text-slate-100">{account.account_id}</span>
                                                <span className="text-slate-500 ml-2 text-sm">({account.server})</span>
                                                {account.account_type === "fund" && (
                                                    <span className="ml-auto text-xs bg-purple-500/[0.15] text-purple-300 border border-purple-500/[0.20] px-2 py-1 rounded">
                                                        {account.current_phase || "Fund"}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                        {unavailableAccounts.map((account) => (
                                            <div
                                                key={account.id}
                                                className="flex items-center p-2 opacity-40 rounded"
                                            >
                                                <div className="mr-3 w-4 h-4" />
                                                <XCircle className="w-4 h-4 text-red-400 mr-2 flex-shrink-0" />
                                                <span className="font-mono text-slate-400">{account.account_id}</span>
                                                <span className="text-slate-600 ml-2 text-sm">(unavailable)</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                            {symbolChecked && (
                                <p className="text-sm text-slate-500 mt-1">
                                    {selectedAccounts.length} of {availableAccounts.length} selected
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleCalculate}
                            disabled={loading || selectedAccounts.length === 0 || !slPrice}
                            className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg disabled:opacity-50 font-medium shadow-lg shadow-blue-500/20 transition-all"
                        >
                            {loading ? "Calculating..." : "Calculate"}
                        </button>
                    </div>
                </div>

                {/* Order Preview */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "22px 24px" }}>
                    <div className="section-label" style={{ marginBottom: "16px" }}>Order Preview</div>

                    {execResults && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-medium text-sm text-slate-300">Execution Results</h3>
                                <button onClick={() => setExecResults(null)} className="text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
                            </div>
                            <div className="space-y-1">
                                {execResults.map((r: any, i: number) => (
                                    <div key={i} className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                                        r.blocked ? "bg-amber-500/[0.08] border border-amber-500/[0.20]" :
                                        r.success ? "bg-emerald-500/[0.08] border border-emerald-500/[0.20]" :
                                        "bg-red-500/[0.08] border border-red-500/[0.20]"
                                    }`}>
                                        <span className={r.blocked ? "text-amber-400" : r.success ? "text-emerald-400" : "text-red-400"}>
                                            {r.blocked ? "⊘" : r.success ? "✓" : "✗"}
                                        </span>
                                        <span className="font-mono font-medium text-slate-100">{r.account_id}</span>
                                        {r.success ? (
                                            <span className="text-emerald-400 text-xs">Ticket #{r.order}</span>
                                        ) : (
                                            <span className={`${r.blocked ? "text-amber-400" : "text-red-400"} text-xs truncate`}>
                                                {r.error ?? "Failed"}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {preview ? (
                        <div>
                            <ConfirmModal
                                isOpen={showExecuteConfirm}
                                title="Execute Orders"
                                message={`Execute ${executableAccountIds.length} order(s)${blockedAccountIds.size > 0 ? ` (${blockedAccountIds.size} blocked account(s) skipped)` : ""}?\n\nSymbol: ${symbol}\nDirection: ${direction}\nTotal Lots: ${(preview.results?.filter((r: any) => !r.rule_status?.blocked && r.calculation && !r.calculation.error).reduce((sum: number, r: any) => sum + r.calculation.lot_size, 0) ?? 0).toFixed(2)}\n\nThis action cannot be undone.`}
                                confirmLabel="Execute"
                                variant="warning"
                                onConfirm={doExecute}
                                onCancel={() => setShowExecuteConfirm(false)}
                            />

                            {/* Results table */}
                            <div className="overflow-x-auto mb-4">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.08]">
                                            <th className="text-left p-3 text-slate-400">Account</th>
                                            <th className="text-right p-3 text-slate-400">Lot</th>
                                            <th className="text-right p-3 text-slate-400">Entry</th>
                                            <th className="text-right p-3 text-slate-400">SL</th>
                                            <th className="text-right p-3 text-slate-400">TP</th>
                                            <th className="text-right p-3 text-slate-400">Risk</th>
                                            <th className="text-right p-3 text-slate-400">R:R</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.results?.map((result: any, index: number) => {
                                            const calc = result.calculation;
                                            const rs: PreTradeStatus | undefined = result.rule_status;
                                            const isBlocked = rs?.blocked;
                                            const isWarning = rs?.level === "warning";

                                            if (!calc || calc.error) {
                                                return (
                                                    <tr key={index} className="border-t border-white/[0.06]">
                                                        <td className="p-3 font-mono text-slate-300">{result.account_id}</td>
                                                        <td colSpan={6} className="p-3 text-red-400">
                                                            {calc?.error || result.error || "Calculation failed"}
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr key={index} className={`border-t border-white/[0.06] ${
                                                    isBlocked ? "opacity-50" : "hover:bg-white/[0.04]"
                                                }`}>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-1.5">
                                                            {isBlocked ? (
                                                                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                                            ) : isWarning ? (
                                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                            ) : rs ? (
                                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                                                            ) : null}
                                                            <span className="font-mono text-slate-100">{result.account_id}</span>
                                                        </div>
                                                        {isBlocked && (
                                                            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded ml-5">
                                                                BLOCKED
                                                            </span>
                                                        )}
                                                        {isWarning && (
                                                            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded ml-5">
                                                                WARN
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-slate-100">{calc.lot_size}</td>
                                                    <td className="p-3 text-right font-mono text-slate-300">{calc.entry_price}</td>
                                                    <td className="p-3 text-right font-mono text-red-400">
                                                        {calc.sl_price}
                                                        <span className="text-xs text-slate-600 ml-1">({calc.sl_pips}p)</span>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-emerald-400">
                                                        {calc.tp_price || "—"}
                                                        {calc.tp_pips > 0 && (
                                                            <span className="text-xs text-slate-600 ml-1">({calc.tp_pips}p)</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right text-red-400">
                                                        ${calc.risk_amount}
                                                        <span className="text-xs text-slate-600 ml-1">({calc.risk_pct}%)</span>
                                                    </td>
                                                    <td className="p-3 text-right text-slate-300">
                                                        {calc.rr_ratio > 0 ? `1:${calc.rr_ratio}` : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Rule status details — only for fund accounts with warnings/blocks */}
                            {preview.results?.some((r: any) => r.rule_status?.level !== "ok" && r.rule_status?.daily_dd_limit_pct != null) && (
                                <div className="space-y-3 mb-4">
                                    {preview.results
                                        .filter((r: any) => r.rule_status?.level !== "ok" && r.rule_status?.daily_dd_limit_pct != null)
                                        .map((result: any) => {
                                            const rs: PreTradeStatus = result.rule_status;
                                            return (
                                                <div
                                                    key={result.account_id}
                                                    className={`rounded-lg border p-3 text-xs ${
                                                        rs.blocked
                                                            ? "bg-red-500/[0.06] border-red-500/30"
                                                            : "bg-amber-500/[0.06] border-amber-500/30"
                                                    }`}
                                                >
                                                    {/* Header */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {rs.blocked
                                                            ? <ShieldAlert className="w-4 h-4 text-red-400" />
                                                            : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                                                        <span className={`font-semibold ${rs.blocked ? "text-red-400" : "text-amber-400"}`}>
                                                            {result.account_id}
                                                        </span>
                                                        {rs.phase && (
                                                            <span className="text-slate-500">{rs.phase}</span>
                                                        )}
                                                        {rs.drawdown_type === "eod_trailing" && (
                                                            <span className="ml-auto text-slate-500 italic">EOD trailing DD</span>
                                                        )}
                                                    </div>

                                                    {/* Block reasons */}
                                                    {rs.block_reasons && rs.block_reasons.length > 0 && (
                                                        <div className="space-y-0.5 mb-2">
                                                            {rs.block_reasons.map((msg, i) => (
                                                                <p key={i} className="text-red-400">{msg}</p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Warnings */}
                                                    {rs.warnings && rs.warnings.length > 0 && (
                                                        <div className="space-y-0.5 mb-2">
                                                            {rs.warnings.map((msg, i) => (
                                                                <p key={i} className="text-amber-400">{msg}</p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* DD headroom meters */}
                                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                                        {(rs.daily_dd_limit_pct ?? 0) > 0 && (
                                                            <div>
                                                                <div className="flex justify-between text-slate-500 mb-1">
                                                                    <span>Daily DD</span>
                                                                    <span>
                                                                        {rs.daily_loss_pct?.toFixed(1)}% / {rs.daily_dd_limit_pct}%
                                                                    </span>
                                                                </div>
                                                                <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all ${
                                                                            (rs.daily_loss_pct ?? 0) >= (rs.daily_dd_limit_pct ?? 0)
                                                                                ? "bg-red-500"
                                                                                : (rs.daily_loss_pct ?? 0) >= (rs.daily_dd_limit_pct ?? 0) * 0.8
                                                                                ? "bg-amber-500"
                                                                                : "bg-emerald-500"
                                                                        }`}
                                                                        style={{
                                                                            width: `${Math.min(100, ((rs.daily_loss_pct ?? 0) / (rs.daily_dd_limit_pct ?? 1)) * 100)}%`,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <p className="text-slate-500 mt-0.5">
                                                                    {(rs.daily_room_amount ?? 0) >= 0
                                                                        ? `$${rs.daily_room_amount?.toFixed(0)} room left`
                                                                        : `$${Math.abs(rs.daily_room_amount ?? 0).toFixed(0)} over limit`}
                                                                </p>
                                                            </div>
                                                        )}
                                                        {(rs.max_dd_limit_pct ?? 0) > 0 && (
                                                            <div>
                                                                <div className="flex justify-between text-slate-500 mb-1">
                                                                    <span>Max DD</span>
                                                                    <span>
                                                                        {rs.max_loss_pct?.toFixed(1)}% / {rs.max_dd_limit_pct}%
                                                                    </span>
                                                                </div>
                                                                <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${
                                                                            (rs.max_loss_pct ?? 0) >= (rs.max_dd_limit_pct ?? 0)
                                                                                ? "bg-red-500"
                                                                                : (rs.max_loss_pct ?? 0) >= (rs.max_dd_limit_pct ?? 0) * 0.8
                                                                                ? "bg-amber-500"
                                                                                : "bg-emerald-500"
                                                                        }`}
                                                                        style={{
                                                                            width: `${Math.min(100, ((rs.max_loss_pct ?? 0) / (rs.max_dd_limit_pct ?? 1)) * 100)}%`,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <p className="text-slate-500 mt-0.5">
                                                                    {(rs.max_room_amount ?? 0) >= 0
                                                                        ? `$${rs.max_room_amount?.toFixed(0)} room left`
                                                                        : `$${Math.abs(rs.max_room_amount ?? 0).toFixed(0)} over limit`}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Best day */}
                                                    {rs.best_day_limit_amount != null && (
                                                        <div className="mt-2 flex items-center gap-2 text-slate-500">
                                                            <span>Today P&L:</span>
                                                            <span className={`font-medium ${(rs.today_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                                {(rs.today_pnl ?? 0) >= 0 ? "+" : ""}${rs.today_pnl?.toFixed(2)}
                                                            </span>
                                                            <span>/ Best day limit: ${rs.best_day_limit_amount.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            )}

                            {/* Summary */}
                            <div className="p-4 bg-white/[0.04] border border-white/[0.06] rounded-lg mb-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-slate-500">Symbol:</span>
                                        <span className="font-bold ml-2 text-slate-100">{symbol}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Direction:</span>
                                        <span className={`font-bold ml-2 ${direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                                            {direction}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Risk:</span>
                                        <span className="font-bold ml-2 text-slate-100">
                                            {riskType === "pct" ? `${riskValue}%` : `$${riskValue}`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Orders:</span>
                                        <span className="font-bold ml-2 text-slate-100">
                                            {executableAccountIds.length}
                                            {blockedAccountIds.size > 0 && (
                                                <span className="text-red-400 ml-1 text-xs font-normal">
                                                    ({blockedAccountIds.size} blocked)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleExecute}
                                disabled={executing || executableAccountIds.length === 0}
                                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg disabled:opacity-50 font-medium shadow-lg shadow-emerald-500/20 transition-all"
                            >
                                {executing
                                    ? "Executing..."
                                    : executableAccountIds.length === 0
                                    ? "All Accounts Blocked — Cannot Execute"
                                    : blockedAccountIds.size > 0
                                    ? `Execute ${executableAccountIds.length} Order(s) — ${blockedAccountIds.size} Blocked`
                                    : `Execute All ${executableAccountIds.length} Orders`}
                            </button>
                        </div>
                    ) : (
                        <div className="text-center text-slate-600 py-16">
                            <p className="text-lg mb-2">No preview yet</p>
                            <p className="text-sm">Set SL price, risk, and click &quot;Calculate&quot;</p>
                            <p className="text-sm mt-1">Lot size is calculated from your risk parameters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
