"use client";

import React from "react";
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

function EquityChart() {
    const equityHistory = useMT5Store((s) => s.equityHistory);

    if (equityHistory.length === 0) {
        return (
            <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                height: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                color: "var(--text-dim)",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.04em",
            }}>
                Waiting for data...
            </div>
        );
    }

    return (
        <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "16px",
        }}>
            <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "14px" }}>
                Balance &amp; Equity
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={equityHistory}>
                    <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                        tickFormatter={(v: number) => v.toLocaleString()}
                    />
                    <Tooltip
                        contentStyle={{
                            background: "#0b0e17",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text)",
                        }}
                        formatter={(value) =>
                            Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        }
                    />
                    <Legend
                        wrapperStyle={{ fontSize: "11px", fontFamily: "'Sora', sans-serif", color: "var(--text-muted)" }}
                    />
                    <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="var(--gold)"
                        dot={false}
                        strokeWidth={1.5}
                        name="Balance"
                    />
                    <Line
                        type="monotone"
                        dataKey="equity"
                        stroke="var(--cyan)"
                        dot={false}
                        strokeWidth={1.5}
                        name="Equity"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default React.memo(EquityChart);
