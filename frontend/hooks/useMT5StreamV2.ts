"use client";

import { useEffect, useRef } from "react";
import { useMT5StreamsV2 } from "@/lib/store";
import type { MT5StreamV2Message } from "@/lib/types";

const WS_URL =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(
        /^http/,
        "ws",
    ) + "/api/mt5/v2/stream";

const RECONNECT_DELAY_MS = 3000;

/**
 * Subscribes once to the multi-account v2 WebSocket and dispatches each
 * tick / health / status frame to `useMT5StreamsV2`.
 *
 * Call from a single layout-level provider — calling it from multiple
 * components would open multiple sockets.
 */
export function useMT5StreamV2() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closed = useRef(false);

    const setActiveAccountIds = useMT5StreamsV2((s) => s.setActiveAccountIds);
    const applyTick = useMT5StreamsV2((s) => s.applyTick);
    const applyHealth = useMT5StreamsV2((s) => s.applyHealth);

    useEffect(() => {
        closed.current = false;
        connect();
        return () => {
            closed.current = true;
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function connect() {
        cleanup();
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as MT5StreamV2Message;
                if (msg.event === "status") {
                    setActiveAccountIds(msg.data.active_account_ids);
                } else if (msg.event === "tick") {
                    applyTick(
                        msg.account_db_id,
                        msg.data.account_info,
                        msg.data.positions,
                        msg.data.ts,
                    );
                } else if (msg.event === "health") {
                    const state = msg.data.state;
                    if (state === "exited") {
                        applyHealth(msg.account_db_id, "exited");
                    } else if (state === "ready" || state === "recovered") {
                        applyHealth(msg.account_db_id, "ready");
                    } else if (state === "disconnected" || state === "reconnecting") {
                        applyHealth(msg.account_db_id, state);
                    } else if (state === "bootstrap_failed") {
                        applyHealth(msg.account_db_id, "bootstrap_failed");
                    }
                }
            } catch {
                // ignore malformed frames
            }
        };

        ws.onclose = () => {
            if (closed.current) return;
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        };

        ws.onerror = () => {
            try {
                ws.close();
            } catch {
                // ignore
            }
        };
    }

    function cleanup() {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
        if (wsRef.current) {
            wsRef.current.onclose = null;
            try {
                wsRef.current.close();
            } catch {
                // ignore
            }
            wsRef.current = null;
        }
    }
}
