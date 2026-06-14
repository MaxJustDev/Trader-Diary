"""Centralized constants and tunables for the backend."""

import os
import sys

# WebSocket stream loop
WS_TICK_INTERVAL_SECONDS = 1.0
SNAPSHOT_INTERVAL_SECONDS = 60
TRAIL_CHECK_INTERVAL_SECONDS = 5
WS_RECONNECT_FAILURE_THRESHOLD = 3

# MT5
MT5_INIT_RETRIES = 3

# Trading
DEFAULT_ORDER_DEVIATION = 20
DEFAULT_MAGIC = 234000

# ── MT5 bridge (Linux/Wine) ──────────────────────────────────────────────────
# On non-Windows the app talks to a bridge server (running under Wine) that
# hosts the native MetaTrader5 module. Override the backend explicitly with
# TRADERDIARY_MT5_BACKEND=native|bridge (used by tests).
MT5_BRIDGE_HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
MT5_BRIDGE_PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))


def default_max_active_accounts():
    """Max simultaneously-active accounts. Linux/Wine is RAM-bound to 1."""
    env = os.getenv("MAX_ACTIVE_ACCOUNTS")
    if env:
        return int(env)
    return 1 if sys.platform != "win32" else None
