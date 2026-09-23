# Network Topology Mapper

A cross-platform network visualization tool that integrates with Nmap to create interactive topology maps of your network infrastructure.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)

## Features

This is the short version. [What Exactly does this do?](wedid.md) goes through each feature in more detail and explains how the tool differs from Zenmap.

### Scanning
- **Live Nmap scans** from the browser. Targets can be single IPs, CIDR ranges or hostnames, separated by commas
- **Port selection**: top N ports (configurable), all ports (1-65535), or a custom list
- **Scan options**: service version detection (`-sV`), OS detection (`-O`), NSE script scanning, SNMP discovery, hostname detection, common TCP and UDP service ports
- **Timing templates**: Paranoid to Insane (T0-T5)
- **Live output**: watch Nmap's output in the terminal, on the page as it runs, or both
- **XML import**: load an existing Nmap XML scan instead of running a new one

### The map
- **Subnet grouping**: devices are clustered and colour-coded by subnet, each with its own hub and a legend showing device counts. The prefix length used for grouping is adjustable (default /24). Nmap can't see VLAN tags, so "VLAN" here means "subnet"
- **Multi-homed devices**: hosts that answer with the same MAC address on different subnets are merged into one device with several interfaces
- **Gateway detection**: the likely gateway in each subnet is marked with a gold ring
- **Role tagging**: DNS, DHCP, domain controller, web, mail, database and file servers are identified from open ports and services
- **Services**: click a device to show its open ports around it, click again to hide them
- **Tooltips**: hover a device for its addresses, subnet, hostname, OS guess, MAC and vendor, roles and open port count
- **Navigation**: drag devices, scroll to zoom, drag the background to pan, "Reset View" to fit everything

### Export
- **JSON**: the topology data behind the map
- **Image**: the whole map as PNG, JPG or SVG, with a legend

### Interface
- Dark-themed web interface that runs locally in your browser
- Scan summary panel (scan time, Nmap version, hosts scanned and hosts up)
- Works on Linux and Windows

## Installation

### Prerequisites

#### Required
- **Python 3.11+**: [Download](https://www.python.org/downloads/)
  (older distributions may ship an older Python; Ubuntu 22.04 has 3.10, so install a newer one alongside it, for example with [pyenv](https://github.com/pyenv/pyenv))
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
1. Install [Python 3.11+](https://www.python.org/downloads/) (check "Add Python to PATH")
2. Install [Nmap](https://nmap.org/download.html)

### Quick Start

#### Linux
```bash
# 1. Clone or download the repository
git clone <repository-url>
cd network-topology-mapper

# 2. Make setup script executable
chmod +x linux_setup.sh

# 3. Run setup (installs dependencies and starts app)
./linux_setup.sh
```

#### Windows
```batch
REM 1. Clone or download the repository
git clone <repository-url>
cd network-topology-mapper

REM 2. Run setup (installs dependencies and starts app)
windows_setup.bat
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
python network_mapper_main.py
```

## Project Structure

```
network-topology-mapper/
├── network_mapper_main.py  # Flask app: runs Nmap, parses XML, builds the map data
├── startup.py              # Launcher that re-runs itself with admin rights
├── requirements.txt        # Python dependencies
├── linux_setup.sh          # Linux setup script
├── windows_setup.bat       # Windows setup script
├── start_scripts.sh        # Linux quick-start (after setup)
├── start_app.bat           # Windows quick-start (after setup)
├── README.md               # This file
├── wedid.md                # Detailed feature walkthrough and Zenmap comparison
├── install_guide.md        # Longer installation guide
├── templates/
│   └── index.html          # Web interface
└── static/
    ├── Script.js           # Map drawing and scan controls (D3.js)
    └── Style.css           # Styling
```

## Usage

### 1. Start the Application

**Linux:**
```bash
./linux_setup.sh
```

**Windows:**
```batch
windows_setup.bat
```

**Later runs, once setup has been done:**
```bash
./start_scripts.sh      # Linux
start_app.bat           # Windows
```

**With admin rights (needed for OS detection and SYN scans):**
```bash
python startup.py
```
This relaunches itself with `sudo` on Linux or a UAC prompt on Windows, then starts the app.

**Or manually:**
```bash
python network_mapper_main.py
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
   - **Service Version Detection**: Identify service versions
   - **OS Detection**: Detect operating systems (requires root/admin)
   - **Script Scanning**: Run NSE discovery scripts
   - **SNMP Discovery**: Scan for SNMP services
   - **Attempt Hostname Detection**: Reverse DNS, NetBIOS and DNS service discovery
   - **Detect Common TCP & UDP Services**: Adds UDP scanning and a set of common ports (slower)
4. Choose display options:
   - **Show Network Connections**: Draw a hub for each subnet and a line from each device to it
   - **Subnet / VLAN grouping**: Prefix length used to group devices (default 24)
5. Choose where Nmap's output goes: the logs (terminal), the webpage, or both
6. Select timing template (T3 = Normal recommended)
7. Click **Start Scan**

#### Option B: Upload Existing Scan
1. Click **Choose Nmap XML File**
2. Select an Nmap XML output file
3. Topology will load automatically, using the subnet grouping and connection settings currently shown in the sidebar

### 4. Interact with the Visualization

- **Click a device**: Show or hide its open ports
- **Hover a device**: Tooltip with addresses, subnet, hostname, OS, MAC, roles and open port count
- **Drag devices**: Reposition manually
- **Scroll**: Zoom in/out
- **Drag background**: Pan view
- **Reset View**: Fit the whole map in the window
- **Export JSON**: Save topology data
- **Export Image**: Save the whole map as PNG, JPG or SVG (pick the format in the dropdown)

Gold rings mark the likely gateway in each subnet. Each colour in the legend is one detected subnet. See [wedid.md](wedid.md) for how grouping, gateway detection and multi-interface devices work.

## Nmap Command Examples

The tool generates Nmap commands similar to these (the timing flag is always added):

```bash
# Quick scan of top 100 ports
nmap -oX output.xml --top-ports 100 -T3 192.168.1.0/24

# Full port scan with service detection
nmap -oX output.xml -p- -sV -T3 192.168.1.0/24

# Aggressive scan with OS detection
nmap -oX output.xml --top-ports 100 -sV -O -T4 192.168.1.0/24

# Custom ports with scripts
nmap -oX output.xml -p 22,80,443,8080 -T3 --script default,discovery 192.168.1.1
```

The exact command is printed to the terminal as `[DEBUG] Running nmap command: ...` for every scan.

## Configuration

### Change Server Port

Edit `network_mapper_main.py`:
```python
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)  # Change port here
```

### Adjust Visualization

Edit `static/Script.js`:
```javascript
// Spacing between neighbouring nodes
const NODE_COLLIDE_RADIUS = 62;
const HUB_COLLIDE_RADIUS = 50;
const SERVICE_COLLIDE_RADIUS = 30;

// Subnet colours (cycles if there are more subnets than colours)
const VLAN_COLORS = ['#667eea', '#2ecc71', '#f39c12', ...];
```
The force simulation (repulsion, link distance) is set up in `initVisualization()` in the same file.

### File Upload Limits

Edit `network_mapper_main.py`:
```python
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
```

## Security Considerations

### Running as Root/Administrator

Some Nmap features require elevated privileges:

**Easiest way (Linux and Windows):**
```bash
python startup.py
```
It asks for elevation itself, using `sudo` on Linux or a UAC prompt on Windows.

**Linux, manually:**
```bash
sudo ./linux_setup.sh
# Or
sudo python network_mapper_main.py
```

**Windows, manually:**
Run Command Prompt or PowerShell as Administrator, then:
```batch
windows_setup.bat
```

### Firewall Considerations

- The application runs on port **5000** by default
- By default it listens on all network interfaces (`host="0.0.0.0"`), so other machines on your network can reach it. Change `host` to `"127.0.0.1"` in `network_mapper_main.py` if you only want local access
- It also starts with Flask's `debug=True`. Turn that off if the app is reachable by anyone else, especially when running as root
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
sudo python network_mapper_main.py

# Or run without OS Detection, which needs raw socket access
```

### Port Already in Use

If port 5000 is occupied:

```bash
# Find process using port
# Linux:
sudo lsof -i :5000
# Windows:
netstat -ano | findstr :5000

# Change port in network_mapper_main.py or kill the process
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
5. **Extra Detail**: Enable script scanning

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
  "timing": "3",
  "show_infra": true,
  "subnet_prefix": 24
}

Response: {
  "success": true,
  "graph": {...},
  "xml_file": "scan_20250104_120000.xml"
}
```

Other accepted fields: `all_ports`, `custom_ports` (e.g. `"22,80,443"`), `script_scan`, `snmp_scan`, `hostname_detection`, `common_services`, `show_terminal`, `show_webpage`. If `show_webpage` is true, the response is `{"success": true, "scan_id": "...", "streaming": true}` instead, and the results arrive over the stream endpoint below.

### Stream Scan Output
```
GET /api/scan-stream/<scan_id>
Response: Server-sent events: {"output": "..."} lines while Nmap runs,
          then {"success": true, "graph": {...}} or {"error": "..."}
```

### Get Current Graph
```
GET /api/graph?show_infra=1&subnet_prefix=24
Response: The graph of the most recent scan or upload, regrouped with the given settings
```

### Upload XML
```
POST /api/upload?show_infra=1&subnet_prefix=24
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
    json={'targets': '192.168.1.0/24', 'top_ports': True})
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
- Subnet/VLAN grouping with adjustable prefix length
- Devices sharing a MAC address merged into one multi-interface device
- Gateway and server role detection
- Live Nmap output on the page
- Image export (PNG, JPG, SVG)

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