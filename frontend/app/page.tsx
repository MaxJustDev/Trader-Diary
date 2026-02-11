"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";

interface StatCard {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [summaryData, accountsData] = await Promise.all([
        apiClient.analytics.getSummary().catch(() => null),
        apiClient.accounts.getAll().catch(() => []),
      ]);
      setStats(summaryData);
      setAccounts(accountsData);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards: StatCard[] = [
    {
      title: "Total Accounts",
      value: accounts.length,
      icon: "👥",
      color: "bg-blue-500",
    },
    {
      title: "Fund Accounts",
      value: accounts.filter(a => a.account_type === "fund").length,
      icon: "📊",
      color: "bg-purple-500",
    },
    {
      title: "Personal Accounts",
      value: accounts.filter(a => a.account_type === "personal").length,
      icon: "👤",
      color: "bg-green-500",
    },
    {
      title: "Total Balance",
      value: stats?.total_balance ? `$${stats.total_balance.toLocaleString()}` : "—",
      icon: "💰",
      color: "bg-yellow-500",
    },
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">📈 TraderDiary Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4"
            style={{
              borderColor: card.color.replace('bg-', '').includes('blue') ? '#3b82f6' :
                card.color.includes('purple') ? '#a855f7' :
                  card.color.includes('green') ? '#22c55e' : '#eab308'
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{card.title}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
              <span className="text-3xl">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">⚡ Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/accounts"
            className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg text-center hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg"
          >
            <span className="text-2xl block mb-2">👤</span>
            <span className="font-medium">Manage Accounts</span>
          </Link>
          <Link
            href="/funds"
            className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg text-center hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg"
          >
            <span className="text-2xl block mb-2">📊</span>
            <span className="font-medium">Manage Funds</span>
          </Link>
          <Link
            href="/trading"
            className="p-4 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg text-center hover:from-green-600 hover:to-green-700 transition-all shadow-lg"
          >
            <span className="text-2xl block mb-2">💹</span>
            <span className="font-medium">Batch Trading</span>
          </Link>
          <Link
            href="/analytics"
            className="p-4 bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-lg text-center hover:from-yellow-600 hover:to-yellow-700 transition-all shadow-lg"
          >
            <span className="text-2xl block mb-2">📈</span>
            <span className="font-medium">Analytics</span>
          </Link>
        </div>
      </div>

      {/* Recent Accounts */}
      <div>
        <h2 className="text-xl font-semibold mb-4">🏦 Your Accounts</h2>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left p-4">Account ID</th>
                <th className="text-left p-4">Server</th>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">Phase</th>
              </tr>
            </thead>
            <tbody>
              {accounts.slice(0, 5).map((account) => (
                <tr key={account.id} className="border-t dark:border-gray-700">
                  <td className="p-4 font-mono">{account.account_id}</td>
                  <td className="p-4">{account.server}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${account.account_type === "fund"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-gray-100 text-gray-800"
                      }`}>
                      {account.account_type}
                    </span>
                  </td>
                  <td className="p-4">{account.current_phase || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {accounts.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p>No accounts yet.</p>
              <Link href="/accounts" className="text-blue-500 hover:underline">
                Add your first account →
              </Link>
            </div>
          )}
          {accounts.length > 5 && (
            <div className="p-4 text-center border-t dark:border-gray-700">
              <Link href="/accounts" className="text-blue-500 hover:underline">
                View all {accounts.length} accounts →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
