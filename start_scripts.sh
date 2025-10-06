#!/bin/bash
# start.sh - Quick start script for Linux

echo "Starting Network Topology Mapper..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
    ./setup.sh
    exit 0
fi

# Activate virtual environment
source venv/bin/activate

# Check if app.py exists
if [ ! -f "app.py" ]; then
    echo "Error: app.py not found"
    exit 1
fi

# Start application
echo "Access the application at: http://localhost:5000"
echo "Press Ctrl+C to stop"
echo ""
python app.py

# ============================================
# Windows version (start.bat)
# Save the content below as start.bat
# ============================================

@echo off
REM start.bat - Quick start script for Windows

echo Starting Network Topology Mapper...

REM Check if virtual environment exists
if not exist "venv" (
    echo Virtual environment not found. Running setup...
    call setup.bat
    exit /b 0
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if app.py exists
if not exist "app.py" (
    echo Error: app.py not found
    pause
    exit /b 1
)

REM Start application
echo Access the application at: http://localhost:5000
echo Press Ctrl+C to stop
echo.
python app.py
