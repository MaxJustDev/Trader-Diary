"""Tier-1 stealth for order requests: reduce the automation footprint.

Prop firms that "ban EAs" commonly detect automation by:
  - a non-zero `magic` number (manual trades use magic 0),
  - a fixed bot comment,
  - identical volume/timing fired across accounts at once.

Tier 1 sets magic=0, draws a natural comment, applies a small per-account timing
jitter and optional volume variance. It does NOT change the server-stamped deal
`reason` (that needs Tier 2 GUI automation) — see deploy/linux/STEALTH_TIER2.md.
"""
from __future__ import annotations

import random
from typing import Optional

from app.config import (
    STEALTH_COMMENTS,
    STEALTH_JITTER_MS,
    STEALTH_MODE,
    STEALTH_VOLUME_VARIANCE,
)


def parse_jitter_ms(spec: str) -> tuple[int, int]:
    """'300-2500' -> (300, 2500); '500' -> (500, 500)."""
    spec = spec.strip()
    if "-" in spec:
        lo, hi = spec.split("-", 1)
        return int(lo), int(hi)
    v = int(spec)
    return v, v


def jitter_seconds(spec: str = STEALTH_JITTER_MS) -> float:
    lo, hi = parse_jitter_ms(spec)
    return random.uniform(lo, hi) / 1000.0


def apply_stealth(
    request: dict,
    *,
    mode: Optional[str] = None,
    comments: Optional[list[str]] = None,
    volume_variance: Optional[float] = None,
) -> dict:
    """Return the (mutated) order request with stealth applied for `mode`.

    `mode` defaults to STEALTH_MODE config. tier2 currently behaves like tier1
    for the request itself (GUI path is separate and not yet implemented).
    """
    mode = mode if mode is not None else STEALTH_MODE
    if mode == "off":
        return request

    comments = comments if comments is not None else STEALTH_COMMENTS
    variance = volume_variance if volume_variance is not None else STEALTH_VOLUME_VARIANCE

    request["magic"] = 0
    request["comment"] = random.choice(comments) if comments else ""

    if variance and variance > 0 and "volume" in request:
        base = float(request["volume"])
        factor = 1.0 + random.uniform(-variance, variance)
        request["volume"] = round(base * factor, 2)

    return request
