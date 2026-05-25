"""Line-delimited JSON-RPC protocol between master and MT5 worker.

Each message is a single JSON object on its own line (terminated by \n).
Three message kinds:

- Request (master → worker): {"id": "...", "method": "...", "params": {...}}
- Response (worker → master): {"id": "...", "result": ...}
                                or {"id": "...", "error": {"code": "...", "message": "..."}}
- Event (worker → master): {"event": "...", "data": {...}}   (no "id")

The id correlates request and response. The same string flows back so the
master can resolve the right awaiting future.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional


# ── Error codes ───────────────────────────────────────────────────────────────
ERR_PARSE = "parse_error"
ERR_METHOD_NOT_FOUND = "method_not_found"
ERR_INVALID_PARAMS = "invalid_params"
ERR_MT5_FAILURE = "mt5_failure"
ERR_INTERNAL = "internal_error"


@dataclass
class Request:
    id: str
    method: str
    params: dict[str, Any]


# ── Encoding ──────────────────────────────────────────────────────────────────
def encode_request(id_: str, method: str, params: Optional[dict[str, Any]] = None) -> str:
    """Return a single-line JSON request, newline-terminated."""
    return json.dumps({"id": id_, "method": method, "params": params or {}}) + "\n"


def encode_response(id_: str, result: Any) -> str:
    return json.dumps({"id": id_, "result": result}) + "\n"


def encode_error(id_: str, code: str, message: str) -> str:
    return json.dumps({"id": id_, "error": {"code": code, "message": message}}) + "\n"


def encode_event(event: str, data: dict[str, Any]) -> str:
    return json.dumps({"event": event, "data": data}) + "\n"


# ── Decoding ──────────────────────────────────────────────────────────────────
def decode_request(line: str) -> Request:
    """Parse a master→worker request line. Raises ValueError on malformed input."""
    try:
        obj = json.loads(line)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid JSON: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError("request must be a JSON object")
    if "id" not in obj or "method" not in obj:
        raise ValueError("request missing 'id' or 'method'")
    return Request(
        id=str(obj["id"]),
        method=str(obj["method"]),
        params=obj.get("params") or {},
    )


def decode_worker_line(line: str) -> dict[str, Any]:
    """Parse a worker→master line. Could be a response or event. Returns the dict."""
    obj = json.loads(line)
    if not isinstance(obj, dict):
        raise ValueError("worker output must be a JSON object")
    return obj


def is_response(obj: dict[str, Any]) -> bool:
    return "id" in obj and ("result" in obj or "error" in obj)


def is_event(obj: dict[str, Any]) -> bool:
    return "event" in obj and "id" not in obj
