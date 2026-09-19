# Network Topology Mapper

A cross-platform network visualization tool that integrates with Nmap to create interactive topology maps of your network infrastructure.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg)
![Python](https://img.shields.io/badge/python-3.7+-blue.svg)

## Features

### 🎯 Core Functionality
- **Live Nmap Scanning**: Run customized Nmap scans directly from the UI
- **XML Import**: Upload existing Nmap XML scan results
- **Interactive Visualization**: D3.js-powered network topology with zoom, drag, and pan
- **Cross-Platform**: Works on Linux and Windows without modification

### 🔧 Nmap Integration
- **Port Selection**:
  - Top N ports (configurable)
  - All ports (1-65535)
  - Custom port lists
- **Service Detection**: Version detection (`-sV`)
- **OS Detection**: Operating system fingerprinting (`-O`)
- **Script Scanning**: NSE (Nmap Scripting Engine) support
- **SNMP Discovery**: UDP scanning for SNMP services
- **Timing Templates**: Paranoid to Insane (T0-T5)

### 🎨 Visualization Features
- **Node Types**:
  - **Hosts** (Blue circles): Network devices with IP, hostname, OS info
  - **Services** (Pink boxes): Open ports with service/version details
- **Interactive Elements**:
  - Click nodes for detailed information
  - Hover for quick tooltips
  - Drag to reposition nodes
  - Zoom and pan controls
- **Data Export**: Save topology as JSON

### 🖥️ User Interface
- Modern, dark-themed web interface
- Real-time scan progress
- Detailed node inspection panel
- Scan metadata display
- Responsive design

## Installation

### Prerequisites

#### Required
- **Python 3.7+**: [Download](https://www.python.org/downloads/)
- **Nmap**: [Download](https://nmap.org/download.html)

#### Linux
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip python3-venv nmap

# Fedora/RHEL
sudo dnf install python3 python3-pip nmap

# Arch Linux
sudo pacman -S python python-pip nmap
```

#### Windows
1. Install [Python 3.7+](https://www.python.org/downloads/) (check "Add Python to PATH")
2. Install [Nmap](https://nmap.org/download.html)

### Quick Start

#### Linux
```bash
# 1. Clone or download the repository
git clone <repository-url>
cd network-topology-mapper

# 2. Make setup script executable
<<<<<<< HEAD
chmod +x setup.sh

# 3. Run setup (installs dependencies and starts app)
./setup.sh
=======
chmod +x linux_setup.sh

# 3. Run setup (installs dependencies and starts app)
./linux_setup.sh
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

#### Windows
```batch
REM 1. Clone or download the repository
git clone <repository-url>
cd network-topology-mapper

REM 2. Run setup (installs dependencies and starts app)
<<<<<<< HEAD
setup.bat
=======
windows_setup.bat
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

### Manual Installation

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt

# Start application
<<<<<<< HEAD
python app.py
=======
python network_mapper_main.py
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

## Project Structure

```
network-topology-mapper/
<<<<<<< HEAD
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── setup.sh              # Linux setup script
├── setup.bat             # Windows setup script
=======
├── network_mapper_main.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── linux_setup.sh              # Linux setup script
├── windows_setup.bat             # Windows setup script
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
├── README.md             # This file
└── templates/
    └── index.html        # Web interface
```

## Usage

### 1. Start the Application

**Linux:**
```bash
<<<<<<< HEAD
./setup.sh
=======
./linux_setup.sh
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

**Windows:**
```batch
<<<<<<< HEAD
setup.bat
=======
windows_setup.bat
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

**Or manually:**
```bash
<<<<<<< HEAD
python app.py
=======
python network_mapper_main.py
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

### 2. Access the Web Interface

Open your browser to: **http://localhost:5000**

### 3. Run a Scan

#### Option A: Live Scan
1. Enter target(s) in the "Targets" field:
   - Single IP: `192.168.1.1`
   - IP range: `192.168.1.0/24`
   - Multiple: `192.168.1.0/24, 10.0.0.1`
2. Select port options:
   - **Top Ports**: Scan most common ports (default: 100)
   - **All Ports**: Comprehensive scan (1-65535)
   - **Custom**: Specific ports (e.g., `22,80,443,8080`)
3. Enable additional options:
   - ☑ **Service Version Detection**: Identify service versions
   - ☑ **OS Detection**: Detect operating systems (requires root/admin)
   - ☑ **Script Scanning**: Run NSE discovery scripts
   - ☑ **SNMP Discovery**: Scan for SNMP services
4. Select timing template (T3 = Normal recommended)
5. Click **Start Scan**

#### Option B: Upload Existing Scan
1. Click **Choose Nmap XML File**
2. Select an Nmap XML output file
3. Topology will load automatically

### 4. Interact with the Visualization

- **Click nodes**: View detailed information
- **Hover nodes**: Quick tooltip
- **Drag nodes**: Reposition manually
- **Scroll**: Zoom in/out
- **Drag background**: Pan view
- **Reset View**: Return to default zoom
- **Export JSON**: Save topology data

## Nmap Command Examples

The tool generates Nmap commands similar to:

```bash
# Quick scan of top 100 ports
nmap -oX output.xml --top-ports 100 192.168.1.0/24

# Full port scan with service detection
nmap -oX output.xml -p- -sV 192.168.1.0/24

# Aggressive scan with OS detection
nmap -oX output.xml -sV -O -T4 192.168.1.0/24

# Custom ports with scripts
nmap -oX output.xml -p 22,80,443,8080 --script default,discovery 192.168.1.1
```

## Configuration

### Change Server Port

<<<<<<< HEAD
Edit `app.py`:
=======
Edit `network_mapper_main.py`:
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```python
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)  # Change port here
```

### Adjust Visualization

Edit `templates/index.html`:
```javascript
// Force simulation parameters
.force('charge', d3.forceManyBody().strength(-300))  // Node repulsion
.force('link', d3.forceLink().id(d => d.id).distance(100))  // Link distance
.force('collision', d3.forceCollide().radius(50))  // Collision radius
```

### File Upload Limits

<<<<<<< HEAD
Edit `app.py`:
=======
Edit `network_mapper_main.py`:
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```python
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
```

## Security Considerations

### Running as Root/Administrator

Some Nmap features require elevated privileges:

**Linux:**
```bash
<<<<<<< HEAD
sudo ./setup.sh
# Or
sudo python app.py
=======
sudo ./linux_setup.sh
# Or
sudo python network_mapper_main.py
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

**Windows:**
Run Command Prompt or PowerShell as Administrator, then:
```batch
<<<<<<< HEAD
setup.bat
=======
windows_setup.bat
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

### Firewall Considerations

- The application runs on port **5000** by default
- Nmap may trigger firewall alerts during scans
- Some scans (SYN scans, OS detection) require raw socket access

### Network Permissions

- Ensure you have authorization to scan target networks
- Unauthorized scanning may violate laws and policies
- Use responsibly on your own networks or with explicit permission

## Troubleshooting

### Nmap Not Found

**Linux:**
```bash
# Check if Nmap is installed
which nmap

# Install if missing
sudo apt install nmap  # Ubuntu/Debian
```

**Windows:**
```batch
# Check if Nmap is installed
nmap --version

# Add to PATH if installed but not found:
# 1. Search for "Environment Variables"
# 2. Add C:\Program Files (x86)\Nmap to PATH
```

### Permission Denied Errors

Some Nmap scans require elevated privileges:

```bash
# Linux
<<<<<<< HEAD
sudo python app.py
=======
sudo python network_mapper_main.py
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)

# Or adjust scan options (avoid -O, use -sT instead of -sS)
```

### Port Already in Use

If port 5000 is occupied:

```bash
# Find process using port
# Linux:
sudo lsof -i :5000
# Windows:
netstat -ano | findstr :5000

<<<<<<< HEAD
# Change port in app.py or kill the process
=======
# Change port in network_mapper_main.py or kill the process
>>>>>>> 5153688 (Updated it to work properly with Subnets and VLANs. Duplicated MAC addresses with 2 different devices, are automatically identified as a single device with multiple subnets)
```

### Browser Can't Connect

1. Check if the server is running
2. Try `http://127.0.0.1:5000` instead of `localhost`
3. Check firewall settings
4. Ensure no proxy is interfering

### Virtual Environment Issues

**Linux:**
```bash
# Remove and recreate
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Windows:**
```batch
REM Remove and recreate
rmdir /s /q venv
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
```

### XML Parsing Errors

- Ensure the XML file is a valid Nmap output (`-oX` format)
- Check file is not corrupted
- Verify file size is within limits (50MB default)

## Advanced Usage

### Scanning Specific Service Types

**Web Servers:**
```
Ports: 80,443,8080,8443
Options: Service Version Detection
```

**Database Servers:**
```
Ports: 1433,3306,5432,27017
Options: Service Version Detection
```

**Network Infrastructure:**
```
Ports: 22,23,161,443
Options: SNMP Discovery, Script Scanning
```

### Network Discovery Workflow

1. **Quick Discovery**: Top 100 ports, T4 timing
2. **Service Identification**: Enable version detection
3. **OS Fingerprinting**: Enable OS detection (requires root)
4. **Deep Dive**: All ports on interesting hosts
5. **Vulnerability Assessment**: Enable script scanning

### Automating Scans

Create scheduled scans using cron (Linux) or Task Scheduler (Windows):

**Linux cron example:**
```bash
# Run scan daily at 2 AM
0 2 * * * nmap -oX /path/to/scan_$(date +\%Y\%m\%d).xml -sV 192.168.1.0/24
```

Then upload results to the tool for visualization.

## API Endpoints

The tool exposes REST API endpoints:

### Check Nmap Installation
```
GET /api/check-nmap
Response: {"installed": true}
```

### Start Scan
```
POST /api/scan
Content-Type: application/json

{
  "targets": "192.168.1.0/24",
  "top_ports": true,
  "top_ports_count": 100,
  "service_version": true,
  "os_detection": false,
  "timing": "3"
}

Response: {
  "success": true,
  "graph": {...},
  "xml_file": "scan_20250104_120000.xml"
}
```

### Upload XML
```
POST /api/upload
Content-Type: multipart/form-data

file: <nmap_output.xml>

Response: {
  "success": true,
  "graph": {...},
  "xml_file": "upload_20250104_120000_nmap_output.xml"
}
```

### Download XML
```
GET /api/download/<filename>
Response: XML file download
```

## Performance Tips

### Large Networks

For networks with many hosts:

1. **Start small**: Scan subnets incrementally
2. **Use timing wisely**: T4 for speed, T2 for stealth
3. **Limit ports**: Start with top ports, expand as needed
4. **Filter results**: Focus on hosts with interesting services

### Browser Performance

- Large topologies (1000+ nodes) may slow rendering
- Use modern browsers (Chrome, Firefox, Edge)
- Close unnecessary browser tabs
- Consider scanning smaller subnets separately

## Integration Examples

### Export to Other Tools

```python
import json
import requests

# Get topology data
response = requests.post('http://localhost:5000/api/scan', 
    json={'targets': '192.168.1.0/24', 'top_ports': true})
data = response.json()

# Export to file
with open('network_data.json', 'w') as f:
    json.dump(data['graph'], f, indent=2)

# Process with custom scripts
for node in data['graph']['nodes']:
    if node['type'] == 'host':
        print(f"Found host: {node['ip']}")
```

### Scripted Scans

```python
import requests

targets = ['192.168.1.0/24', '10.0.0.0/24']

for target in targets:
    response = requests.post('http://localhost:5000/api/scan',
        json={
            'targets': target,
            'service_version': True,
            'timing': '4'
        })
    
    if response.json()['success']:
        print(f"Scan completed: {target}")
```

## Contributing

Contributions are welcome! Areas for improvement:

- Additional visualization layouts (hierarchical, radial)
- More Nmap script integrations (LLDP, mDNS)
- Export formats (CSV, GraphML, Cytoscape)
- Advanced filtering and search
- Real-time scan progress tracking
- Network comparison (diff between scans)

## License

MIT License - See LICENSE file for details

## Acknowledgments

- **Nmap**: Network scanning engine by Gordon Lyon
- **D3.js**: Data visualization library
- **Flask**: Python web framework
- **NetworkX**: Graph analysis library

## Support

For issues, questions, or feature requests:
1. Check the Troubleshooting section
2. Review existing GitHub issues
3. Open a new issue with:
   - Operating system and version
   - Python version
   - Nmap version
   - Error messages or logs
   - Steps to reproduce

## Version History

### v1.0.0 (Current)
- Initial release
- Cross-platform support (Linux/Windows)
- Live Nmap scanning
- XML import functionality
- Interactive D3.js visualization
- Service and OS detection
- Auto-setup scripts

## Future Roadmap

- [ ] Network diff/comparison tool
- [ ] Scheduled automated scans
- [ ] Advanced search and filtering
- [ ] Multi-user support with authentication
- [ ] Database persistence (SQLite/PostgreSQL)
- [ ] Export to Packet Tracer format
- [ ] LLDP neighbor discovery integration
- [ ] mDNS/SSDP discovery enhancements
- [ ] Report generation (PDF/HTML)
- [ ] Docker containerization
- [ ] REST API documentation (OpenAPI/Swagger)

---

**Disclaimer**: This tool is intended for authorized network security assessments only. Unauthorized network scanning may be illegal in your jurisdiction. Always obtain proper authorization before scanning networks you do not own or have explicit permission to test.