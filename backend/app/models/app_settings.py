from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.sql import func
from app.database import Base


class AppSetting(Base):
    """Generic key-value store for app-wide configuration.

    Used for things like default MT5 base path and terminals directory that
    apply across all accounts/funds unless overridden.
    """

    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
