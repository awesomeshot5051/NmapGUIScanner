@echo off
REM ============================================
REM Network Topology Mapper - Windows Setup
REM ============================================

echo.
echo ============================================
echo Network Topology Mapper - Windows Setup
echo ============================================
echo.

REM Step 1: Check Python
echo [1/6] Checking Python installation...
python --version >nul 2>&1
if ERRORLEVEL 1 (
    echo [ERROR] Python not found in PATH
    echo Please install Python 3.7+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYVER=%%i
echo [OK] Python %PYVER% found
echo.

REM Step 2: Check Nmap (optional)
echo [2/6] Checking Nmap installation...
nmap --version >nul 2>&1
if ERRORLEVEL 1 (
    echo [WARNING] Nmap not found - you can still upload XML files
    echo Install from: https://nmap.org/download.html
) else (
    for /f "tokens=3" %%n in ('nmap --version ^| findstr /i "version"') do (
        echo [OK] Nmap %%n found
    )
)
echo.

REM Step 3: Create virtual environment
echo [3/6] Creating virtual environment...
if exist venv (
    echo [INFO] Virtual environment already exists, skipping creation
) else (
    python -m venv venv
    if ERRORLEVEL 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created successfully
)
echo.

REM Step 4: Activate virtual environment
echo [4/6] Activating virtual environment...
if not exist venv\Scripts\activate.bat (
    echo [ERROR] Virtual environment activation script not found
    pause
    exit /b 1
)
call venv\Scripts\activate.bat
echo [OK] Virtual environment activated
echo.

REM Step 5: Install dependencies
echo [5/6] Installing Python packages...
echo This may take a minute...
python -m pip install --upgrade pip --quiet
python -m pip install flask flask-cors networkx pyvis --quiet
if ERRORLEVEL 1 (
    echo [ERROR] Failed to install packages
    echo Trying again with verbose output...
    python -m pip install flask flask-cors networkx pyvis
    pause
    exit /b 1
)
echo [OK] All packages installed successfully
echo.

REM Step 6: Create templates folder
echo [6/6] Setting up folders...
if not exist templates (
    mkdir templates
    echo [OK] Created templates folder
) else (
    echo [INFO] Templates folder already exists
)
echo.

REM Check for required files
echo Checking for required files...
set ERRORS=0

if exist app.py (
    echo [OK] Found app.py
    set MAINFILE=app.py
) else if exist network_mapper_main.py (
    echo [OK] Found network_mapper_main.py
    set MAINFILE=network_mapper_main.py
) else (
    echo [ERROR] Main application file not found!
    echo Please ensure app.py or network_mapper_main.py exists
    set ERRORS=1
)

if exist templates\index.html (
    echo [OK] Found templates\index.html
) else (
    echo [WARNING] templates\index.html not found
    echo The web interface won't work without this file
    set ERRORS=1
)
echo.

if %ERRORS% EQU 1 (
    echo ============================================
    echo Setup completed with warnings/errors
    echo Please fix the issues above before running
    echo ============================================
    pause
    exit /b 1
)

echo ============================================
echo Setup Complete!
echo ============================================
echo.
echo Your environment is ready. To start the app:
echo   1. Run: START_APP.bat
echo   2. Or manually run: python %MAINFILE%
echo   3. Then open: http://localhost:5000
echo.

set /p STARTNOW="Start the application now? (Y/N): "
if /i "%STARTNOW%"=="Y" (
    echo.
    echo Starting Network Topology Mapper...
    echo Press Ctrl+C to stop
    echo.
    echo Open your browser to: http://localhost:5000
    echo.
    python %MAINFILE%
) else (
    echo.
    echo Run START_APP.bat when you're ready
    pause
)