# Batch A — Backend Performance Optimization

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: FastAPI backend at `backend/app/`
**Prereq**: None (no breaking schema change; indexes additive)

## Goal

Stop blocking the asyncio event loop with synchronous MT5/DB calls so concurrent HTTP requests stay responsive during WebSocket streaming and batch trade execution. Add composite indexes for analytics query hot paths. Eliminate redundant work inside per-account loops.

## Non-Goals

- Parallel MT5 logins (constrained by `MetaTrader5` library singleton — only one connection at a time)
- File splits or service extraction (deferred to Batch C)
- Rewriting WS protocol or trade execution semantics
- Changing wire format, schema, or API contract

## Problems Being Solved

| # | Location | Problem | Impact |
|---|----------|---------|--------|
| 1 | `routes/mt5.py:353-454` | WS stream loop calls sync `mt5_service.get_account_info()`, `get_positions()`, `_save_snapshot()`, `_check_trailing_stops()` directly inside async handler. Each call may block 100ms-1s, freezing event loop and stalling other HTTP requests. | High |
| 2 | `routes/trading.py:55-90`, `112-170`, `193-290` | Per-account loop runs `db.query()` + `decrypt_password()` + `mt5.login()` synchronously inside `async def`. 5 accounts ≈ 0.5-2.5s of fully-blocked event loop. | High |
| 3 | `routes/trading.py:55-90` | `db.query(Account).filter(Account.id == aid)` called once per account_id in loop (N queries). | Medium |
| 4 | `models/trade_record.py`, `models/equity_snapshot.py` | Index exists on `executed_at` / `recorded_at` alone; analytics queries filter by `account_db_id` AND sort by time — SQLite falls back to full scan + sort. | Medium |
| 5 | `routes/trading.py:61, 118, 199` | Same `account.password` decrypted 3+ times per batch operation. | Low |
| 6 | `services/mt5_service.py` `get_server_time()` | Probes 4 symbols sequentially on every call when no cache. | Low |

## Solution Architecture

### Async wrapper helper

New file `backend/app/utils/async_helpers.py`:

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial

# Dedicated single-thread executor for MT5 calls.
# MetaTrader5 Python library is a global singleton with stateful per-process
# connection; serializing through one thread avoids cross-thread state races.
_mt5_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mt5-sync")

# Default executor for DB-only work (SQLite handles its own locking).
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db-sync")

async def run_mt5(fn, *args, **kwargs):
    """Run a synchronous MT5 call off the event loop on the dedicated MT5 thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_mt5_executor, partial(fn, *args, **kwargs))

async def run_db(fn, *args, **kwargs):
    """Run synchronous DB work off the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_db_executor, partial(fn, *args, **kwargs))
```

**Why dedicated single-thread executor for MT5**: `MetaTrader5` is a thin C-binding around the terminal — connection state is per-process global. Even though we are inside one process, dispatching MT5 calls from multiple threads concurrently has undefined behavior (likely race on the internal connection state). One worker thread serializes all MT5 calls while keeping them off the event loop. This is the safest minimal change.

**Why a separate DB executor**: SQLite + SQLAlchemy with `check_same_thread=False` is safe across threads. Using a larger pool here lets DB work parallelize when MT5 is idle.

### WS stream loop (`routes/mt5.py`)

Wrap every sync call inside the streaming `while True` loop:

```python
info = await run_mt5(mt5_service.get_account_info)
positions = await run_mt5(mt5_service.get_positions)
# ...
await run_db(_save_snapshot, account_db_id, info)
await run_db(_check_trailing_stops, account_db_id)
await run_db(_maybe_reset_daily_open, account_db_id)
```

Sleep stays `await asyncio.sleep(1)` (already non-blocking).

### Trading routes (`routes/trading.py`)

Pattern for batch operations:

```python
@router.post("/execute-batch")
async def execute_batch(request: BatchTradeRequest, db: Session = Depends(get_db)):
    # Batch query: one DB hit instead of N
    accounts = db.query(Account).filter(Account.id.in_(request.account_ids)).all()
    account_map = {a.id: a for a in accounts}

    # Decrypt once per account
    pw_cache = {a.id: decrypt_password(a.password) for a in accounts}

    results = []
    for aid in request.account_ids:
        account = account_map.get(aid)
        if not account:
            results.append({"account_id": aid, "success": False, "error": "not found"})
            continue
        # MT5 work off the loop — extract current inline body into sync helper
        result = await run_mt5(_execute_single_trade, account, pw_cache[aid], request)
        results.append(result)
    return {"results": results}
```

The current inline per-account body (login + order + save TradeRecord) is extracted into a new module-level sync function `_execute_single_trade(account, password, request) -> dict`. Same refactor applied to `check-symbol` (→ `_check_symbol_on_account`) and `calculate-position` (→ `_calculate_for_account`). Refactor is mechanical: move existing code into a function; do not change behavior.

### Database indexes

Add to `backend/app/main.py` startup migration (after existing column-add migrations):

```python
db.execute(text(
    "CREATE INDEX IF NOT EXISTS ix_trade_records_account_executed "
    "ON trade_records(account_db_id, executed_at)"
))
db.execute(text(
    "CREATE INDEX IF NOT EXISTS ix_equity_snapshots_account_recorded "
    "ON equity_snapshots(account_db_id, recorded_at)"
))
db.execute(text(
    "CREATE INDEX IF NOT EXISTS ix_fund_programs_fund_id "
    "ON fund_programs(fund_id)"
))
db.commit()
```

Also declare on models so fresh installs get them via `create_all()`:

```python
# models/trade_record.py
__table_args__ = (
    Index("ix_trade_records_account_executed", "account_db_id", "executed_at"),
)

# models/equity_snapshot.py
__table_args__ = (
    Index("ix_equity_snapshots_account_recorded", "account_db_id", "recorded_at"),
)

# models/funds.py FundProgram
__table_args__ = (
    Index("ix_fund_programs_fund_id", "fund_id"),
)
```

### Caching

- **MT5 server-time symbol cache**: in `mt5_service.py`, persist `self._server_time_symbol` after first successful probe; reuse on subsequent calls; invalidate on disconnect.
- **Decrypted password**: request-scope only (local dict in route handler). Not stored at module level for security.
- **`FUND_TEMPLATES`**: already a module-level dict — verify no per-request reconstruction; if found, leave as-is (already cached implicitly).

## Files Changed

| File | Change |
|------|--------|
| `backend/app/utils/__init__.py` | New (empty) |
| `backend/app/utils/async_helpers.py` | New: `run_mt5`, `run_db`, executors |
| `backend/app/routes/mt5.py` | Wrap stream-loop calls in `await run_mt5(...)` / `await run_db(...)` |
| `backend/app/routes/trading.py` | Batch query, password cache dict, wrap MT5 calls |
| `backend/app/services/mt5_service.py` | Cache server-time symbol; invalidate in `disconnect()` |
| `backend/app/main.py` | Add `CREATE INDEX IF NOT EXISTS` statements in `_migrate_database()` |
| `backend/app/models/trade_record.py` | `__table_args__` composite index |
| `backend/app/models/equity_snapshot.py` | `__table_args__` composite index |
| `backend/app/models/funds.py` | `__table_args__` on `FundProgram` |

## Testing Plan

No automated test framework exists. Manual verification:

1. **WS responsiveness**: connect MT5, open WS stream, hit `GET /api/accounts` in another tab — response time stays <100ms (currently can spike to 1000ms+ during WS tick).
2. **Batch trade timing**: execute_batch on 5 accounts with logger timing per account. Sum ≈ same as before (still serial). Concurrent HTTP request during batch returns within ~200ms instead of being fully blocked.
3. **Index usage**: run `EXPLAIN QUERY PLAN SELECT ... FROM trade_records WHERE account_db_id = ? ORDER BY executed_at DESC LIMIT 200` and equivalent for equity_snapshots. Expect `USING INDEX ix_trade_records_account_executed`.
4. **Smoke**: refresh-all accounts, view analytics page, execute one batch order — no regression in returned data.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| MT5 library not safe even on dedicated single thread | Low | Single-thread executor effectively replicates current behavior, just off the loop. If failures observed, fall back to keeping MT5 calls inline and only wrapping DB calls. |
| `run_in_executor` with default kwargs swallows exceptions silently | Medium | `partial()` + ensure exception propagates via `await`. Add try/except around each `run_mt5` call to log. |
| Index creation locks DB on large tables | Low | SQLite `CREATE INDEX IF NOT EXISTS` is idempotent; on small DB (<1MB typical) completes in ms. |
| Decrypted password held longer in memory | Low | Limited to request scope; cleared when handler returns. No change to encryption-at-rest. |

## Rollback Plan

All changes are additive or local:
- Revert `routes/mt5.py` + `routes/trading.py` edits → behavior returns to current
- Indexes are harmless if left in place
- `async_helpers.py` becomes dead code if unused

## Out of Scope (Future Batches)

- **Batch C**: Split `routes/mt5.py` into `services/mt5_streaming.py` + `services/trailing_stop_manager.py`. Extract `_login_account()` helper. Move singleton out of `routes/`. DB session dependency injection.
- **Batch B**: Frontend re-render and bundle work.
- **Batch D**: A11y and UX polish.

## Success Criteria

- WS streaming active + concurrent `GET /api/accounts` response time <100ms (measured)
- `EXPLAIN QUERY PLAN` shows composite index in use for analytics queries
- `execute_batch` does not block other HTTP requests for the full duration
- No regression in MT5 connect/disconnect, batch trade, refresh-all flows
