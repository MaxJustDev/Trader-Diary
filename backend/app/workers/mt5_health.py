"""MT5 init robustness: auto-launch terminal, backoff retry, post-init verify, watchdog.

Used by the worker process. NOT by the FastAPI master. The master never touches
MT5 directly — it only spawns workers.

Functions here are sync. They run inside the worker process.
"""
from __future__ import annotations

import logging
import os
import random
import subprocess
import sys
import threading
import time
from typing import Callable, Optional

from app.services.mt5_provider import mt5
import psutil

logger = logging.getLogger(__name__)


# ── Tunables ──────────────────────────────────────────────────────────────────
_INIT_ATTEMPTS = 5
_INIT_DELAYS = [0.5, 1.0, 2.0, 4.0, 8.0]   # seconds, one per attempt
_INIT_JITTER = 0.2                          # ± fraction
_TERMINAL_LAUNCH_WAIT_SECONDS = 12.0
_TERMINAL_LAUNCH_POLL_INTERVAL = 0.5
_CONNECTION_VERIFY_DEADLINE = 5.0           # seconds after login
_CONNECTION_VERIFY_POLL = 0.25
_WATCHDOG_INTERVAL = 5.0


def _terminal_running(exe_path: str) -> bool:
    """True if a process with the given executable path is currently running."""
    target = os.path.normcase(os.path.abspath(exe_path))
    for proc in psutil.process_iter(["pid", "exe"]):
        try:
            exe = proc.info.get("exe")
            if exe and os.path.normcase(os.path.abspath(exe)) == target:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


def launch_terminal_if_needed(exe_path: str) -> bool:
    """If `exe_path` is not already running, spawn it. Wait until detected.

    Returns True if the terminal is now running, False on failure.
    """
    if sys.platform != "win32":
        # Linux: the Wine terminal lifecycle is owned by the bridge systemd
        # service, not the worker. Nothing to launch here.
        logger.info("Non-Windows: skipping terminal launch (bridge owns it)")
        return True

    if _terminal_running(exe_path):
        logger.info("Terminal already running: %s", exe_path)
        return True

    if not os.path.isfile(exe_path):
        logger.error("Terminal executable not found: %s", exe_path)
        return False

    logger.info("Launching terminal: %s", exe_path)
    try:
        # Spawn detached so it survives if worker exits abruptly
        subprocess.Popen(
            [exe_path],
            cwd=os.path.dirname(exe_path),
            creationflags=getattr(subprocess, "DETACHED_PROCESS", 0)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as e:
        logger.error("Failed to spawn terminal: %s", e)
        return False

    deadline = time.monotonic() + _TERMINAL_LAUNCH_WAIT_SECONDS
    while time.monotonic() < deadline:
        if _terminal_running(exe_path):
            logger.info("Terminal up after %.1fs", _TERMINAL_LAUNCH_WAIT_SECONDS - (deadline - time.monotonic()))
            # Give the GUI another moment to be fully ready for API connection.
            time.sleep(1.0)
            return True
        time.sleep(_TERMINAL_LAUNCH_POLL_INTERVAL)

    logger.warning("Terminal launch timed out after %.1fs", _TERMINAL_LAUNCH_WAIT_SECONDS)
    return False


def init_with_backoff(terminal_path: str) -> bool:
    """Initialize MT5 with up to 5 attempts and jittered backoff.

    Each attempt: shutdown + initialize + check `terminal_info()` is connected.
    Returns True on first success.
    """
    for attempt, base_delay in enumerate(_INIT_DELAYS, start=1):
        if attempt > 1:
            jitter = base_delay * _INIT_JITTER * (random.random() * 2 - 1)
            delay = max(0.0, base_delay + jitter)
            logger.info("MT5 init retry %d/%d after %.2fs", attempt, _INIT_ATTEMPTS, delay)
            time.sleep(delay)

        try:
            mt5.shutdown()
        except Exception:
            pass

        init_ok = mt5.initialize() if sys.platform != "win32" else mt5.initialize(path=terminal_path)
        if not init_ok:
            err = mt5.last_error()
            logger.warning("mt5.initialize() failed (attempt %d): %s", attempt, err)
            continue

        info = mt5.terminal_info()
        if info is None:
            logger.warning("terminal_info() returned None after init (attempt %d)", attempt)
            continue

        if not info.connected:
            logger.warning("Terminal not connected after init (attempt %d): %s", attempt, info)
            continue

        logger.info("MT5 initialized on attempt %d (terminal=%s)", attempt, terminal_path)
        return True

    logger.error("MT5 init exhausted %d attempts for %s", _INIT_ATTEMPTS, terminal_path)
    return False


def verify_login_connected(deadline_seconds: float = _CONNECTION_VERIFY_DEADLINE) -> bool:
    """After mt5.login() returns True, poll account_info() until non-None or deadline.

    MetaTrader sometimes reports login success before account data is actually
    reachable. This guards against that race.
    """
    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        info = mt5.account_info()
        if info is not None and info.login:
            term = mt5.terminal_info()
            if term is not None and term.connected:
                return True
        time.sleep(_CONNECTION_VERIFY_POLL)
    return False


class Watchdog:
    """Background thread that monitors MT5 connection and re-establishes on drop.

    Caller passes a `reconnect()` callable that does the full re-init+re-login
    sequence. The watchdog only notices the drop and triggers the callable.

    Emits health events via the `on_event(event_name, data)` callback (one of
    "healthy", "disconnected", "reconnecting", "reconnect_failed", "recovered").
    """

    def __init__(
        self,
        reconnect: Callable[[], bool],
        on_event: Callable[[str, dict], None],
        interval: float = _WATCHDOG_INTERVAL,
    ) -> None:
        self._reconnect = reconnect
        self._on_event = on_event
        self._interval = interval
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_connected = True

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="mt5-watchdog", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        self._thread = None

    def _loop(self) -> None:
        while not self._stop.wait(self._interval):
            try:
                info = mt5.terminal_info()
                connected = info is not None and bool(info.connected)
            except Exception as e:
                logger.warning("Watchdog terminal_info() raised: %s", e)
                connected = False

            if connected and not self._last_connected:
                self._on_event("recovered", {"connected": True})
            elif not connected and self._last_connected:
                self._on_event("disconnected", {"connected": False})
                self._on_event("reconnecting", {"connected": False})
                try:
                    ok = self._reconnect()
                except Exception as e:
                    logger.warning("Watchdog reconnect raised: %s", e)
                    ok = False
                if ok:
                    self._on_event("recovered", {"connected": True})
                    connected = True
                else:
                    self._on_event("reconnect_failed", {"connected": False})

            self._last_connected = connected
