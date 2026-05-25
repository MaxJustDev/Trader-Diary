"""Fake MT5 worker used in pool tests. Does not touch MT5.

Runs as `python -m tests.fixtures.fake_mt5_worker <account_db_id>`.

Behavior:
- Emits {"event":"health","data":{"state":"ready"}} immediately.
- Echoes ping with "pong".
- `echo` method returns its params verbatim.
- `fail` method always returns an RPC error.
- `slow` method waits `params.delay_seconds` then returns "done".
- `shutdown` exits.
- After bootstrap, emits one "tick" event with data {"counter": N} every
  `TICK_INTERVAL` seconds (default 0.05s, fast for tests).
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time

# Allow `from app.workers import protocol` to resolve when run via `-m`.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.workers import protocol as p  # noqa: E402

TICK_INTERVAL = float(os.environ.get("FAKE_WORKER_TICK", "0.05"))

_stop = threading.Event()
_lock = threading.Lock()


def _emit(line: str) -> None:
    with _lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def _tick_loop() -> None:
    counter = 0
    while not _stop.wait(TICK_INTERVAL):
        counter += 1
        _emit(p.encode_event("tick", {"counter": counter}))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m tests.fixtures.fake_mt5_worker <account_db_id>", file=sys.stderr)
        return 2
    _emit(p.encode_event("health", {"state": "ready"}))

    t = threading.Thread(target=_tick_loop, daemon=True)
    t.start()

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = p.decode_request(line)
        except ValueError as e:
            _emit(p.encode_error("0", p.ERR_PARSE, str(e)))
            continue

        if req.method == "ping":
            _emit(p.encode_response(req.id, "pong"))
        elif req.method == "echo":
            _emit(p.encode_response(req.id, req.params))
        elif req.method == "fail":
            _emit(p.encode_error(req.id, "fake_error", "intentional"))
        elif req.method == "slow":
            delay = float(req.params.get("delay_seconds", 0.2))
            time.sleep(delay)
            _emit(p.encode_response(req.id, "done"))
        elif req.method == "shutdown":
            _emit(p.encode_response(req.id, "ok"))
            _stop.set()
            return 0
        else:
            _emit(p.encode_error(req.id, p.ERR_METHOD_NOT_FOUND, req.method))

    _stop.set()
    return 0


if __name__ == "__main__":
    sys.exit(main())
