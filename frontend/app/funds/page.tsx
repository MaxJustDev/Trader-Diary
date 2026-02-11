"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Fund, FundTemplate } from "@/lib/types";

export default function FundsPage() {
    const [funds, setFunds] = useState<Fund[]>([]);
    const [templates, setTemplates] = useState<Record<string, FundTemplate>>({});
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState<string | null>(null);
    const [expandedFund, setExpandedFund] = useState<number | null>(null);

    useEffect(() => {
        loadFunds();
        loadTemplates();
    }, []);

    const loadFunds = async () => {
        setLoading(true);
        try {
            const data = await apiClient.funds.getAll();
            setFunds(data);
        } catch (error) {
            console.error("Failed to load funds:", error);
        } finally {
            setLoading(false);
        }
    };

    const loadTemplates = async () => {
        try {
            const data = await apiClient.funds.getTemplates();
            setTemplates(data.templates || {});
        } catch (error) {
            console.error("Failed to load templates:", error);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this fund and all its programs?")) return;

        try {
            await apiClient.funds.delete(id);
            await loadFunds();
        } catch (error: any) {
            alert(`Failed to delete: ${error.message}`);
        }
    };

    // Check if a template is already added as a fund
    const isFundAdded = (templateName: string) => {
        return funds.some(f => f.fund_name === templateName);
    };

    const handleAddFromTemplate = async (key: string) => {
        setAdding(key);
        try {
            await apiClient.funds.createFromTemplate(key);
            await loadFunds();
        } catch (error: any) {
            alert(`Failed to add: ${error.message}`);
        } finally {
            setAdding(null);
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
            <h1 className="text-3xl font-bold mb-6">Funds Management</h1>

            {/* Fund Templates */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Fund Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(templates).map(([key, tpl]) => {
                        const added = isFundAdded(tpl.fund_name);
                        return (
                            <div
                                key={key}
                                className={`p-4 border-2 rounded-lg transition-colors bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 ${
                                    added
                                        ? "border-green-400 dark:border-green-600 opacity-75"
                                        : "dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer"
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg">{tpl.fund_name}</h3>
                                    {added && (
                                        <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                                            Added
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 font-mono mb-3">{tpl.server_pattern}</p>

                                <div className="space-y-3">
                                    {tpl.programs.map((prog, pIdx) => (
                                        <div key={pIdx} className="text-sm border-l-2 border-blue-300 dark:border-blue-600 pl-3">
                                            <div className="font-medium mb-1">{prog.program_name}</div>
                                            <div className="space-y-0.5">
                                                {prog.phase_rules.map((rule, rIdx) => (
                                                    <div key={rIdx} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2">
                                                        <span className="font-medium w-16">{rule.phase_name}</span>
                                                        <span className="text-green-600">
                                                            {rule.profit_target ? `PT ${rule.profit_target}%` : "—"}
                                                        </span>
                                                        <span className="text-red-500">DD {rule.daily_drawdown}%/{rule.max_drawdown}%</span>
                                                        <span className="text-gray-400">{rule.drawdown_type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Program extras */}
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {prog.payout_days && (
                                                    <span className="text-xs text-gray-500">Payout: {prog.payout_days}d {prog.payout_type}</span>
                                                )}
                                                {prog.min_trading_days && (
                                                    <span className="text-xs text-gray-500">| Min {prog.min_trading_days} days</span>
                                                )}
                                                {prog.max_margin_pct && (
                                                    <span className="text-xs text-orange-500">| Max margin {prog.max_margin_pct}%</span>
                                                )}
                                                {prog.best_day_rule_pct && (
                                                    <span className="text-xs text-yellow-600">| Best day {prog.best_day_rule_pct}%</span>
                                                )}
                                                {prog.min_profit_days && (
                                                    <span className="text-xs text-gray-500">| {prog.min_profit_days} profit days ({prog.profit_day_threshold_pct}%)</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4">
                                    {added ? (
                                        <div className="text-center text-sm text-green-600 dark:text-green-400">
                                            Already configured
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleAddFromTemplate(key)}
                                            disabled={adding === key}
                                            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 text-sm font-medium"
                                        >
                                            {adding === key ? "Adding..." : "Add Fund"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Configured Funds */}
            <div>
                <h2 className="text-xl font-semibold mb-4">Configured Funds</h2>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="text-left p-4 font-semibold">Fund Name</th>
                                <th className="text-left p-4 font-semibold">Server Pattern</th>
                                <th className="text-left p-4 font-semibold">Programs</th>
                                <th className="text-left p-4 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {funds.map((fund) => (
                                <>
                                    <tr
                                        key={fund.id}
                                        className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                        onClick={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                                    >
                                        <td className="p-4 font-medium">{fund.fund_name}</td>
                                        <td className="p-4 font-mono text-sm">{fund.server_pattern}</td>
                                        <td className="p-4">
                                            <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm">
                                                {fund.programs.length} program{fund.programs.length !== 1 ? "s" : ""}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(fund.id); }}
                                                className="text-red-500 hover:underline text-sm"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedFund === fund.id && fund.programs.map((prog) => (
                                        <tr key={`prog-${prog.id}`} className="bg-gray-50 dark:bg-gray-750 border-t dark:border-gray-700">
                                            <td colSpan={4} className="p-4 pl-8">
                                                <div className="text-sm">
                                                    <span className="font-semibold">{prog.program_name}</span>
                                                    {prog.payout_days && (
                                                        <span className="text-gray-500 ml-2">
                                                            Payout: {prog.payout_days}d ({prog.payout_type})
                                                        </span>
                                                    )}
                                                    {prog.min_trading_days && (
                                                        <span className="text-gray-500 ml-2">
                                                            Min days: {prog.min_trading_days}
                                                        </span>
                                                    )}

                                                    <table className="w-full mt-2 text-xs">
                                                        <thead>
                                                            <tr className="text-gray-500">
                                                                <th className="text-left py-1">Phase</th>
                                                                <th className="text-left py-1">Target</th>
                                                                <th className="text-left py-1">Daily DD</th>
                                                                <th className="text-left py-1">Max DD</th>
                                                                <th className="text-left py-1">DD Type</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {prog.phase_rules
                                                                .sort((a, b) => a.phase_order - b.phase_order)
                                                                .map((rule) => (
                                                                    <tr key={rule.id} className="border-t dark:border-gray-700">
                                                                        <td className="py-1 font-medium">{rule.phase_name}</td>
                                                                        <td className="py-1 text-green-600">
                                                                            {rule.profit_target ? `${rule.profit_target}%` : "—"}
                                                                        </td>
                                                                        <td className="py-1 text-red-500">{rule.daily_drawdown}%</td>
                                                                        <td className="py-1 text-red-600">{rule.max_drawdown}%</td>
                                                                        <td className="py-1 text-gray-500">{rule.drawdown_type}</td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </>
                            ))}
                        </tbody>
                    </table>
                    {funds.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            <p className="text-lg mb-2">No funds configured</p>
                            <p>Click "Add Fund" on a template above to get started.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
