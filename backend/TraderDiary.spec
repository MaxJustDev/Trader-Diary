# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for TraderDiary
# Build: cd backend && pyinstaller TraderDiary.spec

import os

block_cipher = None

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=[
        # Bundle the Next.js static export as "frontend/"
        (os.path.join("..", "frontend", "out"), "frontend"),
    ],
    hiddenimports=[
        # uvicorn internals
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
        # MetaTrader5
        "MetaTrader5",
        # websockets
        "websockets",
        "websockets.legacy",
        "websockets.legacy.server",
        # standard lib sometimes missed
        "multiprocessing",
        "email.mime.text",
        # dotenv
        "dotenv",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="TraderDiary",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Keep console window for logs
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="TraderDiary",
)
