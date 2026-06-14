import asyncio
import threading

import pytest


@pytest.mark.asyncio
async def test_run_mt5_executes_off_event_loop():
    from app.utils.async_helpers import run_mt5

    main_thread_id = threading.get_ident()

    def sync_work():
        return threading.get_ident()

    worker_thread_id = await run_mt5(sync_work)
    assert worker_thread_id != main_thread_id


@pytest.mark.asyncio
async def test_run_mt5_serializes_on_single_thread():
    """All MT5 work must funnel through the same thread (singleton constraint)."""
    from app.utils.async_helpers import run_mt5

    def sync_work():
        return threading.get_ident()

    results = await asyncio.gather(
        run_mt5(sync_work),
        run_mt5(sync_work),
        run_mt5(sync_work),
    )
    assert len(set(results)) == 1, f"MT5 calls hit multiple threads: {results}"


@pytest.mark.asyncio
async def test_run_db_uses_separate_pool_from_mt5():
    """DB pool runs in different worker threads than MT5 (independent pools)."""
    from app.utils.async_helpers import run_mt5, run_db

    def sync_work():
        return threading.get_ident()

    mt5_tid = await run_mt5(sync_work)
    db_tid = await run_db(sync_work)
    assert mt5_tid != db_tid


@pytest.mark.asyncio
async def test_run_mt5_propagates_exceptions():
    from app.utils.async_helpers import run_mt5

    def boom():
        raise ValueError("kaboom")

    with pytest.raises(ValueError, match="kaboom"):
        await run_mt5(boom)


@pytest.mark.asyncio
async def test_run_mt5_passes_args_and_kwargs():
    from app.utils.async_helpers import run_mt5

    def add(a, b, *, c):
        return a + b + c

    result = await run_mt5(add, 1, 2, c=3)
    assert result == 6
