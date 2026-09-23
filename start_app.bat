@echo off
REM start_app.bat - Quick start script for Windows

REM Always work from the folder this script lives in
cd /d "%~dp0"

echo Starting Network Topology Mapper...

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo Virtual environment not found. Running setup...
    call windows_setup.bat
    exit /b 0
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if network_mapper_main.py exists
if not exist "network_mapper_main.py" (
    echo Error: network_mapper_main.py not found
    pause
    exit /b 1
)

REM Start application
echo Access the application at: http://localhost:5000
echo Press Ctrl+C to stop
echo.
python network_mapper_main.py
pause
