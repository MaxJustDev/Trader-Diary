"use client";

import { useState } from "react";
import { FundAccountAnalytics } from "@/lib/types";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface Props {
    account: FundAccountAnalytics;
    onUpdated: () => void;
}

function ProgressBar({
    label,
    current,
    limit,
    status,
    suffix = "%",
}: {
    label: string;
    current: number;
    limit: number;
    status: "ok" | "warning" | "violated";
    suffix?: string;
}) {
    const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
    const barColor =
        status === "violated"
            ? "bg-red-500"
            : status === "warning"
              ? "bg-amber-500"
              : "bg-emerald-500";
    const textColor =
        status === "violated"
            ? "text-red-400"
            : status === "warning"
              ? "text-amber-400"
              : "text-slate-400";

    return (
        <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">{label}</span>
                <span className={textColor}>
                    {current.toFixed(2)}{suffix} / {limit}{suffix}
                </span>
            </div>
            <div className="w-full bg-white/[0.08] rounded-full h-2">
                <div
                    className={`${barColor} h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export default function FundAccountCard({ account, onUpdated }: Props) {
    const [editingDate, setEditingDate] = useState(false);
    const [dateValue, setDateValue] = useState(account.next_payout_date || "");
    const [editingBalance, setEditingBalance] = useState(false);
    const [balanceValue, setBalanceValue] = useState(
        account.starting_balance?.toString() || ""
    );
    const [saving, setSaving] = useState(false);
    const [advancing, setAdvancing] = useState(false);

    const saveDate = async () => {
        setSaving(true);
        try {
            await apiClient.analytics.updateAccountAnalytics(account.account_id, {
                next_payout_date: dateValue || undefined,
            });
            setEditingDate(false);
            onUpdated();
        } catch (e) {
            console.error("Failed to save date:", e);
        } finally {
            setSaving(false);
        }
    };

    const handleAdvancePhase = async () => {
        setAdvancing(true);
        try {
            const result = await apiClient.accounts.advancePhase(account.account_id);
            toast.success(`Phase advanced: ${result.old_phase} → ${result.new_phase}`);
            onUpdated();
        } catch (error: any) {
            toast.error(`Failed to advance phase: ${error.message ?? "Unknown error"}`);
        } finally {
            setAdvancing(false);
        }
    };

    const saveBalance = async () => {
        const val = parseFloat(balanceValue);
        if (isNaN(val) || val <= 0) return;
        setSaving(true);
        try {
            await apiClient.analytics.updateAccountAnalytics(account.account_id, {
                starting_balance: val,
            });
            setEditingBalance(false);
            onUpdated();
        } catch (e) {
            console.error("Failed to save balance:", e);
        } finally {
            setSaving(false);
        }
    };

    const profitPct = account.profit_pct;
    const profitTarget = account.profit_target;
    const profitProgress = profitTarget && profitTarget > 0
        ? Math.min(Math.max((profitPct / profitTarget) * 100, 0), 100)
        : 0;
    const profitBarColor = account.profit_achieved
        ? "bg-emerald-500"
        : profitPct < 0
          ? "bg-red-500"
          : "bg-blue-500";

    return (
        <div
            className={`bg-white/[0.04] backdrop-blur-xl border rounded-xl overflow-hidden ${
                account.locked ? "border-red-500/60 ring-1 ring-red-500/30" : "border-white/[0.08]"
            }`}
        >
            {/* Locked banner */}
            {account.locked && (
                <div className="bg-red-600 text-white text-sm px-4 py-1.5 font-medium">
                    Account Locked — {account.violations.join(", ")}
                </div>
            )}

            {/* Header */}
            <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-bold text-slate-100">
                        {account.account_login}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.08] text-slate-400">
                        {account.current_phase || "—"}
                    </span>
                </div>
                <p className="text-sm text-slate-400">
                    {account.fund_name || "Unknown Fund"}
                    {account.program_name ? ` · ${account.program_name}` : ""}
                </p>

                {/* Balance row */}
                <div className="flex items-center gap-4 mt-2 text-sm">
                    <div>
                        <span className="text-slate-500">Balance: </span>
                        <span className="text-slate-100 font-medium">
                            ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-slate-500">Start: </span>
                        {editingBalance ? (
                            <span className="flex items-center gap-1">
                                <input
                                    type="number"
                                    className="w-24 bg-white/[0.06] border border-white/[0.10] text-slate-100 text-sm rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    value={balanceValue}
                                    onChange={(e) => setBalanceValue(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && saveBalance()}
                                    autoFocus
                                />
                                <button
                                    onClick={saveBalance}
                                    disabled={saving}
                                    className="text-emerald-400 hover:text-emerald-300 text-xs"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setEditingBalance(false)}
                                    className="text-slate-500 hover:text-slate-400 text-xs"
                                >
                                    Cancel
                                </button>
                            </span>
                        ) : (
                            <span className="flex items-center gap-1">
                                <span className="text-slate-100 font-medium">
                                    ${account.starting_balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <button
                                    onClick={() => {
                                        setBalanceValue(account.starting_balance.toString());
                                        setEditingBalance(true);
                                    }}
                                    className="text-slate-500 hover:text-slate-300"
                                    title="Edit starting balance"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress bars */}
            <div className="px-4 py-3">
                <ProgressBar
                    label="Daily Loss"
                    current={account.daily_loss_pct}
                    limit={account.daily_drawdown_limit}
                    status={account.daily_status}
                />
                <ProgressBar
                    label={`Max Drawdown (${account.drawdown_type})`}
                    current={account.max_loss_pct}
                    limit={account.max_drawdown_limit}
                    status={account.max_dd_status}
                />

                {/* Profit target */}
                {profitTarget !== null && (
                    <div className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-400">
                                Profit Target
                                {account.profit_achieved && (
                                    <span className="ml-1 text-emerald-400">✓ Achieved</span>
                                )}
                            </span>
                            <span className={profitPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                                {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}% / {profitTarget}%
                            </span>
                        </div>
                        <div className="w-full bg-white/[0.08] rounded-full h-2">
                            <div
                                className={`${profitBarColor} h-2 rounded-full transition-all duration-300`}
                                style={{ width: `${profitProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Best day rule */}
                {account.best_day_limit != null && account.best_day_pct != null && (
                    <ProgressBar
                        label="Best Day Rule (today)"
                        current={Math.max(0, account.best_day_pct)}
                        limit={account.best_day_limit}
                        status={account.best_day_pct >= account.best_day_limit ? "violated" : account.best_day_pct >= account.best_day_limit * 0.8 ? "warning" : "ok"}
                    />
                )}

                {/* Phase advance button */}
                {account.profit_achieved && (
                    <button
                        onClick={handleAdvancePhase}
                        disabled={advancing}
                        className="w-full mt-2 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white text-xs rounded-lg font-medium transition-all shadow-lg shadow-emerald-500/20"
                    >
                        {advancing ? "Advancing..." : "Advance to Next Phase →"}
                    </button>
                )}
            </div>

            {/* Payout date */}
            <div className="px-4 py-3 border-t border-white/[0.08]">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Next Payout</span>
                    {editingDate ? (
                        <span className="flex items-center gap-1">
                            <input
                                type="date"
                                className="bg-white/[0.06] border border-white/[0.10] text-slate-100 text-sm rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={dateValue}
                                onChange={(e) => setDateValue(e.target.value)}
                                autoFocus
                            />
                            <button
                                onClick={saveDate}
                                disabled={saving}
                                className="text-emerald-400 hover:text-emerald-300 text-xs"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => setEditingDate(false)}
                                className="text-slate-500 hover:text-slate-400 text-xs"
                            >
                                Cancel
                            </button>
                        </span>
                    ) : (
                        <button
                            onClick={() => setEditingDate(true)}
                            className="text-slate-100 hover:text-blue-400 flex items-center gap-1"
                        >
                            {account.next_payout_date || "Set date"}
                            <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
