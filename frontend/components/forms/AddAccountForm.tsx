"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { Fund, Account } from "@/lib/types";

interface AddAccountFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export default function AddAccountForm({ onSuccess, onCancel }: AddAccountFormProps) {
    const [accountId, setAccountId] = useState("");
    const [password, setPassword] = useState("");
    const [server, setServer] = useState("");
    const [funds, setFunds] = useState<Fund[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [matchedFund, setMatchedFund] = useState<Fund | null>(null);
    const [createdAccount, setCreatedAccount] = useState<Account | null>(null);

    useEffect(() => {
        loadFunds();
    }, []);

    const loadFunds = async () => {
        try {
            const data = await apiClient.funds.getAll();
            setFunds(data);
        } catch (err) {
            console.error("Failed to load funds:", err);
        }
    };

    const handleServerChange = (value: string) => {
        setServer(value);
        const matched = funds.find(f =>
            value.toLowerCase().includes(f.server_pattern.toLowerCase())
        );
        setMatchedFund(matched || null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const result = await apiClient.accounts.create({
                account_id: accountId,
                password: password,
                server: server,
            });
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
                if (prog.id === createdAccount.fund_program_id) {
                    return `${fund.fund_name} - ${prog.program_name}`;
                }
            }
        }
        return null;
    };

    const inputClass = "w-full p-2.5 bg-white/[0.06] border border-white/[0.10] rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600";

    if (createdAccount) {
        const programLabel = getCreatedProgramLabel();
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#161b27] border border-white/[0.10] rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <h2 className="text-2xl font-bold mb-4 text-emerald-400">Account Added</h2>

                    <div className="space-y-3 mb-6">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Account ID:</span>
                            <span className="font-mono text-slate-100">{createdAccount.account_id}</span>
                        </div>
                        {createdAccount.mt5_name && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">MT5 Name:</span>
                                <span className="text-sm text-slate-300">{createdAccount.mt5_name}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-slate-500">Type:</span>
                            <span className="text-slate-300">{createdAccount.account_type === "fund" ? "Fund" : "Personal"}</span>
                        </div>
                        {programLabel && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Program:</span>
                                <span className="text-slate-300">{programLabel}</span>
                            </div>
                        )}
                        {createdAccount.current_phase && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Phase:</span>
                                <span className="text-xs bg-blue-500/[0.15] text-blue-300 border border-blue-500/[0.20] px-2 py-0.5 rounded">
                                    {createdAccount.current_phase}
                                </span>
                            </div>
                        )}
                        {createdAccount.balance != null && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Balance:</span>
                                <span className="font-mono text-slate-100">{createdAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        )}
                    </div>

                    {createdAccount.mt5_name ? (
                        <p className="text-xs text-emerald-400 mb-4">
                            Phase auto-detected from MT5 account name.
                        </p>
                    ) : (
                        <p className="text-xs text-amber-400 mb-4">
                            Could not connect to MT5 for auto-detection. Phase defaulted to Phase 1.
                        </p>
                    )}

                    <button
                        onClick={onSuccess}
                        className="w-full px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#161b27] border border-white/[0.10] rounded-xl shadow-2xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-slate-100">Add New Account</h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/[0.10] border border-red-500/[0.20] text-red-400 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1 font-medium text-slate-300 text-sm">Account ID *</label>
                        <input
                            type="text"
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            required
                            className={inputClass}
                            placeholder="e.g. 12345678"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-slate-300 text-sm">Password *</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-slate-300 text-sm">Server *</label>
                        <input
                            type="text"
                            value={server}
                            onChange={(e) => handleServerChange(e.target.value)}
                            required
                            className={inputClass}
                            placeholder="e.g. FTMO-Server"
                        />
                        {matchedFund ? (
                            <p className="text-xs text-emerald-400 mt-1">
                                Detected: {matchedFund.fund_name} (phase auto-detected on connect)
                            </p>
                        ) : server.length > 0 ? (
                            <p className="text-xs text-slate-500 mt-1">
                                No fund match - will be added as personal account
                            </p>
                        ) : null}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all"
                        >
                            {loading ? "Adding..." : "Add Account"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
