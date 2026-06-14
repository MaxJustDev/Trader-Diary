import json

import pytest

from app.workers import protocol as p


def test_encode_request_round_trip():
    line = p.encode_request("abc", "ping", {"x": 1})
    assert line.endswith("\n")
    obj = json.loads(line)
    assert obj == {"id": "abc", "method": "ping", "params": {"x": 1}}


def test_encode_request_default_params():
    line = p.encode_request("abc", "ping")
    obj = json.loads(line)
    assert obj["params"] == {}


def test_encode_response_round_trip():
    line = p.encode_response("xyz", {"ok": True})
    obj = json.loads(line)
    assert obj == {"id": "xyz", "result": {"ok": True}}


def test_encode_error_round_trip():
    line = p.encode_error("xyz", p.ERR_MT5_FAILURE, "boom")
    obj = json.loads(line)
    assert obj["id"] == "xyz"
    assert obj["error"]["code"] == p.ERR_MT5_FAILURE
    assert obj["error"]["message"] == "boom"


def test_encode_event_round_trip():
    line = p.encode_event("tick", {"balance": 100})
    obj = json.loads(line)
    assert obj == {"event": "tick", "data": {"balance": 100}}
    assert "id" not in obj


def test_decode_request_valid():
    line = p.encode_request("42", "place_order", {"volume": 0.01})
    req = p.decode_request(line)
    assert req.id == "42"
    assert req.method == "place_order"
    assert req.params == {"volume": 0.01}


def test_decode_request_no_params():
    req = p.decode_request('{"id":"42","method":"ping"}')
    assert req.params == {}


def test_decode_request_missing_id_raises():
    with pytest.raises(ValueError, match="missing"):
        p.decode_request('{"method":"ping"}')


def test_decode_request_missing_method_raises():
    with pytest.raises(ValueError, match="missing"):
        p.decode_request('{"id":"1"}')


def test_decode_request_invalid_json_raises():
    with pytest.raises(ValueError, match="invalid JSON"):
        p.decode_request("not json")


def test_decode_request_not_object_raises():
    with pytest.raises(ValueError, match="JSON object"):
        p.decode_request("[1,2,3]")


def test_is_response_true():
    obj = json.loads(p.encode_response("1", "pong"))
    assert p.is_response(obj)
    assert not p.is_event(obj)


def test_is_response_for_error():
    obj = json.loads(p.encode_error("1", "x", "y"))
    assert p.is_response(obj)
    assert not p.is_event(obj)


def test_is_event_true():
    obj = json.loads(p.encode_event("tick", {}))
    assert p.is_event(obj)
    assert not p.is_response(obj)


def test_id_coerced_to_str():
    """Numeric ids in requests round-trip as strings on parse."""
    req = p.decode_request('{"id":42,"method":"ping"}')
    assert req.id == "42"
