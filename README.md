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

## Project layout

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full file map + data flow.

```
TraderDiary/
├── backend/                Python FastAPI + SQLAlchemy + MetaTrader5
│   ├── app/
│   │   ├── main.py         FastAPI app + startup migrations
│   │   ├── config.py       Timing constants
│   │   ├── database.py     SQLite engine + session factory
│   │   ├── schemas.py      Pydantic request/response models
│   │   ├── models/         SQLAlchemy ORM models
│   │   ├── routes/         HTTP + WebSocket handlers
│   │   ├── services/       Business logic (MT5, sizing, rules, encryption)
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
