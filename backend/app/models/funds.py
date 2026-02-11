from sqlalchemy import Column, Integer, String, Float, Text, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Fund(Base):
    __tablename__ = "funds"

    id = Column(Integer, primary_key=True, index=True)
    fund_name = Column(String(100), unique=True, nullable=False)
    server_pattern = Column(String(100), nullable=False)
    name_format = Column(String(200), nullable=True)
    account_name_patterns = Column(Text, nullable=True)  # JSON string
    created_at = Column(TIMESTAMP, server_default=func.now())

    programs = relationship("FundProgram", back_populates="fund", cascade="all, delete-orphan")


class FundProgram(Base):
    __tablename__ = "fund_programs"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False)
    program_name = Column(String(100), nullable=False)
    min_trading_days = Column(Integer, nullable=True)
    max_margin_pct = Column(Float, nullable=True)
    payout_days = Column(Integer, nullable=True)
    payout_type = Column(String(20), nullable=True)  # 'fixed' or 'on_demand'
    best_day_rule_pct = Column(Float, nullable=True)
    min_profit_days = Column(Integer, nullable=True)
    profit_day_threshold_pct = Column(Float, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    fund = relationship("Fund", back_populates="programs")
    phase_rules = relationship("FundPhaseRule", back_populates="program", cascade="all, delete-orphan")
    accounts = relationship("Account", back_populates="fund_program")


class FundPhaseRule(Base):
    __tablename__ = "fund_phase_rules"

    id = Column(Integer, primary_key=True, index=True)
    program_id = Column(Integer, ForeignKey("fund_programs.id", ondelete="CASCADE"), nullable=False)
    phase_name = Column(String(50), nullable=False)
    phase_order = Column(Integer, nullable=False)
    profit_target = Column(Float, nullable=True)
    daily_drawdown = Column(Float, nullable=False)
    max_drawdown = Column(Float, nullable=False)
    drawdown_type = Column(String(20), nullable=False, default="static")  # 'static' or 'eod_trailing'

    program = relationship("FundProgram", back_populates="phase_rules")
