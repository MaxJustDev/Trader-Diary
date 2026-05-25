"use client";

import { Account, FundAccountAnalytics } from "@/lib/types";

interface Props {
    account: Account;
    analytics?: FundAccountAnalytics;
    isConnected: boolean;
    isConnecting: boolean;
    isDeleting: boolean;
    onConnect: () => void;
    onDelete: () => void;
    onEdit: () => void;
}

function ProgressBar({ label, current, limit, status }: {
    label: string; current: number; limit: number; status: "ok" | "warning" | "violated";
}) {
    const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
    const color = status === "violated" ? "var(--rose)" : status === "warning" ? "var(--amber)" : "var(--emerald)";
    return (
        <div style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.04em" }}>{label}</span>
                <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color, fontWeight: 600 }}>
                    {current.toFixed(2)}% / {limit}%
                </span>
            </div>
            <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "99px", transition: "width 400ms ease", boxShadow: `0 0 6px ${color}60` }} />
            </div>
        </div>
    );
}

function getStaleness(updatedAt?: string): string {
    if (!updatedAt) return "Never synced";
    const diffMin = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
}

export default function AccountCard({ account, analytics, isConnected, isConnecting, isDeleting, onConnect, onDelete, onEdit }: Props) {
    const profit = account.profit ?? 0;
    const profitColor = profit > 0 ? "var(--emerald)" : profit < 0 ? "var(--rose)" : "var(--text-muted)";

    const fmt = (v?: number) =>
        v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const profitPct = analytics?.profit_pct ?? 0;
    const profitTarget = analytics?.profit_target ?? null;
    const profitProgress = profitTarget && profitTarget > 0 ? Math.min(Math.max((profitPct / profitTarget) * 100, 0), 100) : 0;
    const profitBarColor = analytics?.profit_achieved ? "var(--emerald)" : profitPct < 0 ? "var(--rose)" : "var(--cyan)";

    const borderColor = analytics?.locked ? "rgba(248,113,113,0.35)" : isConnected ? "rgba(52,211,153,0.35)" : "var(--border)";
    const glowColor = analytics?.locked ? "rgba(248,113,113,0.08)" : isConnected ? "rgba(52,211,153,0.06)" : "transparent";

    return (
        <div style={{
            background: "var(--surface)",
            border: `1px solid ${borderColor}`,
            borderRadius: "14px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            transition: "border-color 200ms",
            boxShadow: analytics?.locked ? "0 0 20px rgba(248,113,113,0.08)" : isConnected ? "0 0 20px rgba(52,211,153,0.06)" : "none",
        }}>
            {/* Locked banner */}
            {analytics?.locked && (
                <div style={{ background: "rgba(248,113,113,0.15)", borderBottom: "1px solid rgba(248,113,113,0.25)", padding: "6px 14px", fontSize: "11px", fontWeight: 600, color: "var(--rose)", letterSpacing: "0.04em" }}>
                    LOCKED — {analytics.violations.join(", ")}
                </div>
            )}

            {/* Top accent line */}
            {!analytics?.locked && (
                <div style={{ height: "1.5px", background: isConnected ? "linear-gradient(90deg, var(--emerald), transparent)" : "linear-gradient(90deg, rgba(255,255,255,0.06), transparent)" }} />
            )}

            {/* Body */}
            <div style={{ padding: "14px 16px", flex: 1 }}>
                {/* Badges row */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                    {/* Connection dot */}
                    <div style={{
                        width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                        background: isConnected ? "var(--emerald)" : "var(--text-dim)",
                        boxShadow: isConnected ? "0 0 6px var(--emerald)" : "none",
                        animation: isConnected ? "live-pulse 2.4s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                        display: "inline-flex", alignItems: "center", padding: "2px 7px",
                        borderRadius: "99px", fontSize: "10px", fontWeight: 500,
                        background: account.account_type === "fund" ? "var(--purple-dim)" : "rgba(255,255,255,0.05)",
                        color: account.account_type === "fund" ? "var(--purple)" : "var(--text-muted)",
                        border: `1px solid ${account.account_type === "fund" ? "rgba(167,139,250,0.22)" : "transparent"}`,
                    }}>
                        {account.account_type === "fund" ? "Fund" : "Personal"}
                    </span>
                    {account.current_phase && (
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: "99px", fontSize: "10px", fontWeight: 500, background: "rgba(34,211,238,0.08)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.2)" }}>
                            {account.current_phase}
                        </span>
                    )}
                </div>

                {/* Identity */}
                <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#f0f4f8", lineHeight: 1.2, marginBottom: "2px" }}>
                    {account.account_id}
                </div>
                {account.mt5_name && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "1px" }} title={account.mt5_name}>
                        {account.mt5_name}
                    </div>
                )}
                <div style={{ fontSize: "10px", color: "var(--text-dim)", letterSpacing: "0.04em" }}>{account.server}</div>

                {analytics && (analytics.fund_name || analytics.program_name) && (
                    <div style={{ fontSize: "11px", color: "var(--purple)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {analytics.fund_name}{analytics.program_name ? ` · ${analytics.program_name}` : ""}
                    </div>
                )}

                {/* Financials */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                    {[
                        { label: "Balance", value: fmt(account.balance), color: "var(--text-soft)" },
                        { label: "Equity", value: fmt(account.equity), color: "var(--text-soft)" },
                        { label: "Profit", value: `${profit >= 0 ? "+" : ""}${fmt(account.profit)}`, color: profitColor },
                    ].map(({ label, value, color }) => (
                        <div key={label}>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "3px" }}>{label}</div>
                            <div style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Progress bars */}
                {analytics && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                        <ProgressBar label="Daily DD" current={analytics.daily_loss_pct} limit={analytics.daily_drawdown_limit} status={analytics.daily_status} />
                        <ProgressBar label={`Max DD (${analytics.drawdown_type})`} current={analytics.max_loss_pct} limit={analytics.max_drawdown_limit} status={analytics.max_dd_status} />
                        {profitTarget !== null && (
                            <div style={{ marginBottom: "10px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                    <span style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                                        Profit Target {analytics.profit_achieved && <span style={{ color: "var(--emerald)" }}>✓</span>}
                                    </span>
                                    <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: profitPct >= 0 ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                                        {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}% / {profitTarget}%
                                    </span>
                                </div>
                                <div style={{ height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${profitProgress}%`, background: profitBarColor, borderRadius: "99px", transition: "width 400ms ease" }} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)" }}>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", letterSpacing: "0.04em" }}>{getStaleness(account.updated_at)}</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {isConnected ? (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--emerald)", letterSpacing: "0.06em" }}>● LIVE</span>
                    ) : (
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            aria-label="Connect to MT5"
                            style={{ padding: "5px 11px", fontSize: "11px", fontWeight: 600, background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.25)", color: "var(--emerald)", borderRadius: "6px", cursor: isConnecting ? "not-allowed" : "pointer", opacity: isConnecting ? 0.5 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                        >
                            {isConnecting ? "..." : "Connect"}
                        </button>
                    )}
                    <button
                        onClick={onEdit}
                        aria-label="Edit account"
                        style={{ padding: "5px 11px", fontSize: "11px", fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "6px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                    >
                        Edit
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={isDeleting}
                        aria-label="Delete account"
                        style={{ padding: "5px 11px", fontSize: "11px", fontWeight: 500, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--rose)", borderRadius: "6px", cursor: isDeleting ? "not-allowed" : "pointer", opacity: isDeleting ? 0.5 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                    >
                        {isDeleting ? "..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}
