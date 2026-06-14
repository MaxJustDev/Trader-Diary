"""Process-wide MT5 service instance + connected-account tracker.

Imported by routes and services that need to talk to the broker. Kept in
`services/` (not `routes/`) so non-route modules (analytics, streaming) can
import without creating route→route coupling.
"""
from typing import Optional

from app.services.mt5_service import MT5Service

mt5_service = MT5Service()

_connected_account_id: Optional[int] = None


def get_connected_account_id() -> Optional[int]:
    return _connected_account_id


def set_connected_account_id(account_db_id: Optional[int]) -> None:
    global _connected_account_id
    _connected_account_id = account_db_id
