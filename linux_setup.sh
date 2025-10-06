#!/bin/bash

# Network Topology Mapper - Linux Setup Script
# This script sets up the environment and launches the application

set -e

echo "=========================================="
echo "Network Topology Mapper - Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root (needed for some nmap features)
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}Warning: Running as root. Some features may work better, but be cautious.${NC}"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Python installation
echo "Checking Python installation..."
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}✓ Python 3 found: $PYTHON_VERSION${NC}"
    PYTHON_CMD="python3"
elif command_exists python; then
    PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
    if [[ $PYTHON_VERSION == 3* ]]; then
        echo -e "${GREEN}✓ Python 3 found: $PYTHON_VERSION${NC}"
        PYTHON_CMD="python"
    else
        echo -e "${RED}✗ Python 3 is required but not found${NC}"
        echo "Please install Python 3.7 or higher"
        exit 1
    fi
else
    echo -e "${RED}✗ Python is not installed${NC}"
    echo "Please install Python 3.7 or higher:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "  Fedora/RHEL:   sudo dnf install python3 python3-pip"
    echo "  Arch:          sudo pacman -S python python-pip"
    exit 1
fi

# Check pip installation
echo "Checking pip installation..."
if command_exists pip3; then
    echo -e "${GREEN}✓ pip3 found${NC}"
    PIP_CMD="pip3"
elif command_exists pip; then
    echo -e "${GREEN}✓ pip found${NC}"
    PIP_CMD="pip"
else
    echo -e "${YELLOW}! pip not found, attempting to install...${NC}"
    $PYTHON_CMD -m ensurepip --default-pip
    PIP_CMD="$PYTHON_CMD -m pip"
fi

# Check Nmap installation
echo "Checking Nmap installation..."
if command_exists nmap; then
    NMAP_VERSION=$(nmap --version | head -n1 | awk '{print $3}')
    echo -e "${GREEN}✓ Nmap found: $NMAP_VERSION${NC}"
else
    echo -e "${YELLOW}! Nmap not found${NC}"
    echo "Nmap is required for live scanning. Install it with:"
    echo "  Ubuntu/Debian: sudo apt install nmap"
    echo "  Fedora/RHEL:   sudo dnf install nmap"
    echo "  Arch:          sudo pacman -S nmap"
    echo ""
    read -p "Continue without Nmap? (You can still upload existing scans) [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
$PIP_CMD install --upgrade pip >/dev/null 2>&1

# Install required packages
echo "Installing Python dependencies..."
$PIP_CMD install -q flask flask-cors networkx pyvis 2>&1 | grep -v "already satisfied" || true
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create templates directory if it doesn't exist
mkdir -p templates

# Check if index.html exists
if [ ! -f "templates/index.html" ]; then
    echo -e "${YELLOW}! Warning: templates/index.html not found${NC}"
    echo "Please ensure the HTML template is in the templates/ directory"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo "  1. Run this script: ./setup.sh"
echo "  2. Open your browser to: http://localhost:5000"
echo ""

# Ask if user wants to start the application
read -p "Start the application now? [Y/n]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "To start later, run: ./start.sh"
    exit 0
fi

# Start the application
echo ""
echo "Starting Network Topology Mapper..."
echo "Press Ctrl+C to stop"
echo ""

# Check if main script exists
if [ ! -f "app.py" ]; then
    echo -e "${RED}✗ app.py not found${NC}"
    echo "Please ensure app.py is in the current directory"
    exit 1
fi

$PYTHON_CMD app.py
