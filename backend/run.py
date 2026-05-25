# TraderDiary - Run Backend
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


if __name__ == "__main__":
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
