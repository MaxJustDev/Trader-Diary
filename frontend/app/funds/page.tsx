"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Fund } from "@/lib/types";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { RefreshCw } from "lucide-react";

export default function FundsPage() {
    const [funds, setFunds] = useState<Fund[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedFund, setExpandedFund] = useState<number | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

    useEffect(() => {
        loadFunds();
    }, []);

    const loadFunds = async () => {
        setLoading(true);
        try {
            const data = await apiClient.funds.getAll();
            setFunds(data);
        } catch (error) {
            console.error("Failed to load funds:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const result = await apiClient.funds.refreshTemplates();
            await loadFunds();
            toast.success(`Updated: ${result.updated.join(", ")}`);
        } catch (error: any) {
            toast.error(`Refresh failed: ${error.message ?? "Unknown error"}`);
        } finally {
            setRefreshing(false);
        }
    };

    const handleDelete = (id: number) => {
        setDeleteConfirm(id);
    };

    const doDelete = async () => {
        if (deleteConfirm === null) return;
        const id = deleteConfirm;
        setDeleteConfirm(null);
        setDeleting(id);
        try {
            await apiClient.funds.delete(id);
            await loadFunds();
            toast.success("Fund deleted");
        } catch (error: any) {
            toast.error(`Failed to delete: ${error.message ?? "Unknown error"}`);
        } finally {
            setDeleting(null);
        }
    };

    if (loading) {
        return (
            <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
                <div className="shimmer" style={{ width: "200px", height: "26px", borderRadius: "8px", marginBottom: "24px" }} />
                <div className="shimmer" style={{ height: "200px", borderRadius: "14px" }} />
            </div>
        );
    }

    return (
        <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
            <ConfirmModal
                isOpen={deleteConfirm !== null}
                title="Delete Fund"
                message="Are you sure you want to delete this fund and all its programs? Accounts linked to this fund will lose their program association."
                confirmLabel="Delete"
                variant="danger"
                onConfirm={doDelete}
                onCancel={() => setDeleteConfirm(null)}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <div>
                    <div className="section-label" style={{ marginBottom: "4px" }}>Trading Journal</div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: 0, letterSpacing: "-0.01em" }}>
                        Prop Funds
                    </h1>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "8px 16px",
                        background: "rgba(34,211,238,0.08)",
                        border: "1px solid rgba(34,211,238,0.2)",
                        color: "var(--cyan)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: refreshing ? "not-allowed" : "pointer",
                        opacity: refreshing ? 0.7 : 1,
                        transition: "all 150ms",
                        fontFamily: "'Sora', sans-serif",
                    }}
                >
                    <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
                    {refreshing ? "Refreshing..." : "Refresh Templates"}
                </button>
            </div>

            {/* Configured Funds */}
            <div>
                <div className="section-label" style={{ marginBottom: "12px" }}>Configured Funds</div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th className="th-diary">Fund Name</th>
                                <th className="th-diary">Server Pattern</th>
                                <th className="th-diary">Programs</th>
                                <th className="th-diary">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {funds.map((fund) => (
                                <>
                                    <tr
                                        key={fund.id}
                                        style={{ cursor: "pointer", transition: "background 100ms" }}
                                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"}
                                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                                        onClick={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                                    >
                                        <td className="td-diary" style={{ fontWeight: 600, color: "#f0f4f8" }}>{fund.fund_name}</td>
                                        <td className="td-diary" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-muted)" }}>{fund.server_pattern}</td>
                                        <td className="td-diary">
                                            <span className="badge" style={{ background: "rgba(34,211,238,0.08)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.2)" }}>
                                                {fund.programs.length} program{fund.programs.length !== 1 ? "s" : ""}
                                            </span>
                                        </td>
                                        <td className="td-diary">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(fund.id); }}
                                                disabled={deleting === fund.id}
                                                style={{ fontSize: "12px", color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0, opacity: deleting === fund.id ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}
                                            >
                                                {deleting === fund.id ? "Deleting..." : "Delete"}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedFund === fund.id && fund.programs.map((prog) => (
                                        <tr key={`prog-${prog.id}`} style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid var(--border)" }}>
                                            <td colSpan={4} style={{ padding: "16px 20px 16px 32px" }}>
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                                                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8" }}>{prog.program_name}</span>
                                                        {prog.payout_days && (
                                                            <span className="badge" style={{ background: "rgba(240,180,41,0.08)", color: "var(--gold)", border: "1px solid rgba(240,180,41,0.2)" }}>
                                                                Payout {prog.payout_days}d · {prog.payout_type}
                                                            </span>
                                                        )}
                                                        {prog.min_trading_days && (
                                                            <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                                                                Min {prog.min_trading_days} days
                                                            </span>
                                                        )}
                                                    </div>
                                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                        <thead>
                                                            <tr>
                                                                {["Phase", "Target", "Daily DD", "Max DD", "DD Type"].map(h => (
                                                                    <th key={h} style={{ textAlign: "left", padding: "4px 0", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {prog.phase_rules
                                                                .sort((a, b) => a.phase_order - b.phase_order)
                                                                .map((rule) => (
                                                                    <tr key={rule.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                                                        <td style={{ padding: "6px 0", fontWeight: 500, color: "var(--text-soft)", fontSize: "12px" }}>{rule.phase_name}</td>
                                                                        <td style={{ padding: "6px 0", color: "var(--emerald)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>{rule.profit_target ? `${rule.profit_target}%` : "—"}</td>
                                                                        <td style={{ padding: "6px 0", color: "var(--rose)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>{rule.daily_drawdown}%</td>
                                                                        <td style={{ padding: "6px 0", color: "var(--rose)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>{rule.max_drawdown}%</td>
                                                                        <td style={{ padding: "6px 0", color: "var(--text-muted)", fontSize: "11px" }}>{rule.drawdown_type}</td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                    {funds.length === 0 && (
                        <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                            <p style={{ fontSize: "14px", color: "var(--text-soft)", marginBottom: "6px" }}>No funds configured</p>
                            <p>Click &quot;Refresh Templates&quot; to load the latest prop firm data.</p>
                            <button
                                onClick={handleRefresh}
                                style={{
                                    marginTop: 16,
                                    padding: "8px 16px",
                                    borderRadius: 6,
                                    background: "var(--gold-dim)",
                                    color: "var(--gold)",
                                    border: "1px solid var(--gold)",
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: "pointer",
                                }}
                            >
                                Load fund templates
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
