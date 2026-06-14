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
