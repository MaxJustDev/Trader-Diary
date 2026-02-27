import { create } from 'zustand';
import { Account, MT5AccountInfo, MT5Position, EquityDataPoint } from './types';

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
