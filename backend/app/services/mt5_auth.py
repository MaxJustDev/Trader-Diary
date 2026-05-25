"""Single login flow for MT5 accounts.

The same `decrypt + mt5.login` sequence used to appear in six places in the
route layer. Consolidated here so credentials handling lives in one file
that can be audited.
"""
from app.models.accounts import Account
from app.services.encryption import decrypt_password
from app.services.mt5_service import MT5Service


def login_account(account: Account, mt5: MT5Service) -> bool:
    """Decrypt the account's stored password and log in via the given MT5 service.

    Returns True on success, False on any failure (decrypt error or login refused).
    Sync — callers in async handlers should dispatch through `run_mt5`.
    """
    try:
        password = decrypt_password(account.password)
    except Exception:
        return False
    return mt5.login(int(account.account_id), password, account.server, path=account.mt5_path)
