from unittest.mock import MagicMock


def _make_account(account_id="12345", password=b"dummy", server="X-Server", mt5_path="C:/x.exe"):
    """Build a minimal Account-like stand-in. Real Account model not needed."""
    acc = MagicMock()
    acc.account_id = account_id
    acc.password = password
    acc.server = server
    acc.mt5_path = mt5_path
    return acc


def test_login_account_calls_mt5_with_expected_args(monkeypatch):
    from app.services import mt5_auth

    monkeypatch.setattr(mt5_auth, "decrypt_password", lambda _: "plain-pw")

    mt5 = MagicMock()
    mt5.login.return_value = True

    acc = _make_account(account_id="9001")
    result = mt5_auth.login_account(acc, mt5)

    assert result is True
    mt5.login.assert_called_once_with(9001, "plain-pw", "X-Server", path="C:/x.exe")


def test_login_account_returns_false_on_mt5_login_failure(monkeypatch):
    from app.services import mt5_auth

    monkeypatch.setattr(mt5_auth, "decrypt_password", lambda _: "plain-pw")

    mt5 = MagicMock()
    mt5.login.return_value = False

    assert mt5_auth.login_account(_make_account(), mt5) is False


def test_login_account_returns_false_on_decrypt_failure(monkeypatch):
    from app.services import mt5_auth

    def boom(_):
        raise ValueError("bad key")

    monkeypatch.setattr(mt5_auth, "decrypt_password", boom)

    mt5 = MagicMock()
    result = mt5_auth.login_account(_make_account(), mt5)

    assert result is False
    mt5.login.assert_not_called()
