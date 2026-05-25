import { create } from 'zustand';
import { Account, MT5AccountInfo, MT5Position, EquityDataPoint, AccountStreamState } from './types';

interface AccountStore {
    accounts: Account[];
    selectedAccount: Account | null;
    setAccounts: (accounts: Account[]) => void;
    setSelectedAccount: (account: Account | null) => void;
    addAccount: (account: Account) => void;
    removeAccount: (id: number) => void;
    updateAccount: (id: number, data: Partial<Account>) => void;
}

export const useAccountStore = create<AccountStore>((set) => ({
    accounts: [],
    selectedAccount: null,
    setAccounts: (accounts) => set({ accounts }),
    setSelectedAccount: (account) => set({ selectedAccount: account }),
    addAccount: (account) => set((state) => ({
        accounts: [...state.accounts, account]
    })),
    removeAccount: (id) => set((state) => ({
        accounts: state.accounts.filter(a => a.id !== id)
    })),
    updateAccount: (id, data) => set((state) => ({
        accounts: state.accounts.map(a => a.id === id ? { ...a, ...data } : a),
    })),
}));

const MAX_EQUITY_POINTS = 300;

interface MT5State {
    connected: boolean;
    connectedAccountId: number | null;
    accountInfo: MT5AccountInfo | null;
    positions: MT5Position[];
    equityHistory: EquityDataPoint[];
    setConnected: (connected: boolean) => void;
    setConnectedAccountId: (id: number | null) => void;
    setAccountInfo: (info: MT5AccountInfo | null) => void;
    setPositions: (positions: MT5Position[]) => void;
    addEquityPoint: (point: EquityDataPoint) => void;
    clearEquityHistory: () => void;
    reset: () => void;
}

export const useMT5Store = create<MT5State>((set) => ({
    connected: false,
    connectedAccountId: null,
    accountInfo: null,
    positions: [],
    equityHistory: [],
    setConnected: (connected) => set({ connected }),
    setConnectedAccountId: (id) => set({ connectedAccountId: id }),
    setAccountInfo: (info) => set({ accountInfo: info }),
    setPositions: (positions) => set({ positions }),
    addEquityPoint: (point) =>
        set((state) => ({
            equityHistory: [...state.equityHistory, point].slice(-MAX_EQUITY_POINTS),
        })),
    clearEquityHistory: () => set({ equityHistory: [] }),
    reset: () =>
        set({
            accountInfo: null,
            positions: [],
            equityHistory: [],
        }),
}));

// ─── Multi-account live state (Batch F Phase 3) ───────────────────────────────
// One entry per active worker process. Updated by useMT5StreamV2 from the
// `/api/mt5/v2/stream` WebSocket. Components subscribe to a single account's
// slice via `useMT5StreamsV2((s) => s.streams.get(accountDbId))`.

interface MT5StreamsV2State {
    streams: Map<number, AccountStreamState>;
    activeAccountIds: number[];

    setActiveAccountIds: (ids: number[]) => void;
    applyTick: (accountDbId: number, info: MT5AccountInfo | null, positions: MT5Position[], ts: string) => void;
    applyHealth: (accountDbId: number, state: AccountStreamState['health']) => void;
    removeStream: (accountDbId: number) => void;
    clearAll: () => void;
}

export const useMT5StreamsV2 = create<MT5StreamsV2State>((set) => ({
    streams: new Map(),
    activeAccountIds: [],

    setActiveAccountIds: (ids) =>
        set((state) => {
            const next = new Map(state.streams);
            // Drop streams that are no longer active.
            for (const key of next.keys()) {
                if (!ids.includes(key)) next.delete(key);
            }
            // Make sure each active id has an entry so UI can render "waiting"
            // before first tick arrives.
            for (const id of ids) {
                if (!next.has(id)) {
                    next.set(id, {
                        account_db_id: id,
                        accountInfo: null,
                        positions: [],
                        equityHistory: [],
                        lastTickAt: 0,
                        health: 'unknown',
                    });
                }
            }
            return { streams: next, activeAccountIds: [...ids] };
        }),

    applyTick: (accountDbId, info, positions, ts) =>
        set((state) => {
            const next = new Map(state.streams);
            const prev = next.get(accountDbId) ?? {
                account_db_id: accountDbId,
                accountInfo: null,
                positions: [],
                equityHistory: [],
                lastTickAt: 0,
                health: 'ready' as const,
            };
            const equityHistory = info
                ? [
                      ...prev.equityHistory,
                      {
                          time: new Date(ts).toLocaleTimeString(),
                          balance: info.balance,
                          equity: info.equity,
                      },
                  ].slice(-MAX_EQUITY_POINTS)
                : prev.equityHistory;

            next.set(accountDbId, {
                ...prev,
                accountInfo: info,
                positions,
                equityHistory,
                lastTickAt: Date.now(),
                health: prev.health === 'unknown' ? 'ready' : prev.health,
            });
            return { streams: next };
        }),

    applyHealth: (accountDbId, healthState) =>
        set((state) => {
            const next = new Map(state.streams);
            const prev = next.get(accountDbId) ?? {
                account_db_id: accountDbId,
                accountInfo: null,
                positions: [],
                equityHistory: [],
                lastTickAt: 0,
                health: 'unknown' as const,
            };
            next.set(accountDbId, { ...prev, health: healthState });
            return { streams: next };
        }),

    removeStream: (accountDbId) =>
        set((state) => {
            const next = new Map(state.streams);
            next.delete(accountDbId);
            return {
                streams: next,
                activeAccountIds: state.activeAccountIds.filter((id) => id !== accountDbId),
            };
        }),

    clearAll: () => set({ streams: new Map(), activeAccountIds: [] }),
}));
