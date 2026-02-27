"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Fund, FundTemplate } from "@/lib/types";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function FundsPage() {
    const [funds, setFunds] = useState<Fund[]>([]);
    const [templates, setTemplates] = useState<Record<string, FundTemplate>>({});
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState<string | null>(null);
    const [expandedFund, setExpandedFund] = useState<number | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

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

    const handleDelete = (id: number) => {
        setDeleteConfirm(id);
    };

    const doDelete = async () => {
        if (deleteConfirm === null) return;
        const id = deleteConfirm;
        setDeleteConfirm(null);
        setDeleting(id);
        try {
            await apiClient.funds.delete(id);
            await loadFunds();
            toast.success("Fund deleted");
        } catch (error: any) {
            toast.error(`Failed to delete: ${error.message ?? "Unknown error"}`);
        } finally {
            setDeleting(null);
        }
    };

    const isFundAdded = (templateName: string) => {
        return funds.some(f => f.fund_name === templateName);
    };

    const handleAddFromTemplate = async (key: string) => {
        setAdding(key);
        try {
            await apiClient.funds.createFromTemplate(key);
            await loadFunds();
            toast.success("Fund added successfully");
        } catch (error: any) {
            toast.error(`Failed to add fund: ${error.message ?? "Unknown error"}`);
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
            <ConfirmModal
                isOpen={deleteConfirm !== null}
                title="Delete Fund"
                message="Are you sure you want to delete this fund and all its programs? Accounts linked to this fund will lose their program association."
                confirmLabel="Delete"
                variant="danger"
                onConfirm={doDelete}
                onCancel={() => setDeleteConfirm(null)}
            />
            <h1 className="text-3xl font-bold mb-6 text-slate-100">Funds Management</h1>

            {/* Fund Templates */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 text-slate-100">Fund Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(templates).map(([key, tpl]) => {
                        const added = isFundAdded(tpl.fund_name);
                        return (
                            <div
                                key={key}
                                className={`p-4 rounded-xl transition-all bg-white/[0.04] backdrop-blur-xl border ${
                                    added
                                        ? "border-emerald-500/[0.30] opacity-75"
                                        : "border-white/[0.08] hover:border-blue-500/[0.40] hover:bg-white/[0.06] cursor-pointer"
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-slate-100">{tpl.fund_name}</h3>
                                    {added && (
                                        <span className="text-xs bg-emerald-500/[0.15] text-emerald-300 border border-emerald-500/[0.20] px-2 py-1 rounded">
                                            Added
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 font-mono mb-3">{tpl.server_pattern}</p>

                                <div className="space-y-3">
                                    {tpl.programs.map((prog, pIdx) => (
                                        <div key={pIdx} className="text-sm border-l-2 border-blue-500/[0.40] pl-3">
                                            <div className="font-medium mb-1 text-slate-200">{prog.program_name}</div>
                                            <div className="space-y-0.5">
                                                {prog.phase_rules.map((rule, rIdx) => (
                                                    <div key={rIdx} className="text-xs text-slate-500 flex gap-2">
                                                        <span className="font-medium w-16 text-slate-400">{rule.phase_name}</span>
                                                        <span className="text-emerald-400">
                                                            {rule.profit_target ? `PT ${rule.profit_target}%` : "—"}
                                                        </span>
                                                        <span className="text-red-400">DD {rule.daily_drawdown}%/{rule.max_drawdown}%</span>
                                                        <span className="text-slate-600">{rule.drawdown_type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {prog.payout_days && (
                                                    <span className="text-xs text-slate-500">Payout: {prog.payout_days}d {prog.payout_type}</span>
                                                )}
                                                {prog.min_trading_days && (
                                                    <span className="text-xs text-slate-500">| Min {prog.min_trading_days} days</span>
                                                )}
                                                {prog.max_margin_pct && (
                                                    <span className="text-xs text-amber-500">| Max margin {prog.max_margin_pct}%</span>
                                                )}
                                                {prog.best_day_rule_pct && (
                                                    <span className="text-xs text-yellow-500">| Best day {prog.best_day_rule_pct}%</span>
                                                )}
                                                {prog.min_profit_days && (
                                                    <span className="text-xs text-slate-500">| {prog.min_profit_days} profit days ({prog.profit_day_threshold_pct}%)</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4">
                                    {added ? (
                                        <div className="text-center text-sm text-emerald-400">
                                            Already configured
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleAddFromTemplate(key)}
                                            disabled={adding === key}
                                            className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20 transition-all"
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
                <h2 className="text-xl font-semibold mb-4 text-slate-100">Configured Funds</h2>
                <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-white/[0.04]">
                            <tr>
                                <th className="text-left p-4 font-semibold text-slate-400">Fund Name</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Server Pattern</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Programs</th>
                                <th className="text-left p-4 font-semibold text-slate-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {funds.map((fund) => (
                                <>
                                    <tr
                                        key={fund.id}
                                        className="border-t border-white/[0.06] hover:bg-white/[0.04] cursor-pointer"
                                        onClick={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                                    >
                                        <td className="p-4 font-medium text-slate-100">{fund.fund_name}</td>
                                        <td className="p-4 font-mono text-sm text-slate-400">{fund.server_pattern}</td>
                                        <td className="p-4">
                                            <span className="bg-blue-500/[0.15] text-blue-300 border border-blue-500/[0.20] px-2 py-1 rounded text-sm">
                                                {fund.programs.length} program{fund.programs.length !== 1 ? "s" : ""}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(fund.id); }}
                                                disabled={deleting === fund.id}
                                                className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50 transition-colors"
                                            >
                                                {deleting === fund.id ? "Deleting..." : "Delete"}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedFund === fund.id && fund.programs.map((prog) => (
                                        <tr key={`prog-${prog.id}`} className="bg-white/[0.02] border-t border-white/[0.06]">
                                            <td colSpan={4} className="p-4 pl-8">
                                                <div className="text-sm">
                                                    <span className="font-semibold text-slate-200">{prog.program_name}</span>
                                                    {prog.payout_days && (
                                                        <span className="text-slate-500 ml-2">
                                                            Payout: {prog.payout_days}d ({prog.payout_type})
                                                        </span>
                                                    )}
                                                    {prog.min_trading_days && (
                                                        <span className="text-slate-500 ml-2">
                                                            Min days: {prog.min_trading_days}
                                                        </span>
                                                    )}

                                                    <table className="w-full mt-2 text-xs">
                                                        <thead>
                                                            <tr className="text-slate-500">
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
                                                                    <tr key={rule.id} className="border-t border-white/[0.06]">
                                                                        <td className="py-1 font-medium text-slate-300">{rule.phase_name}</td>
                                                                        <td className="py-1 text-emerald-400">
                                                                            {rule.profit_target ? `${rule.profit_target}%` : "—"}
                                                                        </td>
                                                                        <td className="py-1 text-red-400">{rule.daily_drawdown}%</td>
                                                                        <td className="py-1 text-red-400">{rule.max_drawdown}%</td>
                                                                        <td className="py-1 text-slate-500">{rule.drawdown_type}</td>
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
                        <div className="p-12 text-center text-slate-600">
                            <p className="text-lg mb-2">No funds configured</p>
                            <p>Click &quot;Add Fund&quot; on a template above to get started.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
