"use client";

import { useEffect } from "react";
import { useMT5Stream } from "@/hooks/useMT5Stream";
import { useMT5Store } from "@/lib/store";
import { apiClient } from "@/lib/api-client";

/**
 * Mounts the WebSocket stream at layout level so it persists across page navigation.
 * Also polls /status every 30s to recover from backend restarts.
 */
export default function StreamProvider({ children }: { children: React.ReactNode }) {
    useMT5Stream();

    const setConnected = useMT5Store((s) => s.setConnected);
    const setConnectedAccountId = useMT5Store((s) => s.setConnectedAccountId);
    const reset = useMT5Store((s) => s.reset);

    // Poll connection status every 30s for recovery after backend restart
    useEffect(() => {
        const poll = async () => {
            try {
                const status = await apiClient.mt5.getStatus();
                const store = useMT5Store.getState();

                if (status.connected !== store.connected) {
                    setConnected(status.connected);
                    setConnectedAccountId(status.account_id ?? null);
                    if (!status.connected) reset();
                } else if (status.connected && status.account_id !== store.connectedAccountId) {
                    setConnectedAccountId(status.account_id ?? null);
                }
            } catch {
                // Backend offline — don't change state to avoid flicker
            }
        };

        poll(); // initial check
        const interval = setInterval(poll, 30_000);
        return () => clearInterval(interval);
    }, []);

    return <>{children}</>;
}
