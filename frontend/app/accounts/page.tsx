"use client";

import { useEffect, useMemo, useState } from "react";
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

    const analyticsMap = useMemo(
        () => new Map(fundAnalytics.map((a) => [a.account_id, a])),
        [fundAnalytics],
    );

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
            <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
                <div className="shimmer" style={{ width: "180px", height: "26px", borderRadius: "8px", marginBottom: "24px" }} />
                <div className="shimmer" style={{ height: "42px", borderRadius: "10px", marginBottom: "16px" }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
                    {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                    <div className="section-label" style={{ marginBottom: "4px" }}>Trading Journal</div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: 0, letterSpacing: "-0.01em" }}>
                        Accounts
                    </h1>
                </div>
                {connected && (
                    <button
                        onClick={handleDisconnect}
                        style={{
                            padding: "8px 16px",
                            background: "rgba(248,113,113,0.10)",
                            border: "1px solid rgba(248,113,113,0.25)",
                            color: "var(--rose)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 150ms",
                            fontFamily: "'Sora', sans-serif",
                        }}
                    >
                        Disconnect MT5
                    </button>
                )}
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <input
                    type="text"
                    placeholder="Search by ID, name, or server..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-diary"
                    style={{ flex: 1, minWidth: "200px" }}
                />

                {/* Type filter */}
                <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                    {(["all", "fund", "personal"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilterType(t)}
                            style={{
                                padding: "8px 14px",
                                fontSize: "12px",
                                fontWeight: filterType === t ? 600 : 400,
                                background: filterType === t ? "rgba(240,180,41,0.10)" : "rgba(255,255,255,0.03)",
                                color: filterType === t ? "var(--gold)" : "var(--text-muted)",
                                border: "none",
                                cursor: "pointer",
                                transition: "all 150ms",
                                fontFamily: "'Sora', sans-serif",
                                textTransform: "capitalize",
                            }}
                        >
                            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {/* View toggle */}
                <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                    <button
                        onClick={() => setViewMode("cards")}
                        title="Card view"
                        aria-label="Switch to grid view"
                        style={{
                            padding: "8px 12px",
                            background: viewMode === "cards" ? "rgba(240,180,41,0.10)" : "rgba(255,255,255,0.03)",
                            color: viewMode === "cards" ? "var(--gold)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            transition: "all 150ms",
                        }}
                    >
                        <LayoutGrid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode("table")}
                        title="Table view"
                        aria-label="Switch to list view"
                        style={{
                            padding: "8px 12px",
                            background: viewMode === "table" ? "rgba(240,180,41,0.10)" : "rgba(255,255,255,0.03)",
                            color: viewMode === "table" ? "var(--gold)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            transition: "all 150ms",
                        }}
                    >
                        <List size={14} />
                    </button>
                </div>

                <button
                    onClick={handleInitAll}
                    disabled={initingAll || accounts.length === 0}
                    style={{
                        padding: "8px 16px",
                        background: "rgba(34,211,238,0.08)",
                        border: "1px solid rgba(34,211,238,0.2)",
                        color: "var(--cyan)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: initingAll || accounts.length === 0 ? "not-allowed" : "pointer",
                        opacity: initingAll || accounts.length === 0 ? 0.5 : 1,
                        transition: "all 150ms",
                        fontFamily: "'Sora', sans-serif",
                    }}
                >
                    {initingAll ? "Initializing..." : "Init All"}
                </button>
                <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                        padding: "8px 16px",
                        background: "rgba(52,211,153,0.10)",
                        border: "1px solid rgba(52,211,153,0.25)",
                        color: "var(--emerald)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 150ms",
                        fontFamily: "'Sora', sans-serif",
                    }}
                >
                    + Add Account
                </button>
            </div>

            {/* Init results panel */}
            {initResults && initResults.length > 0 && (
                <div style={{ marginBottom: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px" }}>
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
                        <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                            {accounts.length === 0 ? (
                                <>
                                    <p style={{ fontSize: "15px", marginBottom: "6px", color: "var(--text-soft)" }}>No accounts found</p>
                                    <p>Add your first MT5 account to get started.</p>
                                </>
                            ) : (
                                <p>No accounts match your search or filter.</p>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px" }}>
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
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                {["Account ID", "MT5 Name", "Server", "Type", "Program / Phase", "Balance", "Equity", "Profit", "Health", "Actions"].map((h, i) => (
                                    <th key={h} className="th-diary" style={{ textAlign: i >= 5 && i <= 7 ? "right" : "left" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((account) => {
                                const programLabel = getProgramLabel(account.fund_program_id);
                                const isConnected = connected && connectedAccountId === account.id;
                                const analytics = analyticsMap.get(account.id);
                                const profit = account.profit ?? 0;
                                const healthColor = analytics?.locked ? "var(--rose)"
                                    : (analytics?.daily_status === "violated" || analytics?.max_dd_status === "violated") ? "var(--rose)"
                                    : (analytics?.daily_status === "warning" || analytics?.max_dd_status === "warning") ? "var(--amber)"
                                    : analytics ? "var(--emerald)" : "var(--text-dim)";
                                const healthLabel = analytics?.locked ? "Locked"
                                    : (analytics?.daily_status === "violated" || analytics?.max_dd_status === "violated") ? "Violation"
                                    : (analytics?.daily_status === "warning" || analytics?.max_dd_status === "warning") ? "Warning"
                                    : analytics ? "OK" : "";
                                return (
                                    <tr
                                        key={account.id}
                                        style={{ background: isConnected ? "rgba(52,211,153,0.03)" : "transparent", transition: "background 100ms" }}
                                        onMouseEnter={(e) => { if (!isConnected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isConnected ? "rgba(52,211,153,0.03)" : "transparent"; }}
                                    >
                                        <td className="td-diary" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f0f4f8", fontSize: "13px" }}>
                                            {account.account_id}
                                        </td>
                                        <td className="td-diary" style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", color: "var(--text-muted)" }} title={account.mt5_name || ""}>
                                            {account.mt5_name || "—"}
                                        </td>
                                        <td className="td-diary" style={{ fontSize: "12px", color: "var(--text-muted)" }}>{account.server}</td>
                                        <td className="td-diary">
                                            <span className="badge" style={{
                                                background: account.account_type === "fund" ? "var(--purple-dim)" : "rgba(255,255,255,0.05)",
                                                color: account.account_type === "fund" ? "var(--purple)" : "var(--text-muted)",
                                                border: `1px solid ${account.account_type === "fund" ? "rgba(167,139,250,0.25)" : "transparent"}`,
                                            }}>
                                                {account.account_type === "fund" ? "Fund" : "Personal"}
                                            </span>
                                        </td>
                                        <td className="td-diary">
                                            {programLabel ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    <span style={{ fontSize: "12px", color: "var(--text-soft)" }}>{programLabel}</span>
                                                    {account.current_phase && (
                                                        <span className="badge" style={{ background: "rgba(34,211,238,0.08)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.2)" }}>
                                                            {account.current_phase}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color: "var(--text-dim)" }}>—</span>
                                            )}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-soft)" }}>
                                            {formatNumber(account.balance)}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-soft)" }}>
                                            {formatNumber(account.equity)}
                                        </td>
                                        <td className="td-diary" style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: profit > 0 ? "var(--emerald)" : profit < 0 ? "var(--rose)" : "var(--text-muted)" }}>
                                            {profit >= 0 ? "+" : ""}{formatNumber(account.profit)}
                                        </td>
                                        <td className="td-diary">
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: isConnected ? "var(--emerald)" : "var(--text-dim)" }} />
                                                {healthLabel && <span style={{ fontSize: "11px", color: healthColor, fontWeight: 500 }}>{healthLabel}</span>}
                                            </div>
                                        </td>
                                        <td className="td-diary">
                                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                {isConnected ? (
                                                    <span style={{ fontSize: "11px", color: "var(--emerald)", fontWeight: 600 }}>Connected</span>
                                                ) : (
                                                    <button onClick={() => handleConnect(account.id)} disabled={connecting === String(account.id)}
                                                        style={{ fontSize: "11px", color: "var(--emerald)", background: "none", border: "none", cursor: "pointer", padding: 0, opacity: connecting === String(account.id) ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
                                                        {connecting === String(account.id) ? "..." : "Connect"}
                                                    </button>
                                                )}
                                                <button onClick={() => handleEdit(account)}
                                                    style={{ fontSize: "11px", color: "var(--cyan)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'Sora', sans-serif" }}>
                                                    Edit
                                                </button>
                                                <button onClick={() => handleDelete(account.id)} disabled={deleting === account.id}
                                                    style={{ fontSize: "11px", color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0, opacity: deleting === account.id ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
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
                        <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                            {accounts.length === 0 ? "No accounts found — add your first MT5 account." : "No accounts match your search or filter."}
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
