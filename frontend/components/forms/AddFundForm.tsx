"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { FundTemplate, FundTemplateProgram } from "@/lib/types";

interface AddFundFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    template?: FundTemplate | null;
    templateKey?: string | null;
}

export default function AddFundForm({ onSuccess, onCancel, template, templateKey }: AddFundFormProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // For custom fund creation
    const [fundName, setFundName] = useState(template?.fund_name || "");
    const [serverPattern, setServerPattern] = useState(template?.server_pattern || "");

    const handleCreateFromTemplate = async () => {
        if (!templateKey) return;
        setLoading(true);
        setError("");

        try {
            await apiClient.funds.createFromTemplate(templateKey);
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Failed to create fund from template");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCustom = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await apiClient.funds.create({
                fund_name: fundName,
                server_pattern: serverPattern,
                programs: [],
            });
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Failed to create fund");
        } finally {
            setLoading(false);
        }
    };

    // Template preview mode
    if (template && templateKey) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-4">
                        Add {template.fund_name}
                    </h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-2">
                            Server pattern: <span className="font-mono">{template.server_pattern}</span>
                        </p>
                    </div>

                    {/* Show programs and phases */}
                    <div className="space-y-4 mb-6">
                        {template.programs.map((prog: FundTemplateProgram, pIdx: number) => (
                            <div key={pIdx} className="border rounded-lg p-4 dark:border-gray-600">
                                <h3 className="font-semibold text-lg mb-2">{prog.program_name}</h3>

                                {/* Program details */}
                                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                                    {prog.payout_days && (
                                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                            Payout: {prog.payout_days}d {prog.payout_type}
                                        </span>
                                    )}
                                    {prog.min_trading_days && (
                                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                            Min {prog.min_trading_days} trading days
                                        </span>
                                    )}
                                    {prog.max_margin_pct && (
                                        <span className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                                            Max margin: {prog.max_margin_pct}%
                                        </span>
                                    )}
                                    {prog.best_day_rule_pct && (
                                        <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                                            Best day rule: {prog.best_day_rule_pct}%
                                        </span>
                                    )}
                                    {prog.min_profit_days && (
                                        <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                                            Min {prog.min_profit_days} profit days ({prog.profit_day_threshold_pct}%)
                                        </span>
                                    )}
                                </div>

                                {/* Phase rules table */}
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b dark:border-gray-600 text-gray-500">
                                            <th className="text-left py-1 pr-2">Phase</th>
                                            <th className="text-left py-1 pr-2">Target</th>
                                            <th className="text-left py-1 pr-2">Daily DD</th>
                                            <th className="text-left py-1 pr-2">Max DD</th>
                                            <th className="text-left py-1">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {prog.phase_rules.map((rule, rIdx) => (
                                            <tr key={rIdx} className="border-b dark:border-gray-700">
                                                <td className="py-1 pr-2 font-medium">{rule.phase_name}</td>
                                                <td className="py-1 pr-2 text-green-600">
                                                    {rule.profit_target ? `${rule.profit_target}%` : "—"}
                                                </td>
                                                <td className="py-1 pr-2 text-red-500">{rule.daily_drawdown}%</td>
                                                <td className="py-1 pr-2 text-red-600">{rule.max_drawdown}%</td>
                                                <td className="py-1 text-xs text-gray-500">{rule.drawdown_type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreateFromTemplate}
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {loading ? "Creating..." : "Create Fund"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Custom fund creation mode
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4">Add Custom Fund</h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleCreateCustom} className="space-y-4">
                    <div>
                        <label className="block mb-1 font-medium">Fund Name *</label>
                        <input
                            type="text"
                            value={fundName}
                            onChange={(e) => setFundName(e.target.value)}
                            required
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g. MyPropFirm"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium">Server Pattern *</label>
                        <input
                            type="text"
                            value={serverPattern}
                            onChange={(e) => setServerPattern(e.target.value)}
                            required
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g. MyFirm-Server"
                        />
                        <p className="text-xs text-gray-500 mt-1">Used to auto-detect accounts from this fund</p>
                    </div>

                    <p className="text-sm text-gray-500">
                        Programs and phase rules can be added after creating the fund, or use a template instead.
                    </p>

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
                            {loading ? "Adding..." : "Add Fund"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
