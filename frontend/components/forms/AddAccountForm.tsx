"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "@/lib/api-client";
import { Fund, Account } from "@/lib/types";
import { X, CheckCircle2, AlertCircle, Fingerprint, KeyRound, Server } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface AddAccountFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "6px" };
const label: React.CSSProperties = { fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" };

export default function AddAccountForm({ onSuccess, onCancel }: AddAccountFormProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef, { onEscape: onCancel });

    const [accountId, setAccountId] = useState("");
    const [password, setPassword] = useState("");
    const [server, setServer] = useState("");
    const [funds, setFunds] = useState<Fund[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [matchedFund, setMatchedFund] = useState<Fund | null>(null);
    const [createdAccount, setCreatedAccount] = useState<Account | null>(null);

    useEffect(() => {
        apiClient.funds.getAll().then(setFunds).catch(console.error);
    }, []);

    const handleServerChange = (value: string) => {
        setServer(value);
        const matched = funds.find(f => value.toLowerCase().includes(f.server_pattern.toLowerCase()));
        setMatchedFund(matched || null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const result = await apiClient.accounts.create({ account_id: accountId, password, server });
            setCreatedAccount(result);
        } catch (err: any) {
            setError(err.message || "Failed to create account");
        } finally {
            setLoading(false);
        }
    };

    const getCreatedProgramLabel = () => {
        if (!createdAccount?.fund_program_id) return null;
        for (const fund of funds) {
            for (const prog of fund.programs) {
                if (prog.id === createdAccount.fund_program_id) return `${fund.fund_name} — ${prog.program_name}`;
            }
        }
        return null;
    };

    // ── Success state ──
    if (createdAccount) {
        const programLabel = getCreatedProgramLabel();
        if (typeof document === "undefined") return null;
        return createPortal(
            <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}>
                <div style={{ width: "100%", maxWidth: "420px", background: "#0b0e17", border: "1px solid rgba(52,211,153,0.25)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 40px rgba(0,0,0,0.6)", animation: "fade-up 0.25s cubic-bezier(0.22,1,0.36,1) both" }}>
                    <div style={{ height: "2px", background: "linear-gradient(90deg, var(--emerald), transparent)" }} />
                    <div style={{ padding: "28px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                            <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <CheckCircle2 size={18} style={{ color: "var(--emerald)" }} />
                            </div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 700, color: "#f0f4f8" }}>Account Added</div>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Successfully registered</div>
                            </div>
                        </div>

                        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
                            {[
                                ["Account ID", createdAccount.account_id, true],
                                createdAccount.mt5_name ? ["MT5 Name", createdAccount.mt5_name, false] : null,
                                ["Type", createdAccount.account_type === "fund" ? "Fund" : "Personal", false],
                                programLabel ? ["Program", programLabel, false] : null,
                                createdAccount.current_phase ? ["Phase", createdAccount.current_phase, false] : null,
                                createdAccount.balance != null ? ["Balance", `$${createdAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, true] : null,
                            ].filter(Boolean).map((row: any, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row[0]}</span>
                                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#f0f4f8", fontFamily: row[2] ? "'JetBrains Mono', monospace" : "inherit" }}>{row[1]}</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "8px", background: createdAccount.mt5_name ? "rgba(52,211,153,0.07)" : "rgba(251,191,36,0.07)", border: `1px solid ${createdAccount.mt5_name ? "rgba(52,211,153,0.2)" : "rgba(251,191,36,0.2)"}`, fontSize: "12px", color: createdAccount.mt5_name ? "var(--emerald)" : "var(--amber)" }}>
                            {createdAccount.mt5_name
                                ? "Phase auto-detected from MT5 account name."
                                : "MT5 connection failed — phase defaulted to Phase 1."}
                        </div>

                        <button
                            onClick={onSuccess}
                            style={{ width: "100%", marginTop: "20px", padding: "11px", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "var(--emerald)", borderRadius: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        , document.body);
    }

    // ── Add form ──
    if (typeof document === "undefined") return null;
    return createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }} />
            <div ref={modalRef} role="dialog" aria-modal="true" style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "440px", background: "#0b0e17", border: "1px solid var(--border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 40px rgba(0,0,0,0.6)", animation: "fade-up 0.25s cubic-bezier(0.22,1,0.36,1) both" }}>
                {/* Top accent */}
                <div style={{ height: "2px", background: "linear-gradient(90deg, var(--gold), transparent)" }} />

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px" }}>
                    <div>
                        <div className="section-label" style={{ marginBottom: "3px" }}>MT5 Manager</div>
                        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#f0f4f8", margin: 0 }}>Add New Account</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        style={{ width: "28px", height: "28px", borderRadius: "7px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: "8px", fontSize: "12px", color: "var(--rose)" }}>
                            <AlertCircle size={13} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div style={field}>
                            <label style={label}>Account ID</label>
                            <div style={{ position: "relative" }}>
                                <div style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                                    <Fingerprint size={14} />
                                </div>
                                <input
                                    type="text"
                                    value={accountId}
                                    onChange={(e) => setAccountId(e.target.value)}
                                    required
                                    className="input-diary"
                                    style={{ width: "100%", paddingLeft: "34px", fontFamily: "'JetBrains Mono', monospace" }}
                                    placeholder="e.g. 12345678"
                                />
                            </div>
                        </div>

                        <div style={field}>
                            <label style={label}>Password</label>
                            <div style={{ position: "relative" }}>
                                <div style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                                    <KeyRound size={14} />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="input-diary"
                                    style={{ width: "100%", paddingLeft: "34px" }}
                                    placeholder="MT5 account password"
                                />
                            </div>
                        </div>

                        <div style={field}>
                            <label style={label}>Server</label>
                            <div style={{ position: "relative" }}>
                                <div style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                                    <Server size={14} />
                                </div>
                                <input
                                    type="text"
                                    value={server}
                                    onChange={(e) => handleServerChange(e.target.value)}
                                    required
                                    className="input-diary"
                                    style={{ width: "100%", paddingLeft: "34px" }}
                                    placeholder="e.g. FTMO-Server"
                                />
                            </div>
                            {matchedFund ? (
                                <div style={{ fontSize: "11px", color: "var(--emerald)", display: "flex", alignItems: "center", gap: "5px" }}>
                                    <CheckCircle2 size={11} /> Matched: {matchedFund.fund_name}
                                </div>
                            ) : server.length > 2 ? (
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                    No fund match — will be added as personal account
                                </div>
                            ) : null}
                        </div>

                        <div style={{ display: "flex", gap: "8px", paddingTop: "6px" }}>
                            <button
                                type="button"
                                onClick={onCancel}
                                style={{ flex: 1, padding: "10px", fontSize: "13px", fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "9px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{ flex: 2, padding: "10px", fontSize: "13px", fontWeight: 600, background: loading ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "var(--emerald)", borderRadius: "9px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                            >
                                {loading ? "Connecting to MT5..." : "Add Account"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    , document.body);
}
