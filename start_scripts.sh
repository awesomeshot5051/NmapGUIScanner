#!/bin/bash
<<<<<<< HEAD
# start.sh - Quick start script for Linux
=======
# start_scripts.sh - Quick start script for Linux
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)

echo "Starting Network Topology Mapper..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
<<<<<<< HEAD
    ./setup.sh
=======
    ./linux_setup.sh
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
    exit 0
fi

# Activate virtual environment
source venv/bin/activate

<<<<<<< HEAD
# Check if app.py exists
if [ ! -f "app.py" ]; then
    echo "Error: app.py not found"
=======
# Check if network_mapper_main.py exists
if [ ! -f "network_mapper_main.py" ]; then
    echo "Error: network_mapper_main.py not found"
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
    exit 1
fi

# Start application
echo "Access the application at: http://localhost:5000"
echo "Press Ctrl+C to stop"
echo ""
<<<<<<< HEAD
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
=======
python network_mapper_main.py
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
