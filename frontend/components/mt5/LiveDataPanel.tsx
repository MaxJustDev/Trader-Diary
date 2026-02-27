"use client";

import { useMT5Store } from "@/lib/store";
import { useMT5Stream } from "@/hooks/useMT5Stream";
import EquityChart from "./EquityChart";
import PositionsTable from "./PositionsTable";

function StatCard({
    label,
    value,
    color,
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
            <p className="text-sm text-slate-400">{label}</p>
            <p className={`text-xl font-bold font-mono mt-1 ${color ?? "text-slate-100"}`}>
                {value}
            </p>
        </div>
    );
}

export default function LiveDataPanel() {
    const connected = useMT5Store((s) => s.connected);
    const accountInfo = useMT5Store((s) => s.accountInfo);

    useMT5Stream();

    if (!connected) return null;

    const fmt = (v?: number) =>
        v != null
            ? v.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              })
            : "—";

    const profitColor =
        accountInfo && accountInfo.profit >= 0
            ? "text-emerald-400"
            : "text-red-400";

    return (
        <div className="mt-8 space-y-6">
            <h2 className="text-2xl font-bold text-slate-100">Live Account Data</h2>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Balance" value={fmt(accountInfo?.balance)} />
                <StatCard label="Equity" value={fmt(accountInfo?.equity)} />
                <StatCard
                    label="Floating P&L"
                    value={fmt(accountInfo?.profit)}
                    color={profitColor}
                />
                <StatCard
                    label="Free Margin"
                    value={fmt(accountInfo?.margin_free)}
                />
            </div>

            {/* Equity chart */}
            <EquityChart />

            {/* Positions table */}
            <PositionsTable />
        </div>
    );
}
