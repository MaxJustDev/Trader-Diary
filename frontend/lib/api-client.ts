import { Fund, Account, FundAccountAnalytics } from "./types";

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// API client class
class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        endpoint: string,
        options?: RequestInit
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: "Request failed" }));
            throw new Error(error.detail || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    // Accounts API
    accounts = {
        getAll: () => this.request<Account[]>("/api/accounts/"),
        getById: (id: number) => this.request<Account>(`/api/accounts/${id}`),
        create: (data: any) =>
            this.request<Account>("/api/accounts/", {
                method: "POST",
                body: JSON.stringify(data),
            }),
        update: (id: number, data: any) =>
            this.request<Account>(`/api/accounts/${id}`, {
                method: "PUT",
                body: JSON.stringify(data),
            }),
        delete: (id: number) =>
            this.request<any>(`/api/accounts/${id}`, {
                method: "DELETE",
            }),
        refreshAll: () =>
            this.request<any>("/api/accounts/refresh-all", {
                method: "POST",
            }),
        advancePhase: (id: number) =>
            this.request<any>(`/api/accounts/${id}/advance-phase`, {
                method: "POST",
            }),
    };

    // Funds API
    funds = {
        getAll: () => this.request<Fund[]>("/api/funds/"),
        refreshTemplates: () =>
            this.request<{ updated: string[] }>("/api/funds/refresh-templates", {
                method: "POST",
            }),
        create: (data: any) =>
            this.request<Fund>("/api/funds/", {
                method: "POST",
                body: JSON.stringify(data),
            }),
        delete: (id: number) =>
            this.request<any>(`/api/funds/${id}`, {
                method: "DELETE",
            }),
    };

    // MT5 API
    mt5 = {
        connect: (accountId: number) =>
            this.request<any>("/api/mt5/connect", {
                method: "POST",
                body: JSON.stringify({ account_id: accountId }),
            }),
        disconnect: () =>
            this.request<any>("/api/mt5/disconnect", {
                method: "POST",
            }),
        getStatus: () => this.request<any>("/api/mt5/status"),
        closePosition: (ticket: number) =>
            this.request<any>("/api/mt5/close-position", {
                method: "POST",
                body: JSON.stringify({ ticket }),
            }),
        closeAllPositions: () =>
            this.request<any>("/api/mt5/close-all-positions", {
                method: "POST",
            }),
        modifyPosition: (ticket: number, sl: number, tp: number) =>
            this.request<any>("/api/mt5/modify-position", {
                method: "POST",
                body: JSON.stringify({ ticket, sl, tp }),
            }),
        partialClose: (ticket: number, volume: number) =>
            this.request<any>("/api/mt5/partial-close", {
                method: "POST",
                body: JSON.stringify({ ticket, volume }),
            }),
        getRiskStatus: () =>
            this.request<{
                equity: number; balance: number; starting_balance: number; daily_starting: number;
                daily_loss_pct: number; daily_dd_limit: number;
                max_loss_pct: number; max_dd_limit: number;
            }>("/api/mt5/risk-status"),
        searchSymbols: (search: string) =>
            this.request<string[]>(`/api/mt5/symbols?search=${encodeURIComponent(search)}`),
        getHistory: (days = 30) =>
            this.request<any[]>(`/api/mt5/history?days=${days}`),
        getServerTime: () =>
            this.request<{ server_time: string | null; local_time: string; offset_seconds: number }>("/api/mt5/server-time"),
        setTrailingStop: (ticket: number, trail_pips: number) =>
            this.request<any>("/api/mt5/trailing-stop/set", {
                method: "POST",
                body: JSON.stringify({ ticket, trail_pips }),
            }),
        removeTrailingStop: (ticket: number) =>
            this.request<any>(`/api/mt5/trailing-stop/${ticket}`, { method: "DELETE" }),
        getTrailingStops: () =>
            this.request<any[]>("/api/mt5/trailing-stop/list"),
    };

    // Trading API
    trading = {
        checkSymbol: (request: any) =>
            this.request<any>("/api/trading/check-symbol", {
                method: "POST",
                body: JSON.stringify(request),
            }),
        calculatePosition: (request: any) =>
            this.request<any>("/api/trading/calculate-position", {
                method: "POST",
                body: JSON.stringify(request),
            }),
        executeBatch: (request: any) =>
            this.request<any>("/api/trading/execute-batch", {
                method: "POST",
                body: JSON.stringify(request),
            }),
    };

    // Analytics API
    analytics = {
        getSummary: () => this.request<any>("/api/analytics/summary"),
        getFundStatus: () =>
            this.request<{ accounts: FundAccountAnalytics[] }>("/api/analytics/fund-status"),
        updateAccountAnalytics: (id: number, data: { next_payout_date?: string; starting_balance?: number }) =>
            this.request<any>(`/api/analytics/account/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        getEquityCurve: (accountId?: number) =>
            this.request<any>(`/api/analytics/equity-curve${accountId != null ? `?account_id=${accountId}` : ""}`),
        getTradeHistory: (accountId?: number) =>
            this.request<any>(`/api/analytics/trade-history${accountId != null ? `?account_id=${accountId}` : ""}`),
        getJournal: (accountId?: number, days: number = 90) => {
            const params = new URLSearchParams({ days: String(days) });
            if (accountId != null) params.set("account_id", String(accountId));
            return this.request<any>(`/api/analytics/journal?${params}`);
        },
        updateTradeNote: (tradeId: number, notes: string) =>
            this.request<any>(`/api/analytics/trade/${tradeId}/note`, {
                method: "PATCH",
                body: JSON.stringify({ notes }),
            }),
        updateTradeTags: (tradeId: number, tags: string) =>
            this.request<any>(`/api/analytics/trade/${tradeId}/tags`, {
                method: "PATCH",
                body: JSON.stringify({ tags }),
            }),
        syncRealizedPnl: () =>
            this.request<{ synced: number; total_pending: number; message?: string }>("/api/analytics/sync-realized-pnl", {
                method: "POST",
            }),
    };

    // News API
    news = {
        getCalendar: (signal?: AbortSignal) =>
            this.request<{ events: any[]; cached: boolean; error?: string }>("/api/news/calendar", { signal }),
    };

    // System API
    system = {
        backup: () => `${this.baseUrl}/api/system/backup`,
        restore: async (file: File) => {
            const form = new FormData();
            form.append("file", file);
            const resp = await fetch(`${this.baseUrl}/api/system/restore`, {
                method: "POST",
                body: form,
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: "Restore failed" }));
                throw new Error(err.detail || "Restore failed");
            }
            return resp.json();
        },
    };
}

export const apiClient = new ApiClient(API_BASE_URL);
