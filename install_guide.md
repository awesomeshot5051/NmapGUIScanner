# Installation Guide - Network Topology Mapper

This guide provides detailed step-by-step instructions for installing and running the Network Topology Mapper on Linux and Windows.

## Table of Contents

1. [File Structure](#file-structure)
2. [Linux Installation](#linux-installation)
3. [Windows Installation](#windows-installation)
4. [First Run](#first-run)
5. [Verification](#verification)
6. [Common Issues](#common-issues)

---

## File Structure

After downloading/extracting, your directory should contain:

```
network-topology-mapper/
├── network_mapper_main.py    # Main application (REQUIRED)
├── requirements.txt          # Python dependencies (REQUIRED)
├── linux_setup.sh            # Linux setup script (REQUIRED for Linux)
├── windows_setup.bat         # Windows setup script (REQUIRED for Windows)
├── startup.py                # Launcher that asks for admin rights (OPTIONAL)
├── start_scripts.sh          # Linux quick-start (OPTIONAL)
├── start_app.bat             # Windows quick-start (OPTIONAL)
├── README.md                 # Overview (OPTIONAL)
├── wedid.md                  # Detailed feature walkthrough (OPTIONAL)
├── install_guide.md          # This file (OPTIONAL)
├── templates/
│   └── index.html            # Web interface (REQUIRED)
└── static/
    ├── Script.js             # Map drawing and scan controls (REQUIRED)
    └── Style.css             # Styling (REQUIRED)
```

**CRITICAL FILES** (must be present):
- `network_mapper_main.py`
- `templates/index.html`
- `static/Script.js` and `static/Style.css`
- `requirements.txt`
- `linux_setup.sh` (Linux) or `windows_setup.bat` (Windows)

---

## Linux Installation

### Step 1: Install Prerequisites

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nmap
```

#### Fedora/RHEL/CentOS
```bash
sudo dnf install -y python3 python3-pip nmap
```

#### Arch Linux
```bash
sudo pacman -S python python-pip nmap
```

#### Verify Installation
```bash
python3 --version    # Should show Python 3.11 or higher
pip3 --version       # Should show pip version
nmap --version       # Should show Nmap version
```

Some older distributions ship an older Python (Ubuntu 22.04 has 3.10, for example). If `python3 --version` shows something below 3.11, install a newer Python alongside it, for instance with [pyenv](https://github.com/pyenv/pyenv) or a build from [python.org](https://www.python.org/downloads/), and use that to run the setup.

### Step 2: Download and Extract

```bash
# If using git
git clone <repository-url> network-topology-mapper
cd network-topology-mapper

# If using downloaded archive
unzip network-topology-mapper.zip
cd network-topology-mapper
```

### Step 3: Make Scripts Executable

```bash
chmod +x linux_setup.sh
chmod +x start_scripts.sh  # if present
```

### Step 4: Run Setup

```bash
./linux_setup.sh
```

**What this script does:**
1. Checks that Python 3.11 or newer is installed
2. Checks Nmap installation (warns if missing)
3. Creates Python virtual environment
4. Installs required packages (Flask, NetworkX, PyVis, etc.)
5. Verifies templates directory exists
6. Offers to start the application

### Step 5: Start the Application

If you didn't start it during setup:

```bash
# Using start script (recommended)
./start_scripts.sh

# Or manually
source venv/bin/activate
python network_mapper_main.py
```

For OS detection and SYN scans you need root. `python startup.py` handles that by re-running itself with `sudo`.

---

## Windows Installation

### Step 1: Install Python

1. Download Python 3.11 or newer from [python.org](https://www.python.org/downloads/)
2. Run the installer
3. **IMPORTANT**: Tick "Add Python to PATH"
4. Click "Install Now"

#### Verify Installation
Open Command Prompt and run:
```batch
python --version
pip --version
```

Should show Python and pip versions.

### Step 2: Install Nmap

1. Download Nmap from [nmap.org/download.html](https://nmap.org/download.html)
2. Download "Latest stable release self-installer"
3. Run the installer (nmap-X.XX-setup.exe)
4. Accept defaults and complete installation

#### Verify Installation
Open Command Prompt and run:
```batch
nmap --version
```

Should show Nmap version. If not found:
1. Search Windows for "Environment Variables"
2. Click "Edit system environment variables"
3. Click "Environment Variables"
4. Under "System variables", find "Path"
5. Click "Edit"
6. Add: `C:\Program Files (x86)\Nmap`
7. Click OK, restart Command Prompt

### Step 3: Download and Extract

1. Download the project archive
2. Extract to a folder (e.g., `C:\network-topology-mapper`)
3. Open Command Prompt
4. Navigate to the folder:
```batch
cd C:\network-topology-mapper
```

### Step 4: Run Setup

```batch
windows_setup.bat
```

**What this script does:**
1. Checks that Python 3.11 or newer is installed
2. Checks Nmap installation (warns if missing)
3. Creates Python virtual environment
4. Installs required packages
5. Verifies templates directory exists
6. Offers to start the application

### Step 5: Start the Application

If you didn't start it during setup:

```batch
REM Using start script (recommended)
start_app.bat

REM Or manually
venv\Scripts\activate.bat
python network_mapper_main.py
```

For OS detection and SYN scans you need administrator rights. `python startup.py` handles that by asking for elevation (a UAC prompt).

---

## First Run

### 1. Access the Web Interface

After starting the application, you'll see:

```
============================================================
Network Topology Mapper - server starting
============================================================
Upload folder: /tmp/network_mapper_uploads_1000
Nmap installed: True
Open http://localhost:5000
```

The number at the end of the upload folder is your user ID, so it will differ.

Open your web browser and go to: **http://localhost:5000**

### 2. Test with a Simple Scan

For your first scan, try a safe local scan:

**Targets:** `127.0.0.1` (your own computer)

**Options:**
- Top Ports (100)
- Service Version Detection

Click **Start Scan**

### 3. Expected Results

You should see:
- A loading spinner while scanning
- A network graph appears with:
  - One circle for your host, coloured by its subnet
  - A hub for that subnet, connected to the host (turn this off with "Show Network Connections")
- Scan information panel on the left
- A legend listing the detected subnet and how many devices are in it

Click your host to see its open ports appear around it as pink dots.

### 4. Interact with the Graph

- **Click** a device to show or hide its open ports
- **Hover** over a device for its addresses, subnet, hostname, OS, MAC and roles
- **Drag** to move nodes
- **Scroll** to zoom, drag the background to pan
- **Click "Reset View"** to fit the whole map in the window
- **Export JSON** or **Export Image** (PNG, JPG or SVG) to save the result

---

## Verification

### Check Installation is Complete

#### Linux
```bash
# Check virtual environment
ls venv/

# Check Python packages
source venv/bin/activate
pip list | grep -E "Flask|networkx|pyvis"

# Should show something like this (newer patch versions are fine):
# Flask          3.1.3
# flask-cors     6.0.5
# networkx       3.6.1
# pyvis          0.3.2
```

#### Windows
```batch
REM Check virtual environment
dir venv

REM Check Python packages
venv\Scripts\activate.bat
pip list | findstr /I "Flask networkx pyvis"

REM Should show something like this (newer patch versions are fine):
REM Flask          3.1.3
REM flask-cors     6.0.5
REM networkx       3.6.1
REM pyvis          0.3.2
```

### Test Nmap Integration

In the web interface:
1. Enter target: `scanme.nmap.org` (Nmap's official test server)
2. Select "Top Ports (100)"
3. Click "Start Scan"
4. Should complete successfully and show results

### Test XML Upload

1. Run a manual Nmap scan:
```bash
# Linux
nmap -oX test_scan.xml scanme.nmap.org

# Windows
nmap -oX test_scan.xml scanme.nmap.org
```

2. In the web interface, click "Choose Nmap XML File"
3. Select `test_scan.xml`
4. Should load and display the topology

---

## Common Issues

### Issue: "Python is not installed or not in PATH"

**Windows Solution:**
1. Uninstall Python
2. Reinstall and tick "Add Python to PATH"
3. Restart Command Prompt

**Linux Solution:**
```bash
# Install Python
sudo apt install python3 python3-pip  # Ubuntu/Debian
```

### Issue: "Nmap not found"

**Windows Solution:**
Add Nmap to PATH:
1. Win + R → `sysdm.cpl` → Advanced → Environment Variables
2. System Variables → Path → Edit → New
3. Add: `C:\Program Files (x86)\Nmap`
4. OK → Restart Command Prompt

**Linux Solution:**
```bash
sudo apt install nmap  # Ubuntu/Debian
sudo dnf install nmap  # Fedora/RHEL
```

### Issue: "Permission denied" when scanning

**Linux Solution:**
```bash
# Run with sudo for advanced scans (OS detection, SYN scan)
sudo python network_mapper_main.py

# Or let the launcher ask for sudo itself
python startup.py

# Or scan without OS Detection, which needs raw socket access
```

**Windows Solution:**
Run Command Prompt as Administrator:
1. Search "cmd"
2. Right-click → "Run as administrator"
3. Navigate to folder and run start_app.bat

Or run `python startup.py`, which asks for elevation itself.

### Issue: "Port 5000 already in use"

**Solution:** Change the port in `network_mapper_main.py`:
```python
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)  # Changed from 5000
```

Then access at: http://localhost:8080

### Issue: "ModuleNotFoundError: No module named 'flask'"

**Solution:** Reinstall dependencies:

**Linux:**
```bash
source venv/bin/activate
pip install --force-reinstall -r requirements.txt
```

**Windows:**
```batch
venv\Scripts\activate.bat
pip install --force-reinstall -r requirements.txt
```

### Issue: "templates/index.html not found"

**Solution:**
1. Verify `templates` folder exists
2. Verify `index.html` is inside it
3. Check file structure matches [File Structure](#file-structure)

### Issue: Browser shows "Unable to connect"

**Solutions:**
1. Check if network_mapper_main.py is running (should see Flask output)
2. Try http://127.0.0.1:5000 instead of localhost
3. Check firewall isn't blocking port 5000
4. Verify no proxy settings interfering

### Issue: Scan fails with "Nmap scan failed"

**Common Causes:**
- Invalid target format
- Network unreachable
- Firewall blocking
- Insufficient permissions

**Solutions:**
1. Test target is reachable: `ping <target>`
2. Try scanning localhost first: `127.0.0.1`
3. Use less aggressive options (remove OS detection)
4. Run with elevated privileges (sudo/administrator)

---

## Post-Installation

### Regular Usage

**Linux:**
```bash
cd network-topology-mapper
./start_scripts.sh
```

**Windows:**
```batch
cd C:\network-topology-mapper
start_app.bat
```

### Updating Dependencies

```bash
# Linux
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Windows
venv\Scripts\activate.bat
pip install --upgrade -r requirements.txt
```

### Uninstallation

**Linux:**
```bash
cd network-topology-mapper
rm -rf venv/
# Optionally delete entire directory
```

**Windows:**
```batch
cd C:\network-topology-mapper
rmdir /s /q venv
REM Optionally delete entire directory
```

---

## Getting Help

If you encounter issues not covered here:

1. Check the main [README.md](README.md) troubleshooting section
2. Verify all prerequisites are correctly installed
3. Run with verbose logging (check terminal output)
4. Collect error messages and system information:
   - Operating system and version
   - Python version (`python --version`)
   - Nmap version (`nmap --version`)
   - Error messages from terminal/console

---

## Success Checklist

- [ ] Python 3.11+ installed and in PATH
- [ ] Nmap installed and in PATH
- [ ] Project files extracted completely
- [ ] Setup script ran without errors
- [ ] Virtual environment created (`venv/` folder exists)
- [ ] Application starts without errors
- [ ] Web interface accessible at http://localhost:5000
- [ ] Test scan of 127.0.0.1 completes successfully
- [ ] Network graph displays correctly

If all items are checked, installation is complete.

---

**Next Steps:** See [README.md](README.md) for usage instructions and features.