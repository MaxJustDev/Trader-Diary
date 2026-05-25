"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMT5Store } from "@/lib/store";
import {
    LayoutDashboard,
    Users,
    Building2,
    TrendingUp,
    BarChart3,
    BookOpen,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";

const VERSION = "v0.2.2";

const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/accounts", label: "Accounts", icon: Users },
    { href: "/funds", label: "Funds", icon: Building2 },
    { href: "/trading", label: "Batch Trade", icon: TrendingUp },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const connected = useMT5Store((s) => s.connected);
    const accountInfo = useMT5Store((s) => s.accountInfo);

    useEffect(() => {
        const check = () => setCollapsed(window.innerWidth < 1024);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    const W = collapsed ? 58 : 220;

    return (
        <aside
            style={{
                background: "var(--bg-deep)",
                borderRight: "1px solid var(--border)",
                width: `${W}px`,
                minWidth: `${W}px`,
                transition: "width 260ms cubic-bezier(0.4, 0, 0.2, 1), min-width 260ms cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 20,
                overflow: "hidden",
            }}
        >
            {/* ── Logo Row ── */}
            <div
                style={{
                    height: "60px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: collapsed ? "center" : "space-between",
                    padding: collapsed ? "0 14px" : "0 14px 0 16px",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0,
                    gap: "8px",
                }}
            >
                {/* Logo mark */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, overflow: "hidden" }}>
                    <div
                        style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "7px",
                            background: "linear-gradient(140deg, #f0b429 0%, #b87714 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            boxShadow: "0 2px 12px rgba(240,180,41,0.3)",
                        }}
                    >
                        <BookOpen size={13} color="#07090f" />
                    </div>

                    {!collapsed && (
                        <div style={{ overflow: "hidden" }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#edf2f7", letterSpacing: "0.01em", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                                TraderDiary
                            </div>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "1px" }}>
                                MT5 Manager
                            </div>
                        </div>
                    )}
                </div>

                {/* Collapse toggle — always visible */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        transition: "color 150ms, background 150ms",
                    }}
                    onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.color = "var(--gold)";
                        el.style.background = "rgba(240,180,41,0.08)";
                    }}
                    onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.color = "var(--text-muted)";
                        el.style.background = "transparent";
                    }}
                    title={collapsed ? "Expand" : "Collapse"}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>
            </div>

            {/* ── Nav ── */}
            <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto", overflowX: "hidden" }}>
                {/* Section label */}
                {!collapsed && (
                    <div style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--text-dim)",
                        padding: "8px 8px 6px",
                    }}>
                        Menu
                    </div>
                )}

                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            title={collapsed ? label : undefined}
                            aria-label={collapsed ? label : undefined}
                            style={{ display: "block", marginBottom: "2px", textDecoration: "none" }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 10px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    justifyContent: collapsed ? "center" : "flex-start",
                                    background: active ? "rgba(240,180,41,0.08)" : "transparent",
                                    borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
                                    transition: "background 150ms, border-color 150ms",
                                    position: "relative",
                                }}
                                onMouseEnter={(e) => {
                                    if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.035)";
                                }}
                                onMouseLeave={(e) => {
                                    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                                }}
                            >
                                <Icon
                                    size={15}
                                    style={{
                                        color: active ? "var(--gold)" : "var(--text-muted)",
                                        flexShrink: 0,
                                        filter: active ? "drop-shadow(0 0 4px rgba(240,180,41,0.5))" : "none",
                                        transition: "color 150ms, filter 150ms",
                                    }}
                                />
                                {!collapsed && (
                                    <span
                                        style={{
                                            fontSize: "13px",
                                            fontWeight: active ? 600 : 400,
                                            color: active ? "var(--gold)" : "var(--text-muted)",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            transition: "color 150ms",
                                            letterSpacing: "0.01em",
                                        }}
                                    >
                                        {label}
                                    </span>
                                )}

                                {/* Active pip when collapsed */}
                                {active && collapsed && (
                                    <div style={{
                                        position: "absolute",
                                        left: 0,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        width: "2px",
                                        height: "16px",
                                        background: "var(--gold)",
                                        borderRadius: "0 2px 2px 0",
                                        boxShadow: "2px 0 6px rgba(240,180,41,0.4)",
                                    }} />
                                )}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* ── Footer ── */}
            <div
                style={{
                    borderTop: "1px solid var(--border)",
                    padding: "12px 12px 14px",
                    flexShrink: 0,
                }}
            >
                {/* MT5 status */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: collapsed ? "center" : "flex-start",
                        marginBottom: collapsed ? 0 : "6px",
                    }}
                    title={connected ? `MT5 Live${accountInfo ? `: ${accountInfo.login}` : ""}` : "MT5 Offline"}
                >
                    {connected ? (
                        <>
                            <div className="live-dot" style={{ width: "6px", height: "6px" }} />
                            {!collapsed && (
                                <div style={{ minWidth: 0, overflow: "hidden" }}>
                                    <div style={{ fontSize: "11px", color: "var(--emerald)", fontWeight: 600, lineHeight: 1.3 }}>
                                        MT5 Live
                                    </div>
                                    {accountInfo && (
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {accountInfo.login}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#1e2a3a", flexShrink: 0 }} />
                            {!collapsed && (
                                <div style={{ fontSize: "11px", color: "#2d3748" }}>MT5 Offline</div>
                            )}
                        </>
                    )}
                </div>

                {!collapsed && (
                    <div style={{ fontSize: "9px", color: "#1e2a3a", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", marginTop: "4px" }}>
                        {VERSION}
                    </div>
                )}
            </div>
        </aside>
    );
}
