"""Utility to create per-account MT5 terminal copies."""

import os
import shutil
import logging

from app.services.mt5_service import MT5_BASE_PATH, MT5_TERMINALS_DIR

logger = logging.getLogger(__name__)


def _terminal_dir_name(account_id: str) -> str:
    """Return folder name for a given account, e.g. 'Account 12345 MT5 Terminal'."""
    return f"Account {account_id} MT5 Terminal"


def get_terminal_path(account_id: str) -> str:
    """Return the full path to terminal64.exe for an account."""
    folder = os.path.join(MT5_TERMINALS_DIR, _terminal_dir_name(account_id))
    return os.path.join(folder, "terminal64.exe")


def create_terminal_copy(account_id: str) -> str:
    """Copy the base MT5 installation to a per-account folder.

    Returns the path to the new terminal64.exe.
    Skips copy if the folder already exists.
    """
    dest_dir = os.path.join(MT5_TERMINALS_DIR, _terminal_dir_name(account_id))

    if os.path.exists(dest_dir):
        exe_path = os.path.join(dest_dir, "terminal64.exe")
        if os.path.isfile(exe_path):
            logger.info("Terminal folder already exists for account %s", account_id)
            return exe_path
        # Folder exists but no exe — remove and re-copy
        shutil.rmtree(dest_dir)

    if not os.path.isdir(MT5_BASE_PATH):
        raise FileNotFoundError(
            f"Base MT5 installation not found at {MT5_BASE_PATH}. "
            "Set MT5_BASE_PATH env var to the correct folder."
        )

    logger.info("Copying MT5 terminal for account %s: %s -> %s", account_id, MT5_BASE_PATH, dest_dir)
    shutil.copytree(MT5_BASE_PATH, dest_dir)

    exe_path = os.path.join(dest_dir, "terminal64.exe")
    if not os.path.isfile(exe_path):
        raise FileNotFoundError(f"terminal64.exe not found in copied folder: {dest_dir}")

    return exe_path


def delete_terminal_copy(account_id: str) -> bool:
    """Delete the per-account terminal folder. Returns True if deleted."""
    dest_dir = os.path.join(MT5_TERMINALS_DIR, _terminal_dir_name(account_id))

    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
        logger.info("Deleted terminal folder for account %s", account_id)
        return True

    return False
