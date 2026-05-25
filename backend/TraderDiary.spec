# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for TraderDiary — single-file Windows portable build.
# Build via the root-level `build.bat` (preferred) or:
#   cd backend && pyinstaller TraderDiary.spec --noconfirm

import os

block_cipher = None

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=[
        # Next.js static export served by FastAPI under /
        (os.path.join("..", "frontend", "out"), "frontend"),
        # Fund template JSON loaded at runtime by services.fund_templates
        (os.path.join("app", "data", "fund_templates.json"), os.path.join("app", "data")),
    ],
    hiddenimports=[
        # uvicorn internals — picked up dynamically
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # pydantic v2
        "pydantic_core",
        "pydantic.deprecated.decorator",
        # sqlalchemy
        "sqlalchemy.dialects.sqlite",
        # cryptography
        "cryptography.fernet",
        "cryptography.hazmat.primitives.kdf.pbkdf2",
        # MetaTrader5 (the C-binding worker uses)
        "MetaTrader5",
        # psutil for terminal auto-launch
        "psutil",
        # websockets
        "websockets",
        "websockets.legacy",
        "websockets.legacy.server",
        # python-multipart for FastAPI UploadFile (system backup/restore route)
        "python_multipart",
        "multipart",
        # standard lib sometimes missed
        "multiprocessing",
        "email.mime.text",
        # dotenv
        "dotenv",
        # httpx for ForexFactory news calendar
        "httpx",
        # ── App-level imports that must be discoverable from worker dispatch ──
        "app.workers.mt5_worker",
        "app.workers.mt5_health",
        "app.workers.protocol",
        "app.services.worker_pool",
        "app.services.symbol_resolver",
        "app.services.fund_templates",
        "app.services.mt5_singleton",
        "app.services.mt5_streaming",
        "app.services.mt5_auth",
        "app.services.settings",
        "app.routes.mt5_v2",
        "app.routes.trading_v2",
        "app.routes.settings",
        "app.routes.news",
        "app.routes.system",
        "app.utils.async_helpers",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Don't bundle test infrastructure — saves ~30MB
        "pytest", "pytest_asyncio", "_pytest", "iniconfig", "pluggy",
        # IPython is sometimes pulled in transitively by jupyter-style libs
        "IPython", "ipykernel",
    ],
    noarchive=False,
    optimize=0,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# --onefile build: single self-extracting TraderDiary.exe.
# Workers spawn by re-invoking sys.executable with --worker <id>, which the
# bootloader detects and dispatches in run.py before booting uvicorn.
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="TraderDiary",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[
        # UPX can corrupt these on Windows — exclude to be safe
        "MetaTrader5.pyd",
        "_psutil_windows.pyd",
        "vcruntime140.dll",
        "python3.dll",
    ],
    runtime_tmpdir=None,
    console=True,  # console window shows backend log output (errors etc.)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
