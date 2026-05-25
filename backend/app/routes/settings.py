"""App-wide settings + per-fund MT5 base path overrides."""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.funds import Fund
from app.services.settings import (
    KEY_DEFAULT_MT5_BASE_PATH,
    KEY_DEFAULT_TERMINALS_DIR,
    KNOWN_KEYS,
    get_all_settings,
    set_setting,
)

router = APIRouter()


class SettingUpdate(BaseModel):
    value: str | None = None


class PathPayload(BaseModel):
    path: str


@router.get("")
async def list_settings(db: Session = Depends(get_db)):
    """Return all known app settings + their current values + per-fund overrides."""
    settings = get_all_settings(db)
    fund_overrides = [
        {
            "id": f.id,
            "fund_name": f.fund_name,
            "server_pattern": f.server_pattern,
            "mt5_base_path": f.mt5_base_path,
        }
        for f in db.query(Fund).order_by(Fund.fund_name).all()
    ]
    return {"settings": settings, "fund_overrides": fund_overrides}


@router.put("/{key}")
async def upsert_setting(key: str, payload: SettingUpdate, db: Session = Depends(get_db)):
    if key not in KNOWN_KEYS:
        raise HTTPException(status_code=400, detail=f"unknown setting key: {key}")
    set_setting(db, key, payload.value)
    return {"key": key, "value": payload.value}


@router.post("/validate-mt5-path")
async def validate_mt5_path(payload: PathPayload):
    """Confirm that the given folder contains a terminal64.exe."""
    path = payload.path.strip()
    if not path:
        return {"path": path, "exists": False, "has_terminal_exe": False}
    exists = os.path.isdir(path)
    exe_path = os.path.join(path, "terminal64.exe")
    has_exe = os.path.isfile(exe_path)
    return {
        "path": path,
        "exists": exists,
        "has_terminal_exe": has_exe,
        "exe_path": exe_path if has_exe else None,
    }


@router.post("/validate-terminals-dir")
async def validate_terminals_dir(payload: PathPayload):
    """Confirm that the terminals directory exists (or is creatable)."""
    path = payload.path.strip()
    if not path:
        return {"path": path, "exists": False, "writable": False}
    exists = os.path.isdir(path)
    parent = os.path.dirname(path)
    writable = exists or (os.path.isdir(parent) and os.access(parent, os.W_OK))
    return {"path": path, "exists": exists, "writable": writable}


# ── Per-fund MT5 base path override ───────────────────────────────────────────
@router.put("/funds/{fund_id}/mt5-base-path")
async def set_fund_mt5_base_path(fund_id: int, payload: PathPayload, db: Session = Depends(get_db)):
    fund = db.query(Fund).filter(Fund.id == fund_id).first()
    if not fund:
        raise HTTPException(status_code=404, detail="fund not found")
    fund.mt5_base_path = payload.path.strip() or None
    db.commit()
    return {
        "fund_id": fund.id,
        "fund_name": fund.fund_name,
        "mt5_base_path": fund.mt5_base_path,
    }
