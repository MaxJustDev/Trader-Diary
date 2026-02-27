"use client";

import { useState, useEffect } from "react";
import { Account, Fund } from "@/lib/types";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface Props {
    account: Account;
    funds: Fund[];
    onSaved: (updated: Account) => void;
    onCancel: () => void;
}

export default function EditAccountModal({ account, funds, onSaved, onCancel }: Props) {
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

    const selectedProgram = funds
        .flatMap((f) => f.programs)
        .find((p) => p.id === Number(fundProgramId));

    const phases = selectedProgram?.phase_rules ?? [];

    useEffect(() => {
        if (!selectedProgram) {
            setCurrentPhase("");
            return;
        }
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
            if (fundProgramId !== String(account.fund_program_id ?? "")) {
                payload.fund_program_id = fundProgramId ? Number(fundProgramId) : null;
            }
            if (currentPhase !== (account.current_phase ?? "")) {
                payload.current_phase = currentPhase || null;
            }
            if (startingBalance !== "" && Number(startingBalance) !== account.starting_balance) {
                payload.starting_balance = Number(startingBalance);
            }
            if (nextPayoutDate !== (account.next_payout_date ?? "")) {
                payload.next_payout_date = nextPayoutDate || null;
            }

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

    const inputClass = "w-full px-3 py-2 bg-white/[0.06] border border-white/[0.10] rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600";

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#161b27] border border-white/[0.10] rounded-xl shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="p-6 border-b border-white/[0.08]">
                    <h2 className="text-xl font-bold text-slate-100">Edit Account</h2>
                    <p className="text-sm text-slate-500 font-mono mt-1">{account.account_id}</p>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            New Password <span className="text-slate-600">(leave blank to keep current)</span>
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter new password..."
                            className={inputClass}
                        />
                    </div>

                    {/* Fund Program */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Fund Program</label>
                        <select
                            value={fundProgramId}
                            onChange={(e) => setFundProgramId(e.target.value)}
                            className={inputClass}
                        >
                            <option value="">— Personal (no fund) —</option>
                            {funds.map((fund) =>
                                fund.programs.map((prog) => (
                                    <option key={prog.id} value={prog.id}>
                                        {fund.fund_name} — {prog.program_name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Current Phase */}
                    {phases.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Current Phase</label>
                            <select
                                value={currentPhase}
                                onChange={(e) => setCurrentPhase(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">— Select phase —</option>
                                {phases
                                    .sort((a, b) => a.phase_order - b.phase_order)
                                    .map((rule) => (
                                        <option key={rule.phase_name} value={rule.phase_name}>
                                            {rule.phase_name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    )}

                    {/* Starting Balance */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Starting Balance</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={startingBalance}
                            onChange={(e) => setStartingBalance(e.target.value)}
                            placeholder="e.g. 100000"
                            className={`${inputClass} font-mono`}
                        />
                        <p className="text-xs text-slate-600 mt-1">Used as baseline for drawdown & profit calculations</p>
                    </div>

                    {/* Next Payout Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Next Payout Date</label>
                        <input
                            type="date"
                            value={nextPayoutDate}
                            onChange={(e) => setNextPayoutDate(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/[0.08] flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 disabled:opacity-50 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg disabled:opacity-50 font-medium shadow-lg shadow-blue-500/20 transition-all"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
