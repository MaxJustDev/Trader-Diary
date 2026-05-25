"""Resolve a user-typed symbol to a broker-specific symbol per account.

Broker variants are common: EURUSD vs EURUSD.m vs EURUSD.r vs EURUSDi etc.
The resolver tries layers in order, stopping at the first match:

  1. User-defined alias (per account, stored in Account.symbol_aliases JSON).
  2. Exact match (the requested symbol exists on the account).
  3. Known suffix variants (.m / .r / .pro / _ / m / i / .raw / mini / .a).
  4. Fuzzy catalog search (worker symbols_search + Levenshtein-style ranking).

Returns a `ResolveResult` with the resolved name (or None), the confidence
band (`exact`, `user_alias`, `suffix`, `fuzzy`, `not_found`), and a list of
alternative candidates that the UI can show as a dropdown.

The resolver is async because each step calls the worker pool.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional, Protocol

logger = logging.getLogger(__name__)


# Known suffix tokens used by various MT5 brokers. Order matters: tried in this
# sequence. The two-letter variants without dot are intentionally last to
# minimize false matches against unrelated symbols.
KNOWN_SUFFIXES = [
    ".m", ".r", ".pro", ".raw", ".a", ".c", ".cmd",
    "_", "mini",
    "m", "i", "r",
]

# Known whole-name equivalents (case-insensitive).
KNOWN_EQUIVALENTS = {
    "XAUUSD": ["GOLD", "GOLDUSD", "XAU/USD", "XAU-USD"],
    "GOLD": ["XAUUSD", "GOLDUSD"],
    "XAGUSD": ["SILVER", "XAG/USD"],
    "US30": ["DJ30", "WS30", "DOW30", "USA30"],
    "NAS100": ["USTEC", "NDX100", "US100"],
    "SPX500": ["US500", "SP500"],
    "GER40": ["DE40", "DAX40", "DAX"],
    "UK100": ["FTSE100"],
}

FUZZY_THRESHOLD = 0.72
FUZZY_MAX_RETURN = 5


@dataclass
class ResolveResult:
    requested: str
    resolved: Optional[str]
    confidence: str   # exact | user_alias | suffix | fuzzy | not_found
    alternatives: list[str]

    @property
    def available(self) -> bool:
        return self.resolved is not None


class WorkerPoolLike(Protocol):
    """Minimal protocol so tests can pass a fake pool."""

    def is_active(self, account_db_id: int) -> bool: ...
    async def call(self, account_db_id: int, method: str, params: dict | None = None, *, timeout: float = 10.0): ...


# ── Helpers ───────────────────────────────────────────────────────────────────
def parse_aliases(raw: Optional[str]) -> dict[str, str]:
    """Decode the Account.symbol_aliases JSON column. Tolerant of bad data."""
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return {str(k): str(v) for k, v in obj.items()}
    except Exception:
        pass
    return {}


def serialize_aliases(d: dict[str, str]) -> str:
    return json.dumps(d, ensure_ascii=False)


def _generate_candidates(requested: str) -> list[str]:
    """Enumerate broker-variant candidates for the requested name."""
    out: list[str] = []
    seen: set[str] = set()

    def add(s: str) -> None:
        if s and s not in seen:
            seen.add(s)
            out.append(s)

    add(requested)
    upper = requested.upper()
    add(upper)

    for suffix in KNOWN_SUFFIXES:
        add(requested + suffix)
        add(upper + suffix)

    for equiv in KNOWN_EQUIVALENTS.get(upper, []):
        add(equiv)
        for suffix in KNOWN_SUFFIXES:
            add(equiv + suffix)

    return out


async def _symbol_exists(pool: WorkerPoolLike, account_db_id: int, name: str) -> bool:
    try:
        info = await pool.call(account_db_id, "get_symbol_info", {"symbol": name}, timeout=5.0)
        return info is not None
    except Exception:
        return False


def _rank_fuzzy(requested: str, candidates: list[str]) -> list[tuple[str, float]]:
    """Return [(name, score)] sorted desc, length cap = FUZZY_MAX_RETURN."""
    req_norm = requested.upper()
    scored = []
    for name in candidates:
        # Boost: same prefix scores higher than mid-string matches.
        ratio = SequenceMatcher(None, req_norm, name.upper()).ratio()
        if name.upper().startswith(req_norm[:3]):
            ratio = min(1.0, ratio + 0.05)
        scored.append((name, ratio))
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored[:FUZZY_MAX_RETURN]


# ── Public API ────────────────────────────────────────────────────────────────
async def resolve_symbol(
    pool: WorkerPoolLike,
    account_db_id: int,
    requested: str,
    symbol_aliases: dict[str, str],
) -> ResolveResult:
    """Resolve `requested` for the given account using the worker pool."""
    requested = requested.strip()
    if not requested:
        return ResolveResult(requested, None, "not_found", [])

    if not pool.is_active(account_db_id):
        return ResolveResult(requested, None, "not_found", [])

    # Layer 1: user alias
    alias = symbol_aliases.get(requested) or symbol_aliases.get(requested.upper())
    if alias and await _symbol_exists(pool, account_db_id, alias):
        return ResolveResult(requested, alias, "user_alias", [alias])

    # Layer 2: exact
    if await _symbol_exists(pool, account_db_id, requested):
        return ResolveResult(requested, requested, "exact", [requested])

    # Layer 3: suffix + equivalents
    candidates = _generate_candidates(requested)
    if candidates:
        results = await asyncio.gather(
            *[_symbol_exists(pool, account_db_id, c) for c in candidates],
            return_exceptions=True,
        )
        matched = [
            c for c, ok in zip(candidates, results) if ok is True
        ]
        if matched:
            return ResolveResult(requested, matched[0], "suffix", matched[:FUZZY_MAX_RETURN])

    # Layer 4: fuzzy catalog search
    try:
        catalog = await pool.call(
            account_db_id,
            "symbols_search",
            {"query": requested[:4], "limit": 200},
            timeout=10.0,
        )
        catalog = catalog or []
    except Exception as e:
        logger.warning("symbols_search failed for account %d: %s", account_db_id, e)
        catalog = []

    if catalog:
        ranked = _rank_fuzzy(requested, catalog)
        top, score = ranked[0]
        alternatives = [name for name, _ in ranked]
        if score >= FUZZY_THRESHOLD:
            return ResolveResult(requested, top, "fuzzy", alternatives)
        return ResolveResult(requested, None, "not_found", alternatives)

    return ResolveResult(requested, None, "not_found", [])
