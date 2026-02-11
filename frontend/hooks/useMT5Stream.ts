"use client";

import { useEffect, useRef } from "react";
import { useMT5Store } from "@/lib/store";
import { MT5StreamMessage } from "@/lib/types";

const WS_URL =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(
        /^http/,
        "ws"
    ) + "/api/mt5/stream";

const RECONNECT_DELAY = 3000;

export function useMT5Stream() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connected = useMT5Store((s) => s.connected);
    const connectedAccountId = useMT5Store((s) => s.connectedAccountId);
    const setAccountInfo = useMT5Store((s) => s.setAccountInfo);
    const setPositions = useMT5Store((s) => s.setPositions);
    const addEquityPoint = useMT5Store((s) => s.addEquityPoint);

    useEffect(() => {
        if (!connected || !connectedAccountId) {
            // Clean up if we disconnect
            cleanup();
            return;
        }

        connect();

        return () => {
            cleanup();
        };
    }, [connected, connectedAccountId]);

    function connect() {
        cleanup();

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg: MT5StreamMessage = JSON.parse(event.data);
                if (msg.type !== "update") return;

                if (msg.account_info) {
                    setAccountInfo(msg.account_info);
                    addEquityPoint({
                        time: new Date(msg.timestamp).toLocaleTimeString(),
                        balance: msg.account_info.balance,
                        equity: msg.account_info.equity,
                    });
                }

                setPositions(msg.positions ?? []);
            } catch {
                // ignore malformed messages
            }
        };

        ws.onclose = () => {
            // Auto-reconnect if still connected
            const state = useMT5Store.getState();
            if (state.connected && state.connectedAccountId) {
                reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
            }
        };

        ws.onerror = () => {
            ws.close();
        };
    }

    function cleanup() {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
        if (wsRef.current) {
            wsRef.current.onclose = null; // prevent reconnect on intentional close
            wsRef.current.close();
            wsRef.current = null;
        }
    }
}
