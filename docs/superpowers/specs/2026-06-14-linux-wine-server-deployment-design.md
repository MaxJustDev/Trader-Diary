# Linux Wine Server Deployment + Stealth Trading — Design

**Date:** 2026-06-14
**Branch target:** new branch off `batch-f-multi-process`
**Status:** Approved design, pending implementation plan

## Goal

Run TraderDiary as an always-on server on a **low-resource Linux box** (Intel Atom
D2550, 2c/4t, ~1.5 GiB free RAM, 3.8 GiB swap, ~61 GiB disk). The user opens
`http://<server-ip>:8001` from a phone or PC on the LAN and can place market
orders on their accounts immediately. Setup and boot-time init must be one-command
easy.

Two hard requirements from the user:

1. **Local web host, trade from anywhere on LAN** (phone or PC), orders placed
   instantly on accounts.
2. **Handle prop-firm accounts that ban EA / automated trading** — reduce the
   automation footprint of placed orders (stealth), with an optional deep path
   for firms that inspect the deal `reason` field.

## Honest constraints (read first)

- **MetaTrader5 is Windows-only.** The Python `MetaTrader5` package cannot run
  natively on Linux. On this box it runs under **Wine** with a headless virtual
  display (**Xvfb**).
- **~1.5 GiB free RAM ⇒ ~1 account realistically.** A single MT5 terminal under
  Wine costs roughly 400–600 MiB. True multi-account requires N independent Wine
  prefixes × N terminals × N MT5 logins (MT5 is one login per terminal), which
  will not fit. On this hardware the design **degrades gracefully to a single
  active account**. The multi-process/multi-account model is preserved; the box
  is the limiter. Moving to stronger hardware later re-enables parallelism with
  no architecture change.
- **EA-ban reality.** Every MT5 deal carries a server-stamped `reason` field.
  Orders sent through the Python `order_send` API are stamped `EXPERT` (algo).
  **The request cannot set `reason`.** Therefore:
  - **Tier 1 stealth** (easy, defeats *most* prop-firm enforcement): `magic=0`,
    natural/empty comment, per-account random jitter + small volume variance,
    serialized human-like timing. Most firms enforce "no EA" by checking the
    magic number, comment, or identical cross-account timing — Tier 1 covers
    those vectors.
  - **Tier 2 stealth** (deep, the only real defeat for firms that inspect the
    deal `reason`): GUI-automate the Wine terminal so orders originate as a
    manual `CLIENT` trade. Heavy, slower, fragile under a headless display.
    **Design-only in this spec; deferred to Phase 4.**
  - **Contractual caveat, not hidden:** the EA ban is the firm's *contract* rule,
    not a technical boundary. Reducing the automation footprint lowers detection
    risk; nothing guarantees the account is safe. This is the user's own account
    and own risk decision.

## Architecture

```
Phone / PC browser ──LAN──> FastAPI :8001 (host 0.0.0.0)
                              │  serves static frontend/out (no Next.js runtime on the box)
                              │  WorkerPool (Linux-native python)  [capped to 1 worker on Linux]
                              │      │ stdin/stdout JSON-RPC (unchanged protocol)
                              │   mt5_worker.py  ── uses ──> mt5_provider (platform seam)
                              │                                 │
   platform seam ────────────┼─────────────────────────────────┤
   win32:  mt5_provider  →  native MetaTrader5 module           (UNCHANGED behavior)
   linux:  mt5_provider  →  BridgeClient ──TCP localhost:8765──┐
                                                               ▼
              systemd unit: traderdiary-bridge.service
                Xvfb :99  →  wine terminal64.exe  →  wine python bridge_server.py
                bridge_server imports native MetaTrader5, returns plain JSON dicts
```

Two systemd units:

- `traderdiary-bridge.service` — Xvfb + Wine MT5 terminal + the bridge server.
- `traderdiary.service` — the FastAPI app on `0.0.0.0:8001`, depends on the
  bridge being up.

On Windows nothing in this picture exists: `mt5_provider` returns the native
module and the app runs exactly as it does today.

## Components

### C1. Provider seam — `backend/app/services/mt5_provider.py` (new)

The single place that decides which `mt5` handle the rest of the code uses.

- `get_mt5()` returns the handle; module exposes `mt5` for `from ... import mt5`.
- On `sys.platform == "win32"`: `import MetaTrader5` and return it. **Zero
  behavior change on Windows.**
- On Linux: return a `BridgeClient` instance (lazy-connected, cached) that
  exposes the same surface the codebase uses:
  - **Methods:** `initialize`, `login`, `shutdown`, `last_error`,
    `terminal_info`, `account_info`, `positions_get`, `symbol_info`,
    `symbol_info_tick`, `symbols_get`, `order_send`, `order_calc_margin`.
  - **Constants:** `ORDER_TYPE_BUY`, `ORDER_TYPE_SELL`, `TRADE_ACTION_DEAL`,
    `TRADE_ACTION_SLTP`, `ORDER_FILLING_IOC/FOK/RETURN`, `ORDER_TIME_GTC`,
    `TRADE_RETCODE_DONE`, and any others referenced. Fetched once from the
    bridge on connect and set as attributes.
- The 6 files that currently do `import MetaTrader5 as mt5` change to
  `from app.services.mt5_provider import mt5` (or `get_mt5()`): `routes/mt5.py`,
  `routes/analytics.py`, `services/mt5_service.py`, `services/mt5_streaming.py`,
  `workers/mt5_worker.py`, `workers/mt5_health.py`. Call sites and constant
  usage are otherwise unchanged.

Returned records (`account_info()`, `positions_get()[i]`, `symbol_info()`,
`symbol_info_tick()`, `order_send()` result) are wrapped in `SimpleNamespace`
(or a small attr-dict) so existing attribute access — `info.balance`,
`pos.ticket`, `result.retcode` — works unchanged.

### C2. Wine bridge server — `deploy/linux/bridge_server.py` (new, runs under Wine python)

- Minimal: stdlib `socketserver` + line-delimited JSON over TCP on
  `127.0.0.1:8765` (configurable).
- Imports the native `MetaTrader5` (works because it runs under Wine).
- Protocol:
  - On client connect, emit one `{"constants": {...}}` frame with all constant
    name→value pairs the client needs.
  - Then request/response: `{"id", "method", "params"}` → `{"id", "result"}` or
    `{"id", "error"}`. Results are **plain JSON-serializable dicts/lists** —
    the server flattens MT5 named tuples into dicts before sending (fast on the
    Atom; no rpyc-style remote attribute proxies).
- Stateless about accounts/DB — it is a pure MT5 proxy. All account, encryption,
  and DB logic stays Linux-side.
- Reuses the exact field projections already written in `mt5_worker.py`
  handlers, so behavior matches the Windows path.

### C3. Linux bridge client — inside `mt5_provider.py`

- `BridgeClient(host, port)`: connects, reads the constants frame, sets them as
  attributes. Each method call sends a request, blocks on the matching response,
  wraps dict results in `SimpleNamespace`.
- **Resilience:** connection lost → transparent reconnect with backoff; methods
  that fail mid-call return MT5-equivalent failure values (`None` /
  `False`) so existing callers' None-checks still work. `last_error()` returns
  the last bridge/transport error in MT5's `(code, str)` shape.

### C4. Worker / health / pool adaptation

- `mt5_health.launch_terminal_if_needed(path)` and `init_with_backoff(path)`:
  on Linux these do **not** launch a terminal (the systemd bridge service owns
  the Wine terminal lifecycle). Linux behavior = verify the bridge is reachable
  and `initialize()` succeeds, with the same backoff/retry shape. Windows
  behavior unchanged.
- `WorkerPool`: on Linux, **cap active workers to 1**. A request to activate a
  second account returns a clear, surfaced message
  ("This server runs one account at a time; deactivate the current account
  first."). Windows pool behavior unchanged.
- JSON-RPC protocol, watchdog, tick stream, EquitySnapshot writes, TradeRecord
  writes — all unchanged and Linux-native.

### C5. Setup & init tooling — `deploy/linux/` (the "easy" part)

- `setup.sh` — one command, idempotent:
  - apt-install: `wine`, `winetricks`, `xvfb`, `python3-venv`, `python3-pip`,
    `qrencode` (for the LAN QR), build basics.
  - Create/repair the Wine prefix; install required Wine components.
  - **Silent-install MT5** under Wine (download official installer, run
    unattended) — validated in Phase 1.
  - Install a Windows Python inside Wine + `pip install MetaTrader5` (Wine side).
  - Create the Linux venv + `pip install -r backend/requirements.txt` and the
    small bridge-client deps.
  - Build the frontend static export once (`npm run build` → `frontend/out`),
    or accept a prebuilt `frontend/out` to avoid building on the Atom (Node on
    a D2550 is slow; document copying a prebuilt `out/` from a dev machine).
- `start-bridge.sh` — start `Xvfb :99`, launch `wine terminal64.exe` (portable,
  minimal config), then `wine python bridge_server.py`. Wait-for-health.
- `start-app.sh` — activate venv, run the FastAPI app bound to `0.0.0.0:8001`.
- systemd units (templated, installed by `install.sh`):
  - `traderdiary-bridge.service` — runs `start-bridge.sh`, `Restart=always`,
    `MemoryMax=` guard.
  - `traderdiary.service` — runs `start-app.sh`, `After=traderdiary-bridge`,
    `Restart=always`.
- `install.sh` — copy units, `systemctl enable --now` both (autostart on boot).
- `status.sh` — one-shot health check (units active? bridge reachable? app
  responding? prints the LAN URL).
- `.env.linux.example` — documents `MT5_BRIDGE_HOST`, `MT5_BRIDGE_PORT`,
  `WINEPREFIX`, `DISPLAY=:99`, `LOW_RESOURCE_MODE`, `STEALTH_MODE`,
  `STEALTH_JITTER_MS`, `SERVER_HOST=0.0.0.0`.

### C6. Low-resource tuning + LAN access

- App binds `0.0.0.0:8001` (already the dev default in `run.py`), single uvicorn
  worker.
- On boot, `status.sh` / the app log prints the reachable LAN URL and a QR code
  (`qrencode`) so the phone can scan and connect.
- `LOW_RESOURCE_MODE=1` knob (read in `routes/mt5.py` / stream loop):
  - Tick/stream interval relaxed (e.g. 1s → 2–3s).
  - EquitySnapshot interval raised.
  - Market Watch trimmed to only traded symbols; MT5 charts/news disabled in the
    Wine terminal config.
  - Log rotation / size cap.
- systemd `MemoryMax=` on the bridge unit prevents a Wine leak from OOM-ing the
  box (it restarts instead).
- Mobile UX: the existing UI is responsive; verify the trading page is
  thumb-usable on a phone viewport and apply minor CSS only if needed (no
  redesign).

### C7. Stealth order mode — `backend/app/services/stealth.py` (new) + order handler change

- Controlled by `STEALTH_MODE` env / settings: `off | tier1 | tier2`.
- **Tier 1** (default on; platform-independent — also benefits Windows):
  - Order request built with `magic=0` and comment drawn from a configurable
    natural pool (or empty), instead of the current `magic=234000` /
    `comment="TraderDiary"`.
  - Before sending across multiple accounts: per-account random jitter
    (`STEALTH_JITTER_MS`, e.g. 300–2500 ms) and optional ± small volume variance
    to break identical cross-account fingerprints; orders serialized rather than
    fired simultaneously.
  - Applied in the order-build path used by both `mt5_service.place_market_order`
    and the worker's `_handle_place_market_order` (single shared builder).
- **Tier 2** (design-only here, Phase 4): GUI automation of the Wine terminal
  (`xdotool` against Xvfb, or `pyautogui` Wine-side) to place orders through the
  terminal UI so the deal `reason` is `CLIENT`. Documented as experimental,
  gated, slower, and fragile. Not built in Phases 1–3.

## Data flow — placing an order on Linux

1. Phone/PC POSTs to `/api/trading/execute-batch`.
2. Backend (Linux) → WorkerPool → `mt5_worker` RPC (`place_market_order`).
3. Worker builds the request through the shared stealth builder (Tier 1:
   `magic=0`, natural comment, jitter applied per account).
4. Worker calls `mt5.order_send(...)` → `mt5_provider` BridgeClient → TCP →
   Wine `bridge_server` → native `MetaTrader5.order_send` → broker.
5. Result dict flows back the same path; TradeRecord saved Linux-side.

## Phasing

1. **Phase 1 — Bridge + provider seam.** `mt5_provider`, `bridge_server`,
   `BridgeClient`, the 6 import-site swaps, worker/health/pool Linux adaptation,
   pool cap to 1. Effectively a **Wine MT5 feasibility spike**: prove MT5 runs
   under Wine on the box and a round-trip order works.
2. **Phase 2 — Setup/init + deploy.** `setup.sh`, `start-*.sh`, systemd units,
   `install.sh`, `status.sh`, `.env.linux.example`, LAN URL + QR, low-resource
   knobs, mobile UX check.
3. **Phase 3 — Stealth Tier 1.** Shared order builder with `magic=0` / natural
   comment / jitter / volume variance; `STEALTH_MODE` config + UI surface.
4. **Phase 4 — Stealth Tier 2 (optional).** GUI-automation path for `CLIENT`
   reason. Built only if Phase 3 proves insufficient for the user's firms.

Implement in order; checkpoint after each phase. Phase 1 gates everything — if
Wine MT5 will not run acceptably on the D2550, fall back to running MT5 on a
cheap Windows box/VM with the Linux box serving the UI only (the bridge protocol
already supports a remote host via `MT5_BRIDGE_HOST`).

## Risks

- **Wine MT5 on a D2550 is the biggest unknown** — may be slow or unstable.
  Phase 1 is the spike that answers this. Fallback documented above.
- **Deal `reason` = EXPERT** is not defeated by Tier 1; only Tier 2 addresses
  reason-inspecting firms.
- **`MetaTrader5` pip under Wine python** and **silent MT5 install** need
  validation in Phase 1 (these are the fiddliest setup steps).
- **Constants/field parity** between bridge and native module — covered by
  mirroring the existing worker handlers and a connect-time constants snapshot;
  add a parity test.

## Out of scope

- Re-architecting for true parallel multi-account on this box (hardware-bound).
- Any change to Windows behavior beyond the import-site swap (must remain
  byte-for-byte equivalent) and the shared stealth order builder (opt-in).
- TradingView/chart features on the server beyond what already exists.
