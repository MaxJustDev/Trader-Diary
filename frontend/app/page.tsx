"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { FundAccountAnalytics } from "@/lib/types";
import Link from "next/link";
import { Users, Building2, TrendingUp, BarChart3 } from "lucide-react";

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FundAccountAnalytics[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [summaryData, accountsData, fundData, tradeData] = await Promise.all([
        apiClient.analytics.getSummary().catch(() => null),
        apiClient.accounts.getAll().catch(() => []),
        apiClient.analytics.getFundStatus().catch(() => ({ accounts: [] })),
        apiClient.analytics.getTradeHistory().catch(() => ({ trades: [] })),
      ]);
      setStats(summaryData);
      setAccounts(accountsData);
      setFundAccounts(fundData.accounts);
      setRecentTrades((tradeData.trades ?? []).slice(0, 5));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const warnings = fundAccounts.filter(
    (a) => a.daily_status !== "ok" || a.max_dd_status !== "ok" || a.locked
  );

  const fmt2 = (v?: number | null) =>
    v != null
      ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";

  const totalPnl = stats?.total_profit ?? 0;

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-9 w-48 rounded bg-white/[0.06] animate-pulse mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400" />
          <p className="text-slate-400 text-sm">Total Accounts</p>
          <p className="text-3xl font-bold mt-1 text-slate-100">{accounts.length}</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-purple-400" />
          <p className="text-slate-400 text-sm">Fund Accounts</p>
          <p className="text-3xl font-bold mt-1 text-purple-400">
            {accounts.filter(a => a.account_type === "fund").length}
          </p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-400" />
          <p className="text-slate-400 text-sm">Total Balance</p>
          <p className="text-2xl font-bold mt-1 text-emerald-400">
            ${stats?.total_balance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
          </p>
        </div>
        <div className={`bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-5 relative overflow-hidden`}>
          <div className={`absolute top-0 left-0 right-0 h-0.5 ${totalPnl >= 0 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-red-500 to-red-400"}`} />
          <p className="text-slate-400 text-sm">Total Floating P&L</p>
          <p className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${fmt2(totalPnl)}
          </p>
        </div>
      </div>

      {/* Warnings / Violations */}
      {warnings.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-amber-400">Accounts Needing Attention</h2>
          <div className="space-y-2">
            {warnings.map((a) => (
              <div
                key={a.account_id}
                className={`flex items-center justify-between p-4 rounded-xl text-sm ${
                  a.locked
                    ? "bg-red-500/[0.08] border border-red-500/[0.20]"
                    : "bg-amber-500/[0.06] border border-amber-500/[0.20]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.locked ? "bg-red-500" : "bg-amber-500"}`} />
                  <div>
                    <span className="font-mono font-semibold text-slate-100">{a.account_login}</span>
                    {a.fund_name && <span className="text-slate-500 ml-2">{a.fund_name} · {a.current_phase}</span>}
                    <p className="text-xs text-red-400 mt-0.5">
                      {a.locked
                        ? `Locked: ${a.violations.join(", ")}`
                        : [
                            a.daily_status !== "ok" && `Daily DD ${a.daily_loss_pct.toFixed(1)}% / ${a.daily_drawdown_limit}%`,
                            a.max_dd_status !== "ok" && `Max DD ${a.max_loss_pct.toFixed(1)}% / ${a.max_drawdown_limit}%`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                  </div>
                </div>
                <Link href="/analytics" className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">
                  View →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout countdowns */}
      {fundAccounts.some(a => a.next_payout_date) && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-slate-100">Upcoming Payouts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fundAccounts
              .filter(a => a.next_payout_date)
              .sort((a, b) => (a.next_payout_date ?? "").localeCompare(b.next_payout_date ?? ""))
              .map(a => {
                const days = daysUntil(a.next_payout_date);
                const urgent = days != null && days <= 7;
                return (
                  <div key={a.account_id} className={`flex items-center justify-between p-3 rounded-xl border text-sm ${urgent ? "bg-amber-500/[0.06] border-amber-500/[0.30]" : "bg-white/[0.04] border-white/[0.08]"}`}>
                    <div>
                      <p className="font-mono font-medium text-slate-100">{a.account_login}</p>
                      <p className="text-xs text-slate-500">{a.fund_name}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${urgent ? "text-amber-400" : "text-slate-200"}`}>
                        {days != null ? (days <= 0 ? "Today!" : `${days}d`) : a.next_payout_date}
                      </p>
                      <p className="text-xs text-slate-500">{a.next_payout_date}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3 text-slate-100">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/accounts" className="p-4 bg-blue-500/[0.10] hover:bg-blue-500/[0.18] border border-blue-500/[0.20] text-blue-300 rounded-xl text-center transition-all">
            <Users className="w-6 h-6 mx-auto mb-2" />
            <span className="text-sm font-medium">Accounts</span>
          </Link>
          <Link href="/funds" className="p-4 bg-purple-500/[0.10] hover:bg-purple-500/[0.18] border border-purple-500/[0.20] text-purple-300 rounded-xl text-center transition-all">
            <Building2 className="w-6 h-6 mx-auto mb-2" />
            <span className="text-sm font-medium">Funds</span>
          </Link>
          <Link href="/trading" className="p-4 bg-emerald-500/[0.10] hover:bg-emerald-500/[0.18] border border-emerald-500/[0.20] text-emerald-300 rounded-xl text-center transition-all">
            <TrendingUp className="w-6 h-6 mx-auto mb-2" />
            <span className="text-sm font-medium">Batch Trading</span>
          </Link>
          <Link href="/analytics" className="p-4 bg-amber-500/[0.10] hover:bg-amber-500/[0.18] border border-amber-500/[0.20] text-amber-300 rounded-xl text-center transition-all">
            <BarChart3 className="w-6 h-6 mx-auto mb-2" />
            <span className="text-sm font-medium">Analytics</span>
          </Link>
        </div>
      </div>

      {/* Recent Trades */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Recent Trades</h2>
          <Link href="/analytics" className="text-sm text-blue-400 hover:text-blue-300">View all →</Link>
        </div>
        {recentTrades.length === 0 ? (
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-6 text-center text-slate-600 text-sm">
            No trades yet — execute batch orders to see history here
          </div>
        ) : (
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04]">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-400">Time</th>
                  <th className="text-left p-3 font-medium text-slate-400">Account</th>
                  <th className="text-left p-3 font-medium text-slate-400">Symbol</th>
                  <th className="text-left p-3 font-medium text-slate-400">Dir</th>
                  <th className="text-right p-3 font-medium text-slate-400">Lot</th>
                  <th className="text-right p-3 font-medium text-slate-400">Risk</th>
                  <th className="text-center p-3 font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t: any) => (
                  <tr key={t.id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                    <td className="p-3 text-xs text-slate-500">
                      {t.executed_at ? new Date(t.executed_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3 font-mono text-slate-300">{t.account_login}</td>
                    <td className="p-3 font-mono font-medium text-slate-100">{t.symbol}</td>
                    <td className={`p-3 font-bold text-xs ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</td>
                    <td className="p-3 text-right font-mono text-slate-300">{t.lot_size}</td>
                    <td className="p-3 text-right text-red-400">${fmt2(t.risk_amount)}</td>
                    <td className="p-3 text-center">
                      {t.success ? (
                        <span className="text-xs text-emerald-400 font-medium">OK</span>
                      ) : (
                        <span className="text-xs text-red-400">Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accounts overview */}
      {accounts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-100">Accounts</h2>
            <Link href="/accounts" className="text-sm text-blue-400 hover:text-blue-300">Manage →</Link>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04]">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-400">Account ID</th>
                  <th className="text-left p-3 font-medium text-slate-400">Server</th>
                  <th className="text-left p-3 font-medium text-slate-400">Type</th>
                  <th className="text-left p-3 font-medium text-slate-400">Phase</th>
                  <th className="text-right p-3 font-medium text-slate-400">Balance</th>
                  <th className="text-right p-3 font-medium text-slate-400">Profit</th>
                </tr>
              </thead>
              <tbody>
                {accounts.slice(0, 8).map((a) => {
                  const profit = a.profit ?? 0;
                  return (
                    <tr key={a.id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                      <td className="p-3 font-mono text-slate-100">{a.account_id}</td>
                      <td className="p-3 text-slate-500">{a.server}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs border ${a.account_type === "fund" ? "bg-purple-500/[0.15] text-purple-300 border-purple-500/[0.20]" : "bg-white/[0.08] text-slate-400 border-transparent"}`}>
                          {a.account_type}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{a.current_phase || "—"}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{a.balance != null ? `$${fmt2(a.balance)}` : "—"}</td>
                      <td className={`p-3 text-right font-mono ${profit > 0 ? "text-emerald-400" : profit < 0 ? "text-red-400" : "text-slate-400"}`}>
                        {profit >= 0 ? "+" : ""}{fmt2(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {accounts.length > 8 && (
              <div className="p-3 text-center border-t border-white/[0.06]">
                <Link href="/accounts" className="text-sm text-blue-400 hover:text-blue-300">
                  View all {accounts.length} accounts →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-10 text-center text-slate-600">
          <p className="text-lg mb-2">No accounts yet</p>
          <Link href="/accounts" className="text-blue-400 hover:text-blue-300">Add your first MT5 account →</Link>
        </div>
      )}
    </div>
  );
}
