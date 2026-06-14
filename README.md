# TraderDiary

Local-first MetaTrader 5 account manager and batch trading tool for prop firm traders.

🇻🇳 [Vietnamese quickstart](./docs/vi/README.md)

---

## What it does

- Connect multiple MT5 accounts from different prop firms (FTMO, The5ers, Fortrades, …)
- Batch place market orders across selected accounts with EA-style position sizing
- Track fund-phase rules (daily / max drawdown, profit targets) and hard-block trades that would violate them
- Real-time equity stream via WebSocket, persisted to SQLite for analytics
- News calendar, trailing stops, symbol heatmap, trade journal — all local, no cloud sync
- Run headless on a Linux box (MT5 under Wine) and trade from your phone or PC over the LAN
- Stealth order mode to reduce the automation footprint on EA-restricted prop accounts

---

## 5-minute quickstart (prebuilt release)

Windows 10/11 with MetaTrader 5 already installed.

1. Download `TraderDiary.zip` from [Releases](../../releases)
2. Extract anywhere (e.g. `C:\TraderDiary\`)
3. Double-click `TraderDiary.exe`
4. Browser opens at `http://localhost:8001`

First launch creates `.env` (random encryption key) and `traderdiary.db` next to the exe. **Back up `.env`** — losing it means saved MT5 passwords can't be decrypted.

---

## Run from source (dev)

Prerequisites: Python 3.10+, Node.js 18+, MT5 terminal installed (Windows only).

```powershell
git clone https://github.com/<user>/TraderDiary.git
cd TraderDiary

# Backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt    # for running tests
copy .env.example .env                  # then edit ENCRYPTION_KEY
python run.py                           # starts on :8001

# Frontend (new terminal)
cd ..\frontend
npm install
npm run dev                             # starts on :3000
```

Open `http://localhost:3000`.

---

## Tests

```powershell
# Backend
cd backend
.\venv\Scripts\activate
pytest -v

# Frontend
cd frontend
npm test
```

---

## Production build (Windows portable)

```powershell
.\build.bat
```

Produces `backend\dist\TraderDiary\TraderDiary.exe`. Zip it for release:

```powershell
cd backend\dist
Compress-Archive -Path TraderDiary -DestinationPath TraderDiary.zip
```

---

## Run on a Linux server (Wine)

Run TraderDiary always-on on a low-resource Linux box (e.g. an Intel Atom). MT5 is
Windows-only, so it runs under **Wine + Xvfb** behind a thin JSON bridge; the same
app code talks to the native module on Windows and to the bridge on Linux. Open the
UI from your phone or PC on the same network.

```bash
./deploy/linux/setup.sh                       # Wine + MT5 + Python deps
cp deploy/linux/.env.linux.example backend/.env   # then set ENCRYPTION_KEY
./deploy/linux/install.sh                      # systemd autostart
./deploy/linux/status.sh                       # health + LAN URL + QR
```

Full guide, architecture, and troubleshooting: [`deploy/linux/README.md`](./deploy/linux/README.md).

> On a low-RAM box this runs **one active account at a time** (`MAX_ACTIVE_ACCOUNTS`,
> default 1 on Linux) — a Wine MT5 terminal is RAM-heavy.

---

## Stealth order mode

For prop accounts that ban EAs, `STEALTH_MODE` (`off | tier1 | tier2`) reduces the
automation footprint of placed orders.

- **`tier1`** (default): `magic=0`, natural/empty comment, per-account timing jitter,
  optional volume variance. Applied to entries and close/partial-close.
- **`tier2`**: GUI automation so the deal `reason` reads as a manual `CLIENT` trade —
  **design-only** ([`deploy/linux/STEALTH_TIER2.md`](./deploy/linux/STEALTH_TIER2.md)),
  not yet implemented.

> ⚠️ Tier 1 is **on by default**, so orders use `magic=0` / empty comment instead of
> the legacy `magic=234000` / `"TraderDiary"`. Set `STEALTH_MODE=off` to restore the
> old behavior. Tier 1 cannot change the server-stamped deal `reason` (that needs
> Tier 2). This is your firm's contract rule, not a technical wall — your risk.

---

## Project layout

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full file map + data flow.

```
TraderDiary/
├── backend/                Python FastAPI + SQLAlchemy + MetaTrader5
│   ├── app/
│   │   ├── main.py         FastAPI app + startup migrations
│   │   ├── config.py       Timing + MT5-bridge + stealth + low-resource config
│   │   ├── database.py     SQLite engine + session factory
│   │   ├── schemas.py      Pydantic request/response models
│   │   ├── models/         SQLAlchemy ORM models
│   │   ├── routes/         HTTP + WebSocket handlers
│   │   ├── services/       Business logic (MT5 provider/bridge client, sizing, rules, encryption, stealth)
│   │   ├── workers/        MT5 worker process + pool protocol (multi-account)
│   │   ├── data/           Seed data (fund_templates.json)
│   │   └── utils/          Async bridge helpers (run_mt5, run_db)
│   ├── tests/              Pytest suites
│   └── requirements.txt
├── frontend/               Next.js 16 + React 19 + Zustand + recharts
│   ├── app/                Routes (App Router)
│   ├── components/         UI components
│   ├── hooks/              Custom hooks (useMT5Stream, useFocusTrap)
│   ├── lib/                ApiClient, types, Zustand stores
│   └── __tests__/          Vitest suites
├── deploy/
│   └── linux/              Wine bridge server + setup/init scripts + systemd units
├── docs/
│   ├── superpowers/        Design specs + implementation plans
│   └── vi/                 Vietnamese quickstart
├── ARCHITECTURE.md
├── CONTRIBUTING.md
└── build.bat               One-step production build
```

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for branch strategy, commit convention, and how to add a fund template or API endpoint.

Issues and PRs welcome.

---

## License

(TBD)
