"""Batch execution applies a per-account jitter sleep between orders so trades
are not fired at an identical instant across accounts."""
import app.services.stealth as stealth


def test_jitter_seconds_is_bounded():
    for _ in range(50):
        s = stealth.jitter_seconds("300-2500")
        assert 0.30 <= s <= 2.50


def test_jitter_disabled_when_mode_off(monkeypatch):
    # Helper used by the batch loop: returns 0 delay when stealth is off.
    assert stealth.batch_delay_seconds(mode="off") == 0.0


def test_batch_delay_nonzero_for_tier1(monkeypatch):
    monkeypatch.setattr(stealth.random, "uniform", lambda a, b: a)
    # min of "300-2500" → 0.3s
    assert stealth.batch_delay_seconds(mode="tier1", spec="300-2500") == 0.3
