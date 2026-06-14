"""LOW_RESOURCE_MODE relaxes stream + snapshot intervals."""
import importlib


def _reload_config(monkeypatch, value):
    monkeypatch.setenv("LOW_RESOURCE_MODE", value)
    import app.config as cfg
    return importlib.reload(cfg)


def test_low_resource_relaxes_intervals(monkeypatch):
    cfg = _reload_config(monkeypatch, "1")
    assert cfg.WS_TICK_INTERVAL_SECONDS >= 2.0
    assert cfg.SNAPSHOT_INTERVAL_SECONDS >= 120


def test_normal_mode_keeps_defaults(monkeypatch):
    cfg = _reload_config(monkeypatch, "0")
    assert cfg.WS_TICK_INTERVAL_SECONDS == 1.0
    assert cfg.SNAPSHOT_INTERVAL_SECONDS == 60


def teardown_module(module):
    # Restore defaults for any later test that imports config.
    import os, importlib
    os.environ.pop("LOW_RESOURCE_MODE", None)
    import app.config as cfg
    importlib.reload(cfg)
