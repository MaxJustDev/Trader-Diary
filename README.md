# TraderDiary

Local-first MetaTrader 5 account manager and batch trading tool for prop firm traders.

---

## Download & Run (No Setup Required)

1. Go to [Releases](../../releases) and download **`TraderDiary.zip`**
2. Extract the zip to any folder (e.g. `C:\TraderDiary\`)
3. Double-click **`TraderDiary.exe`**
4. Browser opens automatically to `http://localhost:8001`

**Requirements:** Windows 10/11 with MetaTrader 5 installed. No Python or Node.js needed.

**First run** automatically creates:
- `.env` with a random encryption key (for password storage)
- `traderdiary.db` SQLite database

> Keep `TraderDiary.exe`, `.env`, and `traderdiary.db` in the same folder. Back up `.env` — if you lose it, saved MT5 passwords cannot be decrypted.

---

## Build From Source

### Prerequisites

- Python 3.10+
- Node.js 18+
- MT5 terminal installed (Windows only)

### 1. Clone & install dependencies

```bash
git clone https://github.com/user/TraderDiary.git
cd TraderDiary

# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### 2. Build portable app

```bash
build.bat
```

This runs three steps:
1. Builds frontend static export (`frontend/out/`)
2. Installs PyInstaller (if needed)
3. Packages everything into `backend\dist\TraderDiary\`

### 3. Output

```
backend\dist\TraderDiary\
├── TraderDiary.exe      ← run this
├── _internal\           ← runtime (do not modify)
└── (created on first run: .env, traderdiary.db)
```

### Create a release zip

```bash
cd backend\dist
powershell Compress-Archive -Path TraderDiary -DestinationPath TraderDiary.zip
```

Upload `TraderDiary.zip` to GitHub Releases.

---

## Development Mode

Run backend and frontend separately with hot-reload:

```bash
# Terminal 1 — Backend (port 8001)
cd backend
venv\Scripts\activate
python run.py

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Open `http://localhost:3000` for the frontend dev server.

---

## Project Structure

```
TraderDiary/
├── backend/              Python FastAPI backend
│   ├── app/
│   │   ├── main.py       App setup, CORS, static files mount
│   │   ├── database.py   SQLite + SQLAlchemy
│   │   ├── schemas.py    Pydantic models
│   │   ├── models/       SQLAlchemy models
│   │   ├── routes/       API endpoints
│   │   └── services/     MT5, position sizer, encryption
│   ├── run.py            Entry point
│   ├── TraderDiary.spec  PyInstaller config
│   └── requirements.txt
├── frontend/             Next.js 16 frontend
│   ├── app/              Pages (dashboard, accounts, funds, trading, analytics)
│   ├── components/       UI components
│   └── lib/              API client, types, Zustand stores
├── build.bat             One-click build script
└── README.md
```
