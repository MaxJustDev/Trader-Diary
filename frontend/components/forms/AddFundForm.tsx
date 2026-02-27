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

    const inputClass = "w-full p-2.5 bg-white/[0.06] border border-white/[0.10] rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-600";

    if (template && templateKey) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#161b27] border border-white/[0.10] rounded-xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-4 text-slate-100">
                        Add {template.fund_name}
                    </h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/[0.10] border border-red-500/[0.20] text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="mb-4">
                        <p className="text-sm text-slate-500 mb-2">
                            Server pattern: <span className="font-mono text-slate-300">{template.server_pattern}</span>
                        </p>
                    </div>

                    <div className="space-y-4 mb-6">
                        {template.programs.map((prog: FundTemplateProgram, pIdx: number) => (
                            <div key={pIdx} className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-4">
                                <h3 className="font-semibold text-lg mb-2 text-slate-100">{prog.program_name}</h3>

                                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                                    {prog.payout_days && (
                                        <span className="bg-blue-500/[0.15] text-blue-300 border border-blue-500/[0.20] px-2 py-1 rounded">
                                            Payout: {prog.payout_days}d {prog.payout_type}
                                        </span>
                                    )}
                                    {prog.min_trading_days && (
                                        <span className="bg-white/[0.08] text-slate-400 px-2 py-1 rounded">
                                            Min {prog.min_trading_days} trading days
                                        </span>
                                    )}
                                    {prog.max_margin_pct && (
                                        <span className="bg-amber-500/[0.15] text-amber-300 border border-amber-500/[0.20] px-2 py-1 rounded">
                                            Max margin: {prog.max_margin_pct}%
                                        </span>
                                    )}
                                    {prog.best_day_rule_pct && (
                                        <span className="bg-yellow-500/[0.15] text-yellow-300 border border-yellow-500/[0.20] px-2 py-1 rounded">
                                            Best day rule: {prog.best_day_rule_pct}%
                                        </span>
                                    )}
                                    {prog.min_profit_days && (
                                        <span className="bg-emerald-500/[0.15] text-emerald-300 border border-emerald-500/[0.20] px-2 py-1 rounded">
                                            Min {prog.min_profit_days} profit days ({prog.profit_day_threshold_pct}%)
                                        </span>
                                    )}
                                </div>

                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.08] text-slate-500">
                                            <th className="text-left py-1 pr-2">Phase</th>
                                            <th className="text-left py-1 pr-2">Target</th>
                                            <th className="text-left py-1 pr-2">Daily DD</th>
                                            <th className="text-left py-1 pr-2">Max DD</th>
                                            <th className="text-left py-1">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {prog.phase_rules.map((rule, rIdx) => (
                                            <tr key={rIdx} className="border-t border-white/[0.06]">
                                                <td className="py-1 pr-2 font-medium text-slate-300">{rule.phase_name}</td>
                                                <td className="py-1 pr-2 text-emerald-400">
                                                    {rule.profit_target ? `${rule.profit_target}%` : "—"}
                                                </td>
                                                <td className="py-1 pr-2 text-red-400">{rule.daily_drawdown}%</td>
                                                <td className="py-1 pr-2 text-red-400">{rule.max_drawdown}%</td>
                                                <td className="py-1 text-xs text-slate-500">{rule.drawdown_type}</td>
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
                            className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreateFromTemplate}
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all"
                        >
                            {loading ? "Creating..." : "Create Fund"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#161b27] border border-white/[0.10] rounded-xl shadow-2xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-slate-100">Add Custom Fund</h2>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/[0.10] border border-red-500/[0.20] text-red-400 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleCreateCustom} className="space-y-4">
                    <div>
                        <label className="block mb-1 font-medium text-slate-300 text-sm">Fund Name *</label>
                        <input
                            type="text"
                            value={fundName}
                            onChange={(e) => setFundName(e.target.value)}
                            required
                            className={inputClass}
                            placeholder="e.g. MyPropFirm"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-slate-300 text-sm">Server Pattern *</label>
                        <input
                            type="text"
                            value={serverPattern}
                            onChange={(e) => setServerPattern(e.target.value)}
                            required
                            className={inputClass}
                            placeholder="e.g. MyFirm-Server"
                        />
                        <p className="text-xs text-slate-600 mt-1">Used to auto-detect accounts from this fund</p>
                    </div>

                    <p className="text-sm text-slate-500">
                        Programs and phase rules can be added after creating the fund, or use a template instead.
                    </p>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-blue-500/20 transition-all"
                        >
                            {loading ? "Adding..." : "Add Fund"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
