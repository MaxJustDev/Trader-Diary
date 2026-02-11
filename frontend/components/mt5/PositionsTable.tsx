"use client";

import { useMT5Store } from "@/lib/store";

export default function PositionsTable() {
    const positions = useMT5Store((s) => s.positions);

    const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);

    const fmt = (v: number, digits = 2) =>
        v.toLocaleString(undefined, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });

    const profitColor = (v: number) =>
        v >= 0
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400";

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700">
                <h3 className="text-lg font-semibold">Open Positions</h3>
            </div>
            {positions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                    No open positions
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="text-left p-3 font-medium">Ticket</th>
                            <th className="text-left p-3 font-medium">Symbol</th>
                            <th className="text-left p-3 font-medium">Type</th>
                            <th className="text-right p-3 font-medium">Volume</th>
                            <th className="text-right p-3 font-medium">Open Price</th>
                            <th className="text-right p-3 font-medium">SL</th>
                            <th className="text-right p-3 font-medium">TP</th>
                            <th className="text-right p-3 font-medium">Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {positions.map((pos) => (
                            <tr
                                key={pos.ticket}
                                className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                <td className="p-3 font-mono">{pos.ticket}</td>
                                <td className="p-3 font-medium">{pos.symbol}</td>
                                <td className="p-3">
                                    <span
                                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            pos.type === "BUY"
                                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        }`}
                                    >
                                        {pos.type}
                                    </span>
                                </td>
                                <td className="p-3 text-right font-mono">
                                    {fmt(pos.volume)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                    {fmt(pos.price_open, 5)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                    {pos.sl ? fmt(pos.sl, 5) : "—"}
                                </td>
                                <td className="p-3 text-right font-mono">
                                    {pos.tp ? fmt(pos.tp, 5) : "—"}
                                </td>
                                <td
                                    className={`p-3 text-right font-mono font-medium ${profitColor(
                                        pos.profit
                                    )}`}
                                >
                                    {fmt(pos.profit)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700 font-medium">
                        <tr>
                            <td colSpan={7} className="p-3 text-right">
                                Total P&amp;L
                            </td>
                            <td
                                className={`p-3 text-right font-mono ${profitColor(
                                    totalProfit
                                )}`}
                            >
                                {fmt(totalProfit)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            )}
        </div>
    );
}
