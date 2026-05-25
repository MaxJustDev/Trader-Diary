import asyncio
import os
import sys

# Required for asyncio.create_subprocess_exec on Windows (worker pool).
# Set BEFORE the event loop is created.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from dotenv import load_dotenv
# Load environment variables FIRST before importing routes
from app.database import get_base_dir
load_dotenv(os.path.join(get_base_dir(), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from app.routes import accounts, funds, mt5, trading, analytics
from app.routes import news, system as system_routes
from app.routes import mt5_v2, trading_v2
from app.services.worker_pool import pool as worker_pool
from app.database import engine, Base
# Import all models so Base.metadata knows about them
from app.models import Fund, FundProgram, FundPhaseRule, Account, EquitySnapshot, TradeRecord  # noqa: F401

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
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            ("daily_open_equity", "FLOAT"),
            ("daily_open_date", "VARCHAR(10)"),
            ("peak_eod_balance", "FLOAT"),
            ("symbol_aliases", "TEXT"),
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

        # FundProgram table new columns
        fp_cols = {c["name"] for c in inspector.get_columns("fund_programs")}
        for col, coltype in [
            ("max_risk_per_trade_pct", "FLOAT"),
        ]:
            if col not in fp_cols:
                conn.execute(text(f"ALTER TABLE fund_programs ADD COLUMN {col} {coltype}"))

        # trade_records new columns
        tr_cols = {c["name"] for c in inspector.get_columns("trade_records")}
        for col, coltype in [
            ("notes", "VARCHAR(1000)"),
            ("tags", "VARCHAR(500)"),
            ("close_price", "FLOAT"),
            ("realized_pnl", "FLOAT"),
            ("closed_at", "TIMESTAMP"),
        ]:
            if col not in tr_cols:
                conn.execute(text(f"ALTER TABLE trade_records ADD COLUMN {col} {coltype}"))

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
app.include_router(news.router, prefix="/api/news", tags=["News"])
app.include_router(system_routes.router, prefix="/api/system", tags=["System"])
app.include_router(mt5_v2.router, prefix="/api/mt5/v2", tags=["MT5 v2 (multi-process)"])
app.include_router(trading_v2.router, prefix="/api/trading/v2", tags=["Trading v2 (parallel)"])


@app.on_event("shutdown")
async def _shutdown_worker_pool() -> None:
    await worker_pool.shutdown_all()


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
