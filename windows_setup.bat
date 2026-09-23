@echo off
REM ============================================
REM Network Topology Mapper - Windows Setup
REM ============================================
REM Usage: windows_setup.bat [/nostart]
REM   /nostart   set everything up but don't offer to start the app
REM              (used by startup.py, which starts the app itself)

REM Always work from the folder this script lives in. This matters when it is
REM run as administrator, which starts in C:\Windows\System32 by default.
cd /d "%~dp0"

set NOSTART=0
if /i "%~1"=="/nostart" set NOSTART=1

echo.
echo ============================================
echo Network Topology Mapper - Windows Setup
echo ============================================
echo.

REM Step 1: Check Python (3.11 or newer, needed by the packages in requirements.txt)
echo [1/6] Checking Python installation...
python --version >nul 2>&1
if ERRORLEVEL 1 (
    echo [ERROR] Python not found in PATH
    echo Please install Python 3.11+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1
if ERRORLEVEL 1 (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do echo [ERROR] Python %%i found, but 3.11 or newer is required
    echo Please install Python 3.11+ from https://www.python.org/downloads/
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
    echo The venv folder may have been created on another system or interrupted.
    echo Delete the venv folder and run this script again.
    pause
    exit /b 1
)
call venv\Scripts\activate.bat
echo [OK] Virtual environment activated
echo.

REM Step 5: Install dependencies
echo [5/6] Installing Python packages...
if not exist requirements.txt (
    echo [ERROR] requirements.txt not found
    pause
    exit /b 1
)
echo This may take a minute...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet
if ERRORLEVEL 1 (
    echo [ERROR] Failed to install packages
    echo Trying again with verbose output...
    python -m pip install -r requirements.txt
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

if exist network_mapper_main.py (
    echo [OK] Found network_mapper_main.py
) else (
    echo [ERROR] network_mapper_main.py not found!
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

if "%NOSTART%"=="1" exit /b 0

echo Your environment is ready. To start the app:
echo   1. Run: start_app.bat
echo   2. Or manually run: python network_mapper_main.py
echo   3. For admin rights, needed for OS detection and SYN scans, run: python startup.py
echo   4. Then open: http://localhost:5000
echo.

set /p STARTNOW="Start the application now? (Y/N): "
if /i "%STARTNOW%"=="Y" (
    echo.
    echo Starting Network Topology Mapper...
    echo Press Ctrl+C to stop
    echo.
    echo Open your browser to: http://localhost:5000
    echo.
    python network_mapper_main.py
    pause
) else (
    echo.
    echo Run start_app.bat when you're ready
    pause
)
