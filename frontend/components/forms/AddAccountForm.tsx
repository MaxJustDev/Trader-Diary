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

    // Auto-detected fund from server pattern
    const [matchedFund, setMatchedFund] = useState<Fund | null>(null);

    // Result state — shows after successful creation
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

    // Resolve program name for the created account
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

    // Success view after account creation
    if (createdAccount) {
        const programLabel = getCreatedProgramLabel();
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                    <h2 className="text-2xl font-bold mb-4 text-green-600">Account Added</h2>

                    <div className="space-y-3 mb-6">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Account ID:</span>
                            <span className="font-mono">{createdAccount.account_id}</span>
                        </div>
                        {createdAccount.mt5_name && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">MT5 Name:</span>
                                <span className="text-sm">{createdAccount.mt5_name}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-gray-500">Type:</span>
                            <span>{createdAccount.account_type === "fund" ? "Fund" : "Personal"}</span>
                        </div>
                        {programLabel && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Program:</span>
                                <span>{programLabel}</span>
                            </div>
                        )}
                        {createdAccount.current_phase && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Phase:</span>
                                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                                    {createdAccount.current_phase}
                                </span>
                            </div>
                        )}
                        {createdAccount.balance != null && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Balance:</span>
                                <span className="font-mono">{createdAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        )}
                    </div>

                    {createdAccount.mt5_name ? (
                        <p className="text-xs text-green-600 mb-4">
                            Phase auto-detected from MT5 account name.
                        </p>
                    ) : (
                        <p className="text-xs text-yellow-600 mb-4">
                            Could not connect to MT5 for auto-detection. Phase defaulted to Phase 1.
                        </p>
                    )}

                    <button
                        onClick={onSuccess}
                        className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">Add New Account</h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1 font-medium">Account ID *</label>
                        <input
                            type="text"
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            required
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g. 12345678"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium">Password *</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium">Server *</label>
                        <input
                            type="text"
                            value={server}
                            onChange={(e) => handleServerChange(e.target.value)}
                            required
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g. FTMO-Server"
                        />
                        {matchedFund ? (
                            <p className="text-xs text-green-600 mt-1">
                                Detected: {matchedFund.fund_name} (phase auto-detected on connect)
                            </p>
                        ) : server.length > 0 ? (
                            <p className="text-xs text-gray-500 mt-1">
                                No fund match - will be added as personal account
                            </p>
                        ) : null}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {loading ? "Adding..." : "Add Account"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
