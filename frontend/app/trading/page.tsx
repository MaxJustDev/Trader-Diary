"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { useAccountStore } from "@/lib/store";
import dynamic from "next/dynamic";

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

    // Debounce symbol for chart + auto-check availability
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
            alert("Please select at least one account");
            return;
        }
        if (!slPrice) {
            alert("Please enter a Stop Loss price");
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
            alert(`Failed to calculate: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!preview) return;

        const totalLots = preview.results
            ?.filter((r: any) => r.calculation && !r.calculation.error)
            .reduce((sum: number, r: any) => sum + r.calculation.lot_size, 0);

        const confirmed = confirm(
            `Execute ${selectedAccounts.length} order(s)?\n\nSymbol: ${symbol}\nDirection: ${direction}\nTotal Lots: ${totalLots?.toFixed(2)}\n\nThis action cannot be undone.`
        );
        if (!confirmed) return;

        setExecuting(true);
        try {
            const result = await apiClient.trading.executeBatch({
                symbol: symbol.trim(),
                direction,
                sl_price: slPrice,
                tp_price: tpPrice || null,
                risk_type: riskType,
                risk_value: riskValue,
                account_ids: selectedAccounts,
            });
            alert(`Orders executed: ${result.successful}/${result.total} successful`);
            setPreview(null);
        } catch (error: any) {
            alert(`Failed to execute batch: ${error.message}`);
        } finally {
            setExecuting(false);
        }
    };

    const availableAccounts = accounts.filter((a) => availability[a.id] === true);
    const unavailableAccounts = accounts.filter((a) => availability[a.id] === false);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-6">Position Sizer</h1>

            {/* Symbol Bar + Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg mb-8 overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b dark:border-gray-700">
                    <label className="font-medium whitespace-nowrap">Symbol:</label>
                    <input
                        type="text"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        className="flex-1 max-w-xs p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono text-lg"
                        placeholder="EURUSD"
                    />
                    {checkingSymbol && (
                        <span className="text-sm text-blue-500 animate-pulse">Checking accounts...</span>
                    )}
                    {symbolChecked && !checkingSymbol && (
                        <span className="text-sm text-gray-500">
                            {availableAccounts.length}/{accounts.length} accounts available
                        </span>
                    )}
                    {/* Live Bid/Ask from MT5 */}
                    {tick && !checkingSymbol && (
                        <div className="ml-auto flex items-center gap-3 font-mono text-sm">
                            <span className="text-gray-500">Bid:</span>
                            <button
                                onClick={() => setSlPrice(tick.bid)}
                                className="text-red-400 hover:text-red-300 hover:underline cursor-pointer font-bold"
                                title="Click to set as SL"
                            >
                                {tick.bid}
                            </button>
                            <span className="text-gray-600">|</span>
                            <span className="text-gray-500">Ask:</span>
                            <button
                                onClick={() => setTpPrice(tick.ask)}
                                className="text-green-400 hover:text-green-300 hover:underline cursor-pointer font-bold"
                                title="Click to set as TP"
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Position Sizer Form */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h2 className="text-xl font-semibold mb-4">Position Sizer</h2>

                    <div className="space-y-4">
                        {/* Direction */}
                        <div>
                            <label className="block mb-2 font-medium">Direction</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDirection("BUY")}
                                    className={`p-3 rounded-lg font-medium transition-all ${direction === "BUY"
                                        ? "bg-green-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-700 hover:bg-green-100"
                                    }`}
                                >
                                    BUY
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDirection("SELL")}
                                    className={`p-3 rounded-lg font-medium transition-all ${direction === "SELL"
                                        ? "bg-red-500 text-white"
                                        : "bg-gray-100 dark:bg-gray-700 hover:bg-red-100"
                                    }`}
                                >
                                    SELL
                                </button>
                            </div>
                        </div>

                        {/* SL Price */}
                        <div>
                            <label className="block mb-2 font-medium">Stop Loss (price)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.00001"
                                    value={slPrice}
                                    onChange={(e) => setSlPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                    className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono"
                                    placeholder="e.g. 1.08500"
                                />
                                {tick && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setSlPrice(tick.bid)}
                                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 border dark:border-gray-600 rounded-lg font-mono transition-all"
                                            title="Use current Bid price"
                                        >
                                            Bid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSlPrice(tick.ask)}
                                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 border dark:border-gray-600 rounded-lg font-mono transition-all"
                                            title="Use current Ask price"
                                        >
                                            Ask
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TP Price */}
                        <div>
                            <label className="block mb-2 font-medium">Take Profit (price)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.00001"
                                    value={tpPrice}
                                    onChange={(e) => setTpPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                    className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono"
                                    placeholder="e.g. 1.09500 (optional)"
                                />
                                {tick && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setTpPrice(tick.bid)}
                                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-green-100 dark:hover:bg-green-900/30 border dark:border-gray-600 rounded-lg font-mono transition-all"
                                            title="Use current Bid price"
                                        >
                                            Bid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTpPrice(tick.ask)}
                                            className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-green-100 dark:hover:bg-green-900/30 border dark:border-gray-600 rounded-lg font-mono transition-all"
                                            title="Use current Ask price"
                                        >
                                            Ask
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Risk Type Toggle */}
                        <div>
                            <label className="block mb-2 font-medium">Risk</label>
                            <div className="flex gap-2">
                                <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-40 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setRiskType("pct")}
                                        className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${riskType === "pct"
                                            ? "bg-blue-500 text-white shadow"
                                            : "hover:bg-gray-200 dark:hover:bg-gray-600"
                                        }`}
                                    >
                                        %
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRiskType("fixed")}
                                        className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${riskType === "fixed"
                                            ? "bg-blue-500 text-white shadow"
                                            : "hover:bg-gray-200 dark:hover:bg-gray-600"
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
                                    className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-mono"
                                    placeholder={riskType === "pct" ? "1.0" : "100"}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {riskType === "pct"
                                    ? "Risk as % of account balance"
                                    : "Fixed $ amount risk per trade"}
                            </p>
                        </div>

                        {/* Account Selection */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-medium">Accounts</label>
                                {checkingSymbol && (
                                    <span className="text-xs text-blue-500 animate-pulse">checking...</span>
                                )}
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-3 dark:border-gray-600">
                                {accounts.length === 0 ? (
                                    <p className="text-gray-500 text-center py-2">No accounts available</p>
                                ) : !symbolChecked ? (
                                    <p className="text-gray-500 text-center py-2 text-sm">
                                        {checkingSymbol ? "Checking symbol availability..." : "Enter a symbol to check availability"}
                                    </p>
                                ) : (
                                    <>
                                        {availableAccounts.map((account) => (
                                            <label
                                                key={account.id}
                                                className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
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
                                                />
                                                <span className="text-green-500 mr-2 text-sm">&#x2705;</span>
                                                <span className="font-mono">{account.account_id}</span>
                                                <span className="text-gray-500 ml-2 text-sm">({account.server})</span>
                                                {account.account_type === "fund" && (
                                                    <span className="ml-auto text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-1 rounded">
                                                        {account.current_phase || "Fund"}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                        {unavailableAccounts.map((account) => (
                                            <div
                                                key={account.id}
                                                className="flex items-center p-2 opacity-50 rounded"
                                            >
                                                <div className="mr-3 w-4 h-4" />
                                                <span className="text-red-500 mr-2 text-sm">&#x274C;</span>
                                                <span className="font-mono">{account.account_id}</span>
                                                <span className="text-gray-500 ml-2 text-sm">(unavailable)</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                            {symbolChecked && (
                                <p className="text-sm text-gray-500 mt-1">
                                    {selectedAccounts.length} of {availableAccounts.length} selected
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleCalculate}
                            disabled={loading || selectedAccounts.length === 0 || !slPrice}
                            className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium transition-all"
                        >
                            {loading ? "Calculating..." : "Calculate"}
                        </button>
                    </div>
                </div>

                {/* Order Preview */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h2 className="text-xl font-semibold mb-4">Order Preview</h2>

                    {preview ? (
                        <div>
                            <div className="overflow-x-auto mb-4">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b dark:border-gray-700">
                                            <th className="text-left p-3">Account</th>
                                            <th className="text-right p-3">Lot</th>
                                            <th className="text-right p-3">Entry</th>
                                            <th className="text-right p-3">SL</th>
                                            <th className="text-right p-3">TP</th>
                                            <th className="text-right p-3">Risk</th>
                                            <th className="text-right p-3">Reward</th>
                                            <th className="text-right p-3">R:R</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.results?.map((result: any, index: number) => {
                                            const calc = result.calculation;
                                            if (!calc || calc.error) {
                                                return (
                                                    <tr key={index} className="border-b dark:border-gray-700">
                                                        <td className="p-3 font-mono">{result.account_id}</td>
                                                        <td colSpan={7} className="p-3 text-red-500">
                                                            {calc?.error || result.error || "Calculation failed"}
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr key={index} className="border-b dark:border-gray-700">
                                                    <td className="p-3 font-mono">{result.account_id}</td>
                                                    <td className="p-3 text-right font-bold">{calc.lot_size}</td>
                                                    <td className="p-3 text-right font-mono">{calc.entry_price}</td>
                                                    <td className="p-3 text-right font-mono text-red-500">
                                                        {calc.sl_price}
                                                        <span className="text-xs text-gray-500 ml-1">({calc.sl_pips}p)</span>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-green-500">
                                                        {calc.tp_price || "\u2014"}
                                                        {calc.tp_pips > 0 && (
                                                            <span className="text-xs text-gray-500 ml-1">({calc.tp_pips}p)</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right text-red-500">
                                                        ${calc.risk_amount}
                                                        <span className="text-xs text-gray-500 ml-1">({calc.risk_pct}%)</span>
                                                    </td>
                                                    <td className="p-3 text-right text-green-500">
                                                        {calc.reward_amount > 0 ? `$${calc.reward_amount}` : "\u2014"}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        {calc.rr_ratio > 0 ? `1:${calc.rr_ratio}` : "\u2014"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Symbol:</span>
                                        <span className="font-bold ml-2">{symbol}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Direction:</span>
                                        <span className={`font-bold ml-2 ${direction === "BUY" ? "text-green-500" : "text-red-500"}`}>
                                            {direction}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Risk:</span>
                                        <span className="font-bold ml-2">
                                            {riskType === "pct" ? `${riskValue}%` : `$${riskValue}`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Orders:</span>
                                        <span className="font-bold ml-2">{preview.results?.length}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleExecute}
                                disabled={executing}
                                className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 font-medium transition-all"
                            >
                                {executing ? "Executing..." : "Execute All Orders"}
                            </button>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 py-16">
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
