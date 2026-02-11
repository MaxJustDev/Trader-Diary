"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAccountStore, useMT5Store } from "@/lib/store";
import { Fund } from "@/lib/types";
import AddAccountForm from "@/components/forms/AddAccountForm";
import LiveDataPanel from "@/components/mt5/LiveDataPanel";

export default function AccountsPage() {
    const { accounts, setAccounts } = useAccountStore();
    const { connected, connectedAccountId, setConnected, setConnectedAccountId, clearEquityHistory, reset } = useMT5Store();
    const [funds, setFunds] = useState<Fund[]>([]);
    const [loading, setLoading] = useState(false);
    const [initingAll, setInitingAll] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [connecting, setConnecting] = useState<string | null>(null);

    useEffect(() => {
        loadAccounts();
        loadFunds();
        checkMT5Status();
    }, []);

    const loadAccounts = async () => {
        setLoading(true);
        try {
            const data = await apiClient.accounts.getAll();
            setAccounts(data);
        } catch (error) {
            console.error("Failed to load accounts:", error);
        } finally {
            setLoading(false);
        }
    };

    const loadFunds = async () => {
        try {
            const data = await apiClient.funds.getAll();
            setFunds(data);
        } catch (error) {
            console.error("Failed to load funds:", error);
        }
    };

    const checkMT5Status = async () => {
        try {
            const status = await apiClient.mt5.getStatus();
            setConnected(status.connected);
            setConnectedAccountId(status.account_id);
        } catch (error) {
            console.error("Failed to check MT5 status:", error);
        }
    };

    // Resolve program name from fund_program_id
    const getProgramLabel = (fundProgramId?: number) => {
        if (!fundProgramId) return null;
        for (const fund of funds) {
            for (const prog of fund.programs) {
                if (prog.id === fundProgramId) {
                    return `${fund.fund_name} - ${prog.program_name}`;
                }
            }
        }
        return null;
    };

    const handleInitAll = async () => {
        setInitingAll(true);
        try {
            await apiClient.accounts.refreshAll();
            await loadAccounts();
        } catch (error) {
            console.error("Failed to init all accounts:", error);
        } finally {
            setInitingAll(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this account?")) return;

        try {
            await apiClient.accounts.delete(id);
            await loadAccounts();
        } catch (error: any) {
            alert(`Failed to delete: ${error.message}`);
        }
    };

    const handleConnect = async (id: number) => {
        setConnecting(String(id));
        try {
            clearEquityHistory();
            const res = await apiClient.mt5.connect(id);
            setConnected(true);
            setConnectedAccountId(id);
            await loadAccounts();
        } catch (error: any) {
            alert(`Connection failed: ${error.message}`);
        } finally {
            setConnecting(null);
        }
    };

    const handleDisconnect = async () => {
        try {
            await apiClient.mt5.disconnect();
            setConnected(false);
            setConnectedAccountId(null);
            reset();
        } catch (error: any) {
            alert(`Disconnect failed: ${error.message}`);
        }
    };

    const formatNumber = (val?: number) => {
        if (val == null) return "—";
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Accounts Management</h1>
                <div className="flex gap-2">
                    {connected && (
                        <button
                            onClick={handleDisconnect}
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            Disconnect MT5
                        </button>
                    )}
                    <button
                        onClick={handleInitAll}
                        disabled={initingAll || accounts.length === 0}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                        {initingAll ? "Initializing..." : "Init All"}
                    </button>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                        + Add Account
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="text-left p-4 font-semibold">Account ID</th>
                            <th className="text-left p-4 font-semibold">MT5 Name</th>
                            <th className="text-left p-4 font-semibold">Server</th>
                            <th className="text-left p-4 font-semibold">Type</th>
                            <th className="text-left p-4 font-semibold">Program / Phase</th>
                            <th className="text-right p-4 font-semibold">Balance</th>
                            <th className="text-right p-4 font-semibold">Equity</th>
                            <th className="text-left p-4 font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.map((account) => {
                            const programLabel = getProgramLabel(account.fund_program_id);
                            const isConnected = connected && connectedAccountId === account.id;
                            return (
                                <tr key={account.id} className={`border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${isConnected ? "bg-green-50 dark:bg-green-900/20" : ""}`}>
                                    <td className="p-4 font-mono">{account.account_id}</td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={account.mt5_name || ""}>
                                        {account.mt5_name || "—"}
                                    </td>
                                    <td className="p-4">{account.server}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${account.account_type === "fund"
                                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                                : "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200"
                                            }`}>
                                            {account.account_type === "fund" ? "Fund" : "Personal"}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {programLabel ? (
                                            <div>
                                                <span className="text-sm">{programLabel}</span>
                                                {account.current_phase && (
                                                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                                                        {account.current_phase}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">—</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right font-mono text-sm">
                                        {formatNumber(account.balance)}
                                    </td>
                                    <td className="p-4 text-right font-mono text-sm">
                                        {formatNumber(account.equity)}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            {isConnected ? (
                                                <span className="text-green-600 text-sm font-medium">Connected</span>
                                            ) : (
                                                <button
                                                    onClick={() => handleConnect(account.id)}
                                                    disabled={connecting === String(account.id)}
                                                    className="text-green-600 hover:underline disabled:opacity-50"
                                                >
                                                    {connecting === String(account.id) ? "..." : "Connect"}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(account.id)}
                                                className="text-red-500 hover:underline"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {accounts.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                        <p className="text-lg mb-2">No accounts found</p>
                        <p>Add your first MT5 account to get started.</p>
                    </div>
                )}
            </div>

            <LiveDataPanel />

            {showAddForm && (
                <AddAccountForm
                    onSuccess={() => {
                        setShowAddForm(false);
                        loadAccounts();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}
        </div>
    );
}
