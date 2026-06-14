"use client";

import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface JournalDay {
    date: string;
    trade_count: number;
    success_count: number;
    balance_change: number | null;
}

interface TradingCalendarProps {
    journalDays: JournalDay[];
}

const DOW_LABELS = ["Mo", "Tu", "We", "Th", "Fr"];
// Mon=1 … Fri=5
const WEEKDAYS = [1, 2, 3, 4, 5];

function fmtPnl(v: number): string {
    return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function TradingCalendar({ journalDays }: TradingCalendarProps) {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const [viewDate, setViewDate] = useState(
        () => new Date(today.getFullYear(), today.getMonth(), 1)
    );

    const journalMap = useMemo(() => {
        const m = new Map<string, JournalDay>();
        journalDays.forEach(d => m.set(d.date, d));
        return m;
    }, [journalDays]);

    /** Build week rows — only Mon–Fri days */
    const weeks = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Start at the Monday of the week containing the first day
        const cursor = new Date(firstDay);
        const dow = cursor.getDay(); // 0=Sun
        const daysToMon = dow === 0 ? -6 : 1 - dow;
        cursor.setDate(cursor.getDate() + daysToMon);

        const weeksArr: Array<Array<{ date: Date; inMonth: boolean }>> = [];
        while (cursor <= lastDay) {
            const week: Array<{ date: Date; inMonth: boolean }> = [];
            for (let i = 0; i < 5; i++) {
                week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month });
                cursor.setDate(cursor.getDate() + 1);
            }
            // skip to next Monday
            cursor.setDate(cursor.getDate() + 2);
            weeksArr.push(week);
        }
        return weeksArr;
    }, [viewDate]);

    const monthlyTotal = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        let total = 0;
        let hasData = false;
        for (const [dateStr, day] of journalMap) {
            const [y, mo] = dateStr.split("-").map(Number);
            if (y === year && mo - 1 === month && day.balance_change != null) {
                total += day.balance_change;
                hasData = true;
            }
        }
        return hasData ? total : null;
    }, [journalMap, viewDate]);

    const isToday = (date: Date) =>
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();

    const isFuture = (date: Date) => date > today && !isToday(date);

    const goToPrev = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const goToNext = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    const goToToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

    const monthLabel = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

    return (
        <div className="w-full">
            {/* ── Header ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToPrev}
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-semibold text-slate-100 min-w-[160px] text-center">
                        {monthLabel}
                    </span>
                    <button
                        onClick={goToNext}
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={goToToday}
                        className="px-2.5 py-1 text-xs rounded-lg bg-white/[0.06] border border-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        Today
                    </button>
                </div>

                {monthlyTotal != null && (
                    <div
                        className={`text-sm font-semibold px-3 py-1 rounded-lg border ${
                            monthlyTotal >= 0
                                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                                : "text-red-400 bg-red-400/10 border-red-400/20"
                        }`}
                    >
                        Month P&L:{" "}
                        {monthlyTotal >= 0 ? "+" : "-"}
                        {fmtPnl(monthlyTotal)}
                    </div>
                )}
            </div>

            {/* ── Calendar Grid ── */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 480 }}>
                    <thead>
                        <tr>
                            {DOW_LABELS.map(d => (
                                <th
                                    key={d}
                                    className="py-2 text-xs font-medium text-slate-500 text-center border-b border-white/[0.06]"
                                >
                                    {d}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map((week, wi) => (
                            <tr key={wi}>
                                {week.map(({ date, inMonth }, di) => {
                                    const ds = toDateStr(date);
                                    const day = inMonth ? journalMap.get(ds) : undefined;
                                    const todayCell = isToday(date);
                                    const future = isFuture(date);
                                    const hasData = day?.balance_change != null;
                                    const profit = hasData && day!.balance_change! > 0;
                                    const loss = hasData && day!.balance_change! < 0;

                                    let bgStyle: React.CSSProperties = {};
                                    if (inMonth && !future && hasData) {
                                        bgStyle = profit
                                            ? { backgroundColor: "rgba(22, 101, 52, 0.55)" }
                                            : { backgroundColor: "rgba(127, 29, 29, 0.45)" };
                                    }

                                    return (
                                        <td
                                            key={di}
                                            className={`border border-white/[0.07] align-top transition-colors relative ${
                                                !inMonth ? "opacity-20" : ""
                                            } ${future && inMonth ? "opacity-35" : ""}`}
                                            style={{ height: 100, ...bgStyle }}
                                        >
                                            {inMonth && (
                                                <div className="h-full flex flex-col p-2">
                                                    {/* Date number */}
                                                    <div
                                                        className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 self-start ${
                                                            todayCell
                                                                ? "bg-blue-500 text-white"
                                                                : "text-slate-500"
                                                        }`}
                                                    >
                                                        {date.getDate()}
                                                    </div>

                                                    {/* P&L + trade count centered */}
                                                    {hasData && (
                                                        <div className="flex-1 flex flex-col items-center justify-center gap-1">
                                                            <span
                                                                className="font-bold leading-tight"
                                                                style={{
                                                                    fontSize: 15,
                                                                    color: profit ? "#4ade80" : "#f87171",
                                                                }}
                                                            >
                                                                {fmtPnl(day!.balance_change!)}
                                                            </span>
                                                            {day!.trade_count > 0 && (
                                                                <span className="text-xs text-slate-400">
                                                                    {day!.trade_count} trades
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Legend ── */}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: "rgba(22,101,52,0.7)" }} />
                    Profit
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: "rgba(127,29,29,0.6)" }} />
                    Loss
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium flex-shrink-0" style={{ fontSize: 9 }}>
                        1
                    </span>
                    Today
                </div>
            </div>
        </div>
    );
}

export default React.memo(TradingCalendar);
