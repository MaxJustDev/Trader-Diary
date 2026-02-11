from sqlalchemy import Column, Integer, String, Float, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # Encrypted
    server = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False)  # 'fund' or 'personal'
    fund_program_id = Column(Integer, ForeignKey("fund_programs.id"), nullable=True)
    current_phase = Column(String(50), nullable=True)
    mt5_path = Column(String(500), nullable=True)
    mt5_name = Column(String(200), nullable=True)
    balance = Column(Float, nullable=True)
    equity = Column(Float, nullable=True)
    profit = Column(Float, nullable=True)
    starting_balance = Column(Float, nullable=True)
    next_payout_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    fund_program = relationship("FundProgram", back_populates="accounts")
