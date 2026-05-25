"use client";

import React, { useState } from "react";
import { useMT5Store } from "@/lib/store";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface EditState {
    ticket: number;
    sl: string;
    tp: string;
}

function PositionsTable() {
    const positions = useMT5Store((s) => s.positions);
    const [closing, setClosing] = useState<number | null>(null);
    const [closingAll, setClosingAll] = useState(false);
    const [confirmTicket, setConfirmTicket] = useState<number | null>(null);
    const [confirmAll, setConfirmAll] = useState(false);
    const [editing, setEditing] = useState<EditState | null>(null);
    const [modifying, setModifying] = useState(false);
    const [partialTicket, setPartialTicket] = useState<number | null>(null);
    const [partialPct, setPartialPct] = useState(50);
    const [partialClosing, setPartialClosing] = useState(false);
    const [trailTicket, setTrailTicket] = useState<number | null>(null);
    const [trailPips, setTrailPips] = useState("20");
    const [trailSetting, setTrailSetting] = useState(false);
    const [activeTrails, setActiveTrails] = useState<Set<number>>(new Set());

    const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);

    const fmt = (v: number, digits = 2) =>
        v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

    const handleClose = async (ticket: number) => {
        setClosing(ticket);
        setConfirmTicket(null);
        try {
            await apiClient.mt5.closePosition(ticket);
            toast.success(`Position #${ticket} closed`);
        } catch (error: any) {
            toast.error(`Failed to close #${ticket}: ${error.message ?? "Unknown error"}`);
        } finally {
            setClosing(null);
        }
    };

    const handleCloseAll = async () => {
        setClosingAll(true);
        setConfirmAll(false);
        try {
            const result = await apiClient.mt5.closeAllPositions();
            if (result.failed === 0) {
                toast.success(`All ${result.closed} position(s) closed`);
            } else {
                toast.warning(`${result.closed} closed, ${result.failed} failed`);
            }
        } catch (error: any) {
            toast.error(`Failed to close all: ${error.message ?? "Unknown error"}`);
        } finally {
            setClosingAll(false);
        }
    };

    const handleBreakEven = async (pos: { ticket: number; price_open: number; tp: number }) => {
        try {
            await apiClient.mt5.modifyPosition(pos.ticket, pos.price_open, pos.tp);
            toast.success(`#${pos.ticket} SL moved to break-even (${pos.price_open})`);
        } catch (error: any) {
            toast.error(`Break-even failed: ${error.message ?? "Unknown error"}`);
        }
    };

    const handlePartialClose = async () => {
        if (!partialTicket) return;
        const pos = positions.find((p) => p.ticket === partialTicket);
        if (!pos) return;
        const vol = Math.round((pos.volume * partialPct) / 100 * 100) / 100;
        setPartialClosing(true);
        try {
            await apiClient.mt5.partialClose(partialTicket, vol);
            toast.success(`Closed ${partialPct}% (${vol} lot) of #${partialTicket}`);
            setPartialTicket(null);
        } catch (error: any) {
            toast.error(`Partial close failed: ${error.message ?? "Unknown error"}`);
        } finally {
            setPartialClosing(false);
        }
    };

    const handleSetTrail = async () => {
        if (!trailTicket) return;
        const pips = parseFloat(trailPips);
        if (!pips || pips <= 0) { toast.error("Enter a valid pips value"); return; }
        setTrailSetting(true);
        try {
            await apiClient.mt5.setTrailingStop(trailTicket, pips);
            setActiveTrails((prev) => new Set(prev).add(trailTicket));
            toast.success(`Trailing stop set: #${trailTicket} @ ${pips} pips`);
            setTrailTicket(null);
        } catch (error: any) {
            toast.error(`Trailing stop failed: ${error.message ?? "Unknown error"}`);
        } finally {
            setTrailSetting(false);
        }
    };

    const handleRemoveTrail = async (ticket: number) => {
        try {
            await apiClient.mt5.removeTrailingStop(ticket);
            setActiveTrails((prev) => { const s = new Set(prev); s.delete(ticket); return s; });
            toast.success(`Trailing stop removed: #${ticket}`);
        } catch (error: any) {
            toast.error(`Failed: ${error.message ?? "Unknown error"}`);
        }
    };

    const handleModify = async () => {
        if (!editing) return;
        setModifying(true);
        try {
            await apiClient.mt5.modifyPosition(
                editing.ticket,
                parseFloat(editing.sl) || 0,
                parseFloat(editing.tp) || 0,
            );
            toast.success(`Position #${editing.ticket} SL/TP updated`);
            setEditing(null);
        } catch (error: any) {
            toast.error(`Modify failed: ${error.message ?? "Unknown error"}`);
        } finally {
            setModifying(false);
        }
    };

    const confirmPos = positions.find((p) => p.ticket === confirmTicket);

    return (
        <>
            {/* SL/TP Edit Modal */}
            {editing && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                    <div style={{ background: "#0d1117", border: "1px solid var(--border)", borderRadius: "14px", padding: "24px", minWidth: "320px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f4f8" }}>Modify Position #{editing.ticket}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <label style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Stop Loss</label>
                            <input
                                className="input-diary"
                                type="number"
                                step="any"
                                value={editing.sl}
                                onChange={(e) => setEditing({ ...editing, sl: e.target.value })}
                                placeholder="0 = remove SL"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                            />
                            <label style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Take Profit</label>
                            <input
                                className="input-diary"
                                type="number"
                                step="any"
                                value={editing.tp}
                                onChange={(e) => setEditing({ ...editing, tp: e.target.value })}
                                placeholder="0 = remove TP"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                            <button onClick={() => setEditing(null)} style={{ padding: "7px 16px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-soft)", borderRadius: "7px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                                Cancel
                            </button>
                            <button onClick={handleModify} disabled={modifying} style={{ padding: "7px 16px", fontSize: "12px", fontWeight: 600, background: "rgba(240,180,41,0.15)", border: "1px solid rgba(240,180,41,0.35)", color: "var(--gold)", borderRadius: "7px", cursor: modifying ? "not-allowed" : "pointer", opacity: modifying ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
                                {modifying ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Partial Close Modal */}
            {partialTicket !== null && (() => {
                const pos = positions.find((p) => p.ticket === partialTicket);
                if (!pos) return null;
                const vol = Math.round((pos.volume * partialPct) / 100 * 100) / 100;
                return (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                        <div style={{ background: "#0d1117", border: "1px solid var(--border)", borderRadius: "14px", padding: "24px", minWidth: "300px", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f4f8" }}>Partial Close #{partialTicket}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Full volume: {fmt(pos.volume)} lots</div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                {[25, 50, 75, 100].map((p) => (
                                    <button key={p} onClick={() => setPartialPct(p)} style={{ flex: 1, padding: "7px 0", fontSize: "12px", fontWeight: 600, background: partialPct === p ? "rgba(240,180,41,0.20)" : "rgba(255,255,255,0.05)", border: `1px solid ${partialPct === p ? "rgba(240,180,41,0.5)" : "var(--border)"}`, color: partialPct === p ? "var(--gold)" : "var(--text-soft)", borderRadius: "7px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                                        {p}%
                                    </button>
                                ))}
                            </div>
                            <div style={{ textAlign: "center", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", color: "var(--cyan)" }}>
                                Close {vol} lots
                            </div>
                            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                <button onClick={() => setPartialTicket(null)} style={{ padding: "7px 16px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-soft)", borderRadius: "7px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                                    Cancel
                                </button>
                                <button onClick={handlePartialClose} disabled={partialClosing} style={{ padding: "7px 16px", fontSize: "12px", fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "var(--rose)", borderRadius: "7px", cursor: partialClosing ? "not-allowed" : "pointer", opacity: partialClosing ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
                                    {partialClosing ? "Closing..." : "Close"}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Trailing Stop Modal */}
            {trailTicket !== null && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                    <div style={{ background: "#0d1117", border: "1px solid var(--border)", borderRadius: "14px", padding: "24px", minWidth: "280px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f4f8" }}>Trailing Stop #{trailTicket}</div>
                        <div>
                            <label style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "6px" }}>Trail Distance (pips)</label>
                            <input
                                className="input-diary"
                                type="number"
                                min="1"
                                step="1"
                                value={trailPips}
                                onChange={(e) => setTrailPips(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSetTrail(); if (e.key === "Escape") setTrailTicket(null); }}
                                autoFocus
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            {[10, 20, 50].map((p) => (
                                <button key={p} onClick={() => setTrailPips(String(p))} style={{ flex: 1, padding: "5px 0", fontSize: "11px", background: trailPips === String(p) ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${trailPips === String(p) ? "rgba(167,139,250,0.5)" : "var(--border)"}`, color: trailPips === String(p) ? "var(--purple)" : "var(--text-dim)", borderRadius: "6px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                                    {p}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                            <button onClick={() => setTrailTicket(null)} style={{ padding: "7px 16px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-soft)", borderRadius: "7px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>Cancel</button>
                            <button onClick={handleSetTrail} disabled={trailSetting} style={{ padding: "7px 16px", fontSize: "12px", fontWeight: 600, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.35)", color: "var(--purple)", borderRadius: "7px", cursor: trailSetting ? "not-allowed" : "pointer", opacity: trailSetting ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
                                {trailSetting ? "Setting..." : "Activate"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmTicket !== null}
                title="Close Position"
                message={
                    confirmPos
                        ? `Close ${confirmPos.type} ${confirmPos.volume} ${confirmPos.symbol} (Ticket #${confirmPos.ticket})?\nCurrent P&L: ${confirmPos.profit >= 0 ? "+" : ""}${fmt(confirmPos.profit)}`
                        : "Close this position?"
                }
                confirmLabel="Close Position"
                variant="warning"
                onConfirm={() => confirmTicket !== null && handleClose(confirmTicket)}
                onCancel={() => setConfirmTicket(null)}
            />

            <ConfirmModal
                isOpen={confirmAll}
                title="Close All Positions"
                message={`Close all ${positions.length} open position(s)?\nTotal P&L: ${totalProfit >= 0 ? "+" : ""}${fmt(totalProfit)}\n\nThis cannot be undone.`}
                confirmLabel="Close All"
                variant="danger"
                onConfirm={handleCloseAll}
                onCancel={() => setConfirmAll(false)}
            />

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Open Positions</span>
                        {positions.length > 0 && (
                            <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-dim)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "99px", padding: "1px 7px" }}>
                                {positions.length}
                            </span>
                        )}
                    </div>
                    {positions.length > 1 && (
                        <button
                            onClick={() => setConfirmAll(true)}
                            disabled={closingAll}
                            style={{ padding: "5px 12px", fontSize: "11px", fontWeight: 600, background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", color: "var(--rose)", borderRadius: "6px", cursor: closingAll ? "not-allowed" : "pointer", opacity: closingAll ? 0.5 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                        >
                            {closingAll ? "Closing..." : "Close All"}
                        </button>
                    )}
                </div>

                {positions.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
                        No open positions
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                                <tr>
                                    {["Ticket", "Symbol", "Type", "Volume", "Open Price", "SL", "TP", "Profit", ""].map((h, i) => (
                                        <th key={i} className="th-diary" style={{ textAlign: i >= 3 ? "right" : "left", paddingRight: i === 8 ? "16px" : undefined }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map((pos) => (
                                    <tr key={pos.ticket} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td className="td-diary" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>{pos.ticket}</td>
                                        <td className="td-diary" style={{ fontWeight: 600, color: "#f0f4f8" }}>{pos.symbol}</td>
                                        <td className="td-diary">
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", padding: "2px 8px",
                                                borderRadius: "99px", fontSize: "10px", fontWeight: 600,
                                                background: pos.type === "BUY" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                                                color: pos.type === "BUY" ? "var(--emerald)" : "var(--rose)",
                                                border: `1px solid ${pos.type === "BUY" ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                                            }}>
                                                {pos.type}
                                            </span>
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-soft)" }}>{fmt(pos.volume)}</td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-soft)" }}>{fmt(pos.price_open, 5)}</td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "var(--rose)" }}>{pos.sl ? fmt(pos.sl, 5) : "—"}</td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "var(--emerald)" }}>{pos.tp ? fmt(pos.tp, 5) : "—"}</td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: pos.profit >= 0 ? "var(--emerald)" : "var(--rose)" }}>
                                            {pos.profit >= 0 ? "+" : ""}{fmt(pos.profit)}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", paddingRight: "16px", whiteSpace: "nowrap" }}>
                                            <button
                                                onClick={() => handleBreakEven({ ticket: pos.ticket, price_open: pos.price_open, tp: pos.tp })}
                                                title="Move SL to entry price"
                                                style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 600, background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.22)", color: "var(--purple)", borderRadius: "5px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif", marginRight: "4px" }}
                                            >
                                                BE
                                            </button>
                                            <button
                                                onClick={() => { setPartialTicket(pos.ticket); setPartialPct(50); }}
                                                title="Partial close"
                                                style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 600, background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.22)", color: "var(--cyan)", borderRadius: "5px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif", marginRight: "4px" }}
                                            >
                                                ½
                                            </button>
                                            <button
                                                onClick={() => setEditing({ ticket: pos.ticket, sl: String(pos.sl || 0), tp: String(pos.tp || 0) })}
                                                style={{ padding: "3px 9px", fontSize: "10px", fontWeight: 600, background: "rgba(240,180,41,0.10)", border: "1px solid rgba(240,180,41,0.22)", color: "var(--gold)", borderRadius: "5px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif", marginRight: "4px" }}
                                            >
                                                Edit
                                            </button>
                                            {activeTrails.has(pos.ticket) ? (
                                                <button
                                                    onClick={() => handleRemoveTrail(pos.ticket)}
                                                    title="Remove trailing stop"
                                                    style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 600, background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.4)", color: "var(--cyan)", borderRadius: "5px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif", marginRight: "4px" }}
                                                >
                                                    Trail ✓
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => { setTrailTicket(pos.ticket); setTrailPips("20"); }}
                                                    title="Set trailing stop"
                                                    style={{ padding: "3px 8px", fontSize: "10px", fontWeight: 600, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: "5px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif", marginRight: "4px" }}
                                                >
                                                    Trail
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setConfirmTicket(pos.ticket)}
                                                disabled={closing === pos.ticket || closingAll}
                                                style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 600, background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.22)", color: "var(--rose)", borderRadius: "5px", cursor: (closing === pos.ticket || closingAll) ? "not-allowed" : "pointer", opacity: (closing === pos.ticket || closingAll) ? 0.5 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                                            >
                                                {closing === pos.ticket ? "..." : "Close"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                                    <td colSpan={7} className="td-diary" style={{ textAlign: "right", color: "var(--text-dim)", fontSize: "10px", letterSpacing: "0.04em" }}>
                                        Total P&amp;L
                                    </td>
                                    <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: totalProfit >= 0 ? "var(--emerald)" : "var(--rose)" }}>
                                        {totalProfit >= 0 ? "+" : ""}{fmt(totalProfit)}
                                    </td>
                                    <td className="td-diary" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

export default React.memo(PositionsTable);
