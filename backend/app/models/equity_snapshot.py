from sqlalchemy import Column, Integer, Float, String, TIMESTAMP, ForeignKey, Index
from sqlalchemy.sql import func
from app.database import Base


class EquitySnapshot(Base):
    __tablename__ = "equity_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    account_db_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    balance = Column(Float, nullable=False)
    equity = Column(Float, nullable=False)
    profit = Column(Float, nullable=True)
    recorded_at = Column(TIMESTAMP, server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_equity_snapshots_account_recorded", "account_db_id", "recorded_at"),
    )
