"use client";

import React, { useEffect, useState } from "react";
import { useMT5Store } from "@/lib/store";
import { useMT5Stream } from "@/hooks/useMT5Stream";
import { apiClient } from "@/lib/api-client";
import EquityChart from "./EquityChart";
import PositionsTable from "./PositionsTable";

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "14px 16px",
        }}>
            <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                {label}
            </div>
            <div style={{
                fontSize: "18px",
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: color ?? "#f0f4f8",
            }}>
                {value}
            </div>
        </div>
    );
}

interface RiskStatus {
    daily_loss_pct: number; daily_dd_limit: number;
    max_loss_pct: number; max_dd_limit: number;
    daily_starting: number; starting_balance: number;
}

function DrawdownBar({ label, usedPct, limitPct, startingAmount }: {
    label: string; usedPct: number; limitPct: number; startingAmount: number;
}) {
    const ratio = limitPct > 0 ? Math.min(usedPct / limitPct, 1) : 0;
    const color = ratio >= 1 ? "var(--rose)" : ratio >= 0.8 ? "#f59e0b" : "var(--emerald)";
    const remaining = Math.max(0, startingAmount * (limitPct - usedPct) / 100);
    const fmtUsd = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "10px" }}>
                <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color, fontWeight: 700 }}>
                        {usedPct.toFixed(2)}% <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>/ {limitPct}%</span>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: remaining < startingAmount * limitPct / 100 * 0.2 ? "var(--rose)" : "var(--text-soft)" }}>
                        ${fmtUsd(remaining)} left
                    </span>
                </div>
            </div>
            <div style={{ height: "6px", borderRadius: "99px", background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${ratio * 100}%`, borderRadius: "99px", background: color, transition: "width 0.4s ease, background 0.4s ease" }} />
            </div>
        </div>
    );
}

function LiveDataPanel() {
    const connected = useMT5Store((s) => s.connected);
    const accountInfo = useMT5Store((s) => s.accountInfo);
    const [serverTime, setServerTime] = useState<string | null>(null);
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);

    useMT5Stream();

    useEffect(() => {
        if (!connected) { setServerTime(null); return; }

        const fetchTime = async () => {
            try {
                const data = await apiClient.mt5.getServerTime();
                if (data.server_time) {
                    setServerTime(data.server_time);
                    setTimeOffset(data.offset_seconds);
                }
            } catch { /* not critical */ }
        };

        fetchTime();
        const interval = setInterval(() => {
            // Advance display time by 1s locally (fetch every 30s for accuracy)
            setServerTime((prev) => {
                if (!prev) return prev;
                const d = new Date(prev);
                d.setSeconds(d.getSeconds() + 1);
                return d.toISOString();
            });
        }, 1000);
        const syncInterval = setInterval(fetchTime, 30000);

        return () => { clearInterval(interval); clearInterval(syncInterval); };
    }, [connected]);

    useEffect(() => {
        if (!connected) { setRiskStatus(null); return; }
        const fetch = async () => {
            try {
                const data = await apiClient.mt5.getRiskStatus();
                setRiskStatus(data);
            } catch { /* no fund rules = no risk status */ }
        };
        fetch();
        const iv = setInterval(fetch, 5000);
        return () => clearInterval(iv);
    }, [connected]);

    if (!connected) return null;

    const fmt = (v?: number) =>
        v != null ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

    const profitColor = accountInfo && accountInfo.profit >= 0 ? "var(--emerald)" : "var(--rose)";

    return (
        <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="live-dot" />
                <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#f0f4f8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Live Account Data
                </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                <StatCard label="Balance" value={`$${fmt(accountInfo?.balance)}`} />
                <StatCard label="Equity" value={`$${fmt(accountInfo?.equity)}`} />
                <StatCard label="Floating P&L" value={`${accountInfo?.profit != null && accountInfo.profit >= 0 ? "+" : ""}$${fmt(accountInfo?.profit)}`} color={profitColor} />
                <StatCard label="Free Margin" value={`$${fmt(accountInfo?.margin_free)}`} />
                {serverTime && (
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Server Time</div>
                        <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--cyan)" }}>
                            {new Date(serverTime).toISOString().slice(11, 19)}
                        </div>
                        {timeOffset !== 0 && (
                            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>
                                {timeOffset > 0 ? "+" : ""}{Math.round(timeOffset / 3600)}h offset
                            </div>
                        )}
                    </div>
                )}
            </div>

            {riskStatus && riskStatus.daily_dd_limit > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <span style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Drawdown Status</span>
                    <DrawdownBar label="Daily DD" usedPct={riskStatus.daily_loss_pct} limitPct={riskStatus.daily_dd_limit} startingAmount={riskStatus.daily_starting} />
                    <DrawdownBar label="Max DD" usedPct={riskStatus.max_loss_pct} limitPct={riskStatus.max_dd_limit} startingAmount={riskStatus.starting_balance} />
                </div>
            )}

            <EquityChart />
            <PositionsTable />
        </div>
    );
}

export default React.memo(LiveDataPanel);
