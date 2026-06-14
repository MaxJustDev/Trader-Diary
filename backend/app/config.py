"""Centralized constants and tunables for the backend."""

import os
import sys

LOW_RESOURCE_MODE = os.getenv("LOW_RESOURCE_MODE", "0") == "1"

# WebSocket stream loop (relaxed under LOW_RESOURCE_MODE to save CPU/RAM)
WS_TICK_INTERVAL_SECONDS = 3.0 if LOW_RESOURCE_MODE else 1.0
SNAPSHOT_INTERVAL_SECONDS = 180 if LOW_RESOURCE_MODE else 60
TRAIL_CHECK_INTERVAL_SECONDS = 10 if LOW_RESOURCE_MODE else 5
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


# ── Stealth order mode (reduce EA/automation footprint) ───────────────────────
STEALTH_MODE = os.getenv("STEALTH_MODE", "tier1")  # off | tier1 | tier2
# Comma list of natural-looking comments; one is chosen at random per order.
STEALTH_COMMENTS = [
    c.strip()
    for c in os.getenv("STEALTH_COMMENTS", ",").split(",")
]
# Per-account jitter range "min-max" in ms, applied before sending each order.
STEALTH_JITTER_MS = os.getenv("STEALTH_JITTER_MS", "300-2500")
# Optional fractional volume variance (e.g. 0.05 = ±5%); 0 disables.
STEALTH_VOLUME_VARIANCE = float(os.getenv("STEALTH_VOLUME_VARIANCE", "0.0"))
