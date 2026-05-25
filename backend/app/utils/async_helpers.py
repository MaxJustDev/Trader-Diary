"""Async bridge helpers for running sync MT5 and DB code off the event loop.

MT5 calls MUST go through `run_mt5`. The `MetaTrader5` library is a global
per-process singleton with stateful connection — concurrent calls from
multiple threads cause undefined behavior. The dedicated single-thread
executor serializes them while keeping the asyncio event loop responsive.

DB calls can use `run_db` which has a slightly larger pool (SQLite with
check_same_thread=False is fine across threads).
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_mt5_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mt5-sync")
_db_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db-sync")


async def run_mt5(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a synchronous MT5 call off the event loop on the dedicated MT5 thread."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_mt5_executor, partial(fn, *args, **kwargs))


async def run_db(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a synchronous DB call off the event loop on the DB thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_db_executor, partial(fn, *args, **kwargs))
