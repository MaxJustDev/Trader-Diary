"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMT5Store } from "@/lib/store";
import {
    LayoutDashboard,
    Users,
    Building2,
    TrendingUp,
    BarChart3,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

const VERSION = "v0.1.0";

const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/accounts", label: "Accounts", icon: Users },
    { href: "/funds", label: "Funds", icon: Building2 },
    { href: "/trading", label: "Batch Trading", icon: TrendingUp },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const connected = useMT5Store((s) => s.connected);
    const accountInfo = useMT5Store((s) => s.accountInfo);

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    return (
        <aside
            className={`bg-[#0b0f18] border-r border-white/[0.06] flex flex-col transition-all duration-300 ${
                collapsed ? "w-16" : "w-64"
            }`}
        >
            {/* Logo + collapse toggle */}
            <div className={`flex items-center p-4 ${collapsed ? "justify-center" : "justify-between"}`}>
                {!collapsed && (
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            TraderDiary
                        </h1>
                        <p className="text-xs text-slate-500">MT5 Account Manager</p>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors"
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <ChevronLeft className="w-4 h-4" />
                    )}
                </button>
            </div>

            {/* Navigation */}
            <nav className="px-2 flex-1">
                <ul className="space-y-1">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                        const active = isActive(href);
                        return (
                            <li key={href}>
                                <Link
                                    href={href}
                                    title={collapsed ? label : undefined}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                        active
                                            ? "bg-blue-500/[0.15] text-blue-400 border-l-2 border-blue-500"
                                            : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]"
                                    } ${collapsed ? "justify-center" : ""}`}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    {!collapsed && <span className="text-sm">{label}</span>}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* MT5 status + version footer */}
            <div className={`p-3 border-t border-white/[0.06] space-y-1 ${collapsed ? "items-center flex flex-col" : ""}`}>
                {connected ? (
                    <div
                        className={`flex items-center gap-2 ${collapsed ? "justify-center" : "px-1"}`}
                        title={collapsed ? `MT5 Live: ${accountInfo?.login ?? ""}` : undefined}
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]" />
                        {!collapsed && (
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-emerald-400 truncate">MT5 Live</p>
                                {accountInfo && (
                                    <p className="text-xs text-slate-500 truncate font-mono">{accountInfo.login}</p>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        className={`flex items-center gap-2 ${collapsed ? "justify-center" : "px-1"}`}
                        title={collapsed ? "MT5 Offline" : undefined}
                    >
                        <span className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
                        {!collapsed && <p className="text-xs text-slate-500">MT5 Offline</p>}
                    </div>
                )}
                {!collapsed && <p className="text-xs text-slate-600 text-center">{VERSION}</p>}
            </div>
        </aside>
    );
}
