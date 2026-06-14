# Architecture

Single-process desktop tool with a web UI. FastAPI backend talks to MT5 terminal via the `MetaTrader5` Python C-binding. Next.js frontend talks to FastAPI via REST + WebSocket. Everything runs on `localhost`. Data is stored in a local SQLite file. No cloud.

## Process model

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (http://localhost:3000 dev, :8001 prod portable)    │
│  Next.js App Router · Zustand stores · React 19              │
└────────────────────────┬─────────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼─────────────────────────────────────┐
│  FastAPI process (port 8001)                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐        │
│  │ Routes   │→│ Services │→│ MetaTrader5 lib        │        │
│  │ (HTTP +  │  │ (auth,   │  │  (talks to broker via │        │
│  │  WS)     │  │ sizing,  │  │   local MT5 terminal) │        │
│  └────┬─────┘  │ rules,   │  └──────────────────────┘        │
│       │        │ streaming│                                  │
│       │        │ )         │   ┌─────────────────────┐       │
│       │        └────┬─────┘    │ SQLite              │       │
│       └─────────────▶          │ (traderdiary.db)    │       │
│                                └─────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

Dev: backend and frontend run as separate processes on 8001 + 3000. Prod portable build: Next.js exports static HTML to `frontend/out/`, FastAPI mounts it at `/`, single process on 8001.

## Async model

FastAPI handlers are `async def`. Synchronous MT5 calls and SQLite writes are dispatched off the event loop via the bridge in `backend/app/utils/async_helpers.py`:

- `run_mt5(fn, ...)` — dedicated single-thread executor. MT5 is a per-process singleton; serializing through one thread avoids races.
- `run_db(fn, ...)` — 4-thread pool for SQLite writes that happen inside the WS stream loop.

The WebSocket stream loop (`routes/mt5.py:websocket_endpoint`) ticks every `WS_TICK_INTERVAL_SECONDS` (1.0s). On each tick: `await run_mt5(get_account_info)`, `await run_mt5(get_positions)`, conditionally `await run_db(save_snapshot, ...)` every `SNAPSHOT_INTERVAL_SECONDS` (60s), `await run_mt5(check_trailing_stops, ...)` every `TRAIL_CHECK_INTERVAL_SECONDS` (5s).

## Data flow — execute_batch

```
User clicks Execute Batch
  → POST /api/trading/execute-batch with {symbol, direction, sl_price, risk, account_ids}
  → routes/trading.py execute_batch
      → db.query(Account).filter(Account.id.in_(account_ids)).all()       (one DB hit)
      → for each account: await run_mt5(_prepare_for_execution, ...)
            → login_account(account, mt5)   (decrypt + mt5.login)
            → get_account_info, _reset_daily_equity_if_needed
            → PositionSizer.calculate (lot size)
            → RuleChecker.get_pre_trade_status (drawdown + per-trade-risk caps)
            → validate_margin
      → margin gate: 400 if any account fails
      → for each ready account: await run_mt5(_execute_single_trade, ...)
            → place_market_order
            → _save_trade_record (TradeRecord row in SQLite)
  → return {total, successful, blocked, failed, results}
```

Blocked fund accounts get a `TradeRecord` row with `success=False` and the violation reason in `error_msg` — so the analytics journal records every attempted trade.

## Data flow — WebSocket stream

```
StreamProvider (in frontend/components/providers, mounted at layout level)
  → useMT5Stream() hook
      → opens ws://localhost:8001/api/mt5/stream
      → on each message:
          - useMT5Store.setAccountInfo(...)
          - useMT5Store.setPositions(...)
          - useMT5Store.addEquityPoint(...)
          - useAccountStore.updateAccount(...)
      → reconnects every 3s on disconnect
  → Components subscribe to slices via useMT5Store(s => s.X)
      - PositionsTable (positions slice)
      - EquityChart (equityHistory slice)
      - LiveDataPanel (accountInfo + connected slices)
      - all wrapped in React.memo so unrelated ticks don't re-render
```

The backend's WS loop is the source of truth for connection state and triggers the auto-reconnect when 3 consecutive `account_info` reads fail.

## Encryption boundary

MT5 passwords are encrypted with Fernet (symmetric AES-128-CBC + HMAC) before being persisted to the `accounts.password` column. Encryption key is in `backend/.env` as `ENCRYPTION_KEY`. The key never leaves the local machine.

The ONLY path that decrypts is `services/mt5_auth.login_account(account, mt5)`. Everything else passes the encrypted blob around. Auditable.

## File map (backend)

```
backend/app/
├── main.py                    FastAPI app, CORS, startup migration (CREATE INDEX), static mount
├── config.py                  Timing constants (SNAPSHOT_INTERVAL_SECONDS, etc.)
├── database.py                SQLite engine + get_db FastAPI dependency
├── schemas.py                 Pydantic request/response models
├── websocket.py               Bare ConnectionManager (one client at a time)
│
├── models/                    SQLAlchemy ORM
│   ├── accounts.py            accounts table: id, account_id (MT5 login string),
│   │                          password (encrypted), server, mt5_path, balance,
│   │                          equity, daily_open_*, etc.
│   ├── funds.py               funds, fund_programs, fund_phase_rules (3 tables)
│   ├── equity_snapshot.py     equity_snapshots: account_db_id, balance, equity, recorded_at
│   └── trade_record.py        trade_records: every batch trade attempt (success or blocked)
│
├── routes/                    HTTP + WS handlers — thin
│   ├── accounts.py            CRUD + refresh-all
│   ├── funds.py               CRUD + load-from-template (uses services/fund_templates)
│   ├── mt5.py                 connect/disconnect/status/positions/trailing-stop/WS stream
│   ├── trading.py             check-symbol, calculate-position, execute-batch
│   ├── analytics.py           summary, fund-status, equity-curve, trade-history, journal
│   ├── news.py                ForexFactory calendar proxy (httpx, 1h cache)
│   └── system.py              backup / restore endpoints
│
├── services/                  Business logic
│   ├── mt5_service.py         MT5Service: initialize + login + place_market_order + ...
│   ├── mt5_singleton.py       Module-level mt5_service instance + connected-account tracker
│   ├── mt5_auth.py            login_account(account, mt5) — single decrypt+login flow
│   ├── mt5_streaming.py       save_snapshot, maybe_reset_daily_open, check_trailing_stops,
│   │                          attempt_reconnect, TRAILING_STOPS registry
│   ├── mt5_terminal.py        create/delete per-account terminal copy
│   ├── fund_templates.py      load_templates() — lru_cached JSON loader
│   ├── position_sizer.py      EA-style lot size = risk / (sl_pips × pip_value)
│   ├── rule_checker.py        Drawdown + best-day + per-trade-risk validation
│   ├── phase_detector.py      Parse MT5 account name → fund program/phase
│   └── encryption.py          Fernet wrappers (encrypt/decrypt_password)
│
├── data/
│   └── fund_templates.json    Seed data for prop firms (FTMO, The5ers, Fortrades, …)
│
├── utils/
│   └── async_helpers.py       run_mt5 (single thread), run_db (pool) executors
│
└── tests/                     Pytest — async_helpers, fund_templates, mt5_auth,
                               mt5_singleton, imports
```

## File map (frontend)

```
frontend/
├── app/                       App Router pages
│   ├── layout.tsx             Root layout with next/font + StreamProvider + ErrorBoundary
│   ├── page.tsx               Dashboard
│   ├── accounts/page.tsx
│   ├── funds/page.tsx
│   ├── trading/page.tsx
│   ├── analytics/page.tsx
│   └── globals.css            Design tokens + :focus-visible global
│
├── components/
│   ├── layout/Sidebar.tsx
│   ├── providers/
│   │   ├── StreamProvider.tsx    Mounts useMT5Stream once at layout level
│   │   └── ErrorBoundary.tsx
│   ├── accounts/
│   │   ├── AccountCard.tsx
│   │   └── EditAccountModal.tsx
│   ├── analytics/
│   │   ├── TradingCalendar.tsx   (dynamic-loaded)
│   │   ├── SymbolHeatmap.tsx     (dynamic-loaded)
│   │   └── FundAccountCard.tsx
│   ├── mt5/
│   │   ├── EquityChart.tsx       (React.memo'd; recharts)
│   │   ├── PositionsTable.tsx    (React.memo'd)
│   │   └── LiveDataPanel.tsx     (React.memo'd)
│   ├── ui/
│   │   ├── ConfirmModal.tsx      (focus-trapped, async-locked)
│   │   ├── NewsCalendar.tsx      (dynamic-loaded; ForexFactory)
│   │   └── SkeletonCard.tsx
│   └── forms/AddAccountForm.tsx
│
├── hooks/
│   ├── useMT5Stream.ts            WebSocket subscription + reconnect
│   └── useFocusTrap.ts            Modal focus trap
│
├── lib/
│   ├── api-client.ts              fetch wrapper (accepts AbortSignal)
│   ├── store.ts                   useMT5Store + useAccountStore (Zustand)
│   └── types.ts                   TypeScript types
│
└── __tests__/                     Vitest suites
```

## Critical singletons / global state

| State | Where | Why |
|-------|-------|-----|
| `mt5_service: MT5Service` | `backend/app/services/mt5_singleton.py` | The `MetaTrader5` Python lib is a per-process singleton — one connection at a time. The wrapper instance is shared across routes + streaming + reconnect. |
| `connected_account_id: Optional[int]` | same module, via `get_/set_connected_account_id()` | Tracks which DB account is currently logged in. Read by WS endpoint + analytics. |
| `TRAILING_STOPS: dict` | `backend/app/services/mt5_streaming.py` | In-memory map: `ticket → {trail_pips, symbol, best_price, ...}`. Mutated by WS loop + trailing-stop endpoints. Lost on restart. |
| `useMT5Store`, `useAccountStore` | `frontend/lib/store.ts` | Zustand stores for stream-driven UI. Each tick updates only the slices that changed. |

## Database schema (SQLite)

See `backend/app/models/*.py` for SQLAlchemy definitions. Tables:

- `accounts` — MT5 accounts (id, account_id, encrypted password, fund_program_id, balance, daily_open_*, peak_eod_balance, …)
- `funds`, `fund_programs`, `fund_phase_rules` — fund template hierarchy
- `equity_snapshots` — periodic snapshots from WS stream (cap'd implicitly by retention policy you set in maintenance)
- `trade_records` — every batch-order attempt (success or blocked); supports analytics + journal + tags

Composite indexes added in Batch A:
- `ix_trade_records_account_executed (account_db_id, executed_at)`
- `ix_equity_snapshots_account_recorded (account_db_id, recorded_at)`
- `ix_fund_programs_fund_id (fund_id)`

## Where to look for…

- "How are MT5 passwords stored?" → `services/encryption.py` + the `accounts.password` column
- "How is a batch trade executed?" → `routes/trading.py:execute_batch` (uses `_prepare_for_execution` + `_execute_single_trade` helpers)
- "When is `daily_open_equity` reset?" → `services/mt5_streaming.py:maybe_reset_daily_open` (called on every WS tick)
- "Where do fund templates come from?" → `app/data/fund_templates.json` loaded by `services/fund_templates.py`
- "How does the frontend know MT5 disconnected?" → backend WS loop increments `consecutive_failures` and triggers `attempt_reconnect()` at threshold; frontend's `useMT5Stream` reconnects on close
- "Where's the WebSocket message format?" → `routes/mt5.py:websocket_endpoint` (the `data = {...}` dict)
