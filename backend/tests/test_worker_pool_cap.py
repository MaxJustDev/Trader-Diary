"""WorkerPool enforces a max active-worker cap (Linux runs 1 account)."""
import pytest

from app.services.worker_pool import WorkerPool, WorkerLimitReached

FAKE_MODULE = "tests.fixtures.fake_mt5_worker"


@pytest.mark.asyncio
async def test_cap_blocks_second_account():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=1)
    try:
        await p.spawn(1)
        with pytest.raises(WorkerLimitReached):
            await p.spawn(2)
        assert p.active_account_ids() == {1}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_cap_allows_respawn_of_same_account():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=1)
    try:
        await p.spawn(1)
        # Re-spawning the already-active account is idempotent, not a cap hit.
        await p.spawn(1)
        assert p.active_account_ids() == {1}
    finally:
        await p.shutdown_all()


@pytest.mark.asyncio
async def test_unlimited_when_max_is_none():
    p = WorkerPool(worker_module=FAKE_MODULE, max_workers=None)
    try:
        await p.spawn(1)
        await p.spawn(2)
        assert p.active_account_ids() == {1, 2}
    finally:
        await p.shutdown_all()
