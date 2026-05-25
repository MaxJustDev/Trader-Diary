@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo   TraderDiary - 1-click portable build
echo ============================================
echo.

set "ROOT=%~dp0"
pushd "%ROOT%"

:: ── Sanity checks ─────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found on PATH. Install Node 18+ first.
    pause & exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found on PATH. Install Python 3.10+ first.
    pause & exit /b 1
)

:: ── Step 1: Frontend dependencies + static export ─────────
echo [1/4] Building frontend static export...
cd /d "%ROOT%frontend"

if not exist node_modules (
    echo       Installing npm packages (first run only, ~1 min)...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        popd & pause & exit /b 1
    )
)

call npm run build
if errorlevel 1 (
    echo ERROR: npm run build failed.
    popd & pause & exit /b 1
)
if not exist out (
    echo ERROR: frontend\out\ not generated. Check next.config for output:'export'.
    popd & pause & exit /b 1
)
echo       Frontend export: frontend\out\
echo.

:: ── Step 2: Backend venv + dependencies ───────────────────
echo [2/4] Preparing backend venv...
cd /d "%ROOT%backend"

if not exist venv (
    echo       Creating venv (first run only)...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: venv creation failed.
        popd & pause & exit /b 1
    )
)

call venv\Scripts\activate.bat

python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo ERROR: pip install requirements failed.
    popd & pause & exit /b 1
)

pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo       Installing PyInstaller...
    pip install pyinstaller --quiet
)
echo       Backend env ready.
echo.

:: ── Step 3: Clean previous build artifacts ────────────────
echo [3/4] Cleaning previous build...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo.

:: ── Step 4: PyInstaller bundle ────────────────────────────
echo [4/4] Packaging single-file exe (this takes 1-3 minutes)...
pyinstaller TraderDiary.spec --noconfirm --clean
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    popd & pause & exit /b 1
)

if not exist "dist\TraderDiary.exe" (
    echo ERROR: dist\TraderDiary.exe not produced. Check PyInstaller output.
    popd & pause & exit /b 1
)

echo.
echo ============================================
echo   BUILD COMPLETE
echo ============================================
echo   Output: backend\dist\TraderDiary.exe
echo.
echo   Distribute:
echo     1. Copy TraderDiary.exe anywhere on a Windows machine
echo     2. Double-click - browser opens at http://localhost:8001
echo     3. On first run it creates .env + traderdiary.db next to the exe
echo.
echo   Test now:
echo     cd backend\dist
echo     TraderDiary.exe
echo ============================================
popd
pause
