"use client";

import { useMT5Store } from "@/lib/store";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

export default function EquityChart() {
    const equityHistory = useMT5Store((s) => s.equityHistory);

    if (equityHistory.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center justify-center h-64 text-gray-400">
                Waiting for data...
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Balance &amp; Equity</h3>
            <ResponsiveContainer width="100%" height={250}>
                <LineChart data={equityHistory}>
                    <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11 }}
                        width={80}
                        tickFormatter={(v: number) => v.toLocaleString()}
                    />
                    <Tooltip
                        formatter={(value) =>
                            Number(value).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })
                        }
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="#3b82f6"
                        dot={false}
                        strokeWidth={2}
                        name="Balance"
                    />
                    <Line
                        type="monotone"
                        dataKey="equity"
                        stroke="#22c55e"
                        dot={false}
                        strokeWidth={2}
                        name="Equity"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
