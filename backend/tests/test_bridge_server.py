"""Unit tests for the Wine bridge server's pure logic.

bridge_server.py is loaded directly from deploy/linux/ (it is not a package)
and imports MetaTrader5 lazily inside main(), so it loads fine without MT5.
"""
import collections
import importlib.util
import os
from types import SimpleNamespace

import pytest

_HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_BRIDGE_PATH = os.path.join(_HERE, "deploy", "linux", "bridge_server.py")


@pytest.fixture(scope="module")
def bridge():
    spec = importlib.util.spec_from_file_location("bridge_server", _BRIDGE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_serialize_namedtuple(bridge):
    Tick = collections.namedtuple("Tick", ["bid", "ask", "last"])
    assert bridge._serialize(Tick(1.1, 1.2, 1.15)) == {"bid": 1.1, "ask": 1.2, "last": 1.15}


def test_serialize_list_of_namedtuples(bridge):
    Pos = collections.namedtuple("Pos", ["ticket", "symbol"])
    out = bridge._serialize([Pos(1, "EURUSD"), Pos(2, "GBPUSD")])
    assert out == [{"ticket": 1, "symbol": "EURUSD"}, {"ticket": 2, "symbol": "GBPUSD"}]


def test_serialize_nested(bridge):
    Req = collections.namedtuple("Req", ["symbol"])
    Result = collections.namedtuple("Result", ["retcode", "request"])
    assert bridge._serialize(Result(10009, Req("EURUSD"))) == {
        "retcode": 10009,
        "request": {"symbol": "EURUSD"},
    }


def test_serialize_primitives(bridge):
    assert bridge._serialize(None) is None
    assert bridge._serialize(True) is True
    assert bridge._serialize(42) == 42


def test_handle_dispatches_to_fake_mt5(bridge):
    Info = collections.namedtuple("Info", ["balance"])
    fake = SimpleNamespace(account_info=lambda: Info(500.0))
    resp = bridge._handle(fake, {"method": "account_info", "args": [], "kwargs": {}})
    assert resp == {"result": {"balance": 500.0}}


def test_handle_unknown_method(bridge):
    fake = SimpleNamespace()
    resp = bridge._handle(fake, {"method": "nope", "args": [], "kwargs": {}})
    assert "error" in resp


def test_handle_exception_is_caught(bridge):
    def boom():
        raise RuntimeError("kaboom")

    fake = SimpleNamespace(login=boom)
    resp = bridge._handle(fake, {"method": "login", "args": [], "kwargs": {}})
    assert "error" in resp and "kaboom" in resp["error"]
