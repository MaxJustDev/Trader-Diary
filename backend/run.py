# TraderDiary - Run Backend
import os
import sys


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
        # Dev mode: string import enables auto-reload
        uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
