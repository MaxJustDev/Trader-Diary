"use client";

import { Account, FundAccountAnalytics } from "@/lib/types";

interface Props {
    account: Account;
    analytics?: FundAccountAnalytics;
    isConnected: boolean;
    isConnecting: boolean;
    isDeleting: boolean;
    onConnect: () => void;
    onDelete: () => void;
    onEdit: () => void;
}

function ProgressBar({
    label,
    current,
    limit,
    status,
}: {
    label: string;
    current: number;
    limit: number;
    status: "ok" | "warning" | "violated";
}) {
    const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
    const barColor =
        status === "violated"
            ? "bg-red-500"
            : status === "warning"
              ? "bg-amber-500"
              : "bg-emerald-500";
    const textColor =
        status === "violated"
            ? "text-red-400"
            : status === "warning"
              ? "text-amber-400"
              : "text-slate-400";

    return (
        <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{label}</span>
                <span className={textColor}>
                    {current.toFixed(2)}% / {limit}%
                </span>
            </div>
            <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                <div
                    className={`${barColor} h-1.5 rounded-full transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function getStaleness(updatedAt?: string): string {
    if (!updatedAt) return "Never synced";
    const then = new Date(updatedAt).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
}

export default function AccountCard({
    account,
    analytics,
    isConnected,
    isConnecting,
    isDeleting,
    onConnect,
    onDelete,
    onEdit,
}: Props) {
    const profit = account.profit ?? 0;
    const profitColor =
        profit > 0 ? "text-emerald-400" : profit < 0 ? "text-red-400" : "text-slate-400";

    const formatMoney = (v?: number) =>
        v == null
            ? "—"
            : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const profitPct = analytics?.profit_pct ?? 0;
    const profitTarget = analytics?.profit_target ?? null;
    const profitProgress =
        profitTarget && profitTarget > 0
            ? Math.min(Math.max((profitPct / profitTarget) * 100, 0), 100)
            : 0;
    const profitBarColor = analytics?.profit_achieved
        ? "bg-emerald-500"
        : profitPct < 0
          ? "bg-red-500"
          : "bg-blue-500";

    const ringClass = analytics?.locked
        ? "border-red-500/60 ring-1 ring-red-500/30"
        : isConnected
          ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
          : "";

    return (
        <div
            className={`bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden flex flex-col ${ringClass}`}
        >
            {/* Locked banner */}
            {analytics?.locked && (
                <div className="bg-red-600 text-white text-xs px-4 py-1 font-medium">
                    Locked — {analytics.violations.join(", ")}
                </div>
            )}

            {/* Main content */}
            <div className="p-4 flex-1">
                {/* Top row: status dot + badges */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}
                        title={isConnected ? "Connected (live)" : "Offline"}
                    />
                    <span
                        className={`text-xs px-2 py-0.5 rounded border font-medium ${
                            account.account_type === "fund"
                                ? "bg-purple-500/[0.15] text-purple-300 border-purple-500/[0.20]"
                                : "bg-white/[0.08] text-slate-400 border-transparent"
                        }`}
                    >
                        {account.account_type === "fund" ? "Fund" : "Personal"}
                    </span>
                    {account.current_phase && (
                        <span className="text-xs px-2 py-0.5 rounded border bg-blue-500/[0.15] text-blue-300 border-blue-500/[0.20]">
                            {account.current_phase}
                        </span>
                    )}
                </div>

                {/* Identity */}
                <p className="text-xl font-mono font-bold leading-tight text-slate-100">{account.account_id}</p>
                {account.mt5_name && (
                    <p
                        className="text-sm text-slate-400 truncate"
                        title={account.mt5_name}
                    >
                        {account.mt5_name}
                    </p>
                )}
                <p className="text-xs text-slate-600 mt-0.5">{account.server}</p>

                {/* Fund + Program */}
                {analytics && (analytics.fund_name || analytics.program_name) && (
                    <p className="text-xs text-purple-400 mt-1 truncate">
                        {analytics.fund_name}
                        {analytics.program_name ? ` · ${analytics.program_name}` : ""}
                    </p>
                )}

                {/* Financials */}
                <div className="flex gap-4 mt-3 text-sm">
                    <div>
                        <p className="text-xs text-slate-500">Balance</p>
                        <p className="font-mono font-semibold text-slate-100">{formatMoney(account.balance)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Equity</p>
                        <p className="font-mono font-semibold text-slate-100">{formatMoney(account.equity)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Profit</p>
                        <p className={`font-mono font-semibold ${profitColor}`}>
                            {profit >= 0 ? "+" : ""}
                            {formatMoney(account.profit)}
                        </p>
                    </div>
                </div>

                {/* Fund rules progress bars */}
                {analytics && (
                    <div className="mt-3 pt-3 border-t border-white/[0.08]">
                        <ProgressBar
                            label="Daily DD"
                            current={analytics.daily_loss_pct}
                            limit={analytics.daily_drawdown_limit}
                            status={analytics.daily_status}
                        />
                        <ProgressBar
                            label={`Max DD (${analytics.drawdown_type})`}
                            current={analytics.max_loss_pct}
                            limit={analytics.max_drawdown_limit}
                            status={analytics.max_dd_status}
                        />
                        {profitTarget !== null && (
                            <div className="mb-2">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-slate-400">
                                        Profit Target
                                        {analytics.profit_achieved && (
                                            <span className="ml-1 text-emerald-400">✓</span>
                                        )}
                                    </span>
                                    <span
                                        className={
                                            profitPct >= 0 ? "text-emerald-400" : "text-red-400"
                                        }
                                    >
                                        {profitPct >= 0 ? "+" : ""}
                                        {profitPct.toFixed(2)}% / {profitTarget}%
                                    </span>
                                </div>
                                <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                                    <div
                                        className={`${profitBarColor} h-1.5 rounded-full transition-all duration-300`}
                                        style={{ width: `${profitProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-xs text-slate-600">{getStaleness(account.updated_at)}</span>
                <div className="flex gap-2">
                    {isConnected ? (
                        <span className="text-xs text-emerald-400 font-medium">Live</span>
                    ) : (
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            className="text-xs px-3 py-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all"
                        >
                            {isConnecting ? "..." : "Connect"}
                        </button>
                    )}
                    <button
                        onClick={onEdit}
                        className="text-xs px-3 py-1 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 rounded transition-all"
                    >
                        Edit
                    </button>
                    <button
                        onClick={onDelete}
                        disabled={isDeleting}
                        className="text-xs px-3 py-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded disabled:opacity-50 shadow-lg shadow-red-500/20 transition-all"
                    >
                        {isDeleting ? "..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}
