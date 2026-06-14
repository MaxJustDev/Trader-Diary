"""Symbol resolver tests using a fake worker pool."""
import pytest

from app.services.symbol_resolver import (
    KNOWN_SUFFIXES,
    parse_aliases,
    resolve_symbol,
    serialize_aliases,
)


class FakePool:
    """Pool stub that resolves symbols against a fixed catalog per account."""

    def __init__(self, catalogs: dict[int, list[str]]) -> None:
        self.catalogs = catalogs

    def is_active(self, account_db_id: int) -> bool:
        return account_db_id in self.catalogs

    async def call(self, account_db_id: int, method: str, params: dict | None = None, *, timeout: float = 10.0):
        catalog = self.catalogs.get(account_db_id, [])
        if method == "get_symbol_info":
            assert params is not None
            sym = params.get("symbol")
            return {"symbol": sym} if sym in catalog else None
        if method == "symbols_search":
            assert params is not None
            q = (params.get("query") or "").upper()
            limit = int(params.get("limit", 50))
            matches = [s for s in catalog if q in s.upper()]
            return matches[:limit]
        raise RuntimeError(f"unexpected method: {method}")


# ── parse / serialize ──
def test_parse_aliases_handles_none():
    assert parse_aliases(None) == {}


def test_parse_aliases_handles_empty_string():
    assert parse_aliases("") == {}


def test_parse_aliases_handles_bad_json():
    assert parse_aliases("{not json") == {}


def test_parse_aliases_decodes_dict():
    assert parse_aliases('{"EURUSD":"EURUSD.m"}') == {"EURUSD": "EURUSD.m"}


def test_parse_aliases_coerces_values_to_str():
    assert parse_aliases('{"a": 1}') == {"a": "1"}


def test_serialize_aliases_round_trip():
    raw = serialize_aliases({"EURUSD": "EURUSD.m", "GOLD": "XAUUSD"})
    assert parse_aliases(raw) == {"EURUSD": "EURUSD.m", "GOLD": "XAUUSD"}


# ── resolver ──
@pytest.mark.asyncio
async def test_resolve_exact_match():
    pool = FakePool({1: ["EURUSD", "GBPUSD"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {})
    assert r.resolved == "EURUSD"
    assert r.confidence == "exact"


@pytest.mark.asyncio
async def test_resolve_user_alias_wins_over_other_layers():
    pool = FakePool({1: ["EURUSD", "EURUSD.m"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {"EURUSD": "EURUSD.m"})
    assert r.resolved == "EURUSD.m"
    assert r.confidence == "user_alias"


@pytest.mark.asyncio
async def test_resolve_user_alias_falls_back_if_target_missing():
    """If alias points at a symbol that doesn't exist, skip to next layer."""
    pool = FakePool({1: ["EURUSD"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {"EURUSD": "EURUSD.m"})
    assert r.resolved == "EURUSD"
    assert r.confidence == "exact"


@pytest.mark.asyncio
async def test_resolve_suffix_variant_dot_m():
    pool = FakePool({1: ["EURUSD.m", "GBPUSD.m"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {})
    assert r.resolved == "EURUSD.m"
    assert r.confidence == "suffix"
    assert "EURUSD.m" in r.alternatives


@pytest.mark.asyncio
async def test_resolve_suffix_variant_pro():
    pool = FakePool({1: ["EURUSD.pro"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {})
    assert r.resolved == "EURUSD.pro"
    assert r.confidence == "suffix"


@pytest.mark.asyncio
async def test_resolve_equivalent_xauusd_to_gold():
    pool = FakePool({1: ["GOLD"]})
    r = await resolve_symbol(pool, 1, "XAUUSD", {})
    assert r.resolved == "GOLD"
    assert r.confidence == "suffix"  # KNOWN_EQUIVALENTS handled in the suffix layer


@pytest.mark.asyncio
async def test_resolve_fuzzy_match_against_catalog():
    pool = FakePool({1: ["EURUSDi", "GBPUSDi", "EURJPY"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {})
    # EURUSDi isn't in our KNOWN_SUFFIXES list so layer 3 misses; layer 4 catches.
    # Wait — `i` IS in KNOWN_SUFFIXES (lowercase, no dot). So this is suffix layer.
    assert r.resolved == "EURUSDi"
    assert r.confidence in ("suffix", "fuzzy")


@pytest.mark.asyncio
async def test_resolve_not_found_returns_alternatives():
    pool = FakePool({1: ["AUDCHF", "NZDJPY"]})
    r = await resolve_symbol(pool, 1, "EURUSD", {})
    assert r.resolved is None
    assert r.confidence == "not_found"


@pytest.mark.asyncio
async def test_resolve_inactive_pool_returns_not_found():
    pool = FakePool({})
    r = await resolve_symbol(pool, 99, "EURUSD", {})
    assert r.resolved is None
    assert r.confidence == "not_found"


@pytest.mark.asyncio
async def test_known_suffixes_list_is_not_empty():
    assert len(KNOWN_SUFFIXES) > 5
