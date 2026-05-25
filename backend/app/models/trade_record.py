from sqlalchemy import Column, Integer, Float, String, Boolean, TIMESTAMP, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class TradeRecord(Base):
    __tablename__ = "trade_records"

    id = Column(Integer, primary_key=True, index=True)
    account_db_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    account_login = Column(String(50), nullable=False)
    symbol = Column(String(20), nullable=False)
    direction = Column(String(10), nullable=False)   # BUY | SELL
    lot_size = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=True)
    sl_price = Column(Float, nullable=True)
    tp_price = Column(Float, nullable=True)
    sl_pips = Column(Float, nullable=True)
    tp_pips = Column(Float, nullable=True)
    risk_pct = Column(Float, nullable=True)
    risk_amount = Column(Float, nullable=True)
    reward_amount = Column(Float, nullable=True)
    rr_ratio = Column(Float, nullable=True)
    order_ticket = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    error_msg = Column(String(300), nullable=True)
    notes = Column(String(1000), nullable=True)
    tags = Column(String(500), nullable=True)  # comma-separated tag list
    close_price = Column(Float, nullable=True)
    realized_pnl = Column(Float, nullable=True)
    closed_at = Column(TIMESTAMP, nullable=True)
    executed_at = Column(TIMESTAMP, server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_trade_records_account_executed", "account_db_id", "executed_at"),
    )
