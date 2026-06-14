# Linux Wine Server Deployment + Stealth Trading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run TraderDiary on a low-resource Linux box (Atom D2550, ~1.5 GiB free RAM) so the user can open the web UI from a phone or PC on the LAN and place orders on their accounts, with MT5 running under Wine behind a thin JSON bridge and a one-command setup/autostart, plus a stealth order mode for prop firms that ban EAs.

**Architecture:** A platform seam (`mt5_provider`) returns the native `MetaTrader5` module on Windows (unchanged) or a `BridgeClient` on Linux that talks line-delimited JSON over TCP to a tiny `bridge_server.py` running under Wine. The Wine server imports the native MT5 and returns plain dicts. Linux is capped to one active account (RAM-bound). Setup/init scripts + systemd units make deploy one command. Stealth Tier 1 (magic=0, natural comment, jitter, volume variance) reduces the automation footprint of placed orders; Tier 2 (GUI automation) is design-only.

**Tech Stack:** Python 3.10, FastAPI, SQLAlchemy, asyncio subprocess worker pool, Wine + Xvfb, systemd, stdlib `socket`/`socketserver`, pytest (`pytest-asyncio`).

**Spec:** `docs/superpowers/specs/2026-06-14-linux-wine-server-deployment-design.md`

**Working directory note:** all paths are relative to repo root `C:\Users\Max\Desktop\TraderDiary`. Backend commands run from `backend/` with the venv active (`venv\Scripts\activate` on Windows, `. venv/bin/activate` on Linux). Run tests with `pytest -v` from `backend/`.

---

## File Structure

**Phase 1 — Bridge + provider seam**
- Create `backend/app/services/mt5_provider.py` — platform seam + `BridgeClient` (Linux MT5 handle).
- Create `deploy/linux/bridge_server.py` — standalone Wine-side MT5 JSON server.
- Create `backend/tests/test_mt5_provider.py` — BridgeClient against an in-process fake server.
- Create `backend/tests/test_bridge_server.py` — `_serialize`/`_handle` unit tests (no real MT5).
- Modify `backend/app/config.py` — bridge host/port, max-accounts default, low-resource knobs.
- Modify 6 import sites: `services/mt5_service.py`, `services/mt5_streaming.py`, `routes/mt5.py`, `routes/analytics.py`, `workers/mt5_worker.py`, `workers/mt5_health.py`.
- Modify `backend/app/workers/mt5_health.py` — Linux terminal-launch no-op + init without path.
- Modify `backend/app/services/worker_pool.py` — `max_workers` cap + `WorkerLimitReached`.
- Modify `backend/app/services/mt5_terminal.py` — no-op terminal copy on non-Windows.
- Modify `backend/app/routes/mt5_v2.py` — surface the 1-account cap as HTTP 409.

**Phase 2 — Setup/init + deploy**
- Create `deploy/linux/.env.linux.example`, `setup.sh`, `start-bridge.sh`, `start-app.sh`, `install.sh`, `status.sh`, `README.md`.
- Create `deploy/linux/systemd/traderdiary-bridge.service`, `deploy/linux/systemd/traderdiary.service`.
- Modify `backend/app/config.py` — wire `LOW_RESOURCE_MODE` env into intervals.

**Phase 3 — Stealth Tier 1**
- Create `backend/app/services/stealth.py` — order-request builder + config.
- Create `backend/tests/test_stealth.py`.
- Modify `backend/app/workers/mt5_worker.py` and `backend/app/services/mt5_service.py` — use the shared builder.
- Modify `backend/app/config.py` — stealth env knobs.

**Phase 4 — Stealth Tier 2 (design only)**
- Create `deploy/linux/STEALTH_TIER2.md` + `backend/app/services/stealth_gui.py` stub.

---

# PHASE 1 — Bridge + Provider Seam

## Task 1: Bridge + limits config

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add config constants**

Append to `backend/app/config.py`:

```python
import os
import sys

# ── MT5 bridge (Linux/Wine) ──────────────────────────────────────────────────
# On non-Windows the app talks to a bridge server (running under Wine) that
# hosts the native MetaTrader5 module. Override the backend explicitly with
# TRADERDIARY_MT5_BACKEND=native|bridge (used by tests).
MT5_BRIDGE_HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
MT5_BRIDGE_PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))


def default_max_active_accounts():
    """Max simultaneously-active accounts. Linux/Wine is RAM-bound to 1."""
    env = os.getenv("MAX_ACTIVE_ACCOUNTS")
    if env:
        return int(env)
    return 1 if sys.platform != "win32" else None
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from app.config import MT5_BRIDGE_HOST, MT5_BRIDGE_PORT, default_max_active_accounts; print(MT5_BRIDGE_HOST, MT5_BRIDGE_PORT, default_max_active_accounts())"`
Expected: prints `127.0.0.1 8765 None` on Windows (or `... 1` on Linux). No error.

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(config): MT5 bridge host/port + max-active-accounts default"
```

---

## Task 2: Provider seam + BridgeClient

**Files:**
- Create: `backend/app/services/mt5_provider.py`
- Test: `backend/tests/test_mt5_provider.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mt5_provider.py`:

```python
"""BridgeClient tested against an in-process fake bridge server.

The fake server speaks the same line-delimited JSON protocol as the real
Wine-side bridge_server.py: it sends a constants frame on connect, then
answers {method,args,kwargs} requests with {result} or {error}.
"""
import json
import socket
import socketserver
import threading

import pytest

from app.services.mt5_provider import BridgeClient


class _FakeHandler(socketserver.StreamRequestHandler):
    def handle(self):
        # constants frame first
        consts = {"ORDER_TYPE_BUY": 0, "ORDER_TYPE_SELL": 1, "TRADE_RETCODE_DONE": 10009}
        self.wfile.write((json.dumps({"constants": consts}) + "\n").encode())
        self.wfile.flush()
        for raw in self.rfile:
            line = raw.decode().strip()
            if not line:
                continue
            req = json.loads(line)
            method = req["method"]
            if method == "account_info":
                resp = {"result": {"login": 123, "balance": 1000.0, "equity": 1010.0}}
            elif method == "positions_get":
                resp = {"result": [{"ticket": 5, "symbol": "EURUSD"}]}
            elif method == "order_send":
                resp = {"result": {"retcode": 10009, "order": 7, "request": {"symbol": "EURUSD"}}}
            elif method == "boom":
                resp = {"error": "RuntimeError: kaboom"}
            else:
                resp = {"result": None}
            self.wfile.write((json.dumps(resp) + "\n").encode())
            self.wfile.flush()


@pytest.fixture
def fake_bridge():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _FakeHandler)
    server.daemon_threads = True
    host, port = server.server_address
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    yield host, port
    server.shutdown()
    server.server_close()


def test_constants_resolve(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    assert mt5.ORDER_TYPE_BUY == 0
    assert mt5.ORDER_TYPE_SELL == 1
    assert mt5.TRADE_RETCODE_DONE == 10009


def test_account_info_returns_namespace(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    info = mt5.account_info()
    assert info.login == 123
    assert info.balance == 1000.0


def test_positions_get_returns_list_of_namespaces(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    positions = mt5.positions_get()
    assert positions[0].ticket == 5
    assert positions[0].symbol == "EURUSD"


def test_order_send_nested_namespace(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    result = mt5.order_send({"symbol": "EURUSD", "volume": 0.1})
    assert result.retcode == 10009
    assert result.order == 7
    assert result.request.symbol == "EURUSD"


def test_error_response_returns_none_and_sets_last_error(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    assert mt5.boom() is None
    code, msg = mt5.last_error()
    assert "kaboom" in msg


def test_transport_failure_returns_none():
    # Nothing listening on this port → connect fails → method returns None.
    mt5 = BridgeClient("127.0.0.1", 1)  # port 1: refused
    assert mt5.account_info() is None
    code, msg = mt5.last_error()
    assert code == -1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mt5_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.mt5_provider'` (or ImportError for `BridgeClient`).

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/mt5_provider.py`:

```python
"""Platform seam for the MetaTrader5 handle.

On Windows the native `MetaTrader5` module is used unchanged. On Linux (or when
TRADERDIARY_MT5_BACKEND=bridge / MT5_BRIDGE_HOST is set) a `BridgeClient` talks
line-delimited JSON over TCP to a bridge server running under Wine, which hosts
the native MT5 module.

Usage at call sites:
    from app.services.mt5_provider import mt5
    mt5.initialize(); mt5.account_info().balance; mt5.ORDER_TYPE_BUY
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import socket
import sys
import threading
from types import SimpleNamespace
from typing import Any

from app.config import MT5_BRIDGE_HOST, MT5_BRIDGE_PORT


def use_bridge() -> bool:
    backend = os.getenv("TRADERDIARY_MT5_BACKEND")
    if backend == "native":
        return False
    if backend == "bridge":
        return True
    if os.getenv("MT5_BRIDGE_HOST"):
        return True
    return sys.platform != "win32"


def _to_namespace(obj: Any) -> Any:
    if isinstance(obj, dict):
        return SimpleNamespace(**{k: _to_namespace(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return [_to_namespace(v) for v in obj]
    return obj


def _encode_arg(obj: Any) -> Any:
    """Make args JSON-safe. datetime -> unix int (MT5 accepts ints)."""
    if isinstance(obj, _dt.datetime):
        return int(obj.timestamp())
    if isinstance(obj, dict):
        return {k: _encode_arg(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_encode_arg(v) for v in obj]
    return obj


class BridgeError(Exception):
    pass


class BridgeClient:
    """Mimics the MetaTrader5 module over a JSON socket to the Wine bridge.

    Methods not defined on the class are turned into RPC calls by __getattr__.
    Constant names (e.g. ORDER_TYPE_BUY) resolve from the connect-time snapshot.
    """

    def __init__(self, host: str, port: int) -> None:
        self._host = host
        self._port = port
        self._sock: socket.socket | None = None
        self._buf = b""
        self._lock = threading.Lock()
        self._constants: dict[str, Any] = {}
        self._last_error: tuple[int, str] = (0, "no error")

    # ── connection ────────────────────────────────────────────────────────────
    def _connect(self) -> None:
        s = socket.create_connection((self._host, self._port), timeout=10.0)
        s.settimeout(30.0)
        self._sock = s
        self._buf = b""
        frame = self._read_frame()
        self._constants = frame.get("constants", {})

    def _reset(self) -> None:
        try:
            if self._sock:
                self._sock.close()
        except OSError:
            pass
        self._sock = None
        self._buf = b""

    def _read_frame(self) -> dict[str, Any]:
        assert self._sock is not None
        while b"\n" not in self._buf:
            chunk = self._sock.recv(65536)
            if not chunk:
                raise BridgeError("bridge closed connection")
            self._buf += chunk
        line, _, self._buf = self._buf.partition(b"\n")
        return json.loads(line.decode())

    def _rpc(self, method: str, args: tuple, kwargs: dict) -> Any:
        payload = (
            json.dumps(
                {
                    "method": method,
                    "args": [_encode_arg(a) for a in args],
                    "kwargs": _encode_arg(kwargs),
                }
            )
            + "\n"
        ).encode()
        with self._lock:
            frame = None
            for attempt in (1, 2):
                try:
                    if self._sock is None:
                        self._connect()
                    self._sock.sendall(payload)
                    frame = self._read_frame()
                    break
                except (OSError, BridgeError, ValueError) as e:
                    self._reset()
                    self._last_error = (-1, f"bridge transport: {e}")
                    if attempt == 2:
                        return None
            if frame is None:
                return None
            if "error" in frame:
                self._last_error = (-1, str(frame["error"]))
                return None
            return _to_namespace(frame.get("result"))

    # ── public surface (real methods bypass __getattr__) ───────────────────────
    def last_error(self):
        return self._last_error

    def shutdown(self):
        self._reset()
        return True

    def __getattr__(self, name: str):
        # Only called for names not found as real attributes/methods.
        if name.startswith("_"):
            raise AttributeError(name)
        with self._lock:
            if self._sock is None:
                try:
                    self._connect()
                except (OSError, BridgeError, ValueError) as e:
                    self._last_error = (-1, f"bridge transport: {e}")
            constants = dict(self._constants)
        if name in constants:
            return constants[name]

        def _method(*args, **kwargs):
            return self._rpc(name, args, kwargs)

        return _method


# ── Module-level handle chosen at import time ──────────────────────────────────
if use_bridge():
    mt5 = BridgeClient(MT5_BRIDGE_HOST, MT5_BRIDGE_PORT)
else:  # Windows: native module, zero behavior change
    import MetaTrader5 as mt5  # type: ignore


def get_mt5():
    return mt5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mt5_provider.py -v`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mt5_provider.py backend/tests/test_mt5_provider.py
git commit -m "feat(mt5): platform provider seam + Linux BridgeClient"
```

---

## Task 3: Wine-side bridge server (standalone)

**Files:**
- Create: `deploy/linux/bridge_server.py`
- Test: `backend/tests/test_bridge_server.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_bridge_server.py`:

```python
"""Unit tests for the Wine bridge server's pure logic.

bridge_server.py is loaded directly from deploy/linux/ (it is not a package)
and imports MetaTrader5 lazily inside main(), so it loads fine without MT5.
"""
import collections
import importlib.util
import os
from types import SimpleNamespace

import pytest

_HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_BRIDGE_PATH = os.path.join(_HERE, "deploy", "linux", "bridge_server.py")


@pytest.fixture(scope="module")
def bridge():
    spec = importlib.util.spec_from_file_location("bridge_server", _BRIDGE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_serialize_namedtuple(bridge):
    Tick = collections.namedtuple("Tick", ["bid", "ask", "last"])
    assert bridge._serialize(Tick(1.1, 1.2, 1.15)) == {"bid": 1.1, "ask": 1.2, "last": 1.15}


def test_serialize_list_of_namedtuples(bridge):
    Pos = collections.namedtuple("Pos", ["ticket", "symbol"])
    out = bridge._serialize([Pos(1, "EURUSD"), Pos(2, "GBPUSD")])
    assert out == [{"ticket": 1, "symbol": "EURUSD"}, {"ticket": 2, "symbol": "GBPUSD"}]


def test_serialize_nested(bridge):
    Req = collections.namedtuple("Req", ["symbol"])
    Result = collections.namedtuple("Result", ["retcode", "request"])
    assert bridge._serialize(Result(10009, Req("EURUSD"))) == {
        "retcode": 10009,
        "request": {"symbol": "EURUSD"},
    }


def test_serialize_primitives(bridge):
    assert bridge._serialize(None) is None
    assert bridge._serialize(True) is True
    assert bridge._serialize(42) == 42


def test_handle_dispatches_to_fake_mt5(bridge):
    Info = collections.namedtuple("Info", ["balance"])
    fake = SimpleNamespace(account_info=lambda: Info(500.0))
    resp = bridge._handle(fake, {"method": "account_info", "args": [], "kwargs": {}})
    assert resp == {"result": {"balance": 500.0}}


def test_handle_unknown_method(bridge):
    fake = SimpleNamespace()
    resp = bridge._handle(fake, {"method": "nope", "args": [], "kwargs": {}})
    assert "error" in resp


def test_handle_exception_is_caught(bridge):
    def boom():
        raise RuntimeError("kaboom")

    fake = SimpleNamespace(login=boom)
    resp = bridge._handle(fake, {"method": "login", "args": [], "kwargs": {}})
    assert "error" in resp and "kaboom" in resp["error"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_bridge_server.py -v`
Expected: FAIL — `FileNotFoundError`/`spec` is None because `deploy/linux/bridge_server.py` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `deploy/linux/bridge_server.py`:

```python
"""TraderDiary MT5 bridge — runs under Wine python.

Hosts the native MetaTrader5 module and answers line-delimited JSON requests
from the Linux-side BridgeClient. Stdlib + MetaTrader5 only (minimal Wine
footprint). MetaTrader5 is imported lazily inside the connection handler so this
file can be imported (for serialization tests) on a machine without MT5.

Protocol:
  - On connect, server sends one frame: {"constants": {NAME: value, ...}}.
  - Then per line: request  {"method", "args": [...], "kwargs": {...}}
                   response {"result": <json>} or {"error": "<msg>"}
All MetaTrader5 named-tuple results are flattened to plain dicts/lists.
"""
from __future__ import annotations

import json
import logging
import os
import socketserver
import sys
import threading

HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))

# Constants the Linux client needs as attributes.
CONSTANT_NAMES = [
    "ORDER_TYPE_BUY",
    "ORDER_TYPE_SELL",
    "TRADE_ACTION_DEAL",
    "TRADE_ACTION_SLTP",
    "ORDER_FILLING_IOC",
    "ORDER_FILLING_FOK",
    "ORDER_FILLING_RETURN",
    "ORDER_TIME_GTC",
    "TRADE_RETCODE_DONE",
    "DEAL_TYPE_BUY",
    "DEAL_TYPE_SELL",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [bridge] %(levelname)s %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("bridge")

# MT5 is single-connection; serialize all calls across client connections.
_MT5_LOCK = threading.Lock()


def _serialize(obj):
    """Flatten MT5 named tuples / lists into JSON-safe structures."""
    if hasattr(obj, "_asdict"):  # named tuple
        return {k: _serialize(v) for k, v in obj._asdict().items()}
    if isinstance(obj, (list, tuple)):
        return [_serialize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


def _handle(mt5, req):
    """Dispatch one request dict to the mt5 module. Returns a response dict."""
    method = req.get("method")
    args = req.get("args", []) or []
    kwargs = req.get("kwargs", {}) or {}
    fn = getattr(mt5, method, None)
    if fn is None or not callable(fn):
        return {"error": f"unknown method: {method}"}
    try:
        with _MT5_LOCK:
            result = fn(*args, **kwargs)
        return {"result": _serialize(result)}
    except Exception as e:  # noqa: BLE001 — report any MT5 failure to the client
        return {"error": f"{type(e).__name__}: {e}"}


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        import MetaTrader5 as mt5  # lazy: only under Wine

        consts = {name: getattr(mt5, name, None) for name in CONSTANT_NAMES}
        self.wfile.write((json.dumps({"constants": consts}) + "\n").encode())
        self.wfile.flush()
        logger.info("client connected: %s", self.client_address)

        for raw in self.rfile:
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                resp = _handle(mt5, req)
            except Exception as e:  # noqa: BLE001
                resp = {"error": f"bad request: {e}"}
            self.wfile.write((json.dumps(resp) + "\n").encode())
            self.wfile.flush()
        logger.info("client disconnected: %s", self.client_address)


class _Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    logger.info("MT5 bridge listening on %s:%d", HOST, PORT)
    with _Server((HOST, PORT), _Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_bridge_server.py -v`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add deploy/linux/bridge_server.py backend/tests/test_bridge_server.py
git commit -m "feat(bridge): standalone Wine-side MT5 JSON server"
```

---

## Task 4: Swap the 6 MetaTrader5 import sites to the provider

**Files:**
- Modify: `backend/app/services/mt5_service.py:1`
- Modify: `backend/app/services/mt5_streaming.py:14`
- Modify: `backend/app/routes/mt5.py:19`
- Modify: `backend/app/routes/analytics.py:13`
- Modify: `backend/app/workers/mt5_worker.py:40`
- Modify: `backend/app/workers/mt5_health.py:18`

- [ ] **Step 1: Edit each import line**

`backend/app/services/mt5_service.py` line 1:
```python
from app.services.mt5_provider import mt5
```
(was `import MetaTrader5 as mt5`)

`backend/app/services/mt5_streaming.py` line 14:
```python
from app.services.mt5_provider import mt5 as _mt5
```
(was `import MetaTrader5 as _mt5`)

`backend/app/routes/mt5.py` line 19:
```python
from app.services.mt5_provider import mt5 as _mt5
```
(was `import MetaTrader5 as _mt5`)

`backend/app/routes/analytics.py` line 13:
```python
from app.services.mt5_provider import mt5 as _mt5
```
(was `import MetaTrader5 as _mt5`)

`backend/app/workers/mt5_worker.py` line 40:
```python
from app.services.mt5_provider import mt5  # noqa: E402
```
(was `import MetaTrader5 as mt5  # noqa: E402`)

`backend/app/workers/mt5_health.py` line 18:
```python
from app.services.mt5_provider import mt5
```
(was `import MetaTrader5 as mt5`)

- [ ] **Step 2: Verify imports still resolve on Windows (native path)**

Run: `cd backend && python -c "import app.services.mt5_service, app.services.mt5_streaming, app.routes.mt5, app.routes.analytics, app.workers.mt5_worker, app.workers.mt5_health; print('imports ok')"`
Expected: prints `imports ok` (on Windows the provider returns the native module, so behavior is unchanged).

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `cd backend && pytest -v`
Expected: all previously-passing tests still PASS (`test_imports`, `test_mt5_auth`, `test_mt5_singleton`, `test_worker_*`, `test_symbol_resolver`, etc.), plus the two new provider/bridge test files.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/mt5_service.py backend/app/services/mt5_streaming.py backend/app/routes/mt5.py backend/app/routes/analytics.py backend/app/workers/mt5_worker.py backend/app/workers/mt5_health.py
git commit -m "refactor(mt5): route all MetaTrader5 imports through the provider seam"
```

---

## Task 5: Linux adaptation of mt5_health (no terminal launch, init without path)

**Files:**
- Modify: `backend/app/workers/mt5_health.py`
- Test: `backend/tests/test_mt5_health_linux.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mt5_health_linux.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mt5_health_linux.py -v`
Expected: FAIL — `launch_terminal_if_needed` calls `_terminal_running`/`os.path.isfile` (returns False → returns False), and `init_with_backoff` calls `mt5.initialize(path=...)` (so `seen["kwargs"]` would be `{"path": ...}`).

- [ ] **Step 3: Edit `mt5_health.py`**

Add `import sys` to the imports block (after `import subprocess`).

At the very top of `launch_terminal_if_needed` (before the `_terminal_running` check), insert:

```python
    if sys.platform != "win32":
        # Linux: the Wine terminal lifecycle is owned by the bridge systemd
        # service, not the worker. Nothing to launch here.
        logger.info("Non-Windows: skipping terminal launch (bridge owns it)")
        return True
```

In `init_with_backoff`, replace the line:

```python
        if not mt5.initialize(path=terminal_path):
```
with:

```python
        init_ok = mt5.initialize() if sys.platform != "win32" else mt5.initialize(path=terminal_path)
        if not init_ok:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mt5_health_linux.py -v`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/workers/mt5_health.py backend/tests/test_mt5_health_linux.py
git commit -m "feat(mt5): Linux mt5_health — skip terminal launch, init without path"
```

---

## Task 6: WorkerPool max-workers cap (1 account on Linux)

**Files:**
- Modify: `backend/app/services/worker_pool.py`
- Test: `backend/tests/test_worker_pool_cap.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_worker_pool_cap.py`:

```python
"""WorkerPool enforces a max active-worker cap (Linux runs 1 account)."""
import pytest

from app.services.worker_pool import WorkerPool, WorkerLimitReached

FAKE_MODULE = "tests.fixtures.fake_mt5_worker"


@pytest.mark.asyncio
async def test_cap_blocks_second_account():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=1)
    try:
        await p.spawn(1)
        with pytest.raises(WorkerLimitReached):
            await p.spawn(2)
        assert p.active_account_ids() == {1}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_cap_allows_respawn_of_same_account():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=1)
    try:
        await p.spawn(1)
        # Re-spawning the already-active account is idempotent, not a cap hit.
        await p.spawn(1)
        assert p.active_account_ids() == {1}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_unlimited_when_max_is_none():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=None)
    try:
        await p.spawn(1)
        await p.spawn(2)
        assert p.active_account_ids() == {1, 2}
    finally:
        await p.shutdown_all()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_worker_pool_cap.py -v`
Expected: FAIL — `ImportError: cannot import name 'WorkerLimitReached'` and `WorkerPool.__init__` has no `max_workers` kwarg.

- [ ] **Step 3: Edit `worker_pool.py`**

After the `class WorkerNotRunning(Exception):` block, add:

```python
class WorkerLimitReached(Exception):
    """Tried to spawn more workers than this server allows (RAM-bound)."""
```

Change `WorkerPool.__init__` signature and body:

```python
    def __init__(
        self,
        *,
        worker_module: str = "app.workers.mt5_worker",
        max_workers: int | None = None,
    ) -> None:
        self._workers: dict[int, _WorkerHandle] = {}
        self._subscribers: list[asyncio.Queue[tuple[int, dict]]] = []
        self._subscribers_lock = asyncio.Lock()
        self._worker_module = worker_module
        self._python_exe = sys.executable
        self._spawn_locks: dict[int, asyncio.Lock] = {}
        self._max_workers = max_workers
```

In `spawn`, inside the `async with lock:` block, after the existing
already-active idempotent check (the `if account_db_id in self._workers:` block
that returns or pops), and immediately before `argv = self._spawn_args(...)`,
insert the cap check:

```python
            if self._max_workers is not None:
                active = {
                    aid
                    for aid, h in self._workers.items()
                    if h.process.returncode is None
                }
                if account_db_id not in active and len(active) >= self._max_workers:
                    raise WorkerLimitReached(
                        f"This server runs at most {self._max_workers} account(s) "
                        f"at a time. Deactivate the current account first."
                    )
```

At the bottom of the file, change the module-level instance:

```python
from app.config import default_max_active_accounts  # noqa: E402

pool = WorkerPool(max_workers=default_max_active_accounts())
```

(Place the import with the other top-of-file imports if preferred; shown here
for clarity. If moved to the top, drop the `# noqa: E402`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_worker_pool_cap.py tests/test_worker_pool.py -v`
Expected: PASS — new cap tests green AND the existing `test_worker_pool.py` still green (default pool is unlimited on Windows).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/worker_pool.py backend/tests/test_worker_pool_cap.py
git commit -m "feat(pool): max-workers cap (1 active account on Linux)"
```

---

## Task 7: No-op per-account terminal copy on non-Windows

**Files:**
- Modify: `backend/app/services/mt5_terminal.py`
- Test: `backend/tests/test_mt5_terminal_linux.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mt5_terminal_linux.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mt5_terminal_linux.py -v`
Expected: FAIL — `AttributeError: module 'app.services.mt5_terminal' has no attribute 'sys'` (no `import sys` yet), and `create_terminal_copy` would attempt a real copy.

- [ ] **Step 3: Edit `mt5_terminal.py`**

Add `import sys` near the top (after `import os`).

At the start of `create_terminal_copy` (first line of the body, before
computing `source`), insert:

```python
    if sys.platform != "win32":
        # Linux/Wine: one shared terminal, no per-account copies. The worker
        # connects to the already-running Wine terminal via the bridge.
        logger.info("Non-Windows: skipping per-account terminal copy for %s", account_id)
        return ""
```

At the start of `delete_terminal_copy` (first line of the body), insert:

```python
    if sys.platform != "win32":
        return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mt5_terminal_linux.py -v`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mt5_terminal.py backend/tests/test_mt5_terminal_linux.py
git commit -m "feat(mt5): no-op per-account terminal copy on non-Windows"
```

---

## Task 8: Surface the 1-account cap in the v2 connect route

**Files:**
- Modify: `backend/app/routes/mt5_v2.py:22` and the `connect` handler (lines ~29-46)

- [ ] **Step 1: Edit the import**

Change line 22 from:
```python
from app.services.worker_pool import WorkerError, WorkerNotRunning, pool
```
to:
```python
from app.services.worker_pool import WorkerError, WorkerLimitReached, WorkerNotRunning, pool
```

- [ ] **Step 2: Edit the `connect` handler**

Replace the `try/except` around `await pool.spawn(account_db_id)` so the limit
is a clean 409 (insert the `WorkerLimitReached` branch before the generic
`except Exception`):

```python
    try:
        await pool.spawn(account_db_id)
    except WorkerLimitReached as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception("spawn failed for account_db_id=%d", account_db_id)
        raise HTTPException(status_code=500, detail=f"spawn failed: {e}")
```

- [ ] **Step 3: Verify import + app boots**

Run: `cd backend && python -c "import app.routes.mt5_v2; from app.main import app; print('ok')"`
Expected: prints `ok`, no ImportError.

- [ ] **Step 4: Run full suite**

Run: `cd backend && pytest -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/mt5_v2.py
git commit -m "feat(api): return 409 when the account cap is reached"
```

---

### Phase 1 checkpoint

Run the whole backend suite: `cd backend && pytest -v` → all green. On Windows
nothing about runtime behavior changed (provider returns native module). The
Linux MT5 path now exists end-to-end in code (provider → bridge client →
bridge server) and is unit-tested with a fake bridge. **Phase 1 also is the
Wine-MT5 feasibility spike** — before Phase 2, manually validate on the Atom box
that MT5 installs and runs under Wine (see Task 10) and that
`deploy/linux/bridge_server.py` answers a real `account_info()`.

---

# PHASE 2 — Setup / Init / Deploy

> These tasks create shell scripts and systemd units. They are validated by
> running them on the Linux box (or `bash -n` syntax checks on Windows). Each
> script is `set -euo pipefail` and idempotent.

## Task 9: Linux env example

**Files:**
- Create: `deploy/linux/.env.linux.example`

- [ ] **Step 1: Create the file**

```bash
# TraderDiary — Linux server environment (copy to backend/.env and edit)

# Fernet key for encrypting stored MT5 passwords. Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=

# MT5 bridge (Wine side). The app connects here instead of importing MetaTrader5.
MT5_BRIDGE_HOST=127.0.0.1
MT5_BRIDGE_PORT=8765

# Force the MT5 backend (optional): native | bridge. Leave unset to auto-detect
# (bridge on non-Windows).
# TRADERDIARY_MT5_BACKEND=bridge

# Max simultaneously-active accounts. 1 on this low-RAM box.
MAX_ACTIVE_ACCOUNTS=1

# Low-resource mode relaxes stream/snapshot intervals to save CPU/RAM.
LOW_RESOURCE_MODE=1

# Web server bind. 0.0.0.0 = reachable from phone/PC on the LAN.
SERVER_HOST=0.0.0.0
SERVER_PORT=8001

# Wine
WINEPREFIX=/opt/traderdiary/wine
WINEARCH=win64
DISPLAY=:99

# Stealth order mode: off | tier1 | tier2  (tier2 not implemented yet)
STEALTH_MODE=tier1
STEALTH_JITTER_MS=300-2500
STEALTH_VOLUME_VARIANCE=0.0
```

- [ ] **Step 2: Commit**

```bash
git add deploy/linux/.env.linux.example
git commit -m "docs(deploy): Linux .env example"
```

---

## Task 10: One-command setup script

**Files:**
- Create: `deploy/linux/setup.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
# TraderDiary Linux setup — installs Wine + MT5 + Python deps for the Atom box.
# Idempotent: safe to re-run. Run as a normal user with sudo available.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
WINEARCH="${WINEARCH:-win64}"
MT5_SETUP_URL="${MT5_SETUP_URL:-https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe}"
export WINEPREFIX WINEARCH

echo "==> [1/6] APT packages (wine, xvfb, python venv, qrencode)"
sudo dpkg --add-architecture i386 || true
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
    wine wine64 wine32 winbind xvfb xauth \
    python3 python3-venv python3-pip \
    qrencode wget ca-certificates

echo "==> [2/6] Wine prefix at $WINEPREFIX"
sudo mkdir -p "$WINEPREFIX"
sudo chown "$USER":"$USER" "$(dirname "$WINEPREFIX")" "$WINEPREFIX"
# Headless prefix init.
DISPLAY=:99 xvfb-run -a wineboot --init || true

echo "==> [3/6] Download + silent-install MT5 under Wine"
TMP_EXE="$(mktemp --suffix=.exe)"
wget -q -O "$TMP_EXE" "$MT5_SETUP_URL"
# /auto runs the MetaTrader installer unattended.
DISPLAY=:99 xvfb-run -a wine "$TMP_EXE" /auto || true
rm -f "$TMP_EXE"
echo "    NOTE: if the silent install did not complete, run once interactively:"
echo "      WINEPREFIX=$WINEPREFIX DISPLAY=:99 xvfb-run -a wine \"$TMP_EXE\""

echo "==> [4/6] Windows Python + MetaTrader5 inside Wine"
"$REPO_ROOT/deploy/linux/install-wine-python.sh"

echo "==> [5/6] Linux venv + backend deps"
cd "$REPO_ROOT/backend"
python3 -m venv venv
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "==> [6/6] Frontend static export"
if [ -d "$REPO_ROOT/frontend/out" ]; then
    echo "    frontend/out already present — skipping build."
    echo "    (Build on a dev machine and copy frontend/out here to avoid"
    echo "     compiling on the Atom.)"
elif command -v npm >/dev/null 2>&1; then
    cd "$REPO_ROOT/frontend"
    npm install
    npm run build
else
    echo "    npm not found and frontend/out missing."
    echo "    Build frontend/out on a dev machine and copy it here."
fi

echo
echo "Setup complete. Next:"
echo "  1. cp deploy/linux/.env.linux.example backend/.env  && edit ENCRYPTION_KEY"
echo "  2. ./deploy/linux/install.sh   # install + enable systemd services"
echo "  3. ./deploy/linux/status.sh    # health + LAN URL/QR"
```

- [ ] **Step 2: Create the Wine-python helper `deploy/linux/install-wine-python.sh`**

```bash
#!/usr/bin/env bash
# Install a Windows Python inside the Wine prefix and pip-install MetaTrader5.
set -euo pipefail

WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
PYWIN_VER="${PYWIN_VER:-3.10.11}"
PYWIN_URL="https://www.python.org/ftp/python/${PYWIN_VER}/python-${PYWIN_VER}-amd64.exe"
export WINEPREFIX

TMP_EXE="$(mktemp --suffix=.exe)"
echo "    Downloading Windows Python ${PYWIN_VER}"
wget -q -O "$TMP_EXE" "$PYWIN_URL"
echo "    Installing Windows Python under Wine (silent)"
DISPLAY=:99 xvfb-run -a wine "$TMP_EXE" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 || true
rm -f "$TMP_EXE"

echo "    pip install MetaTrader5 (inside Wine python)"
DISPLAY=:99 xvfb-run -a wine python -m pip install --upgrade pip || true
DISPLAY=:99 xvfb-run -a wine python -m pip install MetaTrader5 || true
echo "    Wine python ready. Verify with:"
echo "      WINEPREFIX=$WINEPREFIX wine python -c \"import MetaTrader5; print(MetaTrader5.__version__)\""
```

- [ ] **Step 3: Syntax-check both scripts**

Run: `bash -n deploy/linux/setup.sh && bash -n deploy/linux/install-wine-python.sh && echo "syntax ok"`
Expected: prints `syntax ok` (works on Git Bash on Windows too; this only checks syntax, does not run apt).

- [ ] **Step 4: Make executable + commit**

```bash
chmod +x deploy/linux/setup.sh deploy/linux/install-wine-python.sh
git add deploy/linux/setup.sh deploy/linux/install-wine-python.sh
git commit -m "feat(deploy): one-command Linux setup (Wine + MT5 + deps)"
```

---

## Task 11: Bridge start script

**Files:**
- Create: `deploy/linux/start-bridge.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
# Start Xvfb, the Wine MT5 terminal, then the bridge server (foreground).
# Used by the traderdiary-bridge systemd service.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WINEPREFIX="${WINEPREFIX:-/opt/traderdiary/wine}"
DISPLAY_NUM="${DISPLAY:-:99}"
export WINEPREFIX DISPLAY="$DISPLAY_NUM"

# Load .env (MT5_BRIDGE_PORT etc.) if present.
if [ -f "$REPO_ROOT/backend/.env" ]; then
    set -a; . "$REPO_ROOT/backend/.env"; set +a
fi

echo "==> Starting Xvfb on $DISPLAY"
Xvfb "$DISPLAY" -screen 0 1024x768x16 &
XVFB_PID=$!
sleep 2

TERMINAL_EXE="$(find "$WINEPREFIX/drive_c" -name terminal64.exe 2>/dev/null | head -n1 || true)"
if [ -n "$TERMINAL_EXE" ]; then
    echo "==> Launching MT5 terminal under Wine: $TERMINAL_EXE"
    wine "$TERMINAL_EXE" /portable &
    sleep 8
else
    echo "WARN: terminal64.exe not found under $WINEPREFIX/drive_c — install MT5 first."
fi

cleanup() { kill "$XVFB_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Starting bridge server (wine python)"
exec wine python "$REPO_ROOT/deploy/linux/bridge_server.py"
```

- [ ] **Step 2: Syntax check + chmod + commit**

```bash
bash -n deploy/linux/start-bridge.sh && echo "syntax ok"
chmod +x deploy/linux/start-bridge.sh
git add deploy/linux/start-bridge.sh
git commit -m "feat(deploy): start-bridge.sh (Xvfb + Wine MT5 + bridge server)"
```

---

## Task 12: App start script

**Files:**
- Create: `deploy/linux/start-app.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
# Start the FastAPI app bound to the LAN. Used by the traderdiary systemd unit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT/backend"
. venv/bin/activate

if [ -f .env ]; then set -a; . .env; set +a; fi
HOST="${SERVER_HOST:-0.0.0.0}"
PORT="${SERVER_PORT:-8001}"

echo "==> TraderDiary API on $HOST:$PORT"
exec python -m uvicorn app.main:app --host "$HOST" --port "$PORT" --workers 1
```

- [ ] **Step 2: Syntax check + chmod + commit**

```bash
bash -n deploy/linux/start-app.sh && echo "syntax ok"
chmod +x deploy/linux/start-app.sh
git add deploy/linux/start-app.sh
git commit -m "feat(deploy): start-app.sh (uvicorn on LAN)"
```

---

## Task 13: systemd units

**Files:**
- Create: `deploy/linux/systemd/traderdiary-bridge.service`
- Create: `deploy/linux/systemd/traderdiary.service`

- [ ] **Step 1: Create `traderdiary-bridge.service`**

```ini
[Unit]
Description=TraderDiary MT5 bridge (Wine + Xvfb)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=__USER__
Environment=WINEPREFIX=/opt/traderdiary/wine
Environment=WINEARCH=win64
Environment=DISPLAY=:99
WorkingDirectory=__REPO_ROOT__
ExecStart=/usr/bin/env bash __REPO_ROOT__/deploy/linux/start-bridge.sh
Restart=always
RestartSec=5
# Guard against a Wine memory leak OOM-ing the box (restarts instead).
MemoryMax=900M

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Create `traderdiary.service`**

```ini
[Unit]
Description=TraderDiary web app (FastAPI)
After=traderdiary-bridge.service
Requires=traderdiary-bridge.service

[Service]
Type=simple
User=__USER__
WorkingDirectory=__REPO_ROOT__/backend
ExecStart=/usr/bin/env bash __REPO_ROOT__/deploy/linux/start-app.sh
Restart=always
RestartSec=5
MemoryMax=400M

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Commit**

```bash
git add deploy/linux/systemd/traderdiary-bridge.service deploy/linux/systemd/traderdiary.service
git commit -m "feat(deploy): systemd units for bridge + app (autostart, mem caps)"
```

---

## Task 14: Service installer

**Files:**
- Create: `deploy/linux/install.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
# Install + enable the systemd units (autostart on boot). Re-runnable.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
UNIT_SRC="$REPO_ROOT/deploy/linux/systemd"
UNIT_DST="/etc/systemd/system"

for unit in traderdiary-bridge.service traderdiary.service; do
    echo "==> Installing $unit"
    sed -e "s|__USER__|$USER_NAME|g" -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
        "$UNIT_SRC/$unit" | sudo tee "$UNIT_DST/$unit" >/dev/null
done

sudo systemctl daemon-reload
sudo systemctl enable --now traderdiary-bridge.service
sudo systemctl enable --now traderdiary.service

echo "Installed + started. Check: ./deploy/linux/status.sh"
```

- [ ] **Step 2: Syntax check + chmod + commit**

```bash
bash -n deploy/linux/install.sh && echo "syntax ok"
chmod +x deploy/linux/install.sh
git add deploy/linux/install.sh
git commit -m "feat(deploy): install.sh — enable systemd autostart"
```

---

## Task 15: Status / health + LAN URL + QR

**Files:**
- Create: `deploy/linux/status.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
# Health check: services active? bridge reachable? app responding? Prints the
# LAN URL + a QR code so a phone can scan it.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -f "$REPO_ROOT/backend/.env" ]; then set -a; . "$REPO_ROOT/backend/.env"; set +a; fi
PORT="${SERVER_PORT:-8001}"
BRIDGE_PORT="${MT5_BRIDGE_PORT:-8765}"

echo "== systemd =="
systemctl is-active traderdiary-bridge.service && echo "bridge: active" || echo "bridge: NOT active"
systemctl is-active traderdiary.service && echo "app: active" || echo "app: NOT active"

echo "== bridge port $BRIDGE_PORT =="
if (exec 3<>"/dev/tcp/127.0.0.1/$BRIDGE_PORT") 2>/dev/null; then
    echo "bridge: reachable"
    exec 3>&- 3<&-
else
    echo "bridge: NOT reachable"
fi

echo "== app =="
if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 \
        && echo "app: responding" || echo "app: NOT responding"
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
URL="http://${LAN_IP:-127.0.0.1}:$PORT"
echo
echo "Open on phone or PC (same network):"
echo "  $URL"
if command -v qrencode >/dev/null 2>&1; then
    qrencode -t ANSIUTF8 "$URL"
fi
```

- [ ] **Step 2: Syntax check + chmod + commit**

```bash
bash -n deploy/linux/status.sh && echo "syntax ok"
chmod +x deploy/linux/status.sh
git add deploy/linux/status.sh
git commit -m "feat(deploy): status.sh — health + LAN URL + QR"
```

---

## Task 16: Wire LOW_RESOURCE_MODE into intervals

**Files:**
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_config_low_resource.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_config_low_resource.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_config_low_resource.py -v`
Expected: FAIL — current `config.py` ignores `LOW_RESOURCE_MODE`; intervals stay 1.0/60.

- [ ] **Step 3: Edit `config.py`**

Replace the `# WebSocket stream loop` block with a `LOW_RESOURCE_MODE`-aware
version (keep `os`/`sys` imports from Task 1 at the top):

```python
LOW_RESOURCE_MODE = os.getenv("LOW_RESOURCE_MODE", "0") == "1"

# WebSocket stream loop (relaxed under LOW_RESOURCE_MODE to save CPU/RAM)
WS_TICK_INTERVAL_SECONDS = 3.0 if LOW_RESOURCE_MODE else 1.0
SNAPSHOT_INTERVAL_SECONDS = 180 if LOW_RESOURCE_MODE else 60
TRAIL_CHECK_INTERVAL_SECONDS = 10 if LOW_RESOURCE_MODE else 5
WS_RECONNECT_FAILURE_THRESHOLD = 3
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_config_low_resource.py -v`
Expected: PASS — both tests green.

- [ ] **Step 5: Run full suite (confirm no interval-dependent test broke)**

Run: `cd backend && pytest -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/tests/test_config_low_resource.py
git commit -m "feat(config): LOW_RESOURCE_MODE relaxes stream/snapshot intervals"
```

---

## Task 17: Linux deploy README

**Files:**
- Create: `deploy/linux/README.md`

- [ ] **Step 1: Create the file**

````markdown
# TraderDiary on a Linux server (Wine)

Run TraderDiary as an always-on local server. MT5 runs under Wine; you open the
UI from a phone or PC on the same network.

> **Hardware reality:** on a low-RAM box (e.g. ~1.5 GiB free) this runs **one
> active account at a time** — a Wine MT5 terminal is RAM-heavy. The cap is set
> by `MAX_ACTIVE_ACCOUNTS` (default 1 on Linux).

## Quick start

```bash
git clone <repo> && cd TraderDiary
./deploy/linux/setup.sh                       # Wine + MT5 + Python deps
cp deploy/linux/.env.linux.example backend/.env
#   edit backend/.env → set ENCRYPTION_KEY (see comment in the file)
./deploy/linux/install.sh                      # systemd autostart
./deploy/linux/status.sh                       # health + LAN URL + QR
```

Open the printed `http://<server-ip>:8001` (or scan the QR) on your phone.

## Pieces

| File | Role |
|------|------|
| `setup.sh` | Install Wine, MT5 (silent), Wine-python + MetaTrader5, Linux venv, frontend |
| `install-wine-python.sh` | Windows Python + `pip install MetaTrader5` inside Wine |
| `bridge_server.py` | Runs under Wine python; hosts MT5, answers JSON over TCP :8765 |
| `start-bridge.sh` | Xvfb + Wine MT5 terminal + bridge server |
| `start-app.sh` | FastAPI on `0.0.0.0:8001` |
| `systemd/*.service` | Autostart on boot, restart on crash, memory caps |
| `status.sh` | Health check + LAN URL + QR |

## How it works

```
phone/PC ─LAN─> FastAPI :8001 ─> WorkerPool ─> mt5_provider(BridgeClient)
                                                  └─TCP :8765─> bridge_server (Wine) ─> MetaTrader5
```

The same Python code runs on Windows with the native MetaTrader5 module; the
`mt5_provider` seam swaps in the bridge client only on Linux.

## Troubleshooting

- **`bridge: NOT reachable`** → MT5 not installed/running under Wine. Re-run the
  install step interactively (see `setup.sh` note) and confirm:
  `WINEPREFIX=/opt/traderdiary/wine wine python -c "import MetaTrader5; print('ok')"`.
- **Slow / OOM** → keep `LOW_RESOURCE_MODE=1`; trim the MT5 Market Watch to only
  symbols you trade; the bridge unit's `MemoryMax` will restart Wine if it leaks.
- **Can't reach from phone** → confirm `SERVER_HOST=0.0.0.0` and open port 8001
  in the firewall (`sudo ufw allow 8001`).
- **MT5 won't run on this CPU at all** → fallback: run MT5 + `bridge_server.py`
  on a cheap Windows box/VM and point `MT5_BRIDGE_HOST` at it; the Linux box
  then only serves the UI.

## Updating the frontend

Building Next.js on a weak Atom is slow. Build on a dev machine
(`cd frontend && npm run build`) and copy `frontend/out/` to the server.
````

- [ ] **Step 2: Commit**

```bash
git add deploy/linux/README.md
git commit -m "docs(deploy): Linux server README"
```

---

### Phase 2 checkpoint

On the Atom box: `./deploy/linux/setup.sh` → edit `.env` → `./deploy/linux/install.sh`
→ `./deploy/linux/status.sh` shows bridge reachable + app responding + a QR.
Open the URL from a phone and confirm the dashboard loads. Connect one account
and confirm live ticks stream.

---

# PHASE 3 — Stealth Tier 1

## Task 18: Stealth order-request builder

**Files:**
- Create: `backend/app/services/stealth.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_stealth.py`

- [ ] **Step 1: Add stealth config to `config.py`**

Append:

```python
# ── Stealth order mode (reduce EA/automation footprint) ───────────────────────
STEALTH_MODE = os.getenv("STEALTH_MODE", "tier1")  # off | tier1 | tier2
# Comma list of natural-looking comments; one is chosen at random per order.
STEALTH_COMMENTS = [
    c.strip()
    for c in os.getenv("STEALTH_COMMENTS", ",").split(",")
]
# Per-account jitter range "min-max" in ms, applied before sending each order.
STEALTH_JITTER_MS = os.getenv("STEALTH_JITTER_MS", "300-2500")
# Optional fractional volume variance (e.g. 0.05 = ±5%); 0 disables.
STEALTH_VOLUME_VARIANCE = float(os.getenv("STEALTH_VOLUME_VARIANCE", "0.0"))
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_stealth.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stealth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.stealth'`.

- [ ] **Step 4: Write the implementation**

Create `backend/app/services/stealth.py`:

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_stealth.py -v`
Expected: PASS — all 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/stealth.py backend/app/config.py backend/tests/test_stealth.py
git commit -m "feat(stealth): Tier-1 order-request builder (magic=0, comment, jitter, variance)"
```

---

## Task 19: Use the stealth builder in both order paths

**Files:**
- Modify: `backend/app/workers/mt5_worker.py` (`_handle_place_market_order`, ~lines 242-284)
- Modify: `backend/app/services/mt5_service.py` (`place_market_order`, ~lines 314-368)

- [ ] **Step 1: Edit the worker handler `_handle_place_market_order`**

In `backend/app/workers/mt5_worker.py`, add the import near the other
`from app.workers ...` imports at the top:

```python
from app.services.stealth import apply_stealth  # noqa: E402
```

In `_handle_place_market_order`, change the `request` dict so `magic`/`comment`
come from stealth. Replace:

```python
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": type_order,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": 20,
        "magic": 234000,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(symbol),
    }
    result = mt5.order_send(request)
```

with:

```python
    request = apply_stealth({
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": type_order,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": 20,
        "magic": 234000,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(symbol),
    })
    result = mt5.order_send(request)
```

- [ ] **Step 2: Edit `mt5_service.place_market_order`**

In `backend/app/services/mt5_service.py`, add near the top imports:

```python
from app.services.stealth import apply_stealth
```

In `place_market_order`, wrap the `request` dict the same way. Replace:

```python
        request = {
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "type": type_order,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": 20,
            "magic": 234000,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": self._get_filling_mode(symbol),
        }

        result = mt5.order_send(request)
```

with:

```python
        request = apply_stealth({
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "type": type_order,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": 20,
            "magic": 234000,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": self._get_filling_mode(symbol),
        })

        result = mt5.order_send(request)
```

- [ ] **Step 3: Verify imports + full suite**

Run: `cd backend && python -c "import app.workers.mt5_worker, app.services.mt5_service; print('ok')" && pytest -v`
Expected: prints `ok`; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/workers/mt5_worker.py backend/app/services/mt5_service.py
git commit -m "feat(stealth): apply Tier-1 to both order-placement paths"
```

---

## Task 20: Per-account jitter + serialization in batch execution

**Files:**
- Modify: the batch execution path. Locate it first.
- Test: `backend/tests/test_stealth_batch.py` (create)

- [ ] **Step 1: Locate the batch loop**

Run: `cd backend && grep -rn "execute" app/routes/trading.py | head`
Expected: shows the `execute-batch` handler that loops over accounts. Read the
loop body — it iterates accounts and calls the order path per account.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_stealth_batch.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stealth_batch.py -v`
Expected: FAIL — `stealth.batch_delay_seconds` does not exist.

- [ ] **Step 4: Add `batch_delay_seconds` to `stealth.py`**

Append to `backend/app/services/stealth.py`:

```python
def batch_delay_seconds(*, mode: Optional[str] = None, spec: str = STEALTH_JITTER_MS) -> float:
    """Delay to sleep before sending the next account's order in a batch.

    0 when stealth is off; a jittered value otherwise so orders across accounts
    don't share an identical timestamp (a copy-trade detection signal).
    """
    mode = mode if mode is not None else STEALTH_MODE
    if mode == "off":
        return 0.0
    return jitter_seconds(spec)
```

- [ ] **Step 5: Wire it into the batch loop**

In `backend/app/routes/trading.py`, import at top:

```python
from app.services.stealth import batch_delay_seconds
```

In the `execute-batch` handler's per-account loop, after each account's order is
sent, add a jitter sleep before the next iteration. Inside the loop body, at the
end of each iteration (use `asyncio` if the handler is async, else `time.sleep`):

```python
        # Stealth: stagger orders across accounts (skip after the last one).
        if idx < len(accounts) - 1:
            await asyncio.sleep(batch_delay_seconds())
```

If the loop does not currently expose `idx`/`accounts`, convert it to
`for idx, account in enumerate(accounts):`. If the handler is synchronous,
use `import time` and `time.sleep(batch_delay_seconds())` instead of `await asyncio.sleep(...)`.

- [ ] **Step 6: Run tests + verify import**

Run: `cd backend && python -c "import app.routes.trading; print('ok')" && pytest tests/test_stealth_batch.py tests/test_stealth.py -v`
Expected: prints `ok`; all stealth tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/stealth.py backend/app/routes/trading.py backend/tests/test_stealth_batch.py
git commit -m "feat(stealth): per-account jitter between batch orders"
```

---

## Task 21: Frontend stealth toggle (settings)

**Files:**
- Modify: the settings page/route that already exists (`app/routes/settings.py` backend, settings UI frontend). Locate first.

- [ ] **Step 1: Locate the settings surface**

Run: `cd backend && grep -rn "get_setting\|set_setting\|KEY_" app/services/settings.py | head` and
`grep -rln "settings" frontend/app` to find the settings page.
Expected: identifies the settings key store and the settings page component.

- [ ] **Step 2: Add a `stealth_mode` setting key (backend)**

In `backend/app/services/settings.py`, add a key constant alongside the existing
`KEY_*` constants:

```python
KEY_STEALTH_MODE = "stealth_mode"
```

If there is a settings GET/PUT route in `backend/app/routes/settings.py`, ensure
`stealth_mode` is among the returned/accepted keys (follow the existing pattern
for `KEY_DEFAULT_MT5_BASE_PATH`). Read the file and mirror that pattern exactly.

- [ ] **Step 3: Read the setting at order time (override env default)**

In `backend/app/services/stealth.py`, allow an explicit `mode` argument to win
(already supported). In the batch handler (`trading.py`), read the DB setting
and pass it through:

```python
        mode = get_setting(db, KEY_STEALTH_MODE) or None  # None → falls back to env
```
and pass `mode=mode` into `apply_stealth(...)` and `batch_delay_seconds(mode=mode)`.
Import `get_setting` and `KEY_STEALTH_MODE` at the top of `trading.py`.

- [ ] **Step 4: Add the toggle to the settings page (frontend)**

In the settings page component, add a select bound to the `stealth_mode` setting
with options `off | tier1 | tier2`, persisted via the existing settings API
client call. Follow the existing control pattern on that page (do not invent a
new state mechanism). Keep it minimal — one labeled `<select>`.

- [ ] **Step 5: Verify backend + build frontend**

Run: `cd backend && pytest -v` (all PASS) and `cd frontend && npm run build`
(build succeeds).
Expected: backend green; frontend builds without type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/settings.py backend/app/routes/settings.py backend/app/routes/trading.py frontend/
git commit -m "feat(stealth): settings toggle for stealth mode (off|tier1|tier2)"
```

---

### Phase 3 checkpoint

Place a test order on the Atom box (demo account). In MT5, confirm the resulting
deal shows `magic = 0` and the natural/empty comment. Place a batch on two
accounts (on stronger hardware) and confirm the order timestamps differ by the
jitter interval. The settings toggle flips stealth off/tier1.

---

# PHASE 4 — Stealth Tier 2 (design only)

## Task 22: Document the Tier-2 GUI-automation approach + stub

**Files:**
- Create: `deploy/linux/STEALTH_TIER2.md`
- Create: `backend/app/services/stealth_gui.py` (stub — not wired in)

- [ ] **Step 1: Write the design doc**

Create `deploy/linux/STEALTH_TIER2.md`:

````markdown
# Stealth Tier 2 — GUI automation (design, not implemented)

## Why
Tier 1 sets `magic=0` and a natural comment, defeating the common prop-firm EA
checks. It cannot change the server-stamped deal `reason`: orders sent via the
MetaTrader5 Python API are stamped `DEAL_REASON_EXPERT`. Firms that inspect the
deal `reason` will still see "expert". The only way to register a trade as a
manual `DEAL_REASON_CLIENT` is to drive the terminal UI itself.

## Approach
The MT5 terminal already runs under Wine on a virtual display (`Xvfb :99`).
Automate the One-Click-Trading panel via GUI input against that display:

1. Ensure the symbol is in Market Watch and the chart/One-Click panel is open.
2. Set volume, then click Buy/Sell on the One-Click panel.
3. For SL/TP, open the order dialog (F9), fill fields, submit.

Tooling options (Linux side, acting on the Wine X server):
- `xdotool` — move/click/type against `DISPLAY=:99` (search window, send keys).
- OpenCV template-matching on `import`/`xwd` screenshots to locate buttons
  robustly across terminal themes.

## Why it's deferred
- Fragile: coordinates shift with terminal version/theme/DPI; needs template
  matching + retries.
- Slow: seconds per order vs milliseconds for the API path — bad on an Atom.
- Hard to verify headless; needs a feedback loop reading the resulting deal.

## Integration sketch (when built)
- `backend/app/services/stealth_gui.py` exposes
  `place_via_gui(symbol, volume, side, sl, tp) -> dict` with the same return
  shape as the API path.
- `stealth.apply_stealth(..., mode="tier2")` would route order placement through
  the GUI path instead of `mt5.order_send` when `STEALTH_MODE=tier2`.
- A new bridge method `gui_place_order` would run the xdotool sequence on the
  Wine side (where the X server and terminal live).

## Acceptance criteria for a future Tier-2 task
- A placed order's deal shows `reason == DEAL_REASON_CLIENT` (verify via
  `history_deals_get`).
- Round-trip latency and failure-retry behavior documented and bounded.
````

- [ ] **Step 2: Write the stub module**

Create `backend/app/services/stealth_gui.py`:

```python
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
```

- [ ] **Step 3: Verify the stub imports**

Run: `cd backend && python -c "import app.services.stealth_gui; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add deploy/linux/STEALTH_TIER2.md backend/app/services/stealth_gui.py
git commit -m "docs(stealth): Tier-2 GUI-automation design + stub"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §C1 provider seam → Task 2, Task 4. ✓
- §C2 Wine bridge server → Task 3. ✓
- §C3 Linux bridge client → Task 2. ✓
- §C4 worker/health/pool adaptation → Tasks 5, 6, 7, 8. ✓
- §C5 setup/init tooling → Tasks 9-15, 17. ✓
- §C6 low-resource + LAN/QR → Tasks 15, 16. ✓
- §C7 stealth Tier 1 → Tasks 18, 19, 20, 21. ✓
- §C7 stealth Tier 2 (design-only) → Task 22. ✓
- Single-account cap → Task 6 + Task 8. ✓
- `history_deals_get`/`order_calc_margin` in bridge surface → handled generically by `_handle`/`__getattr__` (any method name dispatches). ✓

**Placeholder scan:** No TBD/TODO. Tasks 20-21 require locating code in
`trading.py`/`settings.py` first (steps include the exact grep), because those
files were not fully read during planning; the edit pattern and target are
specified. Acceptable — the worker is told what to find and how to wire it.

**Type consistency:** `BridgeClient`/`use_bridge`/`mt5` (Task 2) match Task 4
import (`from app.services.mt5_provider import mt5`). `WorkerLimitReached`
(Task 6) matches Task 8 import. `apply_stealth`/`batch_delay_seconds`/
`jitter_seconds`/`parse_jitter_ms` consistent across Tasks 18-20.
`default_max_active_accounts` (Task 1) matches Task 6 usage. `_serialize`/
`_handle` (Task 3) match the bridge test (Task 3) and BridgeClient protocol
(Task 2).
