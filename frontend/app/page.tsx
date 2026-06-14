"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { FundAccountAnalytics } from "@/lib/types";
import Link from "next/link";
import { Users, Building2, TrendingUp, BarChart3, AlertTriangle, ArrowUpRight, Clock } from "lucide-react";

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmt2(v?: number | null) {
  return v != null
    ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "20px 22px",
  position: "relative",
  overflow: "hidden",
  transition: "border-color 200ms, background 200ms",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fundAccounts, setFundAccounts] = useState<FundAccountAnalytics[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    const isAborted = () => ac.signal.aborted;

    (async () => {
      try {
        const [summaryData, accountsData, fundData, tradeData] = await Promise.all([
          apiClient.analytics.getSummary().catch(() => null),
          apiClient.accounts.getAll().catch(() => []),
          apiClient.analytics.getFundStatus().catch(() => ({ accounts: [] })),
          apiClient.analytics.getTradeHistory().catch(() => ({ trades: [] })),
        ]);
        if (isAborted()) return;
        setStats(summaryData);
        setAccounts(accountsData);
        setFundAccounts(fundData.accounts);
        setRecentTrades((tradeData.trades ?? []).slice(0, 6));
      } catch (error) {
        if (isAborted()) return;
        console.error("Failed to load dashboard data:", error);
      } finally {
        if (isAborted()) return;
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  const warnings = fundAccounts.filter(
    (a) => a.daily_status !== "ok" || a.max_dd_status !== "ok" || a.locked
  );

  const totalPnl = stats?.total_profit ?? 0;

  if (loading) {
    return (
      <div className="page-enter" style={{ padding: "32px 36px" }}>
        <div style={{ marginBottom: "32px" }}>
          <div className="shimmer" style={{ width: "160px", height: "11px", borderRadius: "6px", marginBottom: "10px" }} />
          <div className="shimmer" style={{ width: "340px", height: "28px", borderRadius: "8px" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="shimmer" style={{ height: "108px", borderRadius: "14px" }} />
          ))}
        </div>
        <div className="shimmer" style={{ height: "220px", borderRadius: "14px" }} />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ padding: "clamp(16px, 3vw, 36px)" }}>

      {/* ── Journal Header ── */}
      <div style={{ marginBottom: "32px" }}>
        <div className="section-label" style={{ marginBottom: "6px" }}>Trading Journal</div>
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 700,
            color: "#f0f4f8",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {formatDate()}
        </h1>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
          {accounts.length} account{accounts.length !== 1 ? "s" : ""} tracked
          {warnings.length > 0 && (
            <span style={{ color: "var(--rose)", marginLeft: "12px" }}>
              · {warnings.length} need{warnings.length === 1 ? "s" : ""} attention
            </span>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div
        className="stagger"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "24px" }}
      >
        {/* Accounts */}
        <div className="animate-fade-up" style={card}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--gold), transparent)" }} />
          <div className="section-label" style={{ marginBottom: "10px" }}>Accounts</div>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#f0f4f8", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {accounts.length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
            {accounts.filter(a => a.account_type === "fund").length} funded
          </div>
        </div>

        {/* Fund accounts */}
        <div className="animate-fade-up" style={card}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--purple), transparent)" }} />
          <div className="section-label" style={{ marginBottom: "10px" }}>Prop Accounts</div>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "var(--purple)", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {accounts.filter(a => a.account_type === "fund").length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
            {fundAccounts.filter(a => a.locked).length} locked
          </div>
        </div>

        {/* Balance */}
        <div className="animate-fade-up" style={card}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--emerald), transparent)" }} />
          <div className="section-label" style={{ marginBottom: "10px" }}>Total Balance</div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--emerald)", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            ${stats?.total_balance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>across all accounts</div>
        </div>

        {/* P&L */}
        <div className="animate-fade-up" style={card}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "2px",
            background: `linear-gradient(90deg, ${totalPnl >= 0 ? "var(--emerald)" : "var(--rose)"}, transparent)`
          }} />
          <div className="section-label" style={{ marginBottom: "10px" }}>Floating P&L</div>
          <div style={{
            fontSize: "26px", fontWeight: 700, lineHeight: 1,
            color: totalPnl >= 0 ? "var(--emerald)" : "var(--rose)",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {totalPnl >= 0 ? "+" : ""}${fmt2(totalPnl)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>open positions</div>
        </div>
      </div>

      {/* ── Warnings ── */}
      {warnings.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <AlertTriangle size={14} style={{ color: "var(--rose)" }} />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--rose)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Accounts Needing Attention
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {warnings.map((a) => (
              <div
                key={a.account_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: a.locked ? "rgba(248,113,113,0.06)" : "rgba(251,191,36,0.05)",
                  border: `1px solid ${a.locked ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.18)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                    background: a.locked ? "var(--rose)" : "var(--amber)",
                  }} />
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8", fontFamily: "'JetBrains Mono', monospace" }}>
                      {a.account_login}
                    </span>
                    {a.fund_name && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                        {a.fund_name} · {a.current_phase}
                      </span>
                    )}
                    <p style={{ fontSize: "11px", color: a.locked ? "var(--rose)" : "var(--amber)", margin: "2px 0 0" }}>
                      {a.locked
                        ? `Locked: ${a.violations.join(", ")}`
                        : [
                            a.daily_status !== "ok" && `Daily DD ${a.daily_loss_pct.toFixed(1)}% / ${a.daily_drawdown_limit}%`,
                            a.max_dd_status !== "ok" && `Max DD ${a.max_loss_pct.toFixed(1)}% / ${a.max_drawdown_limit}%`,
                          ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <Link
                  href="/analytics"
                  style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px", textDecoration: "none" }}
                >
                  View <ArrowUpRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Two Column: Quick Actions + Payouts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {/* Quick Actions */}
        <div style={card}>
          <div className="section-label" style={{ marginBottom: "14px" }}>Navigate</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              { href: "/accounts", label: "Accounts", icon: Users, color: "var(--cyan)" },
              { href: "/funds", label: "Funds", icon: Building2, color: "var(--purple)" },
              { href: "/trading", label: "Batch Trade", icon: TrendingUp, color: "var(--emerald)" },
              { href: "/analytics", label: "Analytics", icon: BarChart3, color: "var(--gold)" },
            ].map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    cursor: "pointer",
                    transition: "background 150ms, border-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  }}
                >
                  <Icon size={14} style={{ color, flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-soft)" }}>{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Payouts */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
            <Clock size={12} style={{ color: "var(--text-muted)" }} />
            <div className="section-label">Upcoming Payouts</div>
          </div>
          {fundAccounts.some(a => a.next_payout_date) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {fundAccounts
                .filter(a => a.next_payout_date)
                .sort((a, b) => (a.next_payout_date ?? "").localeCompare(b.next_payout_date ?? ""))
                .slice(0, 4)
                .map(a => {
                  const days = daysUntil(a.next_payout_date);
                  const urgent = days != null && days <= 7;
                  return (
                    <div
                      key={a.account_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: urgent ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.025)",
                        border: `1px solid ${urgent ? "rgba(251,191,36,0.2)" : "var(--border)"}`,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#f0f4f8", fontFamily: "'JetBrains Mono', monospace" }}>
                          {a.account_login}
                        </span>
                        {a.fund_name && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "6px" }}>{a.fund_name}</span>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: urgent ? "var(--amber)" : "#f0f4f8", fontFamily: "'JetBrains Mono', monospace" }}>
                          {days != null ? (days <= 0 ? "Today!" : `${days}d`) : a.next_payout_date}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{a.next_payout_date}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", paddingTop: "4px" }}>
              No payout dates configured
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Trades ── */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div className="section-label">Recent Trades</div>
          <Link
            href="/analytics"
            style={{ fontSize: "11px", color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}
          >
            View all <ArrowUpRight size={11} />
          </Link>
        </div>
        {recentTrades.length === 0 ? (
          <div
            style={{
              ...card,
              padding: "36px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "13px",
            }}
          >
            No trades recorded yet — execute batch orders to see history
            <Link
              href="/trading"
              style={{
                display: "inline-block",
                marginTop: 12,
                padding: "8px 16px",
                borderRadius: 6,
                background: "var(--gold-dim)",
                color: "var(--gold)",
                border: "1px solid var(--gold)",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Execute first batch
            </Link>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Time", "Account", "Symbol", "Dir", "Lot", "Risk", "Status"].map((h, i) => (
                    <th key={h} className="th-diary" style={{ textAlign: i >= 4 ? "right" : "left", paddingLeft: i === 0 ? "20px" : undefined, paddingRight: i === 6 ? "20px" : undefined }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t: any) => (
                  <tr key={t.id} style={{ transition: "background 100ms" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td className="td-diary" style={{ paddingLeft: "20px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.executed_at ? new Date(t.executed_at).toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className="td-diary">
                      <span style={{ fontSize: "12px", color: "var(--text-soft)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.account_login}
                      </span>
                    </td>
                    <td className="td-diary">
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8", fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.symbol}
                      </span>
                    </td>
                    <td className="td-diary">
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: "99px",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          background: t.direction === "BUY" ? "var(--emerald-dim)" : "var(--rose-dim)",
                          color: t.direction === "BUY" ? "var(--emerald)" : "var(--rose)",
                          border: `1px solid ${t.direction === "BUY" ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                        }}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="td-diary" style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-soft)" }}>
                        {t.lot_size}
                      </span>
                    </td>
                    <td className="td-diary" style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: "var(--rose)" }}>
                        ${fmt2(t.risk_amount)}
                      </span>
                    </td>
                    <td className="td-diary" style={{ textAlign: "right", paddingRight: "20px" }}>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: t.success ? "var(--emerald)" : "var(--rose)",
                      }}>
                        {t.success ? "OK" : "Fail"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Accounts Overview ── */}
      {accounts.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div className="section-label">All Accounts</div>
            <Link
              href="/accounts"
              style={{ fontSize: "11px", color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}
            >
              Manage <ArrowUpRight size={11} />
            </Link>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Account ID", "Server", "Type", "Phase", "Balance", "Profit"].map((h, i) => (
                    <th key={h} className="th-diary" style={{ textAlign: i >= 4 ? "right" : "left", paddingLeft: i === 0 ? "20px" : undefined, paddingRight: i === 5 ? "20px" : undefined }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.slice(0, 8).map((a) => {
                  const profit = a.profit ?? 0;
                  return (
                    <tr
                      key={a.id}
                      style={{ transition: "background 100ms" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <td className="td-diary" style={{ paddingLeft: "20px" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 600, color: "#f0f4f8" }}>
                          {a.account_id}
                        </span>
                      </td>
                      <td className="td-diary">
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{a.server}</span>
                      </td>
                      <td className="td-diary">
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 8px",
                            borderRadius: "99px",
                            fontSize: "10px",
                            fontWeight: 500,
                            background: a.account_type === "fund" ? "var(--purple-dim)" : "rgba(255,255,255,0.05)",
                            color: a.account_type === "fund" ? "var(--purple)" : "var(--text-muted)",
                            border: `1px solid ${a.account_type === "fund" ? "rgba(167,139,250,0.25)" : "transparent"}`,
                          }}
                        >
                          {a.account_type === "fund" ? "Fund" : "Personal"}
                        </span>
                      </td>
                      <td className="td-diary">
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{a.current_phase || "—"}</span>
                      </td>
                      <td className="td-diary" style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-soft)" }}>
                          {a.balance != null ? `$${fmt2(a.balance)}` : "—"}
                        </span>
                      </td>
                      <td className="td-diary" style={{ textAlign: "right", paddingRight: "20px" }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "12px",
                          color: profit > 0 ? "var(--emerald)" : profit < 0 ? "var(--rose)" : "var(--text-muted)",
                        }}>
                          {profit >= 0 ? "+" : ""}{fmt2(profit)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {accounts.length > 8 && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                <Link
                  href="/accounts"
                  style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}
                >
                  View all {accounts.length} accounts →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {accounts.length === 0 && !loading && (
        <div
          style={{
            ...card,
            padding: "56px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📒</div>
          <p style={{ fontSize: "15px", color: "var(--text-soft)", marginBottom: "8px", fontWeight: 500 }}>
            Your diary is empty
          </p>
          <Link
            href="/accounts"
            style={{ fontSize: "13px", color: "var(--gold)", textDecoration: "none" }}
          >
            Add your first MT5 account →
          </Link>
        </div>
      )}
    </div>
  );
}
