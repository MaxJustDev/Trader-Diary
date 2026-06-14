# TraderDiary entrypoint.
#
# Two modes:
#   1. Default: boot uvicorn HTTP/WS server on port 8001.
#   2. --worker <account_db_id>: dispatch to MT5 worker process (Batch F).
#      Required so PyInstaller-frozen builds can spawn worker subprocesses
#      using their own bundled exe (sys.executable) without needing python.
import asyncio
import os
import sys

# On Windows, ProactorEventLoop is required for asyncio subprocess transports
# (used by the multi-process MT5 worker pool). Selector loop raises
# NotImplementedError on create_subprocess_exec.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def get_base_dir():
    """Return directory next to the exe (frozen) or CWD (dev)."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.abspath(".")


def _dispatch_worker_if_requested() -> bool:
    """If invoked with `--worker <account_db_id>`, run the MT5 worker and exit.

    Returns True if the worker was dispatched (caller should not boot HTTP).
    """
    if len(sys.argv) < 2 or sys.argv[1] != "--worker":
        return False
    if len(sys.argv) < 3:
        print("usage: TraderDiary.exe --worker <account_db_id>", file=sys.stderr)
        sys.exit(2)

    # Load .env before importing worker (it needs ENCRYPTION_KEY).
    base_dir = get_base_dir()
    env_path = os.path.join(base_dir, ".env")
    if os.path.isfile(env_path):
        from dotenv import load_dotenv
        load_dotenv(env_path)
    os.chdir(base_dir)

    # Reshape argv so the worker's argparse sees [program, account_db_id].
    sys.argv = [sys.argv[0], sys.argv[2]]
    from app.workers.mt5_worker import main as worker_main
    sys.exit(worker_main())


if __name__ == "__main__":
    # Worker mode short-circuits everything else.
    if _dispatch_worker_if_requested():
        sys.exit(0)

    base_dir = get_base_dir()
    is_frozen = getattr(sys, "frozen", False)

    # Auto-generate .env with random Fernet key on first run
    env_path = os.path.join(base_dir, ".env")
    if not os.path.exists(env_path):
        from cryptography.fernet import Fernet

        key = Fernet.generate_key().decode()
        with open(env_path, "w") as f:
            f.write(f"ENCRYPTION_KEY={key}\n")
        print(f"Generated new .env at {env_path}")

    # Ensure CWD is base_dir so load_dotenv() and relative paths work
    os.chdir(base_dir)

    import uvicorn

    if is_frozen:
        # Auto-open browser after a short delay
        import threading
        import webbrowser

        threading.Timer(
            1.5, lambda: webbrowser.open("http://localhost:8001")
        ).start()

        # Import app object directly (reload not supported in frozen mode)
        from app.main import app

        uvicorn.run(app, host="127.0.0.1", port=8001)
    else:
        # Dev mode. Reload disabled because uvicorn's reload worker child
        # creates the asyncio event loop before app.main runs, defeating the
        # Windows ProactorEventLoop policy needed for subprocess workers.
        # Restart the server manually after backend code changes.
        from app.main import app

        uvicorn.run(app, host="0.0.0.0", port=8001)
