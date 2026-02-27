"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAccountStore, useMT5Store } from "@/lib/store";
import { Fund, FundAccountAnalytics } from "@/lib/types";
import AddAccountForm from "@/components/forms/AddAccountForm";
import LiveDataPanel from "@/components/mt5/LiveDataPanel";
import AccountCard from "@/components/accounts/AccountCard";
import EditAccountModal from "@/components/accounts/EditAccountModal";
import SkeletonCard from "@/components/ui/SkeletonCard";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { LayoutGrid, List } from "lucide-react";

export default function AccountsPage() {
    const { accounts, setAccounts } = useAccountStore();
    const {
        connected,
        connectedAccountId,
        setConnected,
        setConnectedAccountId,
        clearEquityHistory,
        reset,
    } = useMT5Store();
    const [funds, setFunds] = useState<Fund[]>([]);
    const [fundAnalytics, setFundAnalytics] = useState<FundAccountAnalytics[]>([]);
    const [loading, setLoading] = useState(false);
    const [initingAll, setInitingAll] = useState(false);
    const [initResults, setInitResults] = useState<any[] | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [editingAccount, setEditingAccount] = useState<typeof accounts[0] | null>(null);
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<"all" | "fund" | "personal">("all");
    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

    useEffect(() => {
        loadData();
        loadFunds();
        checkMT5Status();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [accountsData, analyticsData] = await Promise.all([
                apiClient.accounts.getAll(),
                apiClient.analytics.getFundStatus(),
            ]);
            setAccounts(accountsData);
            setFundAnalytics(analyticsData.accounts);
        } catch (error) {
            console.error("Failed to load data:", error);
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

    const analyticsMap = new Map(fundAnalytics.map((a) => [a.account_id, a]));

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

    const filtered = accounts
        .filter((a) => filterType === "all" || a.account_type === filterType)
        .filter(
            (a) =>
                !search ||
                [a.account_id, a.mt5_name, a.server].some((v) =>
                    (v || "").toLowerCase().includes(search.toLowerCase())
                )
        );

    const handleInitAll = async () => {
        setInitingAll(true);
        setInitResults(null);
        try {
            const results = await apiClient.accounts.refreshAll();
            const ok = (results.results || []).filter((r: any) => r.status === "success").length;
            const fail = (results.results || []).length - ok;
            toast.success(`Refreshed ${ok} accounts${fail ? ` (${fail} failed)` : ""}`);
            setInitResults(results.results || []);
            await loadData();
        } catch (error: any) {
            toast.error(`Failed to refresh: ${error.message ?? "Unknown error"}`);
        } finally {
            setInitingAll(false);
        }
    };

    const handleEdit = (account: typeof accounts[0]) => {
        setEditingAccount(account);
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
            await apiClient.accounts.delete(id);
            await loadData();
            toast.success("Account deleted");
        } catch (error: any) {
            toast.error(`Failed to delete: ${error.message ?? "Unknown error"}`);
        } finally {
            setDeleting(null);
        }
    };

    const handleConnect = async (id: number) => {
        setConnecting(String(id));
        try {
            clearEquityHistory();
            await apiClient.mt5.connect(id);
            setConnected(true);
            setConnectedAccountId(id);
            await loadData();
            toast.success("MT5 connected successfully");
        } catch (error: any) {
            toast.error(`Connection failed: ${error.message ?? "Unknown error"}`);
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
            toast.success("MT5 disconnected");
        } catch (error: any) {
            toast.error(`Disconnect failed: ${error.message ?? "Unknown error"}`);
        }
    };

    const formatNumber = (val?: number) => {
        if (val == null) return "—";
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="h-10 w-32 rounded bg-white/[0.06] animate-pulse mb-6" />
                <div className="h-10 rounded-lg bg-white/[0.06] animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <ConfirmModal
                isOpen={deleteConfirm !== null}
                title="Delete Account"
                message="Are you sure you want to delete this account? This will also remove the associated MT5 terminal copy."
                confirmLabel="Delete"
                variant="danger"
                onConfirm={doDelete}
                onCancel={() => setDeleteConfirm(null)}
            />
            {editingAccount && (
                <EditAccountModal
                    account={editingAccount}
                    funds={funds}
                    onSaved={async (updated) => {
                        setEditingAccount(null);
                        await loadData();
                    }}
                    onCancel={() => setEditingAccount(null)}
                />
            )}

            {/* Page title + disconnect */}
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-bold text-slate-100">Accounts</h1>
                {connected && (
                    <button
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-lg text-sm shadow-lg shadow-red-500/20 transition-all"
                    >
                        Disconnect MT5
                    </button>
                )}
            </div>

            {/* Search + filter + view toggle + actions bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <input
                    type="text"
                    placeholder="Search by ID, name, or server..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg bg-white/[0.06] border border-white/[0.10] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                {/* Type filter */}
                <div className="flex rounded-lg overflow-hidden border border-white/[0.10] text-sm">
                    {(["all", "fund", "personal"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilterType(t)}
                            className={`px-3 py-2 capitalize transition-colors ${
                                filterType === t
                                    ? "bg-blue-500/[0.20] text-blue-300"
                                    : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300"
                            }`}
                        >
                            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {/* View toggle */}
                <div className="flex rounded-lg overflow-hidden border border-white/[0.10] text-sm">
                    <button
                        onClick={() => setViewMode("cards")}
                        className={`px-3 py-2 transition-colors ${
                            viewMode === "cards"
                                ? "bg-blue-500/[0.20] text-blue-300"
                                : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300"
                        }`}
                        title="Card view"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode("table")}
                        className={`px-3 py-2 transition-colors ${
                            viewMode === "table"
                                ? "bg-blue-500/[0.20] text-blue-300"
                                : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300"
                        }`}
                        title="Table view"
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>

                <button
                    onClick={handleInitAll}
                    disabled={initingAll || accounts.length === 0}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg disabled:opacity-50 text-sm shadow-lg shadow-blue-500/20 transition-all"
                >
                    {initingAll ? "Initializing..." : "Init All"}
                </button>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg text-sm shadow-lg shadow-emerald-500/20 transition-all"
                >
                    + Add
                </button>
            </div>

            {/* Init results panel */}
            {initResults && initResults.length > 0 && (
                <div className="mb-4 bg-white/[0.04] border border-white/[0.08] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-300">Init Results</p>
                        <button
                            onClick={() => setInitResults(null)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                        >
                            Dismiss
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {initResults.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={r.status === "success" ? "text-emerald-400" : "text-red-400"}>
                                    {r.status === "success" ? "✓" : "✗"}
                                </span>
                                <span className="font-mono text-slate-300">{r.account_id}</span>
                                {r.status !== "success" && (
                                    <span className="text-red-400 truncate">{r.error}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Card view */}
            {viewMode === "cards" && (
                <>
                    {filtered.length === 0 ? (
                        <div className="p-12 text-center text-slate-600">
                            {accounts.length === 0 ? (
                                <>
                                    <p className="text-lg mb-2">No accounts found</p>
                                    <p>Add your first MT5 account to get started.</p>
                                </>
                            ) : (
                                <p>No accounts match your search or filter.</p>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.map((account) => (
                                <AccountCard
                                    key={account.id}
                                    account={account}
                                    analytics={analyticsMap.get(account.id)}
                                    isConnected={connected && connectedAccountId === account.id}
                                    isConnecting={connecting === String(account.id)}
                                    isDeleting={deleting === account.id}
                                    onConnect={() => handleConnect(account.id)}
                                    onEdit={() => handleEdit(account)}
                                    onDelete={() => handleDelete(account.id)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Table view */}
            {viewMode === "table" && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-white/[0.04]">
                            <tr>
                                <th className="text-left p-4 font-semibold text-slate-400">Account ID</th>
                                <th className="text-left p-4 font-semibold text-slate-400">MT5 Name</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Server</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Type</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Program / Phase</th>
                                <th className="text-right p-4 font-semibold text-slate-400">Balance</th>
                                <th className="text-right p-4 font-semibold text-slate-400">Equity</th>
                                <th className="text-right p-4 font-semibold text-slate-400">Profit</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Health</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((account) => {
                                const programLabel = getProgramLabel(account.fund_program_id);
                                const isConnected =
                                    connected && connectedAccountId === account.id;
                                const analytics = analyticsMap.get(account.id);
                                const profit = account.profit ?? 0;
                                return (
                                    <tr
                                        key={account.id}
                                        className={`border-t border-white/[0.06] hover:bg-white/[0.04] ${
                                            isConnected ? "bg-emerald-500/[0.05]" : ""
                                        }`}
                                    >
                                        <td className="p-4 font-mono text-slate-100">{account.account_id}</td>
                                        <td
                                            className="p-4 text-sm text-slate-400 max-w-[180px] truncate"
                                            title={account.mt5_name || ""}
                                        >
                                            {account.mt5_name || "—"}
                                        </td>
                                        <td className="p-4 text-sm text-slate-400">{account.server}</td>
                                        <td className="p-4">
                                            <span
                                                className={`px-2 py-1 rounded text-xs font-medium border ${
                                                    account.account_type === "fund"
                                                        ? "bg-purple-500/[0.15] text-purple-300 border-purple-500/[0.20]"
                                                        : "bg-white/[0.08] text-slate-400 border-transparent"
                                                }`}
                                            >
                                                {account.account_type === "fund" ? "Fund" : "Personal"}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {programLabel ? (
                                                <div>
                                                    <span className="text-sm text-slate-300">{programLabel}</span>
                                                    {account.current_phase && (
                                                        <span className="ml-2 text-xs bg-blue-500/[0.15] text-blue-300 border border-blue-500/[0.20] px-2 py-0.5 rounded">
                                                            {account.current_phase}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono text-sm text-slate-300">
                                            {formatNumber(account.balance)}
                                        </td>
                                        <td className="p-4 text-right font-mono text-sm text-slate-300">
                                            {formatNumber(account.equity)}
                                        </td>
                                        <td
                                            className={`p-4 text-right font-mono text-sm ${
                                                profit > 0
                                                    ? "text-emerald-400"
                                                    : profit < 0
                                                      ? "text-red-400"
                                                      : "text-slate-400"
                                            }`}
                                        >
                                            {profit >= 0 ? "+" : ""}
                                            {formatNumber(account.profit)}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-slate-600"}`}
                                                />
                                                {analytics?.locked && (
                                                    <span className="text-xs text-red-400">Locked</span>
                                                )}
                                                {analytics && !analytics.locked && (
                                                    <span
                                                        className={`text-xs ${
                                                            analytics.daily_status === "violated" ||
                                                            analytics.max_dd_status === "violated"
                                                                ? "text-red-400"
                                                                : analytics.daily_status === "warning" ||
                                                                    analytics.max_dd_status === "warning"
                                                                  ? "text-amber-400"
                                                                  : "text-emerald-400"
                                                        }`}
                                                    >
                                                        {analytics.daily_status === "violated" ||
                                                        analytics.max_dd_status === "violated"
                                                            ? "Violation"
                                                            : analytics.daily_status === "warning" ||
                                                                analytics.max_dd_status === "warning"
                                                              ? "Warning"
                                                              : "OK"}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                {isConnected ? (
                                                    <span className="text-emerald-400 text-sm font-medium">
                                                        Connected
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleConnect(account.id)}
                                                        disabled={connecting === String(account.id)}
                                                        className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50 text-sm"
                                                    >
                                                        {connecting === String(account.id) ? "..." : "Connect"}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEdit(account)}
                                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(account.id)}
                                                    disabled={deleting === account.id}
                                                    className="text-red-400 hover:text-red-300 disabled:opacity-50 text-sm"
                                                >
                                                    {deleting === account.id ? "..." : "Delete"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length === 0 && (
                        <div className="p-12 text-center text-slate-600">
                            {accounts.length === 0 ? (
                                <>
                                    <p className="text-lg mb-2">No accounts found</p>
                                    <p>Add your first MT5 account to get started.</p>
                                </>
                            ) : (
                                <p>No accounts match your search or filter.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <LiveDataPanel />

            {showAddForm && (
                <AddAccountForm
                    onSuccess={() => {
                        setShowAddForm(false);
                        loadData();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}
        </div>
    );
}
