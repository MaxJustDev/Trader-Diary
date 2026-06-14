"""On Linux there are no per-account Windows terminal copies — the single Wine
terminal is shared. create/delete must be safe no-ops."""
from app.services import mt5_terminal


def test_create_terminal_copy_noop_on_linux(monkeypatch):
    monkeypatch.setattr(mt5_terminal.sys, "platform", "linux")

    def _should_not_copy(*a, **k):
        raise AssertionError("copytree must not run on Linux")

    monkeypatch.setattr(mt5_terminal.shutil, "copytree", _should_not_copy)
    # Returns an empty path and does not raise.
    assert mt5_terminal.create_terminal_copy("12345") == ""


def test_delete_terminal_copy_noop_on_linux(monkeypatch):
    monkeypatch.setattr(mt5_terminal.sys, "platform", "linux")
    assert mt5_terminal.delete_terminal_copy("12345") is False
