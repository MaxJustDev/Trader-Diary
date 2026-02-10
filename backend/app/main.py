from dotenv import load_dotenv
# Load environment variables FIRST before importing routes
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import accounts, funds, mt5, trading, analytics
from app.database import engine, Base
# Import all models so Base.metadata knows about them
from app.models import Fund, FundProgram, FundPhaseRule, Account  # noqa: F401

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TraderDiary API",
    description="Backend for TraderDiary MVP",
    version="1.0.0"
)

# CORS configuration
origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "TraderDiary API is running"}

# Include routers
app.include_router(accounts.router, prefix="/api/accounts", tags=["Accounts"])
app.include_router(funds.router, prefix="/api/funds", tags=["Funds"])
app.include_router(mt5.router, prefix="/api/mt5", tags=["MT5"])
app.include_router(trading.router, prefix="/api/trading", tags=["Trading"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
