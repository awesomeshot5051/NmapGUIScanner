#!/bin/bash
# start_scripts.sh - Quick start script for Linux

echo "Starting Network Topology Mapper..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
    ./linux_setup.sh
    exit 0
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
python network_mapper_main.py
