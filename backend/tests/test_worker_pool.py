"""WorkerPool tests using the fake_mt5_worker fixture.

These exercise spawn/call/kill/event-fan-out without touching MT5.
"""
import asyncio

import pytest

from app.services.worker_pool import WorkerPool, WorkerError, WorkerNotRunning

FAKE_MODULE = "tests.fixtures.fake_mt5_worker"


@pytest.fixture
def pool():
    p = WorkerPool(worker_module=FAKE_MODULE)
    yield p
    # Best-effort cleanup; ignore errors if loop is already closed.
    try:
        asyncio.get_event_loop().run_until_complete(p.shutdown_all())
    except Exception:
        pass


@pytest.mark.asyncio
async def test_spawn_and_ping():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(101)
        result = await p.call(101, "ping")
        assert result == "pong"
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_call_echo_params():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(102)
        result = await p.call(102, "echo", {"hello": "world", "n": 42})
        assert result == {"hello": "world", "n": 42}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_call_error_response_raises():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(103)
        with pytest.raises(WorkerError) as exc:
            await p.call(103, "fail")
        assert exc.value.code == "fake_error"
        assert "intentional" in exc.value.message
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_call_unknown_method_raises():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(104)
        with pytest.raises(WorkerError) as exc:
            await p.call(104, "nope")
        assert exc.value.code == "method_not_found"
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_call_when_not_spawned_raises():
    p = WorkerPool(worker_module=FAKE_MODULE)
    with pytest.raises(WorkerNotRunning):
        await p.call(999, "ping")


@pytest.mark.asyncio
async def test_spawn_is_idempotent():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(105)
        # Second spawn should be no-op.
        await p.spawn(105)
        result = await p.call(105, "ping")
        assert result == "pong"
        assert len(p.active_account_ids()) == 1
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_multiple_accounts_isolated():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(201)
        await p.spawn(202)
        r1, r2 = await asyncio.gather(
            p.call(201, "echo", {"who": "one"}),
            p.call(202, "echo", {"who": "two"}),
        )
        assert r1 == {"who": "one"}
        assert r2 == {"who": "two"}
        assert p.active_account_ids() == {201, 202}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_events_reach_subscribers():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        q = await p.subscribe()
        await p.spawn(301)
        # First event should be 'health ready' (sent at bootstrap).
        account_db_id, evt = await asyncio.wait_for(q.get(), timeout=2.0)
        assert account_db_id == 301
        assert evt["event"] == "health"
        # Fake worker also emits tick events ~every 50ms; drain a couple.
        seen_tick = False
        for _ in range(5):
            try:
                _, evt2 = await asyncio.wait_for(q.get(), timeout=1.0)
                if evt2["event"] == "tick":
                    seen_tick = True
                    break
            except asyncio.TimeoutError:
                break
        assert seen_tick, "expected at least one tick event from fake worker"
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_kill_terminates_worker():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(401)
        assert p.is_active(401)
        await p.kill(401)
        assert not p.is_active(401)
        # Subsequent call should fail with WorkerNotRunning.
        with pytest.raises(WorkerNotRunning):
            await p.call(401, "ping")
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_call_timeout_raises_async_timeout():
    p = WorkerPool(worker_module=FAKE_MODULE)
    try:
        await p.spawn(501)
        with pytest.raises(asyncio.TimeoutError):
            # `slow` waits 1.0s; we give 0.1s.
            await p.call(501, "slow", {"delay_seconds": 1.0}, timeout=0.1)
    finally:
        await p.shutdown_all()
