# Batch C — Code Quality Refactor

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: Backend file structure + duplication removal + config externalization
**Prereq**: Batch A merged or branch-stacked

## Goal

Untangle backend file structure so a newcomer can navigate it without reading every file: move the 400-line `FUND_TEMPLATES` dict out of a route file, kill the route→route import in `analytics.py`, deduplicate the MT5 login flow that repeats six times, and split the WS-streaming concerns out of `routes/mt5.py`. Centralize timing constants. No API contract change. No behavioral change.

## Non-Goals

- Renaming the `account.account_id` DB column to `mt5_login` (API-breaking; deferred indefinitely)
- Rewriting error-handling style (HTTPException vs `{success: false}` dicts) — separate concern, separate batch
- Replacing manual `SessionLocal()` blocks where they exist (services already short-lived; FastAPI `get_db` already used in all routes)
- Adding type stubs / mypy / linters

## Problems Being Solved

| # | Location | Problem |
|---|----------|---------|
| 1 | `routes/funds.py` (618 lines) | ~400 lines of hardcoded fund templates (FTMO, The5ers, Fortrades, etc.) mixed into a route file. Newcomer can't tell what's API and what's seed data. |
| 2 | `routes/mt5.py:22-31` | `mt5_service` singleton, `connected_account_id` global, `TRAILING_STOPS` dict, and timing constants live in a route file. `routes/analytics.py:196` imports from `routes/mt5.py` → route→route coupling. |
| 3 | `routes/mt5.py:416-493` | `_save_snapshot`, `_maybe_reset_daily_open`, `_check_trailing_stops`, `_attempt_reconnect` are streaming-mechanics helpers cluttering the route file. |
| 4 | `routes/accounts.py`, `routes/trading.py`, `routes/mt5.py` | The pattern `password = decrypt_password(account.password); mt5_service.login(int(account.account_id), password, account.server, path=account.mt5_path)` appears 6+ times. |
| 5 | `routes/mt5.py:26-31` | `SNAPSHOT_INTERVAL = 60`, `TRAIL_CHECK_INTERVAL = 5`, and other magic numbers (`consecutive_failures >= 3`, trail check ordering) embedded in route module. |
| 6 | `routes/mt5.py:32` | `_last_trail_check = 0.0` is dead — never read, `last_trail_time` local var used instead. |

## Solution Architecture

### File structure changes

| Path | Status | Responsibility |
|------|--------|----------------|
| `backend/app/data/fund_templates.json` | NEW | The literal template dictionary. Loaded once at module import. |
| `backend/app/services/fund_templates.py` | NEW | `load_templates() -> dict`, single source of truth for code that needs templates. |
| `backend/app/services/mt5_singleton.py` | NEW | `mt5_service` instance + `connected_account_id` getter/setter. Replaces direct `from routes.mt5 import mt5_service`. |
| `backend/app/services/mt5_auth.py` | NEW | `login_account(account: Account, mt5_service: MT5Service) -> bool` — single login helper that decrypts password + calls `mt5_service.login(...)`. |
| `backend/app/services/mt5_streaming.py` | NEW | `save_snapshot`, `maybe_reset_daily_open`, `check_trailing_stops`, `attempt_reconnect`, and the `TRAILING_STOPS` registry. |
| `backend/app/config.py` | NEW | All timing/interval constants as module-level values. |
| `backend/app/routes/funds.py` | MODIFY | Replace inline `FUND_TEMPLATES = {...}` with `from app.services.fund_templates import load_templates`. |
| `backend/app/routes/mt5.py` | MODIFY | Import singleton + helpers from services. Keep only HTTP handlers + WS endpoint. Target <250 lines. |
| `backend/app/routes/analytics.py` | MODIFY | Replace `from app.routes.mt5 import mt5_service, connected_account_id` with `from app.services.mt5_singleton import mt5_service, get_connected_account_id`. |
| `backend/app/routes/accounts.py` | MODIFY | Use `login_account(account, mt5_service)` helper. |
| `backend/app/routes/trading.py` | MODIFY | Replace inline `decrypt + mt5.login(int(account.account_id), ...)` with `login_account(account, mt5)` in the three helpers (`_check_symbol_on_account`, `_calculate_for_account`, `_prepare_for_execution`, `_execute_single_trade`). |

### Singleton module shape

`backend/app/services/mt5_singleton.py`:

```python
from app.services.mt5_service import MT5Service

mt5_service = MT5Service()

_connected_account_id: int | None = None

def get_connected_account_id() -> int | None:
    return _connected_account_id

def set_connected_account_id(account_db_id: int | None) -> None:
    global _connected_account_id
    _connected_account_id = account_db_id
```

`routes/mt5.py` keeps the `connected_account_id` reads as `get_connected_account_id()` and writes via `set_connected_account_id(...)`. This makes mutation explicit and visible in audit.

### Login helper shape

`backend/app/services/mt5_auth.py`:

```python
from app.models.accounts import Account
from app.services.mt5_service import MT5Service
from app.services.encryption import decrypt_password

def login_account(account: Account, mt5: MT5Service) -> bool:
    """Decrypt the account's password and log it in via the given MT5 service.

    Returns True on success, False on any failure. The caller is responsible
    for dispatching this through `run_mt5` if called from an async handler.
    """
    try:
        password = decrypt_password(account.password)
    except Exception:
        return False
    return mt5.login(int(account.account_id), password, account.server, path=account.mt5_path)
```

This is sync — by design. Callers in async handlers already dispatch the surrounding work through `run_mt5`.

### Fund templates loader

`backend/app/data/fund_templates.json` — verbatim copy of the current `FUND_TEMPLATES` dict, serialized as JSON. Property order preserved.

`backend/app/services/fund_templates.py`:

```python
import json
from functools import lru_cache
from pathlib import Path

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "data" / "fund_templates.json"

@lru_cache(maxsize=1)
def load_templates() -> dict:
    with _TEMPLATES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)
```

`lru_cache` makes it a singleton-per-process. JSON load happens once.

### Config module

`backend/app/config.py`:

```python
"""Centralized constants and tunables for the backend."""

# WebSocket stream loop
WS_TICK_INTERVAL_SECONDS = 1.0          # how often to poll MT5 + push to client
SNAPSHOT_INTERVAL_SECONDS = 60          # how often to persist EquitySnapshot
TRAIL_CHECK_INTERVAL_SECONDS = 5        # how often to evaluate trailing stops
WS_RECONNECT_FAILURE_THRESHOLD = 3      # consecutive None readings before re-login

# MT5
MT5_INIT_RETRIES = 3                    # MT5Service.initialize attempt count

# Trading
DEFAULT_ORDER_DEVIATION = 20            # broker-side slippage tolerance in points
DEFAULT_MAGIC = 234000                  # comment/magic number on trades
```

Existing literals (e.g., `SNAPSHOT_INTERVAL = 60` in `routes/mt5.py`) replaced with imports from `app.config`.

### Streaming module shape

`backend/app/services/mt5_streaming.py` owns the four helpers + the `TRAILING_STOPS` registry. The functions are pure-sync; the WS handler in `routes/mt5.py` dispatches them via `run_db` / `run_mt5` exactly as before.

Public API:

```python
TRAILING_STOPS: dict[int, dict]

def save_snapshot(account_db_id: int, info: dict) -> None: ...
def maybe_reset_daily_open(account_db_id: int, info: dict) -> None: ...
def check_trailing_stops(positions: list[dict]) -> None: ...

async def attempt_reconnect(account_db_id: int) -> None: ...   # async, uses run_mt5
```

`routes/mt5.py` imports these and the WS endpoint uses them.

## Behavior Preservation

- Every API endpoint returns identical JSON to its current shape.
- The migration in `main.py` is unchanged (no new columns, no removed columns).
- `lru_cache` on `load_templates()` matches the current module-load-once behavior.
- `mt5_service` is still a single instance; `connected_account_id` is still a single int; `TRAILING_STOPS` is still a single dict.
- Logging messages preserved verbatim where possible.

## Testing Plan

Pytest stays the primary mechanism. Add the following unit tests under `backend/tests/`:

1. `test_fund_templates.py` — `load_templates()` returns a dict with at least the keys `FTMO`, `The5ers`, `Fortrades`. Round-trip JSON load OK.
2. `test_mt5_auth.py` — `login_account` is called with the expected `(login, password, server, path)` from a fake `MT5Service.login` (use a tiny stub class). Decrypt failure returns False without raising.
3. `test_mt5_singleton.py` — `get/set_connected_account_id` round-trips. `mt5_service` is the same instance across imports.
4. `test_imports.py` — every refactored module imports without side effects (verifies no circular-import regression after restructuring).

Manual smoke:
- Start backend; verify it loads.
- Hit each endpoint family once (accounts list, funds list, trading check-symbol with a dummy payload that returns 422 — confirms the route is wired, not that MT5 works) and confirm no 500.

## Files Changed Summary

NEW: `data/fund_templates.json`, `services/fund_templates.py`, `services/mt5_singleton.py`, `services/mt5_auth.py`, `services/mt5_streaming.py`, `config.py`, plus four test files.

MODIFY: `routes/funds.py`, `routes/mt5.py`, `routes/analytics.py`, `routes/accounts.py`, `routes/trading.py`.

DELETE (from source files; content moves not deletes): inline `FUND_TEMPLATES` in `funds.py`, in-file helper functions and constants in `mt5.py`.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Circular import after splitting: `services/mt5_streaming.py` ↔ `services/mt5_singleton.py` | Medium | Streaming imports the singleton at call time, not at module load (function-local imports) where needed. Or pass `mt5_service` as a parameter. |
| JSON template format silently differs from Python dict (Booleans/None) | Low | `json.load` round-trips `null` ↔ `None`, `true/false` ↔ `True/False` correctly. Manual diff verification on first program (`FTMO/1 Phase/Phase 1`). |
| `lru_cache` masks template changes during dev | Low | Acceptable: templates change rarely; restart picks up edits. Document in module docstring. |
| Helper extraction changes order of operations | Low | Helper is a pure refactor (same try/decrypt/login sequence). Verified by reading each call-site diff. |
| Constants module breaks existing config flow | Low | `config.py` only adds new constants; nothing else imports config yet; existing `os.environ.get` usage in `mt5_service.py` stays. |

## Success Criteria

- `routes/funds.py` < 250 lines (was 618)
- `routes/mt5.py` < 250 lines (was 521 after Batch A)
- No `from app.routes.*` import inside another route file (`grep -rn "from app.routes" backend/app/routes/` returns nothing)
- Single occurrence of `decrypt_password + mt5.login` chain in the codebase (`grep -rn "decrypt_password" backend/app/` shows it only in `services/mt5_auth.py` and the `encryption.py` definition site)
- All Batch A pytest tests still pass; 4 new test files added and green
- Manual smoke: `python run.py` boots without error; `GET /api/accounts` returns 200

## Out of Scope (Future Batches)

- account_id column rename (API breaking)
- error-handling style unification
- `mt5_service.py` itself splitting (it's already focused)
- `analytics.py` further decomposition
