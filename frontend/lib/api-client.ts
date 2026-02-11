import { Fund, Account, FundTemplate, FundAccountAnalytics } from "./types";

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
        getAll: () => this.request<Account[]>("/api/accounts"),
        getById: (id: number) => this.request<Account>(`/api/accounts/${id}`),
        create: (data: any) =>
            this.request<Account>("/api/accounts", {
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
    };

    // Funds API
    funds = {
        getAll: () => this.request<Fund[]>("/api/funds"),
        getTemplates: () =>
            this.request<{ templates: Record<string, FundTemplate> }>("/api/funds/templates"),
        createFromTemplate: (templateKey: string) =>
            this.request<Fund>("/api/funds/from-template", {
                method: "POST",
                body: JSON.stringify({ template_key: templateKey }),
            }),
        create: (data: any) =>
            this.request<Fund>("/api/funds", {
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
        getEquityCurve: () => this.request<any>("/api/analytics/equity-curve"),
        getTradeHistory: () => this.request<any>("/api/analytics/trade-history"),
    };
}

export const apiClient = new ApiClient(API_BASE_URL);
