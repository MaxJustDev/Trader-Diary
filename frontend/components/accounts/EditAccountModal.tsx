"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Account, Fund } from "@/lib/types";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { X, KeyRound } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
    account: Account;
    funds: Fund[];
    onSaved: (updated: Account) => void;
    onCancel: () => void;
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "6px" };
const lbl: React.CSSProperties = { fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" };
const hint: React.CSSProperties = { fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" };

export default function EditAccountModal({ account, funds, onSaved, onCancel }: Props) {
    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef, { onEscape: onCancel });

    const [password, setPassword] = useState("");
    const [fundProgramId, setFundProgramId] = useState<string>(
        account.fund_program_id ? String(account.fund_program_id) : ""
    );
    const [currentPhase, setCurrentPhase] = useState(account.current_phase ?? "");
    const [startingBalance, setStartingBalance] = useState<string>(
        account.starting_balance != null ? String(account.starting_balance) : ""
    );
    const [nextPayoutDate, setNextPayoutDate] = useState(account.next_payout_date ?? "");
    const [saving, setSaving] = useState(false);

    const selectedProgram = funds.flatMap((f) => f.programs).find((p) => p.id === Number(fundProgramId));
    const phases = selectedProgram?.phase_rules ?? [];

    useEffect(() => {
        if (!selectedProgram) { setCurrentPhase(""); return; }
        const phaseNames = selectedProgram.phase_rules.map((r) => r.phase_name);
        if (!phaseNames.includes(currentPhase)) {
            const first = selectedProgram.phase_rules.sort((a, b) => a.phase_order - b.phase_order)[0];
            setCurrentPhase(first?.phase_name ?? "");
        }
    }, [fundProgramId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload: Record<string, any> = {};
            if (password) payload.password = password;
            if (fundProgramId !== String(account.fund_program_id ?? ""))
                payload.fund_program_id = fundProgramId ? Number(fundProgramId) : null;
            if (currentPhase !== (account.current_phase ?? ""))
                payload.current_phase = currentPhase || null;
            if (startingBalance !== "" && Number(startingBalance) !== account.starting_balance)
                payload.starting_balance = Number(startingBalance);
            if (nextPayoutDate !== (account.next_payout_date ?? ""))
                payload.next_payout_date = nextPayoutDate || null;

            if (Object.keys(payload).length === 0) {
                toast.info("No changes to save");
                onCancel();
                return;
            }
            const updated = await apiClient.accounts.update(account.id, payload);
            toast.success("Account updated");
            onSaved(updated);
        } catch (error: any) {
            toast.error(`Failed to update: ${error.message ?? "Unknown error"}`);
        } finally {
            setSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "9px 12px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        color: "var(--text)",
        fontSize: "13px",
        fontFamily: "'Sora', sans-serif",
        outline: "none",
        transition: "border-color 150ms, background 150ms",
        appearance: "none" as any,
    };

    const selectStyle: React.CSSProperties = {
        ...inputStyle,
        cursor: "pointer",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%23475569' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: "32px",
    };

    if (typeof document === "undefined") return null;
    return createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }} />
            <div ref={modalRef} role="dialog" aria-modal="true" style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "460px", background: "#0b0e17", border: "1px solid var(--border)", borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 40px rgba(0,0,0,0.6)", animation: "fade-up 0.25s cubic-bezier(0.22,1,0.36,1) both" }}>
                <div style={{ height: "2px", background: "linear-gradient(90deg, var(--cyan), transparent)" }} />

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <div className="section-label" style={{ marginBottom: "3px" }}>Account</div>
                        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#f0f4f8", margin: 0 }}>Edit Account</h2>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", marginTop: "2px" }}>{account.account_id}</div>
                    </div>
                    <button
                        onClick={onCancel}
                        aria-label="Close"
                        style={{ width: "28px", height: "28px", borderRadius: "7px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "60vh", overflowY: "auto" }}>
                    {/* Password */}
                    <div style={field}>
                        <label style={lbl}>New Password</label>
                        <div style={{ position: "relative" }}>
                            <div style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                                <KeyRound size={13} />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Leave blank to keep current"
                                style={{ ...inputStyle, paddingLeft: "34px" }}
                            />
                        </div>
                    </div>

                    {/* Fund Program */}
                    <div style={field}>
                        <label style={lbl}>Fund Program</label>
                        <select value={fundProgramId} onChange={(e) => setFundProgramId(e.target.value)} style={selectStyle}>
                            <option value="" style={{ background: "#0b0e17" }}>— Personal (no fund) —</option>
                            {funds.map((fund) =>
                                fund.programs.map((prog) => (
                                    <option key={prog.id} value={prog.id} style={{ background: "#0b0e17" }}>
                                        {fund.fund_name} — {prog.program_name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Phase */}
                    {phases.length > 0 && (
                        <div style={field}>
                            <label style={lbl}>Current Phase</label>
                            <select value={currentPhase} onChange={(e) => setCurrentPhase(e.target.value)} style={selectStyle}>
                                <option value="" style={{ background: "#0b0e17" }}>— Select phase —</option>
                                {phases.sort((a, b) => a.phase_order - b.phase_order).map((rule) => (
                                    <option key={rule.phase_name} value={rule.phase_name} style={{ background: "#0b0e17" }}>
                                        {rule.phase_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Starting Balance */}
                    <div style={field}>
                        <label style={lbl}>Starting Balance</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={startingBalance}
                            onChange={(e) => setStartingBalance(e.target.value)}
                            placeholder="e.g. 100000"
                            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                        />
                        <span style={hint}>Baseline for drawdown & profit calculations</span>
                    </div>

                    {/* Payout Date */}
                    <div style={field}>
                        <label style={lbl}>Next Payout Date</label>
                        <input
                            type="date"
                            value={nextPayoutDate}
                            onChange={(e) => setNextPayoutDate(e.target.value)}
                            style={{ ...inputStyle, colorScheme: "dark" }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ display: "flex", gap: "8px", padding: "16px 24px", borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.01)", justifyContent: "flex-end" }}>
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        style={{ padding: "9px 18px", fontSize: "13px", fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "8px", cursor: "pointer", transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ padding: "9px 22px", fontSize: "13px", fontWeight: 600, background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.28)", color: "var(--cyan)", borderRadius: "8px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif" }}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    , document.body);
}
