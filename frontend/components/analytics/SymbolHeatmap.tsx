"use client";

import React, { useMemo } from "react";

interface Trade {
    executed_at?: string;
    symbol?: string;
    direction?: string;
    realized_pnl?: number | null;
    success?: boolean;
    rr_ratio?: number | null;
}

interface Props {
    trades: Trade[];
}

function SymbolHeatmap({ trades }: Props) {
    const closedTrades = useMemo(
        () => trades.filter((t) => t.realized_pnl != null),
        [trades],
    );

    // ── Hour heatmap ──────────────────────────────────────────────────────────
    const hourData = useMemo(() => {
        const buckets: Record<number, { pnl: number; count: number }> = {};
        for (let h = 0; h < 24; h++) buckets[h] = { pnl: 0, count: 0 };
        for (const t of closedTrades) {
            if (!t.executed_at) continue;
            const h = new Date(t.executed_at).getUTCHours();
            buckets[h].pnl += t.realized_pnl ?? 0;
            buckets[h].count++;
        }
        return buckets;
    }, [closedTrades]);

    const maxAbsPnl = useMemo(
        () => Math.max(...Object.values(hourData).map((b) => Math.abs(b.pnl)), 1),
        [hourData],
    );

    // ── Symbol performance ────────────────────────────────────────────────────
    const symbolData = useMemo(() => {
        const map: Record<string, { wins: number; total: number; pnl: number; rr: number[]; }> = {};
        for (const t of closedTrades) {
            const sym = t.symbol ?? "?";
            if (!map[sym]) map[sym] = { wins: 0, total: 0, pnl: 0, rr: [] };
            map[sym].total++;
            map[sym].pnl += t.realized_pnl ?? 0;
            if ((t.realized_pnl ?? 0) > 0) map[sym].wins++;
            if (t.rr_ratio && t.rr_ratio > 0) map[sym].rr.push(t.rr_ratio);
        }
        return Object.entries(map)
            .map(([sym, d]) => {
                const gains = closedTrades
                    .filter((t) => t.symbol === sym && (t.realized_pnl ?? 0) > 0)
                    .reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
                const losses = Math.abs(
                    closedTrades
                        .filter((t) => t.symbol === sym && (t.realized_pnl ?? 0) < 0)
                        .reduce((s, t) => s + (t.realized_pnl ?? 0), 0),
                );
                return {
                    sym,
                    total: d.total,
                    winRate: d.total > 0 ? Math.round((d.wins / d.total) * 100) : 0,
                    pnl: Math.round(d.pnl * 100) / 100,
                    avgRR: d.rr.length > 0 ? Math.round((d.rr.reduce((a, b) => a + b, 0) / d.rr.length) * 10) / 10 : null,
                    profitFactor: losses > 0 ? Math.round((gains / losses) * 100) / 100 : null,
                };
            })
            .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    }, [closedTrades]);

    if (closedTrades.length === 0) return null;

    const fmtPnl = (v: number) => `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Hour heatmap */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px 20px" }}>
                <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "12px" }}>Best Trading Hours (UTC)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: "3px" }}>
                    {Array.from({ length: 24 }, (_, h) => {
                        const b = hourData[h];
                        const ratio = maxAbsPnl > 0 ? b.pnl / maxAbsPnl : 0;
                        const bg = ratio > 0
                            ? `rgba(52,211,153,${Math.min(0.8, 0.1 + Math.abs(ratio) * 0.7)})`
                            : ratio < 0
                            ? `rgba(248,113,113,${Math.min(0.8, 0.1 + Math.abs(ratio) * 0.7)})`
                            : "rgba(255,255,255,0.04)";
                        return (
                            <div key={h} title={`${String(h).padStart(2, "0")}:00 UTC — ${b.count} trades, ${fmtPnl(b.pnl)}`}
                                style={{ aspectRatio: "1", borderRadius: "3px", background: bg, cursor: "default", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "2px" }}
                            >
                                <span style={{ fontSize: "6px", color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace" }}>{h}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "9px", color: "var(--text-dim)" }}>
                    <span>← Loss</span>
                    <span style={{ color: "var(--text-muted)", letterSpacing: "0.04em" }}>Hover for details</span>
                    <span>Profit →</span>
                </div>
            </div>

            {/* Symbol performance table */}
            {symbolData.length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Symbol Performance</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                                <tr>
                                    {["Symbol", "Trades", "Win Rate", "Realized P&L", "Avg R:R", "Profit Factor"].map((h, i) => (
                                        <th key={i} className="th-diary" style={{ textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {symbolData.map((row) => (
                                    <tr key={row.sym} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td className="td-diary" style={{ fontWeight: 600, color: "#f0f4f8" }}>{row.sym}</td>
                                        <td className="td-diary" style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>{row.total}</td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: row.winRate >= 50 ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                                            {row.winRate}%
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: row.pnl >= 0 ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                                            {fmtPnl(row.pnl)}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-soft)" }}>
                                            {row.avgRR != null ? `1:${row.avgRR}` : "—"}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: row.profitFactor != null && row.profitFactor >= 1 ? "var(--emerald)" : "var(--rose)" }}>
                                            {row.profitFactor != null ? row.profitFactor.toFixed(2) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default React.memo(SymbolHeatmap);
