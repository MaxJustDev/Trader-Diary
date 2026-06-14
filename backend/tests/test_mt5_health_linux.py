"""Linux-mode behavior of mt5_health: terminal launch is a no-op and init
calls mt5.initialize() without a Windows path."""
from app.workers import mt5_health


def test_launch_terminal_is_noop_on_linux(monkeypatch):
    monkeypatch.setattr(mt5_health.sys, "platform", "linux")

    called = {"popen": False}

    def _should_not_run(*a, **k):
        called["popen"] = True
        raise AssertionError("Popen must not be called on Linux")

    monkeypatch.setattr(mt5_health.subprocess, "Popen", _should_not_run)
    assert mt5_health.launch_terminal_if_needed("/anything/terminal64.exe") is True
    assert called["popen"] is False


def test_init_calls_initialize_without_path_on_linux(monkeypatch):
    monkeypatch.setattr(mt5_health.sys, "platform", "linux")
    seen = {}

    class _FakeMt5:
        def shutdown(self):
            pass

        def initialize(self, *args, **kwargs):
            seen["args"] = args
            seen["kwargs"] = kwargs
            return True

        def terminal_info(self):
            return type("T", (), {"connected": True})()

        def last_error(self):
            return (0, "ok")

    monkeypatch.setattr(mt5_health, "mt5", _FakeMt5())
    assert mt5_health.init_with_backoff(r"C:\ignored\terminal64.exe") is True
    # On Linux we must not pass a Windows path.
    assert seen["args"] == () and seen["kwargs"] == {}
