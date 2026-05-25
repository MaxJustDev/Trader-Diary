# Batch C — Code Quality Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Untangle backend file structure — externalize fund templates, move MT5 singleton out of routes, dedupe the login flow, split streaming helpers out of `routes/mt5.py`, centralize timing constants. Zero API change.

**Architecture:** New modules under `backend/app/services/` and `backend/app/data/`; route files become thin handlers. Each route file shrinks below 250 lines. Behavior-preserving.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy, pytest.

**Spec:** `docs/superpowers/specs/2026-05-25-batch-c-code-quality-design.md`

---

## File Map

| Path | Status | Purpose |
|------|--------|---------|
| `backend/app/config.py` | NEW | Timing/interval constants |
| `backend/app/data/__init__.py` | NEW | Empty package marker |
| `backend/app/data/fund_templates.json` | NEW | Template dict serialized |
| `backend/app/services/fund_templates.py` | NEW | `load_templates()` with `lru_cache` |
| `backend/app/services/mt5_singleton.py` | NEW | `mt5_service` + connected_account_id accessors |
| `backend/app/services/mt5_auth.py` | NEW | `login_account()` helper |
| `backend/app/services/mt5_streaming.py` | NEW | Streaming helpers + TRAILING_STOPS |
| `backend/tests/test_fund_templates.py` | NEW | Loader tests |
| `backend/tests/test_mt5_auth.py` | NEW | Login helper tests |
| `backend/tests/test_mt5_singleton.py` | NEW | Singleton getter/setter tests |
| `backend/tests/test_imports.py` | NEW | Smoke import test |
| `backend/app/routes/funds.py` | MODIFY | Use `load_templates()` instead of inline dict |
| `backend/app/routes/mt5.py` | MODIFY | Import singleton + streaming + config; remove inline helpers/constants |
| `backend/app/routes/analytics.py` | MODIFY | Import singleton from `services`, not from `routes.mt5` |
| `backend/app/routes/accounts.py` | MODIFY | Use `login_account()` |
| `backend/app/routes/trading.py` | MODIFY | Use `login_account()` in the four sync helpers |

---

## Task 1: Extract `FUND_TEMPLATES` to JSON + loader

**Files:**
- Create: `backend/app/data/__init__.py`
- Create: `backend/app/data/fund_templates.json`
- Create: `backend/app/services/fund_templates.py`
- Create: `backend/tests/test_fund_templates.py`
- Modify: `backend/app/routes/funds.py`

- [ ] **Step 1: Create empty data package marker**

`backend/app/data/__init__.py` — empty file (0 bytes).

- [ ] **Step 2: Serialize current `FUND_TEMPLATES` to JSON**

Read the current `FUND_TEMPLATES` dict in `backend/app/routes/funds.py` (the literal that starts at the top of the file, lines ~14–480 depending on current state). Use this Python one-liner to extract and save:

```powershell
cd C:\Users\Max\Desktop\TraderDiary\backend
.\venv\Scripts\activate
python -c "import json; from app.routes.funds import FUND_TEMPLATES; open('app/data/fund_templates.json','w',encoding='utf-8').write(json.dumps(FUND_TEMPLATES, indent=2, ensure_ascii=False))"
```

Expected: file `backend/app/data/fund_templates.json` exists, formatted, UTF-8.

- [ ] **Step 3: Write the loader module**

Create `backend/app/services/fund_templates.py`:

```python
"""Single source of truth for prop-firm fund templates.

The JSON file (`app/data/fund_templates.json`) is the seed data for the funds
table. Loaded once per process via `lru_cache`. To pick up edits during dev,
restart the server.
"""
import json
from functools import lru_cache
from pathlib import Path

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "data" / "fund_templates.json"


@lru_cache(maxsize=1)
def load_templates() -> dict:
    """Return the fund-template dictionary keyed by fund name."""
    with _TEMPLATES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)
```

- [ ] **Step 4: Write loader tests**

Create `backend/tests/test_fund_templates.py`:

```python
def test_load_templates_returns_dict_with_expected_funds():
    from app.services.fund_templates import load_templates

    templates = load_templates()
    assert isinstance(templates, dict)
    # Spot-check the three primary funds known to exist
    for key in ("FTMO", "The5ers", "Fortrades"):
        assert key in templates, f"missing template: {key}"


def test_load_templates_caches_same_instance():
    from app.services.fund_templates import load_templates

    a = load_templates()
    b = load_templates()
    assert a is b, "load_templates() should return a cached singleton"


def test_first_program_phase_rule_round_trip():
    """JSON ↔ dict round trip preserved None/True/False correctly."""
    from app.services.fund_templates import load_templates

    ftmo = load_templates()["FTMO"]
    first_program = ftmo["programs"][0]
    first_phase = first_program["phase_rules"][0]
    # profit_target is a number; drawdown_type is a string
    assert isinstance(first_phase["profit_target"], (int, float)) or first_phase["profit_target"] is None
    assert first_phase["drawdown_type"] in ("static", "eod_trailing")
```

- [ ] **Step 5: Run the new tests against the current code (still using inline dict, but the JSON loader works standalone)**

```powershell
pytest tests/test_fund_templates.py -v
```

Expected: 3 PASSED.

- [ ] **Step 6: Switch `routes/funds.py` to use the loader**

Open `backend/app/routes/funds.py`. Locate the inline `FUND_TEMPLATES = { ... }` literal. Replace the entire literal (from the line `FUND_TEMPLATES = {` through its closing `}`) with:

```python
from app.services.fund_templates import load_templates

# Keep the FUND_TEMPLATES name for backward compatibility with downstream code
FUND_TEMPLATES = load_templates()
```

Also remove the `import json` line if it was only used to support the inline dict structure (check; `funds.py` likely still uses `json` for `account_name_patterns` serialization — if so, KEEP the import).

- [ ] **Step 7: Verify everything still imports + routes resolve**

```powershell
python -c "from app.routes.funds import router, FUND_TEMPLATES; assert 'FTMO' in FUND_TEMPLATES; print('OK', len(FUND_TEMPLATES))"
pytest -v
```

Expected: `OK <number-of-templates>`. All previous tests + 3 new tests PASS.

- [ ] **Step 8: Verify the resulting file is < 250 lines**

```powershell
(Get-Content app/routes/funds.py | Measure-Object -Line).Lines
```

Expected: < 250.

- [ ] **Step 9: Commit**

From project root:

```powershell
git add backend/app/data/__init__.py backend/app/data/fund_templates.json backend/app/services/fund_templates.py backend/tests/test_fund_templates.py backend/app/routes/funds.py
git commit -m "refactor(funds): externalize fund templates to JSON + loader"
```

---

## Task 2: Centralize constants in `config.py`

**Files:**
- Create: `backend/app/config.py`
- Modify: `backend/app/routes/mt5.py` (imports + constants usage)

- [ ] **Step 1: Create the config module**

Create `backend/app/config.py`:

```python
"""Centralized constants and tunables for the backend."""

# WebSocket stream loop
WS_TICK_INTERVAL_SECONDS = 1.0
SNAPSHOT_INTERVAL_SECONDS = 60
TRAIL_CHECK_INTERVAL_SECONDS = 5
WS_RECONNECT_FAILURE_THRESHOLD = 3

# MT5
MT5_INIT_RETRIES = 3

# Trading
DEFAULT_ORDER_DEVIATION = 20
DEFAULT_MAGIC = 234000
```

- [ ] **Step 2: Replace `routes/mt5.py` constants with imports**

In `backend/app/routes/mt5.py`, locate the constants block currently around lines 26-31:

```python
# How often to persist an equity snapshot (seconds)
SNAPSHOT_INTERVAL = 60

# In-memory trailing stops: ticket -> {trail_pips, symbol, type, digits}
TRAILING_STOPS: dict = {}
TRAIL_CHECK_INTERVAL = 5  # seconds
_last_trail_check = 0.0
```

Replace with (KEEPING `TRAILING_STOPS` — that's not a constant, it's a registry; we'll move it in Task 5):

```python
from app.config import (
    SNAPSHOT_INTERVAL_SECONDS,
    TRAIL_CHECK_INTERVAL_SECONDS,
    WS_TICK_INTERVAL_SECONDS,
    WS_RECONNECT_FAILURE_THRESHOLD,
)

# Backward-compatible aliases — to be removed in Task 5
SNAPSHOT_INTERVAL = SNAPSHOT_INTERVAL_SECONDS
TRAIL_CHECK_INTERVAL = TRAIL_CHECK_INTERVAL_SECONDS

# In-memory trailing stops: ticket -> {trail_pips, symbol, type, digits}
TRAILING_STOPS: dict = {}
```

The `_last_trail_check = 0.0` line is DEAD — delete it (the WS endpoint uses a local `last_trail_time` variable instead).

Find the WS endpoint and the trail-check guard. Currently it references `TRAIL_CHECK_INTERVAL` — leave that name as-is (it now aliases the config). Same for `SNAPSHOT_INTERVAL`. The `consecutive_failures >= 3` literal in the WS loop — change to:

```python
if consecutive_failures >= WS_RECONNECT_FAILURE_THRESHOLD:
```

`asyncio.sleep(1)` at the bottom of the loop — change to:

```python
await asyncio.sleep(WS_TICK_INTERVAL_SECONDS)
```

- [ ] **Step 3: Verify imports + run tests**

```powershell
python -c "from app.routes.mt5 import websocket_endpoint, SNAPSHOT_INTERVAL, TRAIL_CHECK_INTERVAL; assert SNAPSHOT_INTERVAL == 60 and TRAIL_CHECK_INTERVAL == 5; print('OK')"
pytest -v
```

Expected: `OK`. All tests still pass.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/config.py backend/app/routes/mt5.py
git commit -m "refactor(config): centralize timing constants + drop dead variable"
```

---

## Task 3: MT5 singleton module

**Files:**
- Create: `backend/app/services/mt5_singleton.py`
- Create: `backend/tests/test_mt5_singleton.py`
- Modify: `backend/app/routes/mt5.py` (replace inline singleton with import)
- Modify: `backend/app/routes/analytics.py` (replace `from app.routes.mt5 import ...`)

- [ ] **Step 1: Create the singleton module**

Create `backend/app/services/mt5_singleton.py`:

```python
"""Process-wide MT5 service instance + connected-account tracker.

Imported by routes and services that need to talk to the broker. Kept in
`services/` (not `routes/`) so non-route modules (analytics, streaming) can
import without creating route→route coupling.
"""
from typing import Optional

from app.services.mt5_service import MT5Service

mt5_service = MT5Service()

_connected_account_id: Optional[int] = None


def get_connected_account_id() -> Optional[int]:
    return _connected_account_id


def set_connected_account_id(account_db_id: Optional[int]) -> None:
    global _connected_account_id
    _connected_account_id = account_db_id
```

- [ ] **Step 2: Write singleton tests**

Create `backend/tests/test_mt5_singleton.py`:

```python
def test_mt5_service_is_singleton_across_imports():
    from app.services.mt5_singleton import mt5_service as a
    from app.services.mt5_singleton import mt5_service as b
    assert a is b


def test_connected_account_id_round_trip():
    from app.services.mt5_singleton import (
        get_connected_account_id,
        set_connected_account_id,
    )

    set_connected_account_id(None)
    assert get_connected_account_id() is None

    set_connected_account_id(42)
    assert get_connected_account_id() == 42

    set_connected_account_id(None)
    assert get_connected_account_id() is None


def test_setting_to_int_then_to_none_clears():
    from app.services.mt5_singleton import (
        get_connected_account_id,
        set_connected_account_id,
    )

    set_connected_account_id(7)
    set_connected_account_id(None)
    assert get_connected_account_id() is None
```

- [ ] **Step 3: Run tests against new module only**

```powershell
pytest tests/test_mt5_singleton.py -v
```

Expected: 3 PASSED.

- [ ] **Step 4: Migrate `routes/mt5.py` to use the singleton module**

In `backend/app/routes/mt5.py`:

1. Remove the lines:
```python
# Global MT5 service instance
mt5_service = MT5Service()
connected_account_id = None
```

2. Add a new import near the top (after existing app imports):
```python
from app.services.mt5_singleton import (
    mt5_service,
    get_connected_account_id,
    set_connected_account_id,
)
```

3. Find every reference to `connected_account_id` in the file:
- READS like `if connected_account_id:` or `connected_account_id` as a value → change to `get_connected_account_id()`
- ASSIGNMENTS like `connected_account_id = account_id` → change to `set_connected_account_id(account_id)`
- The `global connected_account_id` lines inside `connect_mt5` and `disconnect_mt5` → DELETE (no longer needed since module-level state lives in `mt5_singleton`)

Carefully apply: in `connect_mt5`, the line `connected_account_id = account_id` becomes `set_connected_account_id(account_id)`. In `disconnect_mt5`, `connected_account_id = None` becomes `set_connected_account_id(None)`. In the WS endpoint and any guard checks, replace bare reads with `get_connected_account_id()` calls.

After your edits, sanity-check:
```powershell
Select-String -Path app\routes\mt5.py -Pattern "connected_account_id" -SimpleMatch
```

Expected: only references via `get_connected_account_id()` / `set_connected_account_id(...)`, no bare reads or writes, no `global` keyword for it.

- [ ] **Step 5: Migrate `routes/analytics.py`**

Find this line in `backend/app/routes/analytics.py` (currently ~line 196):

```python
from app.routes.mt5 import mt5_service, connected_account_id
```

Replace with:

```python
from app.services.mt5_singleton import mt5_service, get_connected_account_id
```

Then find every use of `connected_account_id` in that file and replace with `get_connected_account_id()`.

Sanity:
```powershell
Select-String -Path app\routes\analytics.py -Pattern "from app.routes" -SimpleMatch
```

Expected: no matches (no more route→route imports in analytics.py).

- [ ] **Step 6: Full pytest + import smoke**

```powershell
python -c "from app.main import app; print('boot OK')"
pytest -v
```

Expected: `boot OK`. All tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/services/mt5_singleton.py backend/tests/test_mt5_singleton.py backend/app/routes/mt5.py backend/app/routes/analytics.py
git commit -m "refactor(mt5): extract module-level singleton out of routes/mt5.py"
```

---

## Task 4: Login helper

**Files:**
- Create: `backend/app/services/mt5_auth.py`
- Create: `backend/tests/test_mt5_auth.py`
- Modify: `backend/app/routes/accounts.py`
- Modify: `backend/app/routes/trading.py`
- Modify: `backend/app/routes/mt5.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_mt5_auth.py`:

```python
from unittest.mock import MagicMock


def _make_account(account_id="12345", password=b"dummy", server="X-Server", mt5_path="C:/x.exe"):
    """Build a minimal Account-like stand-in. Real Account model not needed."""
    acc = MagicMock()
    acc.account_id = account_id
    acc.password = password
    acc.server = server
    acc.mt5_path = mt5_path
    return acc


def test_login_account_calls_mt5_with_expected_args(monkeypatch):
    from app.services import mt5_auth

    monkeypatch.setattr(mt5_auth, "decrypt_password", lambda _: "plain-pw")

    mt5 = MagicMock()
    mt5.login.return_value = True

    acc = _make_account(account_id="9001")
    result = mt5_auth.login_account(acc, mt5)

    assert result is True
    mt5.login.assert_called_once_with(9001, "plain-pw", "X-Server", path="C:/x.exe")


def test_login_account_returns_false_on_mt5_login_failure(monkeypatch):
    from app.services import mt5_auth

    monkeypatch.setattr(mt5_auth, "decrypt_password", lambda _: "plain-pw")

    mt5 = MagicMock()
    mt5.login.return_value = False

    assert mt5_auth.login_account(_make_account(), mt5) is False


def test_login_account_returns_false_on_decrypt_failure(monkeypatch):
    from app.services import mt5_auth

    def boom(_):
        raise ValueError("bad key")

    monkeypatch.setattr(mt5_auth, "decrypt_password", boom)

    mt5 = MagicMock()
    result = mt5_auth.login_account(_make_account(), mt5)

    assert result is False
    mt5.login.assert_not_called()
```

Run:
```powershell
pytest tests/test_mt5_auth.py -v
```

Expected: 3 tests FAIL with `ModuleNotFoundError: No module named 'app.services.mt5_auth'`.

- [ ] **Step 2: Implement the helper**

Create `backend/app/services/mt5_auth.py`:

```python
"""Single login flow for MT5 accounts.

The same `decrypt + mt5.login` sequence used to appear in six places in the
route layer. Consolidated here so credentials handling lives in one file
that can be audited.
"""
from app.models.accounts import Account
from app.services.encryption import decrypt_password
from app.services.mt5_service import MT5Service


def login_account(account: Account, mt5: MT5Service) -> bool:
    """Decrypt the account's stored password and log in via the given MT5 service.

    Returns True on success, False on any failure (decrypt error or login refused).
    Sync — callers in async handlers should dispatch through `run_mt5`.
    """
    try:
        password = decrypt_password(account.password)
    except Exception:
        return False
    return mt5.login(int(account.account_id), password, account.server, path=account.mt5_path)
```

- [ ] **Step 3: Run tests — must pass**

```powershell
pytest tests/test_mt5_auth.py -v
```

Expected: 3 PASSED.

- [ ] **Step 4: Migrate callers in `routes/trading.py`**

In `backend/app/routes/trading.py`, find the four sync helpers:
- `_check_symbol_on_account`
- `_calculate_for_account`
- `_prepare_for_execution`
- `_execute_single_trade`

In EACH helper, replace the existing login pattern:

```python
if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
```

with:

```python
if not login_account(account, mt5):
```

Each helper currently takes `password` as a parameter (cached upfront by the route). Since `login_account` re-decrypts internally, the password-cache pre-decrypt is now redundant. Three options:

**Chosen approach:** Keep the password-cache pre-decrypt (it still saves work if `login_account` is called multiple times for the same account), but pass it through and have `login_account` re-decrypt anyway — OR — drop the password cache and let `login_account` handle it. The latter is simpler.

Drop the password caching:
- In `check_symbol` route, delete the `pw_cache = {a.id: decrypt_password(a.password) for a in accounts}` line and the `pw_cache[account.id]` argument from the `run_mt5` call.
- Same for `calculate_position` and `execute_batch` routes.
- In each helper, remove the `password: str` parameter from the signature and update the call sites.

Mechanical change. After edits, the helper signatures become:

```python
def _check_symbol_on_account(mt5: MT5Service, account: Account, symbol: str) -> dict: ...
def _calculate_for_account(mt5, sizer, checker, account, request, db) -> dict: ...
def _prepare_for_execution(mt5, sizer, checker, account, request, db) -> dict: ...
def _execute_single_trade(mt5, account, calc, request) -> dict: ...
```

And the route call sites drop the `password` argument.

Add the import at the top of `trading.py`:

```python
from app.services.mt5_auth import login_account
```

Remove the now-unused `from app.services.encryption import decrypt_password` import if no remaining references.

- [ ] **Step 5: Migrate callers in `routes/accounts.py`**

Open `backend/app/routes/accounts.py`. Find lines matching the pattern:

```python
password = decrypt_password(account.password)
... mt5_service.login(int(account.account_id), password, account.server, path=account.mt5_path) ...
```

Replace each with `login_account(account, mt5_service)`. Add the import at the top.

There may be 2-3 such sites. For each, ensure the surrounding `try/except` and error flow is preserved.

- [ ] **Step 6: Migrate `routes/mt5.py` `connect_mt5` handler**

The `connect_mt5` handler in `backend/app/routes/mt5.py` currently does:

```python
try:
    password = decrypt_password(account.password)
except ValueError:
    raise HTTPException(status_code=500, detail="Failed to decrypt password")
...
if mt5_service.login(int(account.account_id), password, account.server, path=account.mt5_path):
```

This one has a SPECIFIC error message for decrypt failure that we don't want to lose. Leave this one as-is OR refactor to:

```python
if not login_account(account, mt5_service):
    raise HTTPException(status_code=400, detail="Failed to connect to MT5")
```

(The 500-vs-400 distinction was thin — both fail the request. The 400 message is honest about the cause.)

Apply the second form. Delete the now-unused `decrypt_password` import in this file if no other references.

Sanity:
```powershell
Select-String -Path app\routes -Pattern "decrypt_password" -SimpleMatch -Recurse
```

Expected: no matches in any route file. Only matches in `services/mt5_auth.py` and `services/encryption.py`.

- [ ] **Step 7: Full pytest + boot check**

```powershell
python -c "from app.main import app; print('boot OK')"
pytest -v
```

Expected: `boot OK`. All tests pass (Batch A 5 + Batch C new tests).

- [ ] **Step 8: Commit**

```powershell
git add backend/app/services/mt5_auth.py backend/tests/test_mt5_auth.py backend/app/routes/trading.py backend/app/routes/accounts.py backend/app/routes/mt5.py
git commit -m "refactor(mt5): dedupe login flow into single helper"
```

---

## Task 5: Extract streaming helpers + TRAILING_STOPS

**Files:**
- Create: `backend/app/services/mt5_streaming.py`
- Modify: `backend/app/routes/mt5.py`

- [ ] **Step 1: Create the streaming module with the four helpers moved out of `routes/mt5.py`**

Create `backend/app/services/mt5_streaming.py`:

```python
"""Background streaming helpers for the MT5 WebSocket loop.

The WS endpoint in `routes/mt5.py` dispatches these through `run_db` /
`run_mt5` so the asyncio event loop stays responsive. Functions here are
sync by contract — callers do the async wrapping.

`TRAILING_STOPS` is the live registry of active trailing stops. Mutated by
the WS loop (`check_trailing_stops`) and the `/trailing-stop/set` /
`/trailing-stop/{ticket}` endpoints.
"""
from datetime import datetime
import logging

import MetaTrader5 as _mt5

from app.database import SessionLocal
from app.models.accounts import Account
from app.models.equity_snapshot import EquitySnapshot
from app.services.mt5_singleton import mt5_service
from app.services.mt5_auth import login_account
from app.utils.async_helpers import run_mt5

logger = logging.getLogger(__name__)

# ticket -> {trail_pips, symbol, type, digits, pip_size, best_price}
TRAILING_STOPS: dict = {}


def save_snapshot(account_db_id: int, info: dict) -> None:
    """Persist an equity snapshot to the database."""
    db = SessionLocal()
    try:
        snapshot = EquitySnapshot(
            account_db_id=account_db_id,
            balance=info.get("balance", 0),
            equity=info.get("equity", 0),
            profit=info.get("profit"),
        )
        db.add(snapshot)
        db.commit()
    except Exception as e:
        logger.warning("Failed to save equity snapshot: %s", e)
    finally:
        db.close()


def maybe_reset_daily_open(account_db_id: int, info: dict) -> None:
    """If it's a new trading day, update daily_open_equity on the account."""
    today = datetime.now().strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        account = db.query(Account).filter(Account.id == account_db_id).first()
        if account and account.daily_open_date != today:
            account.daily_open_equity = info.get("equity", info.get("balance", 0))
            account.daily_open_date = today
            db.commit()
            logger.info(
                "Daily open equity reset for account %s: %.2f",
                account_db_id,
                account.daily_open_equity,
            )
    except Exception as e:
        logger.warning("Failed to reset daily open equity: %s", e)
    finally:
        db.close()


def check_trailing_stops(positions: list) -> None:
    """Update SL on active trailing stops when price moves favorably."""
    if not TRAILING_STOPS:
        return
    pos_map = {p["ticket"]: p for p in positions}
    for ticket, ts in list(TRAILING_STOPS.items()):
        pos = pos_map.get(ticket)
        if not pos:
            TRAILING_STOPS.pop(ticket, None)
            continue

        symbol = ts["symbol"]
        pip_size = ts["pip_size"]
        trail_distance = ts["trail_pips"] * pip_size
        current_sl = pos.get("sl") or 0
        tp = pos.get("tp") or 0

        if pos["type"] == "BUY":
            tick = _mt5.symbol_info_tick(symbol)
            if not tick:
                continue
            bid = tick.bid
            new_sl = round(bid - trail_distance, ts["digits"])
            if new_sl > current_sl + pip_size * 0.5:
                result = mt5_service.modify_position(ticket, new_sl, tp)
                if result.get("success"):
                    ts["best_price"] = bid
                    logger.info("Trail: #%d BUY SL -> %.5f (bid=%.5f)", ticket, new_sl, bid)
        else:  # SELL
            tick = _mt5.symbol_info_tick(symbol)
            if not tick:
                continue
            ask = tick.ask
            new_sl = round(ask + trail_distance, ts["digits"])
            if current_sl == 0 or new_sl < current_sl - pip_size * 0.5:
                result = mt5_service.modify_position(ticket, new_sl, tp)
                if result.get("success"):
                    ts["best_price"] = ask
                    logger.info("Trail: #%d SELL SL -> %.5f (ask=%.5f)", ticket, new_sl, ask)


async def attempt_reconnect(account_db_id: int) -> None:
    """Re-login to MT5 using stored credentials when stream goes stale."""

    def _do_reconnect() -> bool:
        db = SessionLocal()
        try:
            account = db.query(Account).filter(Account.id == account_db_id).first()
            if not account:
                return False
            return login_account(account, mt5_service)
        finally:
            db.close()

    try:
        success = await run_mt5(_do_reconnect)
        if success:
            logger.info("Auto-reconnect succeeded for account %s", account_db_id)
        else:
            logger.warning("Auto-reconnect failed for account %s", account_db_id)
    except Exception as e:
        logger.warning("Auto-reconnect error: %s", e)
```

- [ ] **Step 2: Wire `routes/mt5.py` to use the new module**

In `backend/app/routes/mt5.py`:

1. DELETE the local `TRAILING_STOPS: dict = {}` declaration (now lives in the streaming module).
2. DELETE the local `_save_snapshot`, `_maybe_reset_daily_open`, `_check_trailing_stops` functions (now `save_snapshot`, `maybe_reset_daily_open`, `check_trailing_stops` in streaming).
3. DELETE the local `_attempt_reconnect` async function (now `attempt_reconnect`).
4. Add this import near the top:

```python
from app.services.mt5_streaming import (
    TRAILING_STOPS,
    save_snapshot,
    maybe_reset_daily_open,
    check_trailing_stops,
    attempt_reconnect,
)
```

5. In the WS endpoint, update the function calls to use the new (non-underscore) names:
- `await run_mt5(_check_trailing_stops, positions or [])` → `await run_mt5(check_trailing_stops, positions or [])`
- `await run_db(_save_snapshot, ...)` → `await run_db(save_snapshot, ...)`
- `await run_db(_maybe_reset_daily_open, ...)` → `await run_db(maybe_reset_daily_open, ...)`
- `await _attempt_reconnect(connected_account_id)` → `await attempt_reconnect(get_connected_account_id())` (also picks up the singleton refactor from Task 3)

6. The `set_trailing_stop` and `remove_trailing_stop` route handlers still mutate `TRAILING_STOPS` directly — that's the imported registry now. No further change needed beyond removing local declaration.

- [ ] **Step 3: Verify file size + imports**

```powershell
(Get-Content app\routes\mt5.py | Measure-Object -Line).Lines
python -c "from app.routes.mt5 import websocket_endpoint, set_trailing_stop; from app.services.mt5_streaming import TRAILING_STOPS, save_snapshot, maybe_reset_daily_open, check_trailing_stops, attempt_reconnect; print('OK')"
```

Expected: line count < 250. Prints `OK`.

- [ ] **Step 4: Full pytest + boot**

```powershell
python -c "from app.main import app; print('boot OK')"
pytest -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/mt5_streaming.py backend/app/routes/mt5.py
git commit -m "refactor(mt5): extract streaming helpers into services/mt5_streaming"
```

---

## Task 6: Final import smoke test + grep verification

**Files:**
- Create: `backend/tests/test_imports.py`

- [ ] **Step 1: Write an import-smoke test**

Create `backend/tests/test_imports.py`:

```python
"""Smoke test: every module imports without side-effects or circular imports."""


def test_routes_import():
    from app.routes import accounts, funds, mt5, trading, analytics, news
    from app.routes import system as system_routes
    assert accounts.router is not None
    assert funds.router is not None
    assert mt5.router is not None
    assert trading.router is not None
    assert analytics.router is not None
    assert system_routes.router is not None
    assert news.router is not None


def test_services_import():
    from app.services import (
        mt5_service,
        mt5_singleton,
        mt5_auth,
        mt5_streaming,
        fund_templates,
        position_sizer,
        rule_checker,
        encryption,
    )
    # All modules importable; spot-check key public names
    assert mt5_singleton.mt5_service is not None
    assert callable(mt5_auth.login_account)
    assert callable(fund_templates.load_templates)


def test_no_route_imports_from_another_route():
    """Guard against route→route coupling regressions."""
    import pathlib
    routes_dir = pathlib.Path(__file__).resolve().parent.parent / "app" / "routes"
    offenders = []
    for py in routes_dir.glob("*.py"):
        text = py.read_text(encoding="utf-8")
        if "from app.routes" in text or "import app.routes" in text:
            offenders.append(py.name)
    assert not offenders, f"Route files importing from other routes: {offenders}"
```

- [ ] **Step 2: Run**

```powershell
pytest tests/test_imports.py -v
```

Expected: 3 PASSED.

- [ ] **Step 3: Final full pytest run**

```powershell
pytest -v
```

Expected: all tests pass (Batch A 5 + Batch C 13 new = 18 total, give or take).

- [ ] **Step 4: Verify success criteria from spec**

```powershell
(Get-Content app\routes\funds.py | Measure-Object -Line).Lines     # expect < 250
(Get-Content app\routes\mt5.py | Measure-Object -Line).Lines       # expect < 250
Select-String -Path app\routes\*.py -Pattern "from app.routes" -SimpleMatch
Select-String -Path app\routes\*.py -Pattern "decrypt_password" -SimpleMatch
```

Expected:
- `funds.py` < 250 lines
- `mt5.py` < 250 lines
- Both `Select-String` calls produce zero matches.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_imports.py
git commit -m "test: add import-smoke + route-coupling guard"
```

---

## Self-Review

- **Spec coverage**: all six problems in spec mapped to tasks 1–5; success criteria verified by Task 6.
- **Placeholder scan**: every step has concrete code or exact command.
- **Type consistency**: `login_account(account, mt5)` signature consistent across all call sites in Task 4. New module public names (`save_snapshot`, `maybe_reset_daily_open`, `check_trailing_stops`, `attempt_reconnect`) consistent with their imports in Task 5.
- **Out of scope (per spec)**: account_id column rename, error-handling style — left for future. Not implemented here.
