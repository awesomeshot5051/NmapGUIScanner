#!/bin/bash

# Network Topology Mapper - Linux Setup Script
# This script sets up the environment and launches the application
#
# Usage: ./linux_setup.sh [--no-start]
#   --no-start   set everything up but don't offer to start the app
#                (used by startup.py, which starts the app itself)

set -e

# Always work from the folder this script lives in, wherever it was run from
cd "$(dirname "$(readlink -f "$0")")"

NO_START=0
for arg in "$@"; do
    case "$arg" in
        --no-start) NO_START=1 ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--no-start]"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "Network Topology Mapper - Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# The dependencies in requirements.txt (networkx 3.6+) need Python 3.11 or newer
MIN_MAJOR=3
MIN_MINOR=11

# Check if running as root (needed for some nmap features)
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. Some features may work better, but be cautious.${NC}"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check that a python command is new enough
python_ok() {
    "$1" -c "import sys; sys.exit(0 if sys.version_info >= ($MIN_MAJOR, $MIN_MINOR) else 1)" >/dev/null 2>&1
}

# Check Python installation. Plain "python3" is tried first, then specific
# versions, so a newer Python installed next to an old system one is found too.
echo "Checking Python installation..."
PYTHON_CMD=""
for candidate in python3 python3.14 python3.13 python3.12 python3.11 python; do
    if command_exists "$candidate" && python_ok "$candidate"; then
        PYTHON_CMD="$candidate"
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    if command_exists python3; then
        OLD_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        echo -e "${RED}✗ Python $OLD_VERSION found, but Python $MIN_MAJOR.$MIN_MINOR or higher is required${NC}"
    else
        echo -e "${RED}✗ Python is not installed${NC}"
    fi
    echo "Please install Python $MIN_MAJOR.$MIN_MINOR or higher:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "  Fedora/RHEL:   sudo dnf install python3 python3-pip"
    echo "  Arch:          sudo pacman -S python python-pip"
    echo "  Older distros: install a newer Python alongside the system one (for example with pyenv)"
    exit 1
fi
PYTHON_VERSION=$("$PYTHON_CMD" -c "import platform; print(platform.python_version())")
echo -e "${GREEN}✓ Python found: $PYTHON_VERSION ($PYTHON_CMD)${NC}"

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
    read -p "Continue without Nmap? (You can still upload existing scans) [y/N]: " -n 1 -r || REPLY=""
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create virtual environment if it doesn't exist
# (pip comes with the virtual environment, so no system-wide pip is needed)
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    if ! "$PYTHON_CMD" -m venv venv; then
        rm -rf venv
        echo -e "${RED}✗ Could not create the virtual environment${NC}"
        echo "On Ubuntu/Debian this usually means the venv package is missing:"
        echo "  sudo apt install python3-venv"
        exit 1
    fi
    echo -e "${GREEN}✓ Virtual environment created${NC}"
elif [ ! -f "venv/bin/activate" ]; then
    echo -e "${RED}✗ A 'venv' folder exists but isn't a Linux virtual environment${NC}"
    echo "(It may have been created on Windows, or the setup was interrupted.)"
    echo "Delete it and run this script again:  rm -rf venv"
    exit 1
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip (not essential, so a failure here doesn't stop the setup)
echo "Upgrading pip..."
python -m pip install --upgrade pip >/dev/null 2>&1 || \
    echo -e "${YELLOW}! Could not upgrade pip, continuing with the version already installed${NC}"

# Install required packages
echo "Installing Python dependencies..."
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}✗ requirements.txt not found${NC}"
    echo "Please ensure requirements.txt is in the current directory"
    exit 1
fi
if python -m pip install -q -r requirements.txt; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    echo "Check the error above and your internet connection."
    echo "If it mentions your Python version, delete the venv folder (rm -rf venv) and run this script again."
    exit 1
fi

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

if [ "$NO_START" -eq 1 ]; then
    exit 0
fi

echo "To start the application later:"
echo "  ./start_scripts.sh     (normal)"
echo "  python startup.py      (asks for root, needed for OS detection and SYN scans)"
echo "Then open your browser to: http://localhost:5000"
echo ""

# Ask if user wants to start the application
if ! read -p "Start the application now? [Y/n]: " -n 1 -r; then
    # No input available (not run from a terminal), so don't start a server
    echo
    echo "To start later, run: ./start_scripts.sh"
    exit 0
fi
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "To start later, run: ./start_scripts.sh"
    exit 0
fi

# Start the application
echo ""
echo "Starting Network Topology Mapper..."
echo "Press Ctrl+C to stop"
echo ""

# Check if main script exists
if [ ! -f "network_mapper_main.py" ]; then
    echo -e "${RED}✗ network_mapper_main.py not found${NC}"
    echo "Please ensure network_mapper_main.py is in the current directory"
    exit 1
fi

python network_mapper_main.py
