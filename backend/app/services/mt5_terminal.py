"""Utility to create per-account MT5 terminal copies."""

import os
import shutil
import sys
import logging
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.services.mt5_service import MT5_BASE_PATH, MT5_TERMINALS_DIR
from app.services.settings import (
    KEY_DEFAULT_MT5_BASE_PATH,
    KEY_DEFAULT_TERMINALS_DIR,
    get_setting,
)

logger = logging.getLogger(__name__)

# Map fund server_pattern → the broker's own MT5 terminal installation path.
# When an account belongs to one of these funds, we copy from the broker terminal
# instead of the generic MetaTrader 5 base.
FUND_TERMINAL_BASES: Dict[str, str] = {
    "FivePercentOnline-Real": os.path.join(MT5_TERMINALS_DIR, "Five Percent Online MetaTrader 5"),
    "QuantTekel-Server": os.path.join(MT5_TERMINALS_DIR, "Quant Tekel MT5 Terminal"),
}


def _terminal_dir_name(account_id: str) -> str:
    """Return folder name for a given account, e.g. 'Account 12345 MT5 Terminal'."""
    return f"Account {account_id} MT5 Terminal"


def get_terminal_path(account_id: str, db: Optional[Session] = None) -> str:
    """Return the full path to terminal64.exe for an account."""
    folder = os.path.join(_effective_terminals_dir(db), _terminal_dir_name(account_id))
    return os.path.join(folder, "terminal64.exe")


def _effective_terminals_dir(db: Optional[Session] = None) -> str:
    """Return the active terminals directory: DB setting > env > hardcoded."""
    if db is not None:
        setting = get_setting(db, KEY_DEFAULT_TERMINALS_DIR)
        if setting:
            return setting
    return MT5_TERMINALS_DIR


def resolve_base_path(server: str, db: Optional[Session] = None, fund_override: Optional[str] = None) -> str:
    """Return the MT5 base installation path for an account.

    Resolution order:
      1. Explicit fund_override (fund.mt5_base_path from DB)
      2. Hardcoded FUND_TERMINAL_BASES mapping (legacy)
      3. App-level DB setting `default_mt5_base_path`
      4. Env var MT5_BASE_PATH
      5. Hardcoded default
    """
    if fund_override:
        return fund_override
    for pattern, path in FUND_TERMINAL_BASES.items():
        if pattern.lower() in server.lower():
            return path
    if db is not None:
        setting = get_setting(db, KEY_DEFAULT_MT5_BASE_PATH)
        if setting:
            return setting
    return MT5_BASE_PATH


def create_terminal_copy(account_id: str, base_path: Optional[str] = None, db: Optional[Session] = None) -> str:
    """Copy the base MT5 installation to a per-account folder.

    Args:
        account_id: The MT5 account login number (used for folder name).
        base_path: Source MT5 installation to copy from. If None, uses settings/env fallback.
        db: Optional SQLAlchemy session for reading runtime settings.

    Returns the path to the new terminal64.exe.
    Skips copy if the folder already exists.
    """
    if sys.platform != "win32":
        # Linux/Wine: one shared terminal, no per-account copies. The worker
        # connects to the already-running Wine terminal via the bridge.
        logger.info("Non-Windows: skipping per-account terminal copy for %s", account_id)
        return ""
    source = base_path or (get_setting(db, KEY_DEFAULT_MT5_BASE_PATH) if db else None) or MT5_BASE_PATH
    dest_dir = os.path.join(_effective_terminals_dir(db), _terminal_dir_name(account_id))

    if os.path.exists(dest_dir):
        exe_path = os.path.join(dest_dir, "terminal64.exe")
        if os.path.isfile(exe_path):
            logger.info("Terminal folder already exists for account %s", account_id)
            return exe_path
        # Folder exists but no exe — remove and re-copy
        shutil.rmtree(dest_dir)

    if not os.path.isdir(source):
        raise FileNotFoundError(
            f"Base MT5 installation not found at {source}. "
            "Ensure the broker terminal is installed or set MT5_BASE_PATH."
        )

    logger.info("Copying MT5 terminal for account %s: %s -> %s", account_id, source, dest_dir)
    shutil.copytree(source, dest_dir)

    exe_path = os.path.join(dest_dir, "terminal64.exe")
    if not os.path.isfile(exe_path):
        raise FileNotFoundError(f"terminal64.exe not found in copied folder: {dest_dir}")

    return exe_path


def delete_terminal_copy(account_id: str) -> bool:
    """Delete the per-account terminal folder. Returns True if deleted."""
    if sys.platform != "win32":
        return False
    dest_dir = os.path.join(MT5_TERMINALS_DIR, _terminal_dir_name(account_id))

    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
        logger.info("Deleted terminal folder for account %s", account_id)
        return True

    return False
