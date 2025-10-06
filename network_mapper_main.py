#!/usr/bin/env python3
"""
Network Topology Mapper
Cross-platform network visualization tool using Nmap
"""

import os
import sys
import subprocess
import tempfile
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import networkx as nx
import threading
import queue
from collections import defaultdict

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = Path(tempfile.gettempdir()) / "network_mapper_uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Output queues for streaming
output_queues = {}

# -------------------------------
# Nmap Execution
# -------------------------------
def check_nmap_installed():
    """Check if nmap is available"""
    try:
        subprocess.run(["nmap", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def run_nmap(targets, options, scan_id, show_terminal=True, show_webpage=False):
    """Execute nmap with specified options"""
    if not check_nmap_installed():
        raise RuntimeError("Nmap is not installed or not in PATH")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = UPLOAD_FOLDER / f"scan_{timestamp}.xml"

    cmd = ["nmap", "-oX", str(output_file)] + options + targets

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )

        # Create output queue if webpage output is requested
        if show_webpage and scan_id:
            output_queues[scan_id] = queue.Queue()

        stdout_lines = []
        stderr_lines = []

        # Read stdout in real-time
        for line in iter(process.stdout.readline, ''):
            if line:
                stdout_lines.append(line)
                if show_terminal:
                    print(line.rstrip())
                if show_webpage and scan_id and scan_id in output_queues:
                    output_queues[scan_id].put(line.rstrip())

        process.stdout.close()

        # Read stderr
        stderr = process.stderr.read()
        if stderr:
            stderr_lines.append(stderr)
            if show_terminal:
                print(stderr, file=sys.stderr)
            if show_webpage and scan_id and scan_id in output_queues:
                output_queues[scan_id].put(f"STDERR: {stderr}")

        process.stderr.close()
        return_code = process.wait()

        # Signal end of output
        if show_webpage and scan_id and scan_id in output_queues:
            output_queues[scan_id].put("__END__")

        if return_code != 0:
            error_msg = ''.join(stderr_lines) if stderr_lines else "Unknown error"
            raise RuntimeError(f"Nmap scan failed: {error_msg}")

        return str(output_file), ''.join(stdout_lines)
    except Exception as e:
        if show_webpage and scan_id and scan_id in output_queues:
            output_queues[scan_id].put(f"ERROR: {str(e)}")
            output_queues[scan_id].put("__END__")
        raise RuntimeError(f"Failed to run nmap: {str(e)}")

# -------------------------------
# Network Role Detection
# -------------------------------
def identify_network_roles(G):
    """Identify special network roles based on ports and services"""
    roles = {}

    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") != "host":
            continue

        node_roles = []
        ports = node_data.get("ports", [])
        port_numbers = [int(p["port"]) for p in ports]
        services = [p["service"].lower() for p in ports]

        # DNS Server (port 53)
        if 53 in port_numbers or "domain" in services:
            node_roles.append("DNS Server")

        # DHCP Server (ports 67, 68)
        if 67 in port_numbers or 68 in port_numbers or "dhcp" in services:
            node_roles.append("DHCP Server")

        # Domain Controller (ports 88, 389, 636, 3268, 3269)
        dc_ports = [88, 389, 636, 3268, 3269]
        if any(p in port_numbers for p in dc_ports) or "ldap" in services or "kerberos" in services:
            node_roles.append("Domain Controller")

        # Web Server
        if 80 in port_numbers or 443 in port_numbers or "http" in services or "https" in services:
            node_roles.append("Web Server")

        # Mail Server
        mail_ports = [25, 110, 143, 465, 587, 993, 995]
        mail_services = ["smtp", "pop3", "imap"]
        if any(p in port_numbers for p in mail_ports) or any(s in services for s in mail_services):
            node_roles.append("Mail Server")

        # Database Server
        db_ports = [1433, 3306, 5432, 27017, 1521]
        db_services = ["mysql", "postgresql", "mssql", "mongodb", "oracle"]
        if any(p in port_numbers for p in db_ports) or any(s in services for s in db_services):
            node_roles.append("Database Server")

        # File Server
        file_ports = [139, 445, 2049]
        file_services = ["smb", "netbios", "nfs"]
        if any(p in port_numbers for p in file_ports) or any(s in services for s in file_services):
            node_roles.append("File Server")

        # Gateway/Router - identify by having most connections or being .1/.254
        ip = node_data.get("ip", "")
        if ip.endswith(".1") or ip.endswith(".254"):
            node_roles.append("Gateway")

        if node_roles:
            roles[node_id] = node_roles

    return roles

# -------------------------------
# XML Parsing
# -------------------------------
def parse_nmap_xml(xml_file):
    """Parse Nmap XML output into graph structure"""
    G = nx.Graph()
    scan_info = {
        "scan_time": None,
        "nmap_version": None,
        "total_hosts": 0,
        "hosts_up": 0
    }

    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()

        # Extract scan metadata
        scan_info["nmap_version"] = root.get("version")
        runstats = root.find("runstats/finished")
        if runstats is not None:
            scan_info["scan_time"] = runstats.get("timestr")

        hosts_up = 0
        for host in root.findall("host"):
            status = host.find("status")
            if status is None or status.get("state") != "up":
                continue

            hosts_up += 1

            # Get IP address
            addr_elem = host.find("address[@addrtype='ipv4']")
            if addr_elem is None:
                addr_elem = host.find("address[@addrtype='ipv6']")
            if addr_elem is None:
                continue

            addr = addr_elem.get("addr")

            # Get hostname
            hostname = None
            hostnames = host.find("hostnames")
            if hostnames is not None:
                hostname_elem = hostnames.find("hostname")
                if hostname_elem is not None:
                    hostname = hostname_elem.get("name")

            # Get OS info
            os_match = None
            os_accuracy = 0
            osmatch = host.find(".//osmatch")
            if osmatch is not None:
                os_match = osmatch.get("name")
                os_accuracy = int(osmatch.get("accuracy", 0))

            # Get MAC address
            mac_addr = None
            mac_vendor = None
            mac_elem = host.find("address[@addrtype='mac']")
            if mac_elem is not None:
                mac_addr = mac_elem.get("addr")
                mac_vendor = mac_elem.get("vendor")

            # Add host node
            node_label = hostname if hostname else addr
            G.add_node(addr,
                       label=node_label,
                       ip=addr,
                       hostname=hostname,
                       os=os_match,
                       os_accuracy=os_accuracy,
                       mac=mac_addr,
                       mac_vendor=mac_vendor,
                       type="host",
                       ports=[])

            # Parse ports
            for port in host.findall(".//port"):
                portid = port.get("portid")
                protocol = port.get("protocol")

                state_elem = port.find("state")
                state = state_elem.get("state") if state_elem is not None else "unknown"

                if state != "open":
                    continue

                service_elem = port.find("service")
                service = "unknown"
                version = None
                product = None

                if service_elem is not None:
                    service = service_elem.get("name", "unknown")
                    product = service_elem.get("product")
                    version = service_elem.get("version")

                port_info = {
                    "port": portid,
                    "protocol": protocol,
                    "state": state,
                    "service": service,
                    "product": product,
                    "version": version
                }

                G.nodes[addr]["ports"].append(port_info)

        scan_info["total_hosts"] = len(root.findall("host"))
        scan_info["hosts_up"] = hosts_up

    except Exception as e:
        raise RuntimeError(f"Failed to parse XML: {str(e)}")

    return G, scan_info

# -------------------------------
# Graph Export
# -------------------------------
def graph_to_json(G, scan_info, show_services=False, show_infra=False):
    """Convert graph to JSON format for visualization"""
    nodes = []
    links = []

    # Identify network roles
    roles = identify_network_roles(G)

    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") != "host":
            continue

        node_obj = {
            "id": str(node_id),
            "label": node_data.get("label", str(node_id)),
            "type": "host",
            "ip": node_data.get("ip"),
            "hostname": node_data.get("hostname"),
            "os": node_data.get("os"),
            "os_accuracy": node_data.get("os_accuracy", 0),
            "mac": node_data.get("mac"),
            "mac_vendor": node_data.get("mac_vendor"),
            "ports": node_data.get("ports", []),
            "open_ports_count": len(node_data.get("ports", [])),
            "roles": roles.get(node_id, [])
        }
        nodes.append(node_obj)

        # Add service nodes if requested
        if show_services:
            for port in node_data.get("ports", []):
                service_label = f"{port['service']}:{port['port']}/{port['protocol']}"
                if port.get('product'):
                    service_label = f"{port['product']} ({port['service']}:{port['port']})"

                service_id = f"{node_id}_{port['protocol']}_{port['port']}"
                service_node = {
                    "id": service_id,
                    "label": service_label,
                    "type": "service",
                    "port": port['port'],
                    "protocol": port['protocol'],
                    "service": port['service'],
                    "product": port.get('product'),
                    "version": port.get('version')
                }
                nodes.append(service_node)
                links.append({
                    "source": str(node_id),
                    "target": service_id,
                    "relation": "provides"
                })

    # Add infrastructure connections if requested
    if show_infra:
        # Find gateway (likely .1 or .254, or node with most roles)
        gateway_candidates = []
        for node_id, node_roles in roles.items():
            if "Gateway" in node_roles or "DHCP Server" in node_roles:
                gateway_candidates.append(node_id)

        # Connect all hosts to gateway
        if gateway_candidates:
            gateway = gateway_candidates[0]
            for node_id, node_data in G.nodes(data=True):
                if node_data.get("type") == "host" and node_id != gateway:
                    links.append({
                        "source": gateway,
                        "target": str(node_id),
                        "relation": "gateway"
                    })

        # Connect hosts to DNS servers
        dns_servers = [nid for nid, nroles in roles.items() if "DNS Server" in nroles]
        for dns in dns_servers:
            for node_id, node_data in G.nodes(data=True):
                if node_data.get("type") == "host" and node_id != dns:
                    links.append({
                        "source": str(node_id),
                        "target": dns,
                        "relation": "dns"
                    })

    return {
        "nodes": nodes,
        "links": links,
        "scan_info": scan_info
    }

# -------------------------------
# Flask Routes
# -------------------------------
@app.route("/")
def index():
    """Main page"""
    return render_template("index.html")

@app.route("/api/check-nmap", methods=["GET"])
def check_nmap():
    """Check if Nmap is installed"""
    return jsonify({"installed": check_nmap_installed()})

@app.route("/api/scan", methods=["POST"])
def start_scan():
    """Start a new Nmap scan"""
    try:
        data = request.json
        targets = data.get("targets", "").strip()

        if not targets:
            return jsonify({"error": "No targets specified"}), 400

        # Get output options
        show_terminal = data.get("show_terminal", True)
        show_webpage = data.get("show_webpage", False)

        # Generate scan ID for streaming
        scan_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

        # Build nmap options
        options = []

        # Port options
        if data.get("all_ports"):
            options.append("-p-")
        elif data.get("top_ports"):
            top = data.get("top_ports_count", 100)
            options.extend(["--top-ports", str(top)])
        elif data.get("custom_ports"):
            options.extend(["-p", data.get("custom_ports")])

        # Service/Version detection
        if data.get("service_version"):
            options.append("-sV")

        # OS detection
        if data.get("os_detection"):
            options.append("-O")

        # SNMP scanning
        if data.get("snmp_scan"):
            options.append("-sU")
            options.extend(["-p", "161"])

        # Timing
        timing = data.get("timing", "3")
        options.append(f"-T{timing}")

        # Additional options
        if data.get("script_scan"):
            options.extend(["--script", "default,discovery"])

        target_list = [t.strip() for t in targets.split(",") if t.strip()]

        # Run scan in background thread if showing webpage output
        if show_webpage:
            def run_scan_thread():
                try:
                    xml_file, output = run_nmap(target_list, options, scan_id, show_terminal, show_webpage)
                    G, scan_info = parse_nmap_xml(xml_file)
                    graph_data = graph_to_json(G, scan_info, show_services=False, show_infra=False)

                    # Store result in queue
                    if scan_id in output_queues:
                        output_queues[scan_id].put(f"__RESULT__{json.dumps({'success': True, 'graph': graph_data, 'xml_file': os.path.basename(xml_file)})}")
                except Exception as e:
                    if scan_id in output_queues:
                        output_queues[scan_id].put(f"__ERROR__{str(e)}")

            thread = threading.Thread(target=run_scan_thread)
            thread.daemon = True
            thread.start()

            return jsonify({"success": True, "scan_id": scan_id, "streaming": True})
        else:
            # Run synchronously
            xml_file, output = run_nmap(target_list, options, None, show_terminal, False)
            G, scan_info = parse_nmap_xml(xml_file)
            graph_data = graph_to_json(G, scan_info, show_services=False, show_infra=False)

            return jsonify({
                "success": True,
                "graph": graph_data,
                "xml_file": os.path.basename(xml_file)
            })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Store current graph globally for toggle operations
current_graph = None
current_scan_info = None

@app.route('/api/graph')
def graph_data():
    """Return graph data with optional infrastructure overlay"""
    global current_graph, current_scan_info

    show_infra = request.args.get('show_infra', '0') == '1'
    show_services = request.args.get('show_services', '0') == '1'

    if current_graph is None:
        return jsonify({"nodes": [], "links": [], "scan_info": {}})

    return jsonify(graph_to_json(current_graph, current_scan_info,
                                 show_services=show_services, show_infra=show_infra))

@app.route("/api/scan-stream/<scan_id>")
def scan_stream(scan_id):
    """Stream scan output to webpage"""
    def generate():
        if scan_id not in output_queues:
            yield f"data: {json.dumps({'error': 'Invalid scan ID'})}\n\n"
            return

        q = output_queues[scan_id]
        while True:
            try:
                line = q.get(timeout=60)
                if line == "__END__":
                    break
                elif line.startswith("__RESULT__"):
                    result_data = json.loads(line[10:])
                    # Store graph globally
                    global current_graph, current_scan_info
                    if result_data.get('success') and result_data.get('graph'):
                        # Reconstruct the graph from the result
                        G = nx.Graph()
                        for node in result_data['graph']['nodes']:
                            G.add_node(node['id'], **node)
                        current_graph = G
                        current_scan_info = result_data['graph']['scan_info']
                    yield f"data: {line[10:]}\n\n"
                    break
                elif line.startswith("__ERROR__"):
                    yield f"data: {json.dumps({'error': line[9:]})}\n\n"
                    break
                else:
                    yield f"data: {json.dumps({'output': line})}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'keepalive': True})}\n\n"

        # Cleanup
        if scan_id in output_queues:
            del output_queues[scan_id]

    return Response(generate(), mimetype='text/event-stream')

@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Upload and parse existing Nmap XML file"""
    global current_graph, current_scan_info

    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        if not file.filename.endswith(".xml"):
            return jsonify({"error": "Only XML files are supported"}), 400

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"upload_{timestamp}_{file.filename}"
        filepath = UPLOAD_FOLDER / filename
        file.save(str(filepath))

        G, scan_info = parse_nmap_xml(str(filepath))
        current_graph = G
        current_scan_info = scan_info
        graph_data = graph_to_json(G, scan_info, show_services=False, show_infra=False)

        return jsonify({
            "success": True,
            "graph": graph_data,
            "xml_file": filename
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/download/<filename>")
def download_file(filename):
    """Download XML file"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

if __name__ == "__main__":
    print("=" * 60)
    print("Network Topology Mapper")
    print("=" * 60)
    print(f"Starting server...")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Nmap installed: {check_nmap_installed()}")
    print(f"\nAccess the application at: http://localhost:5000")
    print("=" * 60)

    app.run(debug=True, host="0.0.0.0", port=5000, threaded=True)