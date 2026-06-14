"""Tier-1 stealth: magic=0, natural comment, jitter range, volume variance."""
from app.services import stealth


def test_off_keeps_existing_magic_and_comment():
    req = {"magic": 234000, "comment": "TraderDiary", "volume": 0.10}
    out = stealth.apply_stealth(dict(req), mode="off")
    assert out["magic"] == 234000
    assert out["comment"] == "TraderDiary"
    assert out["volume"] == 0.10


def test_tier1_zeroes_magic():
    out = stealth.apply_stealth({"magic": 234000, "volume": 0.1}, mode="tier1")
    assert out["magic"] == 0


def test_tier1_sets_comment_from_pool():
    out = stealth.apply_stealth(
        {"comment": "TraderDiary", "volume": 0.1},
        mode="tier1",
        comments=["swing", "scalp"],
    )
    assert out["comment"] in ("swing", "scalp")


def test_tier1_empty_comment_pool_yields_empty_comment():
    out = stealth.apply_stealth({"comment": "x", "volume": 0.1}, mode="tier1", comments=[""])
    assert out["comment"] == ""


def test_volume_variance_stays_within_bounds():
    base = 1.0
    for _ in range(50):
        out = stealth.apply_stealth({"volume": base}, mode="tier1", volume_variance=0.10)
        assert 0.90 <= out["volume"] <= 1.10


def test_zero_variance_keeps_volume_exact():
    out = stealth.apply_stealth({"volume": 0.37}, mode="tier1", volume_variance=0.0)
    assert out["volume"] == 0.37


def test_parse_jitter_range():
    assert stealth.parse_jitter_ms("300-2500") == (300, 2500)
    assert stealth.parse_jitter_ms("500") == (500, 500)


def test_jitter_seconds_within_range(monkeypatch):
    monkeypatch.setattr(stealth.random, "uniform", lambda a, b: b)
    assert stealth.jitter_seconds("300-2500") == 2.5
