"""Key/value app settings backed by the AppSetting table.

Used for runtime-configurable values that we don't want hardcoded in env
files — primarily MT5 base paths and per-fund terminal overrides.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.app_settings import AppSetting

# Known settings keys
KEY_DEFAULT_MT5_BASE_PATH = "default_mt5_base_path"
KEY_DEFAULT_TERMINALS_DIR = "default_terminals_dir"
KEY_STEALTH_MODE = "stealth_mode"

KNOWN_KEYS = {KEY_DEFAULT_MT5_BASE_PATH, KEY_DEFAULT_TERMINALS_DIR, KEY_STEALTH_MODE}


def get_setting(db: Session, key: str) -> Optional[str]:
    """Return the stored value for a key, or None if not set."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else None


def set_setting(db: Session, key: str, value: Optional[str]) -> None:
    """Upsert a single setting. Pass value=None to delete."""
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if value is None or value == "":
        if row:
            db.delete(row)
            db.commit()
        return
    if row:
        row.value = value
    else:
        row = AppSetting(key=key, value=value)
        db.add(row)
    db.commit()


def get_all_settings(db: Session) -> dict[str, Optional[str]]:
    """Return all known settings keys with their current values (None if unset)."""
    rows = db.query(AppSetting).all()
    found = {r.key: r.value for r in rows}
    return {key: found.get(key) for key in KNOWN_KEYS}
