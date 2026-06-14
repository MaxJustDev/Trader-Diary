"""Stealth Tier 2 — GUI automation placeholder (NOT implemented).

See deploy/linux/STEALTH_TIER2.md for the design. Wiring this in is a future
task; today STEALTH_MODE=tier2 behaves like tier1 for the order request.
"""
from __future__ import annotations


def place_via_gui(symbol: str, volume: float, side: str, sl: float = 0.0, tp: float = 0.0) -> dict:
    raise NotImplementedError(
        "Stealth Tier 2 (GUI automation) is design-only. "
        "See deploy/linux/STEALTH_TIER2.md."
    )
