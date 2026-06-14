"""BridgeClient tested against an in-process fake bridge server.

The fake server speaks the same line-delimited JSON protocol as the real
Wine-side bridge_server.py: it sends a constants frame on connect, then
answers {method,args,kwargs} requests with {result} or {error}.
"""
import json
import socket
import socketserver
import threading

import pytest

from app.services.mt5_provider import BridgeClient


class _FakeHandler(socketserver.StreamRequestHandler):
    def handle(self):
        # constants frame first
        consts = {"ORDER_TYPE_BUY": 0, "ORDER_TYPE_SELL": 1, "TRADE_RETCODE_DONE": 10009}
        self.wfile.write((json.dumps({"constants": consts}) + "\n").encode())
        self.wfile.flush()
        for raw in self.rfile:
            line = raw.decode().strip()
            if not line:
                continue
            req = json.loads(line)
            method = req["method"]
            if method == "account_info":
                resp = {"result": {"login": 123, "balance": 1000.0, "equity": 1010.0}}
            elif method == "positions_get":
                resp = {"result": [{"ticket": 5, "symbol": "EURUSD"}]}
            elif method == "order_send":
                resp = {"result": {"retcode": 10009, "order": 7, "request": {"symbol": "EURUSD"}}}
            elif method == "boom":
                resp = {"error": "RuntimeError: kaboom"}
            else:
                resp = {"result": None}
            self.wfile.write((json.dumps(resp) + "\n").encode())
            self.wfile.flush()


@pytest.fixture
def fake_bridge():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _FakeHandler)
    server.daemon_threads = True
    host, port = server.server_address
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    yield host, port
    server.shutdown()
    server.server_close()


def test_constants_resolve(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    assert mt5.ORDER_TYPE_BUY == 0
    assert mt5.ORDER_TYPE_SELL == 1
    assert mt5.TRADE_RETCODE_DONE == 10009


def test_account_info_returns_namespace(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    info = mt5.account_info()
    assert info.login == 123
    assert info.balance == 1000.0


def test_positions_get_returns_list_of_namespaces(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    positions = mt5.positions_get()
    assert positions[0].ticket == 5
    assert positions[0].symbol == "EURUSD"


def test_order_send_nested_namespace(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    result = mt5.order_send({"symbol": "EURUSD", "volume": 0.1})
    assert result.retcode == 10009
    assert result.order == 7
    assert result.request.symbol == "EURUSD"


def test_error_response_returns_none_and_sets_last_error(fake_bridge):
    host, port = fake_bridge
    mt5 = BridgeClient(host, port)
    assert mt5.boom() is None
    code, msg = mt5.last_error()
    assert "kaboom" in msg


def test_transport_failure_returns_none():
    # Nothing listening on this port -> connect fails -> method returns None.
    mt5 = BridgeClient("127.0.0.1", 1)  # port 1: refused
    assert mt5.account_info() is None
    code, msg = mt5.last_error()
    assert code == -1
