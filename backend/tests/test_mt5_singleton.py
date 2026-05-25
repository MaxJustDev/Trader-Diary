def test_mt5_service_is_singleton_across_imports():
    from app.services.mt5_singleton import mt5_service as a
    from app.services.mt5_singleton import mt5_service as b
    assert a is b


def test_connected_account_id_round_trip():
    from app.services.mt5_singleton import (
        get_connected_account_id,
        set_connected_account_id,
    )

    set_connected_account_id(None)
    assert get_connected_account_id() is None

    set_connected_account_id(42)
    assert get_connected_account_id() == 42

    set_connected_account_id(None)
    assert get_connected_account_id() is None


def test_setting_to_int_then_to_none_clears():
    from app.services.mt5_singleton import (
        get_connected_account_id,
        set_connected_account_id,
    )

    set_connected_account_id(7)
    set_connected_account_id(None)
    assert get_connected_account_id() is None
