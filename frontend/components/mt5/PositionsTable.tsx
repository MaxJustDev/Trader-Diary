"use client";

import { useState } from "react";
import { useMT5Store } from "@/lib/store";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function PositionsTable() {
    const positions = useMT5Store((s) => s.positions);
    const [closing, setClosing] = useState<number | null>(null);
    const [closingAll, setClosingAll] = useState(false);
    const [confirmTicket, setConfirmTicket] = useState<number | null>(null);
    const [confirmAll, setConfirmAll] = useState(false);

    const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);

    const fmt = (v: number, digits = 2) =>
        v.toLocaleString(undefined, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });

    const profitColor = (v: number) =>
        v >= 0 ? "text-emerald-400" : "text-red-400";

    const handleClose = async (ticket: number) => {
        setClosing(ticket);
        setConfirmTicket(null);
        try {
            await apiClient.mt5.closePosition(ticket);
            toast.success(`Position #${ticket} closed`);
        } catch (error: any) {
            toast.error(`Failed to close #${ticket}: ${error.message ?? "Unknown error"}`);
        } finally {
            setClosing(null);
        }
    };

    const handleCloseAll = async () => {
        setClosingAll(true);
        setConfirmAll(false);
        try {
            const result = await apiClient.mt5.closeAllPositions();
            if (result.failed === 0) {
                toast.success(`All ${result.closed} position(s) closed`);
            } else {
                toast.warning(`${result.closed} closed, ${result.failed} failed`);
            }
        } catch (error: any) {
            toast.error(`Failed to close all: ${error.message ?? "Unknown error"}`);
        } finally {
            setClosingAll(false);
        }
    };

    const confirmPos = positions.find((p) => p.ticket === confirmTicket);

    return (
        <>
            <ConfirmModal
                isOpen={confirmTicket !== null}
                title="Close Position"
                message={
                    confirmPos
                        ? `Close ${confirmPos.type} ${confirmPos.volume} ${confirmPos.symbol} (Ticket #${confirmPos.ticket})?\nCurrent P&L: ${confirmPos.profit >= 0 ? "+" : ""}${fmt(confirmPos.profit)}`
                        : "Close this position?"
                }
                confirmLabel="Close Position"
                variant="warning"
                onConfirm={() => confirmTicket !== null && handleClose(confirmTicket)}
                onCancel={() => setConfirmTicket(null)}
            />

            <ConfirmModal
                isOpen={confirmAll}
                title="Close All Positions"
                message={`Close all ${positions.length} open position(s)?\nTotal P&L: ${totalProfit >= 0 ? "+" : ""}${fmt(totalProfit)}\n\nThis cannot be undone.`}
                confirmLabel="Close All"
                variant="danger"
                onConfirm={handleCloseAll}
                onCancel={() => setConfirmAll(false)}
            />

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-100">
                        Open Positions
                        {positions.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-slate-400">
                                ({positions.length})
                            </span>
                        )}
                    </h3>
                    {positions.length > 1 && (
                        <button
                            onClick={() => setConfirmAll(true)}
                            disabled={closingAll}
                            className="px-3 py-1.5 text-xs bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:opacity-50 text-white rounded-lg font-medium transition-all shadow-lg shadow-red-500/20"
                        >
                            {closingAll ? "Closing..." : "Close All"}
                        </button>
                    )}
                </div>
                {positions.length === 0 ? (
                    <div className="p-8 text-center text-slate-600">
                        No open positions
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.04]">
                            <tr>
                                <th className="text-left p-3 font-medium text-slate-400">Ticket</th>
                                <th className="text-left p-3 font-medium text-slate-400">Symbol</th>
                                <th className="text-left p-3 font-medium text-slate-400">Type</th>
                                <th className="text-right p-3 font-medium text-slate-400">Volume</th>
                                <th className="text-right p-3 font-medium text-slate-400">Open Price</th>
                                <th className="text-right p-3 font-medium text-slate-400">SL</th>
                                <th className="text-right p-3 font-medium text-slate-400">TP</th>
                                <th className="text-right p-3 font-medium text-slate-400">Profit</th>
                                <th className="p-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((pos) => (
                                <tr
                                    key={pos.ticket}
                                    className="border-t border-white/[0.06] hover:bg-white/[0.04]"
                                >
                                    <td className="p-3 font-mono text-slate-300">{pos.ticket}</td>
                                    <td className="p-3 font-medium text-slate-100">{pos.symbol}</td>
                                    <td className="p-3">
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                                pos.type === "BUY"
                                                    ? "bg-emerald-500/[0.15] text-emerald-300 border-emerald-500/[0.20]"
                                                    : "bg-red-500/[0.15] text-red-300 border-red-500/[0.20]"
                                            }`}
                                        >
                                            {pos.type}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-mono text-slate-300">
                                        {fmt(pos.volume)}
                                    </td>
                                    <td className="p-3 text-right font-mono text-slate-300">
                                        {fmt(pos.price_open, 5)}
                                    </td>
                                    <td className="p-3 text-right font-mono text-red-400">
                                        {pos.sl ? fmt(pos.sl, 5) : "—"}
                                    </td>
                                    <td className="p-3 text-right font-mono text-emerald-400">
                                        {pos.tp ? fmt(pos.tp, 5) : "—"}
                                    </td>
                                    <td
                                        className={`p-3 text-right font-mono font-medium ${profitColor(pos.profit)}`}
                                    >
                                        {pos.profit >= 0 ? "+" : ""}
                                        {fmt(pos.profit)}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => setConfirmTicket(pos.ticket)}
                                            disabled={closing === pos.ticket || closingAll}
                                            className="px-2 py-1 text-xs bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded disabled:opacity-50 transition-all"
                                        >
                                            {closing === pos.ticket ? "..." : "Close"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-white/[0.04] font-medium">
                            <tr>
                                <td colSpan={7} className="p-3 text-right text-slate-500">
                                    Total P&amp;L
                                </td>
                                <td
                                    className={`p-3 text-right font-mono ${profitColor(totalProfit)}`}
                                >
                                    {totalProfit >= 0 ? "+" : ""}
                                    {fmt(totalProfit)}
                                </td>
                                <td className="p-3" />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </>
    );
}
