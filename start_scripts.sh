#!/bin/bash
# start_scripts.sh - Quick start script for Linux

# Always work from the folder this script lives in, wherever it was run from
cd "$(dirname "$(readlink -f "$0")")"

echo "Starting Network Topology Mapper..."

# Check if virtual environment exists
if [ ! -f "venv/bin/activate" ]; then
    echo "Virtual environment not found. Running setup..."
    exec bash ./linux_setup.sh
fi

# Activate virtual environment
source venv/bin/activate

# Check if network_mapper_main.py exists
if [ ! -f "network_mapper_main.py" ]; then
    echo "Error: network_mapper_main.py not found"
    exit 1
fi

# Start application
echo "Access the application at: http://localhost:5000"
echo "Press Ctrl+C to stop"
echo ""
exec python network_mapper_main.py
