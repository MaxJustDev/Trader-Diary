"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { FundAccountAnalytics } from "@/lib/types";
import FundAccountCard from "@/components/analytics/FundAccountCard";

export default function AnalyticsPage() {
    const [summary, setSummary] = useState<any>(null);
    const [fundAccounts, setFundAccounts] = useState<FundAccountAnalytics[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async () => {
        try {
            const [summaryData, fundData] = await Promise.all([
                apiClient.analytics.getSummary(),
                apiClient.analytics.getFundStatus(),
            ]);
            setSummary(summaryData);
            setFundAccounts(fundData.accounts);
        } catch (error) {
            console.error("Failed to load analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await apiClient.accounts.refreshAll();
            await loadAnalytics();
        } catch (error) {
            console.error("Refresh failed:", error);
        } finally {
            setRefreshing(false);
        }
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
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Analytics</h1>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    {refreshing ? "Refreshing..." : "Refresh Data"}
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <p className="text-gray-500 text-sm">Total Accounts</p>
                    <p className="text-3xl font-bold mt-1">{summary?.total_accounts || 0}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <p className="text-gray-500 text-sm">Fund Accounts</p>
                    <p className="text-3xl font-bold mt-1 text-purple-500">{summary?.fund_accounts || 0}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <p className="text-gray-500 text-sm">Personal Accounts</p>
                    <p className="text-3xl font-bold mt-1 text-blue-500">{summary?.personal_accounts || 0}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <p className="text-gray-500 text-sm">Total Balance</p>
                    <p className="text-3xl font-bold mt-1 text-green-500">
                        ${summary?.total_balance?.toLocaleString() || "0"}
                    </p>
                </div>
            </div>

            {/* Fund Account Status */}
            {fundAccounts.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Fund Account Status</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {fundAccounts.map((acct) => (
                            <FundAccountCard
                                key={acct.account_id}
                                account={acct}
                                onUpdated={loadAnalytics}
                            />
                        ))}
                    </div>
                </div>
            )}

            {fundAccounts.length === 0 && (
                <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-400 mb-8">
                    <p className="text-lg">No fund accounts found</p>
                    <p className="text-sm mt-1">Add fund accounts and run "Init All" to see analytics</p>
                </div>
            )}

            {/* Equity Curve Placeholder */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-xl font-semibold mb-4">Equity Curve</h2>
                <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-lg text-gray-400">
                    <div className="text-center">
                        <p>Equity curve visualization</p>
                        <p className="text-sm">Coming soon - Connect accounts to see historical data</p>
                    </div>
                </div>
            </div>

            {/* Trade History Placeholder */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Trade History</h2>
                <div className="h-48 flex items-center justify-center border-2 border-dashed rounded-lg text-gray-400">
                    <div className="text-center">
                        <p>Trade history will appear here</p>
                        <p className="text-sm">Execute trades to see history</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
