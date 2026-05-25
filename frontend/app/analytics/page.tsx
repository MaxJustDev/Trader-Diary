"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { FundAccountAnalytics } from "@/lib/types";
import FundAccountCard from "@/components/analytics/FundAccountCard";
import { toast } from "sonner";
import {
    LineChart, Line, BarChart, Bar, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { BookOpen, TrendingUp, ChevronDown, ChevronRight, ArrowUp, ArrowDown, CalendarDays, RefreshCw, FileDown, Download, Upload } from "lucide-react";
import dynamic from "next/dynamic";

const TradingCalendar = dynamic(() => import("@/components/analytics/TradingCalendar"), { ssr: false });
const NewsCalendar = dynamic(() => import("@/components/ui/NewsCalendar"), { ssr: false });
const SymbolHeatmap = dynamic(() => import("@/components/analytics/SymbolHeatmap"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface EquityPoint {
    time: string;
    balance: number;
    equity: number;
    profit?: number;
    account_db_id: number;
}

interface TradeRecord {
    id: number;
    account_login: string;
    symbol: string;
    direction: string;
    lot_size: number;
    entry_price?: number;
    sl_price?: number;
    tp_price?: number;
    risk_pct?: number;
    risk_amount?: number;
    reward_amount?: number;
    rr_ratio?: number;
    order_ticket?: number;
    success: boolean;
    error_msg?: string;
    notes?: string;
    tags?: string;
    close_price?: number;
    realized_pnl?: number;
    closed_at?: string;
    executed_at?: string;
}

interface JournalTrade extends TradeRecord {
    sl_pips?: number;
    tp_pips?: number;
}

interface JournalDay {
    date: string;
    trade_count: number;
    success_count: number;
    symbols: string[];
    buy_count: number;
    sell_count: number;
    total_lots: number;
    total_risk: number;
    avg_rr: number | null;
    balance_change: number | null;
    trades: JournalTrade[];
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function ActivityHeatmap({ journalDays }: { journalDays: JournalDay[] }) {
    const [tooltip, setTooltip] = useState<{
        x: number; y: number; date: string; day: JournalDay | null;
    } | null>(null);

    const journalMap = useMemo(() => {
        const m = new Map<string, JournalDay>();
        journalDays.forEach(d => m.set(d.date, d));
        return m;
    }, [journalDays]);

    const { cells, monthLabels } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Align grid start to the Sunday 12 weeks before the current week's Sunday
        const currentWeekSunday = new Date(today);
        currentWeekSunday.setDate(today.getDate() - today.getDay());
        const gridStart = new Date(currentWeekSunday);
        gridStart.setDate(gridStart.getDate() - 12 * 7);

        const cells: Array<Array<{ date: string | null }>> = [];
        const monthLabels: Array<{ col: number; label: string }> = [];
        let lastMonth = -1;

        for (let col = 0; col < 13; col++) {
            cells[col] = [];
            for (let row = 0; row < 7; row++) {
                const d = new Date(gridStart);
                d.setDate(gridStart.getDate() + col * 7 + row);
                if (d > today) {
                    cells[col].push({ date: null });
                } else {
                    const dateStr = d.toISOString().split("T")[0];
                    cells[col].push({ date: dateStr });
                    if (row === 0 && d.getMonth() !== lastMonth) {
                        lastMonth = d.getMonth();
                        monthLabels.push({
                            col,
                            label: d.toLocaleString("default", { month: "short" }),
                        });
                    }
                }
            }
        }
        return { cells, monthLabels };
    }, []);

    const CELL = 14;
    const GAP = 3;
    const STEP = CELL + GAP;
    const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    const cellColor = (date: string | null): string => {
        if (!date) return "transparent";
        const day = journalMap.get(date);
        if (!day || day.trade_count === 0) return "rgba(255,255,255,0.05)";
        if (day.balance_change == null) return "rgba(59,130,246,0.45)";
        if (day.balance_change > 0) return "rgba(16,185,129,0.75)";
        if (day.balance_change < 0) return "rgba(239,68,68,0.75)";
        return "rgba(59,130,246,0.45)";
    };

    return (
        <div className="relative select-none">
            {/* Month labels */}
            <div className="relative h-5 mb-1" style={{ marginLeft: 30 }}>
                {monthLabels.map(({ col, label }) => (
                    <span
                        key={`${label}-${col}`}
                        className="absolute text-xs text-slate-500"
                        style={{ left: col * STEP }}
                    >
                        {label}
                    </span>
                ))}
            </div>

            <div className="flex" style={{ gap: GAP }}>
                {/* Day labels */}
                <div className="flex flex-col" style={{ gap: GAP, width: 26 }}>
                    {DAY_LABELS.map((lbl, i) => (
                        <div
                            key={lbl}
                            className="text-xs text-slate-500 flex items-center justify-end pr-1"
                            style={{ height: CELL }}
                        >
                            {i % 2 === 1 ? lbl : ""}
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex" style={{ gap: GAP }}>
                    {cells.map((col, colIdx) => (
                        <div key={colIdx} className="flex flex-col" style={{ gap: GAP }}>
                            {col.map(({ date }, rowIdx) => (
                                <div
                                    key={rowIdx}
                                    className="rounded-sm cursor-default"
                                    style={{
                                        width: CELL,
                                        height: CELL,
                                        backgroundColor: cellColor(date),
                                    }}
                                    onMouseEnter={e => {
                                        if (date) {
                                            setTooltip({
                                                x: e.clientX,
                                                y: e.clientY,
                                                date,
                                                day: journalMap.get(date) ?? null,
                                            });
                                        }
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                <span>Less</span>
                {[
                    "rgba(255,255,255,0.05)",
                    "rgba(59,130,246,0.45)",
                    "rgba(239,68,68,0.75)",
                    "rgba(16,185,129,0.75)",
                ].map((c, i) => (
                    <div key={i} className="rounded-sm" style={{ width: CELL, height: CELL, backgroundColor: c }} />
                ))}
                <span>More</span>
                <span className="ml-3 flex items-center gap-1.5">
                    <span className="rounded-sm inline-block" style={{ width: CELL, height: CELL, backgroundColor: "rgba(16,185,129,0.75)" }} />
                    Profit
                    <span className="rounded-sm inline-block ml-1" style={{ width: CELL, height: CELL, backgroundColor: "rgba(239,68,68,0.75)" }} />
                    Loss
                    <span className="rounded-sm inline-block ml-1" style={{ width: CELL, height: CELL, backgroundColor: "rgba(59,130,246,0.45)" }} />
                    Traded (no P&L)
                </span>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 bg-[#1a2035] border border-white/10 rounded-lg p-3 text-xs pointer-events-none shadow-xl"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
                >
                    <p className="font-semibold text-slate-200 mb-1">{tooltip.date}</p>
                    {tooltip.day && tooltip.day.trade_count > 0 ? (
                        <>
                            <p className="text-slate-400">
                                {tooltip.day.trade_count} entr{tooltip.day.trade_count === 1 ? "y" : "ies"}
                            </p>
                            {tooltip.day.symbols.length > 0 && (
                                <p className="text-slate-400">{tooltip.day.symbols.join(", ")}</p>
                            )}
                            {tooltip.day.balance_change != null && (
                                <p className={`font-medium mt-0.5 ${tooltip.day.balance_change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {tooltip.day.balance_change >= 0 ? "+" : ""}
                                    ${tooltip.day.balance_change.toFixed(2)}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-slate-500">No activity</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v?: number | null) =>
    v != null
        ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOfWeek = (dateStr: string) => {
    try { return DOW[new Date(dateStr + "T12:00:00").getDay()]; } catch { return ""; }
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState<"overview" | "journal" | "calendar">("overview");
    const [summary, setSummary] = useState<any>(null);
    const [fundAccounts, setFundAccounts] = useState<FundAccountAnalytics[]>([]);
    const [allAccounts, setAllAccounts] = useState<any[]>([]);
    const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
    const [trades, setTrades] = useState<TradeRecord[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [tradesFetched, setTradesFetched] = useState(false);
    const [journalDays, setJournalDays] = useState<JournalDay[]>([]);
    const [calendarDays, setCalendarDays] = useState<JournalDay[]>([]);
    const [journalPeriod, setJournalPeriod] = useState<30 | 60 | 90>(90);
    const [journalAccountFilter, setJournalAccountFilter] = useState<number | "all">("all");
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [journalLoading, setJournalLoading] = useState(false);
    const [equityFilter, setEquityFilter] = useState<number | "all">("all");
    const [editingNote, setEditingNote] = useState<{ id: number; value: string } | null>(null);
    const [savingNote, setSavingNote] = useState(false);
    const [syncingPnl, setSyncingPnl] = useState(false);
    const [editingTags, setEditingTags] = useState<number | null>(null);
    const [restoringDb, setRestoringDb] = useState(false);

    useEffect(() => { loadAnalytics(); }, []);

    const loadAnalytics = async () => {
        try {
            const [summaryData, fundData, accountsData, equityData, journalData, calendarData] = await Promise.all([
                apiClient.analytics.getSummary(),
                apiClient.analytics.getFundStatus(),
                apiClient.accounts.getAll(),
                apiClient.analytics.getEquityCurve(),
                apiClient.analytics.getJournal(undefined, 90),
                apiClient.analytics.getJournal(undefined, 400),
            ]);
            setSummary(summaryData);
            setFundAccounts(fundData.accounts);
            setAllAccounts(accountsData);
            setEquityCurve(equityData.data ?? []);
            setJournalDays(journalData.days ?? []);
            setCalendarDays(calendarData.days ?? []);
        } catch (error: any) {
            toast.error(`Failed to load analytics: ${error.message ?? "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncPnl = async () => {
        setSyncingPnl(true);
        try {
            const r = await apiClient.analytics.syncRealizedPnl();
            if (r.message) { toast.success(r.message); }
            else { toast.success(`Synced P&L for ${r.synced} trade(s)`); }
            if (r.synced > 0) {
                const data = await apiClient.analytics.getTradeHistory();
                setTrades(data.trades ?? []);
            }
        } catch (e: any) {
            toast.error(`Sync failed: ${e.message}`);
        } finally {
            setSyncingPnl(false);
        }
    };

    const saveNote = async () => {
        if (!editingNote) return;
        setSavingNote(true);
        try {
            await apiClient.analytics.updateTradeNote(editingNote.id, editingNote.value);
            setTrades((prev) => prev.map((t) => t.id === editingNote.id ? { ...t, notes: editingNote.value } : t));
            toast.success("Note saved");
            setEditingNote(null);
        } catch (e: any) {
            toast.error(`Failed to save note: ${e.message}`);
        } finally {
            setSavingNote(false);
        }
    };

    const TRADE_TAGS = ["Trend", "Breakout", "Reversal", "News", "FOMO", "Revenge", "Patient", "Scalp", "Swing"];

    const toggleTag = async (trade: TradeRecord, tag: string) => {
        const current = trade.tags ? trade.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
        const updated = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
        const newTags = updated.join(",");
        try {
            await apiClient.analytics.updateTradeTags(trade.id, newTags);
            setTrades((prev) => prev.map((t) => t.id === trade.id ? { ...t, tags: newTags } : t));
        } catch (e: any) {
            toast.error(`Failed to save tags: ${e.message}`);
        }
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRestoringDb(true);
        try {
            const result = await apiClient.system.restore(file);
            toast.success(`Database restored (${(result.size_bytes / 1024).toFixed(1)} KB). Refreshing...`);
            setTimeout(() => window.location.reload(), 1200);
        } catch (err: any) {
            toast.error(`Restore failed: ${err.message}`);
        } finally {
            setRestoringDb(false);
            e.target.value = "";
        }
    };

    const loadJournal = async (period: 30 | 60 | 90, accId: number | "all") => {
        setJournalLoading(true);
        try {
            const data = await apiClient.analytics.getJournal(
                accId === "all" ? undefined : accId,
                period,
            );
            setJournalDays(data.days ?? []);
        } catch (e: any) {
            toast.error(`Journal load failed: ${e.message}`);
        } finally {
            setJournalLoading(false);
        }
    };

    const fetchTradeHistory = async () => {
        setTradesLoading(true);
        try {
            const data = await apiClient.analytics.getTradeHistory();
            setTrades(data.trades ?? []);
            setTradesFetched(true);
        } catch (error: any) {
            toast.error(`Failed to load trade history: ${error.message ?? "Unknown error"}`);
        } finally {
            setTradesLoading(false);
        }
    };

    const handlePeriodChange = (p: 30 | 60 | 90) => {
        setJournalPeriod(p);
        loadJournal(p, journalAccountFilter);
    };

    const handleAccountFilterChange = (accId: number | "all") => {
        setJournalAccountFilter(accId);
        loadJournal(journalPeriod, accId);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await apiClient.accounts.refreshAll();
            await loadAnalytics();
            toast.success("Data refreshed from MT5");
        } catch (error: any) {
            toast.error(`Refresh failed: ${error.message ?? "Unknown error"}`);
        } finally {
            setRefreshing(false);
        }
    };

    // ── Computed ───────────────────────────────────────────────────────────────

    const filteredEquity = useMemo(() => {
        if (equityFilter === "all") return equityCurve;
        return equityCurve.filter(p => p.account_db_id === equityFilter);
    }, [equityCurve, equityFilter]);

    const accountsWithData = useMemo(() => {
        const ids = new Set(equityCurve.map(p => p.account_db_id));
        return allAccounts.filter(a => ids.has(a.id));
    }, [allAccounts, equityCurve]);

    const tradeStats = useMemo(() => {
        const total = trades.length;
        const succeeded = trades.filter(t => t.success).length;
        const failed = total - succeeded;
        const totalLots = trades.reduce((s, t) => s + (t.lot_size ?? 0), 0);
        const totalRisk = trades.filter(t => t.success).reduce((s, t) => s + (t.risk_amount ?? 0), 0);
        const withRR = trades.filter(t => t.rr_ratio != null && t.rr_ratio > 0);
        const avgRR = withRR.length > 0
            ? withRR.reduce((s, t) => s + (t.rr_ratio ?? 0), 0) / withRR.length
            : null;
        return { total, succeeded, failed, totalLots, totalRisk, avgRR };
    }, [trades]);

    const journalStats = useMemo(() => {
        const tradingDays = journalDays.filter(d => d.trade_count > 0).length;
        const totalEntries = journalDays.reduce((s, d) => s + d.trade_count, 0);
        const daysWithPnl = journalDays.filter(d => d.balance_change != null && d.trade_count > 0);
        const bestDay = daysWithPnl.length > 0
            ? daysWithPnl.reduce((b, d) => d.balance_change! > b.balance_change! ? d : b)
            : null;
        const worstDay = daysWithPnl.length > 0
            ? daysWithPnl.reduce((w, d) => d.balance_change! < w.balance_change! ? d : w)
            : null;

        // Current streak: count consecutive win/loss days from most recent
        let streak = 0;
        let streakType: "win" | "loss" | null = null;
        const chronoDays = [...daysWithPnl].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = chronoDays.length - 1; i >= 0; i--) {
            const bc = chronoDays[i].balance_change!;
            const type = bc > 0 ? "win" : bc < 0 ? "loss" : null;
            if (!type) break;
            if (streakType === null) { streakType = type; streak = 1; }
            else if (type === streakType) { streak++; }
            else break;
        }

        return { tradingDays, totalEntries, bestDay, worstDay, streak, streakType };
    }, [journalDays]);

    // Day ratings stored in localStorage
    const [dayRatings, setDayRatings] = useState<Record<string, { rating: number; mood: string }>>(() => {
        try { return JSON.parse(localStorage.getItem("traderdiary_day_ratings") || "{}"); } catch { return {}; }
    });
    const setDayRating = (date: string, rating: number, mood: string) => {
        const updated = { ...dayRatings, [date]: { rating, mood } };
        setDayRatings(updated);
        localStorage.setItem("traderdiary_day_ratings", JSON.stringify(updated));
    };

    // P&L bar chart data (chronological, days with balance_change only)
    const pnlChartData = useMemo(() => {
        return [...journalDays]
            .filter(d => d.balance_change != null && d.trade_count > 0)
            .reverse()
            .map(d => ({
                date: d.date,
                pnl: d.balance_change!,
                label: d.date.slice(5), // MM-DD
            }));
    }, [journalDays]);

    const tooltipStyle = {
        backgroundColor: "#161b27",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "8px",
        color: "#f1f5f9",
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    return (
        <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <div>
                    <div className="section-label" style={{ marginBottom: "4px" }}>Trading Journal</div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: 0, letterSpacing: "-0.01em" }}>
                        Analytics
                    </h1>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                    onClick={async () => {
                        const { exportAnalyticsPdf } = await import("@/lib/export-pdf");
                        exportAnalyticsPdf({ summary, journalStats, trades });
                    }}
                    aria-label="Export analytics to PDF"
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "rgba(240,180,41,0.08)", border: "1px solid rgba(240,180,41,0.2)", color: "var(--gold)", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "'Sora', sans-serif" }}
                >
                    <FileDown size={14} /> Export PDF
                </button>
                <a
                    href={apiClient.system.backup()}
                    download
                    aria-label="Backup database"
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "var(--cyan)", borderRadius: "8px", fontSize: "12px", fontWeight: 500, textDecoration: "none", fontFamily: "'Sora', sans-serif" }}
                >
                    <Download size={14} /> Backup DB
                </a>
                <label aria-label="Restore database from file" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)", color: "var(--purple)", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: restoringDb ? "not-allowed" : "pointer", opacity: restoringDb ? 0.5 : 1, fontFamily: "'Sora', sans-serif" }}>
                    <Upload size={14} /> {restoringDb ? "Restoring..." : "Restore DB"}
                    <input type="file" accept=".db" onChange={handleRestore} style={{ display: "none" }} disabled={restoringDb} />
                </label>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label="Refresh analytics data"
                    style={{
                        padding: "8px 16px",
                        background: "rgba(34,211,238,0.08)",
                        border: "1px solid rgba(34,211,238,0.2)",
                        color: "var(--cyan)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: refreshing ? "not-allowed" : "pointer",
                        opacity: refreshing ? 0.7 : 1,
                        transition: "all 150ms",
                        fontFamily: "'Sora', sans-serif",
                    }}
                >
                    {refreshing ? "Refreshing..." : "Refresh Data"}
                </button>
                </div>
            </div>

            {/* Summary Stats — always visible */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginBottom: "24px" }}>
                {[
                    { label: "Total Accounts", value: String(summary?.total_accounts || 0), accentColor: "var(--cyan)", textColor: "#f0f4f8" },
                    { label: "Fund Accounts", value: String(summary?.fund_accounts || 0), accentColor: "var(--purple)", textColor: "var(--purple)" },
                    {
                        label: "Total Balance",
                        value: `$${summary?.total_balance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || "0"}`,
                        accentColor: "var(--emerald)",
                        textColor: "var(--emerald)",
                    },
                    {
                        label: "Total P&L",
                        value: `${(summary?.total_profit ?? 0) >= 0 ? "+" : ""}$${fmt(summary?.total_profit)}`,
                        accentColor: (summary?.total_profit ?? 0) >= 0 ? "var(--emerald)" : "var(--rose)",
                        textColor: (summary?.total_profit ?? 0) >= 0 ? "var(--emerald)" : "var(--rose)",
                    },
                ].map(({ label, value, accentColor, textColor }) => (
                    <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
                        <div className="section-label" style={{ marginBottom: "8px" }}>{label}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: textColor, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
                {[
                    { id: "overview" as const, icon: <TrendingUp size={13} />, label: "Overview" },
                    { id: "journal" as const, icon: <BookOpen size={13} />, label: "Journal" },
                    { id: "calendar" as const, icon: <CalendarDays size={13} />, label: "Calendar" },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "9px 14px",
                            fontSize: "12px",
                            fontWeight: activeTab === tab.id ? 600 : 400,
                            color: activeTab === tab.id ? "var(--gold)" : "var(--text-muted)",
                            background: "none",
                            border: "none",
                            borderBottom: activeTab === tab.id ? "2px solid var(--gold)" : "2px solid transparent",
                            marginBottom: "-1px",
                            cursor: "pointer",
                            transition: "color 150ms, border-color 150ms",
                            fontFamily: "'Sora', sans-serif",
                        }}
                        onMouseEnter={(e) => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = "var(--text-soft)"; }}
                        onMouseLeave={(e) => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
                <>
                    {/* Fund Account Status */}
                    {fundAccounts.length > 0 ? (
                        <div className="mb-8">
                            <h2 className="text-xl font-semibold mb-4 text-slate-100">Fund Account Status</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {fundAccounts.map(acct => (
                                    <FundAccountCard key={acct.account_id} account={acct} onUpdated={loadAnalytics} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-8 text-center text-slate-600 mb-8">
                            <p className="text-lg">No fund accounts found</p>
                            <p className="text-sm mt-1">Add fund accounts and run &quot;Init All&quot; to see analytics</p>
                            <Link
                                href="/accounts"
                                style={{
                                    display: "inline-block",
                                    marginTop: 12,
                                    padding: "8px 16px",
                                    borderRadius: 6,
                                    background: "var(--cyan-dim)",
                                    color: "var(--cyan)",
                                    border: "1px solid var(--cyan)",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                    fontSize: 13,
                                }}
                            >
                                Manage accounts
                            </Link>
                        </div>
                    )}

                    {/* Equity Curve */}
                    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-6 mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-slate-100">Equity Curve</h2>
                            {accountsWithData.length > 0 && (
                                <select
                                    value={equityFilter === "all" ? "all" : String(equityFilter)}
                                    onChange={e => setEquityFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                                    className="text-sm px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.10] text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="all">All accounts</option>
                                    {accountsWithData.map(a => (
                                        <option key={a.id} value={a.id}>{a.account_id}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        {filteredEquity.length === 0 ? (
                            <div className="h-64 flex items-center justify-center border-2 border-dashed border-white/[0.08] rounded-lg text-slate-600">
                                <div className="text-center">
                                    <p>No equity data yet</p>
                                    <p className="text-sm mt-1">Connect an account — snapshots are saved every 60s</p>
                                </div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={filteredEquity}>
                                    <XAxis
                                        dataKey="time"
                                        tick={{ fontSize: 11, fill: "#475569" }}
                                        interval="preserveStartEnd"
                                        tickFormatter={(v: string) => {
                                            try { return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
                                            catch { return v; }
                                        }}
                                    />
                                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#475569" }} width={85}
                                        tickFormatter={(v: number) => v.toLocaleString()} />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        labelFormatter={(l: any) => { try { return new Date(String(l)).toLocaleString(); } catch { return String(l); } }}
                                        formatter={(v: any) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    />
                                    <Legend wrapperStyle={{ color: "#94a3b8" }} />
                                    <Line type="monotone" dataKey="balance" stroke="#3b82f6" dot={false} strokeWidth={2} name="Balance" />
                                    <Line type="monotone" dataKey="equity" stroke="#22c55e" dot={false} strokeWidth={2} name="Equity" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Trade Statistics */}
                    {trades.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                            {[
                                { label: "Total Orders", value: String(tradeStats.total) },
                                { label: "Executed", value: String(tradeStats.succeeded), color: "text-emerald-400" },
                                { label: "Failed", value: String(tradeStats.failed), color: "text-red-400" },
                                { label: "Total Lots", value: tradeStats.totalLots.toFixed(2) },
                                { label: "Total Risk $", value: `$${fmt(tradeStats.totalRisk)}`, color: "text-amber-400" },
                                { label: "Avg R:R", value: tradeStats.avgRR != null ? `1:${tradeStats.avgRR.toFixed(2)}` : "—" },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
                                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                                    <p className={`text-xl font-bold ${color ?? "text-slate-100"}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* News Calendar */}
                    <div style={{ marginBottom: "24px" }}>
                        <NewsCalendar />
                    </div>

                    {/* Symbol Performance + Hour Heatmap */}
                    {trades.length > 0 && (
                        <div style={{ marginBottom: "24px" }}>
                            <SymbolHeatmap trades={trades} />
                        </div>
                    )}

                    {/* Trade History */}
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-slate-100">
                                Trade History
                                {trades.length > 0 && (
                                    <span className="ml-2 text-sm font-normal text-slate-400">
                                        ({trades.length} record{trades.length !== 1 ? "s" : ""})
                                    </span>
                                )}
                            </h2>
                            <div style={{ display: "flex", gap: "8px" }}>
                                {tradesFetched && (
                                    <button
                                        onClick={handleSyncPnl}
                                        disabled={syncingPnl}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
                                        style={{ background: "rgba(240,180,41,0.08)", borderColor: "rgba(240,180,41,0.25)", color: "#f0b429" }}
                                        title="Sync realized P&L from connected MT5 terminal"
                                        aria-label="Sync profit and loss"
                                    >
                                        {syncingPnl ? "Syncing..." : "Sync P&L"}
                                    </button>
                                )}
                                <button
                                    onClick={fetchTradeHistory}
                                    disabled={tradesLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
                                    style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)", color: "#94a3b8" }}
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${tradesLoading ? "animate-spin" : ""}`} />
                                    {tradesLoading ? "Loading..." : tradesFetched ? "Refresh" : "Load History"}
                                </button>
                            </div>
                        </div>
                        {!tradesFetched ? (
                            <div className="h-48 flex items-center justify-center border-2 border-dashed border-white/[0.08] rounded-lg text-slate-600">
                                <div className="text-center">
                                    <p>Click "Load History" to fetch trade records</p>
                                </div>
                            </div>
                        ) : trades.length === 0 ? (
                            <div className="h-48 flex items-center justify-center border-2 border-dashed border-white/[0.08] rounded-lg text-slate-600">
                                <div className="text-center">
                                    <p>No trades yet</p>
                                    <p className="text-sm mt-1">Execute batch orders to see history</p>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.08] text-left">
                                            <th className="p-3 font-semibold text-slate-400">Time</th>
                                            <th className="p-3 font-semibold text-slate-400">Account</th>
                                            <th className="p-3 font-semibold text-slate-400">Symbol</th>
                                            <th className="p-3 font-semibold text-slate-400">Dir</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">Lot</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">Entry</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">SL</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">TP</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">Risk $</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">R:R</th>
                                            <th className="p-3 text-right font-semibold text-slate-400">Realized P&L</th>
                                            <th className="p-3 font-semibold text-slate-400">Status</th>
                                            <th className="p-3 font-semibold text-slate-400">Tags</th>
                                            <th className="p-3 font-semibold text-slate-400">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trades.map(t => (
                                            <tr key={t.id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                                                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                                                    {t.executed_at ? new Date(t.executed_at).toLocaleString() : "—"}
                                                </td>
                                                <td className="p-3 font-mono text-slate-300">{t.account_login}</td>
                                                <td className="p-3 font-mono font-medium text-slate-100">{t.symbol}</td>
                                                <td className={`p-3 font-bold ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</td>
                                                <td className="p-3 text-right font-mono text-slate-300">{t.lot_size}</td>
                                                <td className="p-3 text-right font-mono text-slate-300">{fmt(t.entry_price)}</td>
                                                <td className="p-3 text-right font-mono text-red-400">{fmt(t.sl_price)}</td>
                                                <td className="p-3 text-right font-mono text-emerald-400">{fmt(t.tp_price)}</td>
                                                <td className="p-3 text-right font-mono text-red-400">${fmt(t.risk_amount)}</td>
                                                <td className="p-3 text-right text-slate-400">{t.rr_ratio ? `1:${t.rr_ratio}` : "—"}</td>
                                                <td className="p-3 text-right font-mono" style={{ color: t.realized_pnl != null ? (t.realized_pnl >= 0 ? "var(--emerald, #34d399)" : "var(--rose, #f87171)") : "#475569" }}>
                                                    {t.realized_pnl != null ? `${t.realized_pnl >= 0 ? "+" : ""}$${fmt(t.realized_pnl)}` : "—"}
                                                </td>
                                                <td className="p-3">
                                                    {t.success
                                                        ? <span className="text-emerald-400 font-medium text-xs">OK</span>
                                                        : <span className="text-red-400 text-xs" title={t.error_msg ?? ""}>Failed</span>}
                                                </td>
                                                <td className="p-3" style={{ minWidth: "180px" }}>
                                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                                                        {(t.tags ? t.tags.split(",").map(tag => tag.trim()).filter(Boolean) : []).map(tag => (
                                                            <span key={tag} onClick={() => toggleTag(t, tag)} style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 7px", fontSize: "10px", fontWeight: 600, background: "rgba(240,180,41,0.12)", border: "1px solid rgba(240,180,41,0.3)", color: "var(--gold)", borderRadius: "99px", cursor: "pointer" }}>
                                                                {tag} ×
                                                            </span>
                                                        ))}
                                                        {editingTags === t.id ? (
                                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                                                                {TRADE_TAGS.filter(tag => !(t.tags || "").split(",").map(s => s.trim()).includes(tag)).map(tag => (
                                                                    <span key={tag} onClick={() => { toggleTag(t, tag); setEditingTags(null); }} style={{ padding: "2px 7px", fontSize: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: "99px", cursor: "pointer" }}>
                                                                        +{tag}
                                                                    </span>
                                                                ))}
                                                                <span onClick={() => setEditingTags(null)} style={{ padding: "2px 6px", fontSize: "10px", color: "var(--text-dim)", cursor: "pointer" }}>✕</span>
                                                            </div>
                                                        ) : (
                                                            <span onClick={() => setEditingTags(t.id)} style={{ padding: "2px 6px", fontSize: "10px", color: "var(--text-dim)", cursor: "pointer", borderRadius: "99px", border: "1px dashed rgba(255,255,255,0.1)" }} title="Add tag">+</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3" style={{ minWidth: "160px" }}>
                                                    {editingNote?.id === t.id ? (
                                                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                            <input
                                                                autoFocus
                                                                value={editingNote.value}
                                                                onChange={(e) => setEditingNote({ id: t.id, value: e.target.value })}
                                                                onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setEditingNote(null); }}
                                                                style={{ flex: 1, fontSize: "11px", padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "5px", color: "#f0f4f8", outline: "none", fontFamily: "'Sora', sans-serif" }}
                                                            />
                                                            <button onClick={saveNote} disabled={savingNote} style={{ fontSize: "10px", padding: "3px 8px", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "var(--emerald)", borderRadius: "5px", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                                                                {savingNote ? "..." : "Save"}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => setEditingNote({ id: t.id, value: t.notes ?? "" })}
                                                            style={{ fontSize: "11px", color: t.notes ? "var(--text-soft)" : "var(--text-dim)", cursor: "pointer", fontStyle: t.notes ? "normal" : "italic", minHeight: "20px", padding: "2px 4px", borderRadius: "4px" }}
                                                            title="Click to add note"
                                                        >
                                                            {t.notes || "add note..."}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── JOURNAL TAB ── */}

            {activeTab === "journal" && (
                <>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-4 mb-6">
                        <select
                            value={journalAccountFilter === "all" ? "all" : String(journalAccountFilter)}
                            onChange={e => handleAccountFilterChange(e.target.value === "all" ? "all" : Number(e.target.value))}
                            className="text-sm px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.10] text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All accounts</option>
                            {allAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.account_id}</option>
                            ))}
                        </select>

                        <div className="flex gap-2">
                            {([30, 60, 90] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => handlePeriodChange(p)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        journalPeriod === p
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                            : "bg-white/[0.06] border border-white/[0.10] text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {p}d
                                </button>
                            ))}
                        </div>

                        {journalLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                        )}
                    </div>

                    {/* Journal Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400" />
                            <p className="text-xs text-slate-400">Trading Days</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{journalStats.tradingDays}</p>
                        </div>
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-400" />
                            <p className="text-xs text-slate-400 flex items-center gap-1"><ArrowUp className="w-3 h-3 text-emerald-400" /> Best Day</p>
                            {journalStats.bestDay ? (
                                <>
                                    <p className="text-xl font-bold text-emerald-400 mt-1">
                                        +${Math.abs(journalStats.bestDay.balance_change!).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">{journalStats.bestDay.date}</p>
                                </>
                            ) : <p className="text-xl font-bold text-slate-500 mt-1">—</p>}
                        </div>
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-400" />
                            <p className="text-xs text-slate-400 flex items-center gap-1"><ArrowDown className="w-3 h-3 text-red-400" /> Worst Day</p>
                            {journalStats.worstDay && journalStats.worstDay.balance_change! < 0 ? (
                                <>
                                    <p className="text-xl font-bold text-red-400 mt-1">
                                        -${Math.abs(journalStats.worstDay.balance_change!).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">{journalStats.worstDay.date}</p>
                                </>
                            ) : <p className="text-xl font-bold text-slate-500 mt-1">—</p>}
                        </div>
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-400" />
                            <p className="text-xs text-slate-400">Total Entries</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{journalStats.totalEntries}</p>
                        </div>
                        {journalStats.streak > 0 && (
                            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 relative overflow-hidden">
                                <div className={`absolute top-0 left-0 right-0 h-0.5 ${journalStats.streakType === "win" ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-red-500 to-red-400"}`} />
                                <p className="text-xs text-slate-400">Current Streak</p>
                                <p className={`text-2xl font-bold mt-1 ${journalStats.streakType === "win" ? "text-emerald-400" : "text-red-400"}`}>
                                    {journalStats.streakType === "win" ? "🔥" : "⚠️"} {journalStats.streak}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">{journalStats.streakType === "win" ? "winning" : "losing"} day{journalStats.streak !== 1 ? "s" : ""}</p>
                            </div>
                        )}
                    </div>

                    {/* Activity Heatmap */}
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 mb-6">
                        <h2 className="text-lg font-semibold text-slate-100 mb-4">Activity Heatmap</h2>
                        <ActivityHeatmap journalDays={journalDays} />
                    </div>

                    {/* Daily P&L Bar Chart */}
                    {pnlChartData.length > 0 && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6 mb-6">
                            <h2 className="text-lg font-semibold text-slate-100 mb-4">Daily P&L</h2>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={pnlChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 10, fill: "#475569" }}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: "#475569" }}
                                        width={70}
                                        tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                                    />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        labelFormatter={(l: any) => `Date: ${l}`}
                                        formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Balance Δ"]}
                                    />
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                                        {pnlChartData.map((entry, idx) => (
                                            <Cell
                                                key={idx}
                                                fill={entry.pnl >= 0 ? "rgba(16,185,129,0.8)" : "rgba(239,68,68,0.8)"}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Daily Breakdown Table */}
                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-slate-100 mb-4">
                            Daily Breakdown
                            {journalDays.filter(d => d.trade_count > 0).length > 0 && (
                                <span className="ml-2 text-sm font-normal text-slate-400">
                                    ({journalDays.filter(d => d.trade_count > 0).length} trading days)
                                </span>
                            )}
                        </h2>

                        {journalDays.filter(d => d.trade_count > 0).length === 0 ? (
                            <div className="h-40 flex items-center justify-center border-2 border-dashed border-white/[0.08] rounded-lg text-slate-600">
                                <div className="text-center">
                                    <p>No trading activity in this period</p>
                                    <p className="text-sm mt-1">Execute trades to see the journal</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {journalDays.filter(d => d.trade_count > 0).map(day => {
                                    const isExpanded = expandedDay === day.date;
                                    const borderColor =
                                        day.balance_change == null ? "border-blue-500/50"
                                        : day.balance_change > 0 ? "border-emerald-500"
                                        : day.balance_change < 0 ? "border-red-500"
                                        : "border-blue-500/50";

                                    return (
                                        <div key={day.date} className="rounded-lg overflow-hidden border border-white/[0.06]">
                                            {/* Row */}
                                            <div
                                                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.04] border-l-4 ${borderColor} transition-colors`}
                                                onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                            >
                                                {/* Date */}
                                                <div className="w-28 shrink-0">
                                                    <p className="text-sm font-medium text-slate-100">{day.date}</p>
                                                    <p className="text-xs text-slate-500">{dayOfWeek(day.date)}</p>
                                                </div>

                                                {/* Symbols */}
                                                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                                    {day.symbols.map(sym => (
                                                        <span key={sym} className="px-1.5 py-0.5 bg-white/[0.06] rounded text-xs font-mono text-slate-300">
                                                            {sym}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Stats */}
                                                <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
                                                    <span className="whitespace-nowrap">{day.trade_count} entr{day.trade_count === 1 ? "y" : "ies"}</span>
                                                    <span className="whitespace-nowrap">
                                                        <span className="text-emerald-400">{day.buy_count}B</span>
                                                        {" / "}
                                                        <span className="text-red-400">{day.sell_count}S</span>
                                                    </span>
                                                    <span className="whitespace-nowrap">{day.total_lots.toFixed(2)} lots</span>
                                                    {day.total_risk > 0 && (
                                                        <span className="whitespace-nowrap text-amber-400">${day.total_risk.toFixed(2)}</span>
                                                    )}
                                                    {day.balance_change != null && (
                                                        <span className={`font-semibold whitespace-nowrap ${day.balance_change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                            {day.balance_change >= 0 ? "+" : ""}${day.balance_change.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Day rating */}
                                                <div className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                    {[1,2,3,4,5].map(star => (
                                                        <button
                                                            key={star}
                                                            onClick={() => setDayRating(day.date, star, dayRatings[day.date]?.mood ?? "")}
                                                            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 1px", fontSize: "13px", opacity: (dayRatings[day.date]?.rating ?? 0) >= star ? 1 : 0.2, lineHeight: 1 }}
                                                            title={`Rate day ${star}/5`}
                                                        >★</button>
                                                    ))}
                                                </div>

                                                {/* Chevron */}
                                                <div className="shrink-0 text-slate-500">
                                                    {isExpanded
                                                        ? <ChevronDown className="w-4 h-4" />
                                                        : <ChevronRight className="w-4 h-4" />}
                                                </div>
                                            </div>

                                            {/* Expanded trades */}
                                            {isExpanded && (
                                                <div className="border-t border-white/[0.06] bg-black/20">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="border-b border-white/[0.06] text-left">
                                                                    <th className="px-4 py-2 font-semibold text-slate-500">Time</th>
                                                                    <th className="px-4 py-2 font-semibold text-slate-500">Account</th>
                                                                    <th className="px-4 py-2 font-semibold text-slate-500">Symbol</th>
                                                                    <th className="px-4 py-2 font-semibold text-slate-500">Dir</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">Lot</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">Entry</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">SL</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">TP</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">Risk $</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-slate-500">R:R</th>
                                                                    <th className="px-4 py-2 font-semibold text-slate-500">Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {day.trades.map(t => (
                                                                    <tr key={t.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                                                                            {t.executed_at
                                                                                ? new Date(t.executed_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                                                                                : "—"}
                                                                        </td>
                                                                        <td className="px-4 py-2 font-mono text-slate-400">{t.account_login}</td>
                                                                        <td className="px-4 py-2 font-mono font-medium text-slate-200">{t.symbol}</td>
                                                                        <td className={`px-4 py-2 font-bold ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</td>
                                                                        <td className="px-4 py-2 text-right font-mono text-slate-300">{t.lot_size}</td>
                                                                        <td className="px-4 py-2 text-right font-mono text-slate-300">{fmt(t.entry_price)}</td>
                                                                        <td className="px-4 py-2 text-right font-mono text-red-400">{fmt(t.sl_price)}</td>
                                                                        <td className="px-4 py-2 text-right font-mono text-emerald-400">{fmt(t.tp_price)}</td>
                                                                        <td className="px-4 py-2 text-right font-mono text-amber-400">${fmt(t.risk_amount)}</td>
                                                                        <td className="px-4 py-2 text-right text-slate-400">{t.rr_ratio ? `1:${t.rr_ratio}` : "—"}</td>
                                                                        <td className="px-4 py-2">
                                                                            {t.success
                                                                                ? <span className="text-emerald-400 font-medium">OK</span>
                                                                                : <span className="text-red-400" title={t.error_msg ?? ""}>Failed</span>}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── CALENDAR TAB ── */}
            {activeTab === "calendar" && (
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 sm:p-6">
                    <h2 className="text-lg font-semibold text-slate-100 mb-4">P&amp;L Calendar</h2>
                    <TradingCalendar journalDays={calendarDays} />
                </div>
            )}
        </div>
    );
}
