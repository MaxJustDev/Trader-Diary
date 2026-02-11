import os
import sys
from dotenv import load_dotenv
# Load environment variables FIRST before importing routes
from app.database import get_base_dir
load_dotenv(os.path.join(get_base_dir(), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from app.routes import accounts, funds, mt5, trading, analytics
from app.database import engine, Base
# Import all models so Base.metadata knows about them
from app.models import Fund, FundProgram, FundPhaseRule, Account  # noqa: F401

# Create database tables
Base.metadata.create_all(bind=engine)

# Migrate existing tables: add new columns if they don't exist
def _migrate():
    inspector = inspect(engine)
    with engine.connect() as conn:
        # Account table new columns
        acct_cols = {c["name"] for c in inspector.get_columns("accounts")}
        for col, coltype in [
            ("mt5_path", "VARCHAR(500)"),
            ("mt5_name", "VARCHAR(200)"),
            ("balance", "FLOAT"),
            ("equity", "FLOAT"),
            ("profit", "FLOAT"),
            ("starting_balance", "FLOAT"),
            ("next_payout_date", "VARCHAR(10)"),
        ]:
            if col not in acct_cols:
                conn.execute(text(f"ALTER TABLE accounts ADD COLUMN {col} {coltype}"))

        # Fund table new columns
        fund_cols = {c["name"] for c in inspector.get_columns("funds")}
        for col, coltype in [
            ("name_format", "VARCHAR(200)"),
            ("account_name_patterns", "TEXT"),
        ]:
            if col not in fund_cols:
                conn.execute(text(f"ALTER TABLE funds ADD COLUMN {col} {coltype}"))

        conn.commit()

_migrate()

app = FastAPI(
    title="TraderDiary API",
    description="Backend for TraderDiary MVP",
    version="0.1.0"
)

# CORS configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(accounts.router, prefix="/api/accounts", tags=["Accounts"])
app.include_router(funds.router, prefix="/api/funds", tags=["Funds"])
app.include_router(mt5.router, prefix="/api/mt5", tags=["MT5"])
app.include_router(trading.router, prefix="/api/trading", tags=["Trading"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])


# Serve frontend static files (must be AFTER API routers)
def _get_frontend_path():
    if getattr(sys, "frozen", False):
        # PyInstaller --onedir: bundled data is under _internal/
        return os.path.join(sys._MEIPASS, "frontend")
    # Dev mode: use Next.js static export output
    dev_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "out")
    dev_path = os.path.normpath(dev_path)
    if os.path.isdir(dev_path):
        return dev_path
    return None


_frontend_path = _get_frontend_path()
if _frontend_path and os.path.isdir(_frontend_path):
    app.mount("/", StaticFiles(directory=_frontend_path, html=True), name="frontend")
