"use client";

import React, { useState } from "react";
import { FundAccountAnalytics } from "@/lib/types";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Pencil, Check, X, ArrowRight } from "lucide-react";

interface Props {
    account: FundAccountAnalytics;
    onUpdated: () => void;
}

function ProgressBar({ label, current, limit, status, suffix = "%" }: {
    label: string; current: number; limit: number; status: "ok" | "warning" | "violated"; suffix?: string;
}) {
    const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
    const color = status === "violated" ? "var(--rose)" : status === "warning" ? "var(--amber)" : "var(--emerald)";
    return (
        <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
                <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color, fontWeight: 600 }}>
                    {current.toFixed(2)}{suffix} / {limit}{suffix}
                </span>
            </div>
            <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "99px", transition: "width 400ms ease", boxShadow: `0 0 8px ${color}50` }} />
            </div>
        </div>
    );
}

const miniInputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--text)",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "4px 8px",
    outline: "none",
    width: "100px",
    transition: "border-color 150ms",
};

function FundAccountCard({ account, onUpdated }: Props) {
    const [editingDate, setEditingDate] = useState(false);
    const [dateValue, setDateValue] = useState(account.next_payout_date || "");
    const [editingBalance, setEditingBalance] = useState(false);
    const [balanceValue, setBalanceValue] = useState(account.starting_balance?.toString() || "");
    const [saving, setSaving] = useState(false);
    const [advancing, setAdvancing] = useState(false);

    const saveDate = async () => {
        setSaving(true);
        try {
            await apiClient.analytics.updateAccountAnalytics(account.account_id, { next_payout_date: dateValue || undefined });
            setEditingDate(false);
            onUpdated();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const saveBalance = async () => {
        const val = parseFloat(balanceValue);
        if (isNaN(val) || val <= 0) return;
        setSaving(true);
        try {
            await apiClient.analytics.updateAccountAnalytics(account.account_id, { starting_balance: val });
            setEditingBalance(false);
            onUpdated();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const handleAdvancePhase = async () => {
        setAdvancing(true);
        try {
            const result = await apiClient.accounts.advancePhase(account.account_id);
            toast.success(`Phase advanced: ${result.old_phase} → ${result.new_phase}`);
            onUpdated();
        } catch (error: any) {
            toast.error(`Failed to advance phase: ${error.message ?? "Unknown error"}`);
        } finally { setAdvancing(false); }
    };

    const profitPct = account.profit_pct;
    const profitTarget = account.profit_target;
    const profitProgress = profitTarget && profitTarget > 0 ? Math.min(Math.max((profitPct / profitTarget) * 100, 0), 100) : 0;
    const profitBarColor = account.profit_achieved ? "var(--emerald)" : profitPct < 0 ? "var(--rose)" : "var(--cyan)";

    const borderColor = account.locked ? "rgba(248,113,113,0.3)" : "var(--border)";

    return (
        <div style={{ background: "var(--surface)", border: `1px solid ${borderColor}`, borderRadius: "14px", overflow: "hidden", boxShadow: account.locked ? "0 0 20px rgba(248,113,113,0.07)" : "none" }}>
            {/* Locked banner */}
            {account.locked && (
                <div style={{ background: "rgba(248,113,113,0.12)", borderBottom: "1px solid rgba(248,113,113,0.22)", padding: "7px 16px", fontSize: "11px", fontWeight: 600, color: "var(--rose)", letterSpacing: "0.06em" }}>
                    ACCOUNT LOCKED — {account.violations.join(", ")}
                </div>
            )}

            {/* Top line */}
            {!account.locked && (
                <div style={{ height: "1.5px", background: "linear-gradient(90deg, rgba(255,255,255,0.08), transparent)" }} />
            )}

            {/* Header */}
            <div style={{ padding: "14px 16px 10px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ fontSize: "17px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#f0f4f8" }}>
                        {account.account_login}
                    </div>
                    {account.current_phase && (
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: "99px", fontSize: "10px", fontWeight: 600, background: "rgba(34,211,238,0.08)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.2)" }}>
                            {account.current_phase}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {account.fund_name || "Unknown Fund"}
                    {account.program_name ? ` · ${account.program_name}` : ""}
                </div>

                {/* Balance row */}
                <div style={{ display: "flex", gap: "20px", marginTop: "10px" }}>
                    <div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Balance</div>
                        <div style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f0f4f8" }}>
                            ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Start</div>
                        {editingBalance ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <input
                                    type="number"
                                    style={miniInputStyle}
                                    value={balanceValue}
                                    onChange={(e) => setBalanceValue(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && saveBalance()}
                                    autoFocus
                                />
                                <button onClick={saveBalance} disabled={saving} style={{ background: "none", border: "none", color: "var(--emerald)", cursor: "pointer", padding: "2px" }}>
                                    <Check size={12} />
                                </button>
                                <button onClick={() => setEditingBalance(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}>
                                    <X size={12} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f0f4f8" }}>
                                    ${account.starting_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                <button
                                    onClick={() => { setBalanceValue(account.starting_balance.toString()); setEditingBalance(true); }}
                                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                                    title="Edit starting balance"
                                >
                                    <Pencil size={10} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress bars */}
            <div style={{ padding: "10px 16px" }}>
                <ProgressBar label="Daily Loss" current={account.daily_loss_pct} limit={account.daily_drawdown_limit} status={account.daily_status} />
                <ProgressBar label={`Max Drawdown (${account.drawdown_type})`} current={account.max_loss_pct} limit={account.max_drawdown_limit} status={account.max_dd_status} />

                {profitTarget !== null && (
                    <div style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                Profit Target {account.profit_achieved && <span style={{ color: "var(--emerald)" }}>✓ Achieved</span>}
                            </span>
                            <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: profitPct >= 0 ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                                {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}% / {profitTarget}%
                            </span>
                        </div>
                        <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${profitProgress}%`, background: profitBarColor, borderRadius: "99px", transition: "width 400ms ease" }} />
                        </div>
                    </div>
                )}

                {account.best_day_limit != null && account.best_day_pct != null && (
                    <ProgressBar
                        label="Best Day Rule (today)"
                        current={Math.max(0, account.best_day_pct)}
                        limit={account.best_day_limit}
                        status={account.best_day_pct >= account.best_day_limit ? "violated" : account.best_day_pct >= account.best_day_limit * 0.8 ? "warning" : "ok"}
                    />
                )}

                {account.profit_achieved && (
                    <button
                        onClick={handleAdvancePhase}
                        disabled={advancing}
                        style={{ width: "100%", marginTop: "4px", padding: "9px", background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.28)", color: "var(--emerald)", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: advancing ? "not-allowed" : "pointer", opacity: advancing ? 0.6 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                        {advancing ? "Advancing..." : <><span>Advance to Next Phase</span><ArrowRight size={13} /></>}
                    </button>
                )}
            </div>

            {/* Payout footer */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Next Payout</span>
                {editingDate ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                            type="date"
                            style={{ ...miniInputStyle, colorScheme: "dark", width: "130px" }}
                            value={dateValue}
                            onChange={(e) => setDateValue(e.target.value)}
                            autoFocus
                        />
                        <button onClick={saveDate} disabled={saving} style={{ background: "none", border: "none", color: "var(--emerald)", cursor: "pointer" }}>
                            <Check size={13} />
                        </button>
                        <button onClick={() => setEditingDate(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                            <X size={13} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setEditingDate(true)}
                        style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", color: account.next_payout_date ? "#f0f4f8" : "var(--text-muted)", fontSize: "12px", fontWeight: account.next_payout_date ? 600 : 400, fontFamily: "'Sora', sans-serif" }}
                    >
                        {account.next_payout_date || "Set date"}
                        <Pencil size={9} style={{ color: "var(--text-muted)" }} />
                    </button>
                )}
            </div>
        </div>
    );
}

export default React.memo(FundAccountCard);
