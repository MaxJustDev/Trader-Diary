"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Newspaper, RefreshCw } from "lucide-react";

interface NewsEvent {
    title: string;
    country: string;
    date: string;
    time: string;
    impact: "high" | "medium";
    forecast?: string;
    previous?: string;
}

const CURRENCY_FLAG: Record<string, string> = {
    USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
    AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
    CNY: "🇨🇳", CNH: "🇨🇳",
};

function parseEventTime(e: NewsEvent): Date | null {
    try {
        return new Date(`${e.date} ${e.time}`);
    } catch {
        return null;
    }
}

function NewsCalendar() {
    const [events, setEvents] = useState<NewsEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetched, setFetched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchNews = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiClient.news.getCalendar(signal);
            if (signal?.aborted) return;
            setEvents(data.events || []);
            if (data.error) setError(data.error);
        } catch (e: any) {
            if (signal?.aborted) return;
            setError(e.message);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
                setFetched(true);
            }
        }
    }, []);

    useEffect(() => {
        const ac = new AbortController();
        fetchNews(ac.signal);
        return () => ac.abort();
    }, [fetchNews]);

    const now = new Date();

    // Group by date
    const grouped: Record<string, NewsEvent[]> = {};
    for (const e of events) {
        if (!grouped[e.date]) grouped[e.date] = [];
        grouped[e.date].push(e);
    }

    const dateKeys = Object.keys(grouped).sort((a, b) => {
        try {
            return new Date(a).getTime() - new Date(b).getTime();
        } catch { return 0; }
    });

    return (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Newspaper size={13} color="var(--gold)" />
                    <span style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>News Calendar</span>
                    {events.length > 0 && (
                        <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-dim)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: "99px", padding: "1px 7px" }}>
                            {events.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => fetchNews()}
                    disabled={loading}
                    style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", fontSize: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: "6px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Sora', sans-serif", opacity: loading ? 0.5 : 1 }}
                >
                    <RefreshCw size={10} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                    Refresh
                </button>
            </div>

            {!fetched && loading ? (
                <div style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                    Loading...
                </div>
            ) : error ? (
                <div style={{ padding: "16px", fontSize: "11px", color: "var(--rose)" }}>
                    Failed to load news: {error}
                </div>
            ) : events.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                    No high/medium impact events this week
                </div>
            ) : (
                <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                    {dateKeys.map((dateKey) => (
                        <div key={dateKey}>
                            <div style={{ padding: "6px 16px", fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                {(() => { try { return new Date(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return dateKey; } })()}
                            </div>
                            {grouped[dateKey].map((e, i) => {
                                const evtTime = parseEventTime(e);
                                const isPast = evtTime ? evtTime < now : false;
                                const isSoon = evtTime ? (!isPast && (evtTime.getTime() - now.getTime()) < 30 * 60 * 1000) : false;
                                return (
                                    <div key={i} style={{
                                        display: "flex", alignItems: "center", gap: "10px",
                                        padding: "8px 16px",
                                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                                        opacity: isPast ? 0.45 : 1,
                                        background: isSoon ? "rgba(248,113,113,0.04)" : "transparent",
                                    }}>
                                        <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: isSoon ? "var(--rose)" : "var(--text-muted)", width: "52px", flexShrink: 0 }}>
                                            {e.time}
                                        </span>
                                        <span style={{ fontSize: "13px", flexShrink: 0 }}>{CURRENCY_FLAG[e.country] ?? "🌐"}</span>
                                        <span style={{ fontSize: "10px", color: "var(--text-dim)", flexShrink: 0, width: "30px" }}>{e.country}</span>
                                        <div style={{
                                            width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                                            background: e.impact === "high" ? "var(--rose)" : "#f59e0b",
                                            boxShadow: e.impact === "high" ? "0 0 5px var(--rose)" : "0 0 5px #f59e0b",
                                        }} />
                                        <span style={{ fontSize: "11px", color: "#f0f4f8", flex: 1, lineHeight: 1.3 }}>{e.title}</span>
                                        {(e.forecast || e.previous) && (
                                            <div style={{ display: "flex", gap: "8px", flexShrink: 0, fontSize: "9px", fontFamily: "'JetBrains Mono', monospace" }}>
                                                {e.forecast && <span style={{ color: "var(--cyan)" }}>F: {e.forecast}</span>}
                                                {e.previous && <span style={{ color: "var(--text-dim)" }}>P: {e.previous}</span>}
                                            </div>
                                        )}
                                        {isSoon && (
                                            <span style={{ fontSize: "9px", color: "var(--rose)", fontWeight: 700, flexShrink: 0, padding: "2px 6px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "4px" }}>
                                                SOON
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default React.memo(NewsCalendar);
