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

    # connection
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

    # public surface (real methods bypass __getattr__)
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
                    self._reset()
                    self._last_error = (-1, f"bridge transport: {e}")
            constants = dict(self._constants)
        if name in constants:
            return constants[name]

        def _method(*args, **kwargs):
            return self._rpc(name, args, kwargs)

        return _method


# Module-level handle chosen at import time
if use_bridge():
    mt5 = BridgeClient(MT5_BRIDGE_HOST, MT5_BRIDGE_PORT)
else:  # Windows: native module, zero behavior change
    import MetaTrader5 as mt5  # type: ignore


def get_mt5():
    return mt5
