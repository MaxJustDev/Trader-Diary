# Batch F — Multi-Process Architecture + MT5 Robustness

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: Major backend architecture change — per-account worker processes with their own MT5 instance
**Prereq**: Batches A and C merged (uses `run_mt5` + `mt5_singleton` + `mt5_auth` patterns)

## Goal

Enable TRUE parallel multi-account operations: simultaneous live monitoring of N accounts AND parallel batch order placement, with per-account latency ≈ network roundtrip (not N × roundtrip). Solve the long-standing MT5 init flakiness through health checks, auto-launch, backoff jitter, and a watchdog.

## Non-Goals

- Rewriting in Go (no MT5 Go binding exists; see memory `feedback-no-go-rewrite`)
- Distributed multi-machine workers (single-host only)
- Replacing the MT5 library with raw broker API
- Backwards compatibility with the single-process WS message format on the wire (frontend will be updated)

## The Core Constraint

The `MetaTrader5` Python C-binding is a per-process global singleton. ONE active connection per Python process. The only way to have N live MT5 connections is N Python processes. Threads inside one process do NOT help — they all share the same singleton state.

The current architecture (Batches A-E) preserved this serialization. Batch F removes it by spawning a dedicated worker process per active account.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ Master FastAPI process (port 8001)                               │
│                                                                  │
│   HTTP routes ─────► WorkerPool ──────► [N child processes]      │
│        │                  │                                       │
│        │                  └─► JSON-RPC over stdin/stdout pipes   │
│        │                                                          │
│   WS hub ◄────── EventBus ◄──────── worker stdout streams        │
│        │                                                          │
│        ▼                                                          │
│   Browser (WS multiplex, per-account streams)                    │
└──────────────────────────────────────────────────────────────────┘
```

### Worker process (`backend/app/workers/mt5_worker.py`)

A standalone Python script run as a child process. Each instance owns one MT5 connection. Lifecycle:

1. **Boot:** parse args `account_db_id` + `encryption_key`. Open SQLite read-only to read the encrypted password + server + mt5_path. Decrypt.
2. **MT5 init:** auto-launch terminal64.exe if not running. Initialize with backoff jitter. Health-check via `account_info()` post-init. Refuse to start if all init attempts fail (exit non-zero, master logs).
3. **Main loop:** read JSON-RPC requests from stdin, one per line. Dispatch to handler. Write JSON-RPC responses + spontaneous tick events to stdout, one per line.
4. **Tick stream:** background thread polls `mt5.account_info()` + `mt5.positions_get()` every 1s, emits a `tick` event to stdout.
5. **Watchdog:** background thread checks `mt5.terminal_info().connected` every 5s. On disconnect, attempts re-init+re-login with backoff. Emits `health` events.
6. **Shutdown:** on `shutdown` RPC, on SIGTERM, or on stdin EOF — flush, `mt5.shutdown()`, exit 0.

### JSON-RPC protocol

Line-delimited JSON over stdin/stdout. Each message is one JSON object per line.

**Request (master → worker):**
```json
{"id": "uuid-or-int", "method": "place_market_order", "params": {...}}
```

**Response (worker → master):**
```json
{"id": "uuid-or-int", "result": {...}}
{"id": "uuid-or-int", "error": {"code": "...", "message": "..."}}
```

**Event (worker → master, no id):**
```json
{"event": "tick", "data": {"account_info": {...}, "positions": [...], "ts": "ISO8601"}}
{"event": "health", "data": {"connected": false, "reason": "..."}}
{"event": "log", "data": {"level": "warning", "message": "..."}}
```

**Methods:**
- `ping` — `{"result": "pong"}`
- `get_account_info` — current info
- `get_positions`
- `get_symbol_info`, `get_tick_price`
- `place_market_order` (symbol, volume, order_type, sl, tp, comment)
- `close_position`, `modify_position`, `partial_close`
- `calculate_margin`
- `subscribe_tick` (`{symbol: "EURUSD"}`) — start emitting `symbol_tick` events for this symbol
- `unsubscribe_tick` (`{symbol}`)
- `shutdown` — clean exit

### Worker pool (`backend/app/services/worker_pool.py`)

Async manager owned by the FastAPI app. Public API:

```python
class WorkerPool:
    async def spawn(self, account_db_id: int) -> None: ...
    async def kill(self, account_db_id: int, graceful: bool = True) -> None: ...
    async def call(self, account_db_id: int, method: str, params: dict | None = None, timeout: float = 5.0) -> dict: ...
    def active_account_ids(self) -> set[int]: ...
    def event_stream(self) -> AsyncIterator[tuple[int, dict]]: ...   # (account_db_id, event)
    async def shutdown_all(self) -> None: ...
```

Internals:
- Each `spawn` creates a `subprocess.Popen` (using `asyncio.create_subprocess_exec`) with stdin + stdout pipes.
- A reader task per worker parses stdout lines, routes responses to pending `call` futures (by `id`), forwards events into the event bus.
- A writer queue per worker serializes outgoing requests (one line at a time, await `drain()`).
- Worker death (exit) → notify event bus, clean up pending futures with error.
- `call` correlates request/response by UUID.

### Event bus

Simple asyncio `Queue` per WS connection. WS hub fans events from worker pool to all subscribed WS clients. Frontend filters by `account_db_id`.

### Master HTTP routes (changes)

- `POST /api/mt5/connect/{account_db_id}` — `await worker_pool.spawn(id)`. Returns `{success, info}`. (No more global `connected_account_id`.)
- `POST /api/mt5/disconnect/{account_db_id}` — `await worker_pool.kill(id)`.
- `GET /api/mt5/status` — `{active: [{account_db_id, connected, last_tick}, ...]}`. Multiple accounts possible.
- `WS /api/mt5/stream` — broadcasts events from ALL active workers to subscribed clients. Message format includes `account_db_id` to disambiguate.
- `POST /api/trading/execute-batch` — `asyncio.gather(*[worker_pool.call(id, "place_market_order", ...) for id in request.account_ids])`. TRUE parallel.

### MT5 robustness (inside the worker)

1. **Auto-launch terminal64.exe** — at boot, check via `psutil.process_iter()` whether a process named `terminal64.exe` with matching executable path is running. If not, `subprocess.Popen(mt5_path)`. Wait up to 10s for window ready (poll via `psutil` for the spawned PID + `mt5.initialize` success).
2. **Backoff jitter retry** — 5 attempts: 0.5s, 1.0s, 2.0s, 4.0s, 8.0s with ±20% jitter. Total ≈ 15s max startup.
3. **Health check post-init** — after `mt5.initialize()` returns True and `mt5.login()` returns True, call `mt5.account_info()`. If None, log + retry init.
4. **Connection verify with deadline** — poll `mt5.terminal_info().connected == True` up to 5s after login.
5. **Watchdog** — thread checks `terminal_info().connected` every 5s. On False: kill MT5 cleanly, re-init, re-login. Emit `health` event so frontend can show "reconnecting" banner.

## Files

| Path | Status | Purpose |
|------|--------|---------|
| `backend/app/workers/__init__.py` | NEW | Empty package marker |
| `backend/app/workers/mt5_worker.py` | NEW | Standalone worker entry point |
| `backend/app/workers/mt5_health.py` | NEW | Auto-launch, backoff, watchdog, health check |
| `backend/app/workers/protocol.py` | NEW | JSON-RPC message helpers (parse_request, make_response, make_event, make_error) |
| `backend/app/services/worker_pool.py` | NEW | Async pool manager + event bus |
| `backend/app/services/mt5_singleton.py` | DELETE | Replaced by worker_pool |
| `backend/app/services/mt5_streaming.py` | DELETE | Replaced by per-worker thread |
| `backend/app/routes/mt5.py` | REWRITE | New connect/disconnect/status/WS, removes global state |
| `backend/app/routes/trading.py` | MODIFY | Use `worker_pool.call` instead of in-process MT5 calls; remove sync helpers |
| `backend/app/routes/analytics.py` | MODIFY | Drop `from app.services.mt5_singleton import mt5_service` (use `worker_pool.call` if needed) |
| `backend/app/main.py` | MODIFY | Create `WorkerPool` at startup, shutdown on app stop |
| `backend/requirements.txt` | MODIFY | Add `psutil` |
| `backend/tests/test_worker_protocol.py` | NEW | JSON-RPC parser tests |
| `backend/tests/test_worker_pool.py` | NEW | Pool spawn/call/kill tests (with a fake worker subprocess) |
| `backend/tests/fixtures/fake_mt5_worker.py` | NEW | A worker stub that doesn't touch MT5 — emits canned ticks for tests |
| `frontend/lib/store.ts` | MODIFY | Multi-account live state: `Map<account_db_id, AccountStream>` |
| `frontend/hooks/useMT5Stream.ts` | MODIFY | Filter incoming events by account_db_id; expose per-account selectors |
| `frontend/components/mt5/LiveDataPanel.tsx` | MODIFY | Accept `account_db_id` prop; show data for that account only |
| `frontend/app/accounts/page.tsx` | MODIFY | AccountCard: per-card Connect/Disconnect toggle |

## Phasing

The change is too large for one shot. Phases:

### Phase 1: Worker skeleton (proof of concept)
- Build `workers/mt5_worker.py` + `workers/protocol.py`
- Manual test: `python -m app.workers.mt5_worker <account_id>`, send JSON via stdin, observe stdout
- No FastAPI integration yet
- Includes `mt5_health.py` (auto-launch, backoff, watchdog) — robustness goal achieved here
- Tests: `test_worker_protocol.py`

### Phase 2: Worker pool + single-account live
- Build `services/worker_pool.py`
- Wire `/api/mt5/connect/{id}` to spawn worker
- WS stream from ONE worker through pool to browser
- Frontend: existing UI continues to work via account-ID-filtered events
- Tests: `test_worker_pool.py` using fake worker fixture

### Phase 3: Multi-account live
- Spawn N workers simultaneously
- WS broadcasts events from all workers
- Frontend: `useMT5Store` reshaped to `Map<account_db_id, AccountStream>`
- `LiveDataPanel`, `PositionsTable`, `EquityChart` accept `account_db_id` prop

### Phase 4: Parallel batch trade
- Rewrite `execute_batch` to `asyncio.gather(*[worker_pool.call("place_market_order", ...) for id in ids])`
- `check_symbol` + `calculate_position` similar

### Phase 5: Cleanup
- Remove `mt5_singleton.py`, `mt5_streaming.py`
- Update tests to drop singleton tests
- Update memory + docs

Each phase ends in a committable + manually-testable state.

## Behavior Changes (intentional)

- WS message format gains an `account_db_id` field at top level — old format had it as `connected_account_id` for the single account; new format = same key, but multiple messages stream concurrently.
- `GET /api/mt5/status` returns a LIST of active account IDs instead of a single ID + bool.
- `POST /api/mt5/connect` accepts `account_db_id` in path, not body.
- Multiple AccountCards can show "Connected" state at once.

## Testing Plan

- Unit tests for protocol parser (round-trip JSON-RPC encode/decode).
- Worker pool tests using a `fake_mt5_worker.py` stub fixture (doesn't touch MT5; emits canned events). Verifies: spawn, call/response correlation, kill, event fan-out, worker crash detection.
- Integration: real MT5 not in CI, manual test only.

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Zombie worker processes | Medium | `WorkerPool.shutdown_all()` on app shutdown hook; `psutil` audit pass on startup kills orphans matching our worker signature |
| Stdin/stdout buffering deadlocks | Medium | Always `flush=True` after writing; use `asyncio.subprocess` (line-buffered semantics); never call `subprocess.communicate()` |
| Worker request lost mid-flight on crash | Low | Pending futures resolved with explicit error on worker death |
| PyInstaller frozen build can't spawn `app.workers.mt5_worker` | High | In frozen mode, `sys.executable` is the bundled exe; need a `--worker` flag to dispatch to the worker entry point. Update `run.py` to detect the flag |
| Per-account terminal copy disk space | Low | Existing constraint, not new |
| MT5 auto-launch fails on locked-down Windows | Low | Fallback: detailed error message asking user to launch MT5 manually once |
| WebSocket message volume × N accounts overwhelms browser | Low | Frontend filters by account_db_id and only renders visible ones; tick rate stays 1s/account |

## Migration Plan

Don't merge to main until all 5 phases land + manual smoke tests pass on real MT5. Phase 2 alone is functionally useful (single-account, no regression vs current). Phases 3-4 unlock the design goal.

During development, keep Batches A-E branch stable on `main`-eligible state. Batch F is a new branch — `batch-f-multi-process` — built on top.

Phase 1 should be runnable end of week. Phase 2: +3 days. Phase 3: +4 days. Phase 4: +2 days. Phase 5: +1 day. ≈ 2 weeks of focused work.

## Success Criteria

- 5 accounts connected simultaneously, all streaming live in the UI with delay < 1.5s end-to-end per tick.
- `execute_batch` on 5 accounts completes in < (slowest single account login + order latency) + 500ms — i.e., parallel speedup measurable.
- `terminal_info().connected` going False → watchdog re-establishes connection without user action.
- Killing terminal64.exe externally → worker auto-relaunches it via `psutil`-driven auto-launch.
- All pre-existing tests still pass; new worker pool tests green.

## Out of Scope

- Replacing MT5 library (no viable alternative).
- Distributed workers across machines.
- Order routing optimizations (slippage management, smart split).
- Per-account isolated SQLite databases (single DB is fine — only the MT5 connection needs isolation).
