"""Async manager for MT5 worker subprocesses.

One worker process per account. The pool spawns workers on demand, routes
JSON-RPC requests to the right worker via its stdin pipe, and reads back
responses + spontaneous events via its stdout pipe.

Thread/task model:
- For each spawned worker, one background task reads stdout line-by-line.
  Responses are matched to pending futures by request id. Events are
  pushed to all subscribed asyncio Queues (the WS hub subscribes to one).
- Requests are written to stdin from the calling task; stdin writes are
  serialized via an asyncio.Lock per worker.
- A monitor task waits for the worker process to exit and cleans up.

The pool is owned by the FastAPI app and shut down with the app lifecycle.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

from app.workers import protocol as p

logger = logging.getLogger(__name__)


_DEFAULT_CALL_TIMEOUT_SECONDS = 10.0
_GRACEFUL_KILL_TIMEOUT = 3.0


class WorkerError(Exception):
    """RPC call returned an error response."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class WorkerNotRunning(Exception):
    """Tried to call a worker that hasn't been spawned (or has died)."""


@dataclass
class _WorkerHandle:
    account_db_id: int
    process: asyncio.subprocess.Process
    stdin_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    pending: dict[str, asyncio.Future] = field(default_factory=dict)
    reader_task: Optional[asyncio.Task] = None
    monitor_task: Optional[asyncio.Task] = None


class WorkerPool:
    def __init__(self, *, worker_module: str = "app.workers.mt5_worker") -> None:
        self._workers: dict[int, _WorkerHandle] = {}
        self._subscribers: list[asyncio.Queue[tuple[int, dict]]] = []
        self._subscribers_lock = asyncio.Lock()
        self._worker_module = worker_module
        self._python_exe = sys.executable
        self._spawn_locks: dict[int, asyncio.Lock] = {}

    def _spawn_args(self, account_db_id: int) -> list[str]:
        """Return argv for spawning a worker process.

        Frozen build: re-invoke the bundled exe with `--worker <id>` so it
        re-enters the worker dispatch path in run.py.
        Dev: `python -m app.workers.mt5_worker <id>`.
        """
        if getattr(sys, "frozen", False):
            return [self._python_exe, "--worker", str(account_db_id)]
        return [self._python_exe, "-m", self._worker_module, str(account_db_id)]

    # ── Public API ───────────────────────────────────────────────────────────
    async def spawn(self, account_db_id: int) -> None:
        """Spawn a worker for the given account. Idempotent — no-op if alive."""
        # Per-account lock so concurrent spawn() calls don't race.
        lock = self._spawn_locks.setdefault(account_db_id, asyncio.Lock())
        async with lock:
            if account_db_id in self._workers:
                existing = self._workers[account_db_id]
                if existing.process.returncode is None:
                    return
                # Dead worker still in dict — clean up before respawn.
                self._workers.pop(account_db_id, None)

            argv = self._spawn_args(account_db_id)
            logger.info("Spawning worker for account_db_id=%d: %s", account_db_id, argv)
            proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            handle = _WorkerHandle(account_db_id=account_db_id, process=proc)
            self._workers[account_db_id] = handle
            handle.reader_task = asyncio.create_task(
                self._read_stdout(handle), name=f"worker-{account_db_id}-reader",
            )
            handle.monitor_task = asyncio.create_task(
                self._monitor_exit(handle), name=f"worker-{account_db_id}-monitor",
            )
            # Also drain stderr (worker logs) so the pipe doesn't fill.
            asyncio.create_task(
                self._drain_stderr(handle), name=f"worker-{account_db_id}-stderr",
            )

    async def kill(self, account_db_id: int, *, graceful: bool = True) -> None:
        """Terminate the worker. Graceful first; SIGKILL fallback after timeout."""
        handle = self._workers.get(account_db_id)
        if handle is None:
            return
        proc = handle.process
        if proc.returncode is not None:
            self._workers.pop(account_db_id, None)
            return

        if graceful:
            try:
                # Ask worker to shut down via RPC; ignore if it can't respond.
                await asyncio.wait_for(
                    self.call(account_db_id, "shutdown", timeout=2.0), timeout=2.0,
                )
            except (WorkerError, WorkerNotRunning, asyncio.TimeoutError):
                pass

        try:
            await asyncio.wait_for(proc.wait(), timeout=_GRACEFUL_KILL_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning("Worker %d did not exit gracefully, terminating", account_db_id)
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                logger.warning("Worker %d did not respond to terminate(), killing", account_db_id)
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
                await proc.wait()
        self._workers.pop(account_db_id, None)

    async def call(
        self,
        account_db_id: int,
        method: str,
        params: Optional[dict] = None,
        *,
        timeout: float = _DEFAULT_CALL_TIMEOUT_SECONDS,
    ) -> object:
        """Send an RPC request and await its response. Raises WorkerError on RPC error."""
        handle = self._workers.get(account_db_id)
        if handle is None or handle.process.returncode is not None:
            raise WorkerNotRunning(f"worker not running for account_db_id={account_db_id}")

        req_id = uuid.uuid4().hex
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        handle.pending[req_id] = future
        line = p.encode_request(req_id, method, params).encode()

        try:
            async with handle.stdin_lock:
                if handle.process.stdin is None or handle.process.stdin.is_closing():
                    raise WorkerNotRunning("worker stdin closed")
                handle.process.stdin.write(line)
                await handle.process.stdin.drain()
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            handle.pending.pop(req_id, None)

    def active_account_ids(self) -> set[int]:
        return {
            aid
            for aid, h in self._workers.items()
            if h.process.returncode is None
        }

    def is_active(self, account_db_id: int) -> bool:
        h = self._workers.get(account_db_id)
        return h is not None and h.process.returncode is None

    async def subscribe(self) -> asyncio.Queue[tuple[int, dict]]:
        """Return a fresh queue that will receive (account_db_id, event_dict) tuples."""
        q: asyncio.Queue[tuple[int, dict]] = asyncio.Queue(maxsize=1024)
        async with self._subscribers_lock:
            self._subscribers.append(q)
        return q

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        async with self._subscribers_lock:
            try:
                self._subscribers.remove(queue)
            except ValueError:
                pass

    async def shutdown_all(self) -> None:
        ids = list(self._workers.keys())
        await asyncio.gather(*(self.kill(aid) for aid in ids), return_exceptions=True)

    # ── Internals ────────────────────────────────────────────────────────────
    async def _read_stdout(self, handle: _WorkerHandle) -> None:
        proc = handle.process
        assert proc.stdout is not None
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            try:
                obj = p.decode_worker_line(line)
            except Exception as e:
                logger.warning(
                    "worker %d sent malformed line: %s (line=%r)",
                    handle.account_db_id, e, line[:200],
                )
                continue

            if p.is_response(obj):
                req_id = str(obj.get("id"))
                fut = handle.pending.get(req_id)
                if fut is None or fut.done():
                    continue
                if "error" in obj:
                    err = obj["error"]
                    fut.set_exception(
                        WorkerError(err.get("code", "?"), err.get("message", ""))
                    )
                else:
                    fut.set_result(obj.get("result"))
            elif p.is_event(obj):
                event_payload = {"event": obj["event"], "data": obj.get("data", {})}
                await self._fanout_event(handle.account_db_id, event_payload)
            else:
                logger.warning("worker %d sent unknown frame: %r", handle.account_db_id, obj)

    async def _drain_stderr(self, handle: _WorkerHandle) -> None:
        proc = handle.process
        if proc.stderr is None:
            return
        while True:
            raw = await proc.stderr.readline()
            if not raw:
                break
            line = raw.decode(errors="replace").rstrip()
            if line:
                logger.info("[worker:%d] %s", handle.account_db_id, line)

    async def _monitor_exit(self, handle: _WorkerHandle) -> None:
        rc = await handle.process.wait()
        logger.info("worker %d exited with returncode=%s", handle.account_db_id, rc)
        # Fail any still-pending requests so callers don't hang.
        for fut in list(handle.pending.values()):
            if not fut.done():
                fut.set_exception(WorkerNotRunning(f"worker exited rc={rc}"))
        handle.pending.clear()
        # Emit an event so subscribers know.
        await self._fanout_event(
            handle.account_db_id,
            {"event": "health", "data": {"state": "exited", "returncode": rc}},
        )

    async def _fanout_event(self, account_db_id: int, event: dict) -> None:
        async with self._subscribers_lock:
            queues = list(self._subscribers)
        msg = (account_db_id, event)
        for q in queues:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                logger.warning("subscriber queue full, dropping event for account_db_id=%d", account_db_id)


# ── Module-level instance owned by FastAPI app ────────────────────────────────
pool = WorkerPool()
