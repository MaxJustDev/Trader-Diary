# Batch A — Backend Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop blocking the asyncio event loop with sync MT5/DB calls; add composite indexes; remove redundant per-account work — without changing API contracts.

**Architecture:** Introduce a small async-bridge helper (`run_mt5` / `run_db`) backed by a dedicated single-thread executor for MT5 and a small thread pool for DB. Refactor each per-account loop into a sync `_per_account` helper that gets dispatched through the executor. Add SQLite composite indexes via existing startup migration. Cache decrypted passwords per-request and cache the MT5 server-time probe symbol on the service.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy 2.0, SQLite, MetaTrader5 5.0.45, pytest (added by this plan).

**Spec:** `docs/superpowers/specs/2026-05-25-batch-a-backend-performance-design.md`

---

## File Map

| Path | Status | Purpose |
|------|--------|---------|
| `backend/requirements-dev.txt` | NEW | Dev-only deps (pytest, pytest-asyncio) |
| `backend/pytest.ini` | NEW | Pytest config (rootdir, asyncio_mode) |
| `backend/tests/__init__.py` | NEW | Test package marker |
| `backend/tests/conftest.py` | NEW | Shared fixtures (sys.path setup) |
| `backend/tests/test_async_helpers.py` | NEW | Unit tests for run_mt5 / run_db |
| `backend/app/utils/__init__.py` | NEW | Empty package marker |
| `backend/app/utils/async_helpers.py` | NEW | run_mt5, run_db, executors |
| `backend/app/main.py` | MODIFY | Add CREATE INDEX migration |
| `backend/app/models/trade_record.py` | MODIFY | `__table_args__` composite index |
| `backend/app/models/equity_snapshot.py` | MODIFY | `__table_args__` composite index |
| `backend/app/models/funds.py` | MODIFY | `__table_args__` on FundProgram |
| `backend/app/services/mt5_service.py` | MODIFY | Cache server-time symbol |
| `backend/app/routes/trading.py` | MODIFY | Batch query + per-account helper + async dispatch |
| `backend/app/routes/mt5.py` | MODIFY | Wrap WS stream sync calls + helper fns in `await run_*` |

---

## Task 1: Set up pytest

**Files:**
- Create: `backend/requirements-dev.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create dev requirements file**

Create `backend/requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Create pytest config**

Create `backend/pytest.ini`:

```ini
[pytest]
testpaths = tests
asyncio_mode = auto
python_files = test_*.py
python_functions = test_*
addopts = -v --tb=short
```

- [ ] **Step 3: Create test package**

Create empty file `backend/tests/__init__.py` (zero bytes).

- [ ] **Step 4: Create conftest with sys.path setup**

Create `backend/tests/conftest.py`:

```python
import os
import sys

# Make `app` importable when running pytest from backend/
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
```

- [ ] **Step 5: Install dev deps and verify pytest collects**

Run from `backend/`:

```powershell
venv\Scripts\activate
pip install -r requirements-dev.txt
pytest --collect-only
```

Expected: exit 5 ("no tests collected") with no import errors. Exit 5 is fine — we haven't written tests yet.

- [ ] **Step 6: Commit**

```powershell
git add backend/requirements-dev.txt backend/pytest.ini backend/tests/__init__.py backend/tests/conftest.py
git commit -m "test: add pytest scaffolding for backend"
```

---

## Task 2: Async helpers — failing test

**Files:**
- Test: `backend/tests/test_async_helpers.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_async_helpers.py`:

```python
import asyncio
import threading

import pytest


@pytest.mark.asyncio
async def test_run_mt5_executes_off_event_loop():
    from app.utils.async_helpers import run_mt5

    main_thread_id = threading.get_ident()

    def sync_work():
        return threading.get_ident()

    worker_thread_id = await run_mt5(sync_work)
    assert worker_thread_id != main_thread_id


@pytest.mark.asyncio
async def test_run_mt5_serializes_on_single_thread():
    """All MT5 work must funnel through the same thread (singleton constraint)."""
    from app.utils.async_helpers import run_mt5

    def sync_work():
        return threading.get_ident()

    results = await asyncio.gather(
        run_mt5(sync_work),
        run_mt5(sync_work),
        run_mt5(sync_work),
    )
    assert len(set(results)) == 1, f"MT5 calls hit multiple threads: {results}"


@pytest.mark.asyncio
async def test_run_db_uses_separate_pool_from_mt5():
    """DB pool runs in different worker threads than MT5 (independent pools)."""
    from app.utils.async_helpers import run_mt5, run_db

    def sync_work():
        return threading.get_ident()

    mt5_tid = await run_mt5(sync_work)
    db_tid = await run_db(sync_work)
    assert mt5_tid != db_tid


@pytest.mark.asyncio
async def test_run_mt5_propagates_exceptions():
    from app.utils.async_helpers import run_mt5

    def boom():
        raise ValueError("kaboom")

    with pytest.raises(ValueError, match="kaboom"):
        await run_mt5(boom)


@pytest.mark.asyncio
async def test_run_mt5_passes_args_and_kwargs():
    from app.utils.async_helpers import run_mt5

    def add(a, b, *, c):
        return a + b + c

    result = await run_mt5(add, 1, 2, c=3)
    assert result == 6
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:

```powershell
pytest tests/test_async_helpers.py -v
```

Expected: all 5 tests FAIL with `ModuleNotFoundError: No module named 'app.utils'`.

---

## Task 3: Async helpers — implementation

**Files:**
- Create: `backend/app/utils/__init__.py`
- Create: `backend/app/utils/async_helpers.py`

- [ ] **Step 1: Create package marker**

Create empty `backend/app/utils/__init__.py`.

- [ ] **Step 2: Write async_helpers.py**

Create `backend/app/utils/async_helpers.py`:

```python
"""Async bridge helpers for running sync MT5 and DB code off the event loop.

MT5 calls MUST go through `run_mt5`. The `MetaTrader5` library is a global
per-process singleton with stateful connection — concurrent calls from
multiple threads cause undefined behavior. The dedicated single-thread
executor serializes them while keeping the asyncio event loop responsive.

DB calls can use `run_db` which has a slightly larger pool (SQLite with
check_same_thread=False is fine across threads).
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Awaitable, Callable, TypeVar

T = TypeVar("T")

_mt5_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mt5-sync")
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db-sync")


async def run_mt5(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a synchronous MT5 call off the event loop on the dedicated MT5 thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_mt5_executor, partial(fn, *args, **kwargs))


async def run_db(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a synchronous DB call off the event loop on the DB thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_db_executor, partial(fn, *args, **kwargs))
```

- [ ] **Step 3: Run tests — must pass**

```powershell
pytest tests/test_async_helpers.py -v
```

Expected: 5 PASSED.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/utils/__init__.py backend/app/utils/async_helpers.py backend/tests/test_async_helpers.py
git commit -m "feat(backend): add async bridge helpers for MT5/DB sync work"
```

---

## Task 4: DB composite indexes — model declarations

**Files:**
- Modify: `backend/app/models/trade_record.py`
- Modify: `backend/app/models/equity_snapshot.py`
- Modify: `backend/app/models/funds.py`

- [ ] **Step 1: Add composite index to TradeRecord**

In `backend/app/models/trade_record.py`, change the import line and add `__table_args__` after the class column declarations.

Replace line 1:

```python
from sqlalchemy import Column, Integer, Float, String, Boolean, TIMESTAMP, ForeignKey, Index
```

After line 32 (`executed_at = ...`), inside the class body, add:

```python

    __table_args__ = (
        Index("ix_trade_records_account_executed", "account_db_id", "executed_at"),
    )
```

- [ ] **Step 2: Add composite index to EquitySnapshot**

In `backend/app/models/equity_snapshot.py`, replace line 1:

```python
from sqlalchemy import Column, Integer, Float, String, TIMESTAMP, ForeignKey, Index
```

After line 14 (`recorded_at = ...`), inside the class body, add:

```python

    __table_args__ = (
        Index("ix_equity_snapshots_account_recorded", "account_db_id", "recorded_at"),
    )
```

- [ ] **Step 3: Add index to FundProgram**

In `backend/app/models/funds.py`, replace line 1:

```python
from sqlalchemy import Column, Integer, String, Float, Text, TIMESTAMP, ForeignKey, Index
```

After the `FundProgram` class body (after `accounts = relationship(...)` line 38), add:

```python

    __table_args__ = (
        Index("ix_fund_programs_fund_id", "fund_id"),
    )
```

- [ ] **Step 4: Smoke check — import models**

```powershell
cd backend
venv\Scripts\activate
python -c "from app.models import TradeRecord, EquitySnapshot, FundProgram; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/models/trade_record.py backend/app/models/equity_snapshot.py backend/app/models/funds.py
git commit -m "perf(db): declare composite indexes on hot analytics paths"
```

---

## Task 5: Auto-migration creates indexes

**Files:**
- Modify: `backend/app/main.py:22-75` (the `_migrate` function)

- [ ] **Step 1: Add CREATE INDEX statements to `_migrate`**

In `backend/app/main.py`, after line 71 (the `trade_records` column loop) but BEFORE `conn.commit()` on line 73, add:

```python

        # Composite indexes for analytics hot paths (idempotent)
        for stmt in (
            "CREATE INDEX IF NOT EXISTS ix_trade_records_account_executed "
            "ON trade_records(account_db_id, executed_at)",
            "CREATE INDEX IF NOT EXISTS ix_equity_snapshots_account_recorded "
            "ON equity_snapshots(account_db_id, recorded_at)",
            "CREATE INDEX IF NOT EXISTS ix_fund_programs_fund_id "
            "ON fund_programs(fund_id)",
        ):
            conn.execute(text(stmt))
```

- [ ] **Step 2: Smoke check — startup runs migration cleanly**

```powershell
cd backend
venv\Scripts\activate
python -c "from app.main import app; print('startup OK')"
```

Expected: prints `startup OK`, no exception. Migration is idempotent so safe to re-run.

- [ ] **Step 3: Verify index exists in DB**

```powershell
python -c "import sqlite3; c = sqlite3.connect('traderdiary.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'\")])"
```

Expected output contains:
- `ix_trade_records_account_executed`
- `ix_equity_snapshots_account_recorded`
- `ix_fund_programs_fund_id`

- [ ] **Step 4: Verify query plan uses index**

```powershell
python -c "import sqlite3; c = sqlite3.connect('traderdiary.db'); print('\n'.join(r[3] for r in c.execute(\"EXPLAIN QUERY PLAN SELECT * FROM trade_records WHERE account_db_id = 1 ORDER BY executed_at DESC LIMIT 200\")))"
```

Expected: line includes `USING INDEX ix_trade_records_account_executed`.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/main.py
git commit -m "perf(db): create composite indexes via startup migration"
```

---

## Task 6: Cache MT5 server-time probe symbol

**Files:**
- Modify: `backend/app/services/mt5_service.py` (`__init__`, `shutdown`)
- Modify: `backend/app/routes/mt5.py:298-316` (`get_server_time`)

- [ ] **Step 1: Add cache field on the service**

In `backend/app/services/mt5_service.py`, in `MT5Service.__init__` (lines 24-27), append a line:

Replace lines 24-27:

```python
    def __init__(self):
        self.connected_account = None
        self.is_initialized = False
        self.current_path = None
        self._server_time_symbol: Optional[str] = None
```

In `shutdown` (lines 70-78), reset the cache. Replace lines 70-78:

```python
    def shutdown(self):
        """Shutdown MT5 connection completely"""
        try:
            mt5.shutdown()
        except Exception:
            pass
        self.is_initialized = False
        self.connected_account = None
        self.current_path = None
        self._server_time_symbol = None
```

- [ ] **Step 2: Use the cache in get_server_time**

In `backend/app/routes/mt5.py`, replace lines 298-316 (`get_server_time` handler):

```python
@router.get("/server-time")
async def get_server_time():
    """Get broker server time vs local time."""
    if not mt5_service.is_initialized:
        raise HTTPException(status_code=400, detail="MT5 not connected")

    # Probe order: cached symbol first, then common majors
    probe_symbols = []
    if mt5_service._server_time_symbol:
        probe_symbols.append(mt5_service._server_time_symbol)
    for sym in ("EURUSD", "GBPUSD", "USDJPY", "XAUUSD"):
        if sym not in probe_symbols:
            probe_symbols.append(sym)

    for sym in probe_symbols:
        tick = _mt5.symbol_info_tick(sym)
        if tick:
            mt5_service._server_time_symbol = sym
            server_ts = tick.time
            local_ts = int(datetime.utcnow().timestamp())
            return {
                "server_time": datetime.utcfromtimestamp(server_ts).isoformat() + "Z",
                "local_time": datetime.utcnow().isoformat() + "Z",
                "offset_seconds": server_ts - local_ts,
            }

    return {"server_time": None, "local_time": datetime.utcnow().isoformat() + "Z", "offset_seconds": 0}
```

- [ ] **Step 3: Smoke check — import still works**

```powershell
python -c "from app.services.mt5_service import MT5Service; s = MT5Service(); print(s._server_time_symbol)"
```

Expected: prints `None`.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/services/mt5_service.py backend/app/routes/mt5.py
git commit -m "perf(mt5): cache server-time probe symbol"
```

---

## Task 7: Refactor `check_symbol` — batch query + async dispatch

**Files:**
- Modify: `backend/app/routes/trading.py:45-95` (`check_symbol`)

- [ ] **Step 1: Add import for run_mt5 + run_db**

In `backend/app/routes/trading.py`, after line 12 (`import logging`), add:

```python
from app.utils.async_helpers import run_mt5, run_db
```

- [ ] **Step 2: Extract per-account helper above the route**

In `backend/app/routes/trading.py`, immediately after the `_reset_daily_equity_if_needed` function (after line 42), add:

```python
def _check_symbol_on_account(mt5: MT5Service, account: Account, password: str, symbol: str) -> dict:
    """Sync per-account check used by check_symbol. Returns {available, tick_or_none}."""
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
            return {"available": False, "tick": None}
        symbol_info = mt5.get_symbol_info(symbol)
        available = symbol_info is not None
        tick = mt5.get_tick_price(symbol) if available else None
        mt5.logout()
        return {"available": available, "tick": tick}
    except Exception:
        return {"available": False, "tick": None}
```

- [ ] **Step 3: Replace the `check_symbol` body**

In `backend/app/routes/trading.py`, replace lines 45-95 (the whole `check_symbol` function):

```python
@router.post("/check-symbol")
async def check_symbol(
    request: SymbolCheckRequest,
    db: Session = Depends(get_db),
):
    """Check symbol availability across multiple accounts, return tick price from first available."""
    mt5 = MT5Service()
    results = []
    tick = None

    # One DB hit instead of N
    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}

    # Decrypt once per account up front
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    # Preserve client-requested order
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue

        outcome = await run_mt5(
            _check_symbol_on_account, mt5, account, pw_cache[account.id], request.symbol
        )

        if tick is None and outcome["tick"] is not None:
            tick = outcome["tick"]

        results.append({
            "account_id": account.account_id,
            "id": account.id,
            "available": outcome["available"],
        })

    await run_mt5(mt5.shutdown)

    return {"results": results, "tick": tick}
```

- [ ] **Step 4: Smoke check — import + route resolves**

```powershell
python -c "from app.routes.trading import check_symbol, _check_symbol_on_account; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/routes/trading.py
git commit -m "perf(trading): batch-query accounts + async-wrap check_symbol"
```

---

## Task 8: Refactor `calculate_position`

**Files:**
- Modify: `backend/app/routes/trading.py:98-173` (`calculate_position`)

- [ ] **Step 1: Extract per-account sync helper**

In `backend/app/routes/trading.py`, immediately after `_check_symbol_on_account` (added in Task 7), add:

```python
def _calculate_for_account(
    mt5: MT5Service,
    sizer: PositionSizer,
    checker: RuleChecker,
    account: Account,
    password: str,
    request: "PositionCalculateRequest",
    db: Session,
) -> dict:
    """Sync per-account calc used by calculate_position. Returns the per-account result dict."""
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
            return {"account_id": account.account_id, "error": "login failed"}

        info = mt5.get_account_info()
        if not info:
            mt5.logout()
            return {"account_id": account.account_id, "error": "no account_info"}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        calc = sizer.calculate(
            balance=info["balance"],
            symbol=request.symbol,
            direction=request.direction,
            sl_price=request.sl_price,
            risk_type=request.risk_type,
            risk_value=request.risk_value,
            tp_price=request.tp_price,
        )

        margin_ok = True
        if not calc.get("error") and calc.get("lot_size", 0) > 0:
            margin_ok = sizer.validate_margin(
                request.symbol,
                calc["lot_size"],
                request.direction,
                info["margin_free"],
            )

        risk_amount = calc.get("risk_amount", 0.0) or 0.0
        reward_amount = calc.get("reward_amount", 0.0) or 0.0
        rule_status = checker.get_pre_trade_status(
            account=account,
            proposed_risk_amount=risk_amount,
            proposed_reward_amount=reward_amount,
        )

        mt5.logout()
        return {
            "account_id": account.account_id,
            "balance": info["balance"],
            "calculation": calc,
            "margin_ok": margin_ok,
            "rule_status": rule_status,
        }
    except Exception as e:
        return {"account_id": account.account_id, "error": str(e)}
```

- [ ] **Step 2: Replace the route body**

In `backend/app/routes/trading.py`, replace the existing `calculate_position` (lines 98-173) with:

```python
@router.post("/calculate-position")
async def calculate_position(
    request: PositionCalculateRequest,
    db: Session = Depends(get_db),
):
    """
    Calculate position size for multiple accounts using EA-style sizing.
    Also runs pre-trade fund-rule validation and returns rule_status per account.
    """
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    checker = RuleChecker(db)

    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    results = []
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue
        result = await run_mt5(
            _calculate_for_account, mt5, sizer, checker, account, pw_cache[account.id], request, db
        )
        results.append(result)

    await run_mt5(mt5.shutdown)
    return {"results": results}
```

- [ ] **Step 3: Smoke check**

```powershell
python -c "from app.routes.trading import calculate_position, _calculate_for_account; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/routes/trading.py
git commit -m "perf(trading): batch-query + async-wrap calculate_position"
```

---

## Task 9: Refactor `execute_batch`

**Files:**
- Modify: `backend/app/routes/trading.py:176-348` (`execute_batch`)

- [ ] **Step 1: Extract sync helpers**

In `backend/app/routes/trading.py`, after `_calculate_for_account` (added in Task 8), add two helpers:

```python
def _prepare_for_execution(
    mt5: MT5Service,
    sizer: PositionSizer,
    checker: RuleChecker,
    account: Account,
    password: str,
    request: "BatchTradeRequest",
    db: Session,
) -> dict:
    """Per-account pre-trade phase: login, calc, fund rule check, margin check.

    Returns dict with one of these shapes:
      - {"ready": True, "account": ..., "password": ..., "calc": ..., "margin_ok": bool}
      - {"ready": False, "blocked": True, "account_id": ..., "error": ..., "calc": ..., "account": ...}
      - {"ready": False, "error": str, "account_id": ..., "account": ...}
    """
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
            return {"ready": False, "error": "login failed", "account_id": account.account_id, "account": account, "calc": None}

        info = mt5.get_account_info()
        if not info:
            mt5.logout()
            return {"ready": False, "error": "no account_info", "account_id": account.account_id, "account": account, "calc": None}

        _reset_daily_equity_if_needed(account, info["equity"], info["balance"], db)

        calc = sizer.calculate(
            balance=info["balance"],
            symbol=request.symbol,
            direction=request.direction,
            sl_price=request.sl_price,
            risk_type=request.risk_type,
            risk_value=request.risk_value,
            tp_price=request.tp_price,
        )

        if account.account_type == "fund" and account.fund_program_id:
            risk_amount = calc.get("risk_amount", 0.0) or 0.0
            rule_result = checker.get_pre_trade_status(
                account=account,
                proposed_risk_amount=risk_amount,
            )
            if rule_result.get("blocked"):
                reasons = rule_result.get("block_reasons", [])
                error_msg = f"Blocked: {' | '.join(reasons)}"
                mt5.logout()
                return {
                    "ready": False,
                    "blocked": True,
                    "account_id": account.account_id,
                    "account": account,
                    "calc": calc,
                    "error": error_msg,
                }

        margin_ok = True
        if not calc.get("error") and calc.get("lot_size", 0) > 0:
            margin_ok = sizer.validate_margin(
                request.symbol,
                calc["lot_size"],
                request.direction,
                info["margin_free"],
            )

        mt5.logout()
        return {
            "ready": True,
            "account": account,
            "password": password,
            "calc": calc,
            "margin_ok": margin_ok,
        }
    except Exception as e:
        return {"ready": False, "error": str(e), "account_id": account.account_id, "account": account, "calc": None}


def _execute_single_trade(
    mt5: MT5Service,
    account: Account,
    password: str,
    calc: dict,
    request: "BatchTradeRequest",
) -> dict:
    """Per-account order phase: login + place_market_order. Returns the MT5 result dict."""
    try:
        if not mt5.login(int(account.account_id), password, account.server, path=account.mt5_path):
            return {"success": False, "error": "login failed"}
        result = mt5.place_market_order(
            symbol=request.symbol,
            volume=calc["lot_size"],
            order_type=request.direction,
            sl=calc["sl_price"],
            tp=calc["tp_price"],
            comment="TraderDiary Batch",
        )
        mt5.logout()
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}
```

- [ ] **Step 2: Replace the route body**

In `backend/app/routes/trading.py`, replace `execute_batch` (lines 176-348) with:

```python
@router.post("/execute-batch")
async def execute_batch(
    request: BatchTradeRequest,
    db: Session = Depends(get_db),
):
    """
    Execute batch orders on multiple accounts and persist trade records.

    Fund accounts that currently violate drawdown/best-day rules are HARD BLOCKED:
    they are skipped and a failed trade record is saved with the violation reason.
    """
    mt5 = MT5Service()
    sizer = PositionSizer(mt5)
    checker = RuleChecker(db)

    accounts = (
        db.query(Account)
        .filter(Account.id.in_(request.account_ids))
        .all()
    )
    account_map = {a.id: a for a in accounts}
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    # ── Phase 1: per-account pre-trade prep (parallel-friendly serialization) ──
    prepared = []
    blocked_results = []
    for account_id in request.account_ids:
        account = account_map.get(account_id)
        if not account:
            continue
        outcome = await run_mt5(
            _prepare_for_execution, mt5, sizer, checker, account, pw_cache[account.id], request, db
        )

        if outcome.get("blocked"):
            _save_trade_record(
                db=db,
                account=outcome["account"],
                symbol=request.symbol,
                direction=request.direction,
                calc=outcome["calc"],
                success=False,
                error_msg=outcome["error"],
            )
            blocked_results.append({
                "account_id": outcome["account_id"],
                "success": False,
                "blocked": True,
                "error": outcome["error"],
            })
            continue

        if outcome.get("ready"):
            prepared.append(outcome)
        # else: silent skip (matches prior behavior on login/info failure)

    # ── Margin gate ────────────────────────────────────────────────────────────
    failed_margin = [p for p in prepared if not p.get("margin_ok")]
    if failed_margin:
        await run_mt5(mt5.shutdown)
        raise HTTPException(
            status_code=400,
            detail=f"{len(failed_margin)} account(s) don't have enough margin",
        )

    # ── Phase 2: execute orders ────────────────────────────────────────────────
    results = list(blocked_results)
    for entry in prepared:
        account = entry["account"]
        calc = entry["calc"]
        result = await run_mt5(_execute_single_trade, mt5, account, entry["password"], calc, request)

        success = result.get("success", False)
        order_ticket = result.get("order")

        _save_trade_record(
            db=db,
            account=account,
            symbol=request.symbol,
            direction=request.direction,
            calc=calc,
            success=success,
            order_ticket=order_ticket,
            error_msg=result.get("error"),
        )

        results.append({
            "account_id": account.account_id,
            "success": success,
            "order": order_ticket,
            "error": result.get("error"),
        })

    await run_mt5(mt5.shutdown)

    successful = sum(1 for r in results if r.get("success"))
    blocked_count = len(blocked_results)

    return {
        "total": len(results),
        "successful": successful,
        "blocked": blocked_count,
        "failed": len(results) - successful - blocked_count,
        "results": results,
    }
```

- [ ] **Step 3: Smoke check**

```powershell
python -c "from app.routes.trading import execute_batch, _prepare_for_execution, _execute_single_trade; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/routes/trading.py
git commit -m "perf(trading): batch-query + two-phase async-wrapped execute_batch"
```

---

## Task 10: Refactor WS stream loop in `mt5.py`

**Files:**
- Modify: `backend/app/routes/mt5.py:338-393` (`websocket_endpoint`)
- Modify: `backend/app/routes/mt5.py:396-449` (`_attempt_reconnect`, `_save_snapshot`, `_maybe_reset_daily_open`)

- [ ] **Step 1: Add import for run_mt5 + run_db**

In `backend/app/routes/mt5.py`, after line 14 (`import logging`), add:

```python
from app.utils.async_helpers import run_mt5, run_db
```

- [ ] **Step 2: Wrap calls in `websocket_endpoint`**

Replace lines 338-393 (the whole `websocket_endpoint` function):

```python
@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time MT5 data streaming.
    - Persists equity snapshots every 60s.
    - Resets daily_open_equity at the start of each trading day.
    - Auto-reconnects if connection goes stale.
    """
    await manager.connect(websocket)
    last_snapshot_time = 0.0
    last_trail_time = 0.0
    consecutive_failures = 0

    try:
        while True:
            if mt5_service.is_initialized and connected_account_id:
                info = await run_mt5(mt5_service.get_account_info)
                positions = await run_mt5(mt5_service.get_positions)
                now = asyncio.get_event_loop().time()

                if info:
                    consecutive_failures = 0
                    if TRAILING_STOPS and (now - last_trail_time) >= TRAIL_CHECK_INTERVAL:
                        await run_mt5(_check_trailing_stops, positions or [])
                        last_trail_time = now

                    if (now - last_snapshot_time) >= SNAPSHOT_INTERVAL:
                        await run_db(_save_snapshot, connected_account_id, info)
                        last_snapshot_time = now

                    await run_db(_maybe_reset_daily_open, connected_account_id, info)
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= 3:
                        logger.warning("MT5 stream: %d consecutive failures, attempting reconnect...", consecutive_failures)
                        await _attempt_reconnect(connected_account_id)
                        consecutive_failures = 0

                data = {
                    "type": "update",
                    "connected_account_id": connected_account_id,
                    "account_info": info,
                    "positions": positions,
                    "timestamp": datetime.now().isoformat(),
                }

                await manager.send_personal_message(json.dumps(data), websocket)

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning("WS stream error: %s", e)
        manager.disconnect(websocket)
```

Note: this also fixes the silent-swallow `except Exception:` by adding a `logger.warning` (Batch C touches more error handling; this is the minimum disturbance here).

- [ ] **Step 3: Convert `_attempt_reconnect` to dispatch through `run_mt5`/`run_db`**

Replace lines 396-413:

```python
async def _attempt_reconnect(account_db_id: int):
    """Re-login to MT5 using stored credentials when stream goes stale."""

    def _do_reconnect() -> bool:
        db = SessionLocal()
        try:
            account = db.query(Account).filter(Account.id == account_db_id).first()
            if not account:
                return False
            password = decrypt_password(account.password)
            return mt5_service.login(
                int(account.account_id), password, account.server, path=account.mt5_path
            )
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

- [ ] **Step 4: Smoke check — module imports + route registration**

```powershell
python -c "from app.routes.mt5 import websocket_endpoint, _attempt_reconnect; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/routes/mt5.py
git commit -m "perf(mt5): async-wrap WS stream loop + reconnect path"
```

---

## Task 11: End-to-end smoke test

**Files:**
- No code changes — manual verification only.

- [ ] **Step 1: Start backend**

```powershell
cd backend
venv\Scripts\activate
python run.py
```

Expected: log line `Uvicorn running on http://0.0.0.0:8001`. No exception in `_migrate`.

- [ ] **Step 2: Verify indexes exist on running DB**

In a separate PowerShell:

```powershell
python -c "import sqlite3; c = sqlite3.connect('backend/traderdiary.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'\")])"
```

Expected: list includes the three new `ix_*` indexes.

- [ ] **Step 3: Connect MT5 from frontend + open WS stream**

Start frontend (`cd frontend && npm run dev`), navigate to a page that triggers connection, open browser DevTools → Network → WS tab. Confirm `/api/mt5/stream` messages arriving ~1/sec with `account_info` populated.

Expected: stream messages tick every ~1s. No backend log errors.

- [ ] **Step 4: Concurrent request during streaming**

While WS is streaming, run this in PowerShell repeatedly (10x):

```powershell
Measure-Command { Invoke-RestMethod http://localhost:8001/api/accounts -Method GET } | Select-Object TotalMilliseconds
```

Expected: every call returns in <300ms (was previously spiking >1000ms during WS tick). Median should be <100ms.

- [ ] **Step 5: Execute a batch trade (if a fund-blocked or demo account is available)**

Use the Trading page with at least 2 accounts selected. Trigger Calculate, then Execute.

Expected: batch completes; results returned per account; no event-loop stall in backend logs; trade records appear in analytics.

- [ ] **Step 6: Run pytest one more time to confirm green**

```powershell
cd backend
pytest -v
```

Expected: all `test_async_helpers.py` tests pass.

- [ ] **Step 7: Document the manual verification result**

Append a short note to the spec file noting the date of verification and any anomalies. If anomalies, file follow-up tasks instead of completing.

- [ ] **Step 8: Final commit (if any tweaks needed)**

If verification surfaces a small fix, fix it and commit:

```powershell
git add <files>
git commit -m "fix(batch-a): <one-line>"
```

Otherwise no commit needed.

---

## Self-Review Notes

- **Spec coverage**: All 6 problems from spec → tasks 4-5 (indexes), 6 (server-time cache), 3 (async helpers), 7-9 (trading routes), 10 (WS stream). ✓
- **Placeholder scan**: every step has concrete code or exact command. ✓
- **Type consistency**: `_check_symbol_on_account`, `_calculate_for_account`, `_prepare_for_execution`, `_execute_single_trade` defined once, used consistently. `run_mt5` / `run_db` signatures match across all call sites. ✓
- **Out of scope (per spec)**: file splits, login dedup helper, session dependency injection — left for Batch C. Not implemented here. ✓
