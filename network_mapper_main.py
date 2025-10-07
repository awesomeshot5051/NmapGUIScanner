#!/usr/bin/env python3
"""
Network Topology Mapper - updated with hostname/common/weak service toggles
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

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = Path(tempfile.gettempdir()) / "network_mapper_uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

output_queues = {}

# -------------------------------
# Nmap Execution helpers
# -------------------------------
def check_nmap_installed():
    try:
        subprocess.run(["nmap", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def run_nmap(targets, options, scan_id, show_terminal=True, show_webpage=False):
    if not check_nmap_installed():
        raise RuntimeError("Nmap is not installed or not in PATH")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = UPLOAD_FOLDER / f"scan_{timestamp}.xml"

    # Build command: nmap [options] targets...
    cmd = ["nmap", "-oX", str(output_file)] + options + targets

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )

        if show_webpage and scan_id:
            output_queues[scan_id] = queue.Queue()

        stdout_lines = []
        stderr_lines = []

        for line in iter(process.stdout.readline, ''):
            if line:
                stdout_lines.append(line)
                if show_terminal:
                    print(line.rstrip())
                if show_webpage and scan_id and scan_id in output_queues:
                    output_queues[scan_id].put(line.rstrip())

        process.stdout.close()
        stderr = process.stderr.read()
        if stderr:
            stderr_lines.append(stderr)
            if show_terminal:
                print(stderr, file=sys.stderr)
            if show_webpage and scan_id and scan_id in output_queues:
                output_queues[scan_id].put(f"STDERR: {stderr}")

        process.stderr.close()
        return_code = process.wait()

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
# XML Parsing (unchanged)
# -------------------------------
def parse_nmap_xml(xml_file):
    G = nx.Graph()
    scan_info = {
        "scan_time": None,
        "nmap_version": None,
        "total_hosts": 0,
        "hosts_up": 0
    }

    tree = ET.parse(xml_file)
    root = tree.getroot()

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

        addr_elem = host.find("address[@addrtype='ipv4']")
        if addr_elem is None:
            addr_elem = host.find("address[@addrtype='ipv6']")
        if addr_elem is None:
            continue

        addr = addr_elem.get("addr")

        hostname = None
        hostnames = host.find("hostnames")
        if hostnames is not None:
            hostname_elem = hostnames.find("hostname")
            if hostname_elem is not None:
                hostname = hostname_elem.get("name")

        os_match = None
        os_accuracy = 0
        osmatch = host.find(".//osmatch")
        if osmatch is not None:
            os_match = osmatch.get("name")
            os_accuracy = int(osmatch.get("accuracy", 0))

        mac_addr = None
        mac_vendor = None
        mac_elem = host.find("address[@addrtype='mac']")
        if mac_elem is not None:
            mac_addr = mac_elem.get("addr")
            mac_vendor = mac_elem.get("vendor")

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

    return G, scan_info

# -------------------------------
# Role detection (unchanged)
# -------------------------------
def identify_network_roles(G):
    roles = {}
    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") != "host":
            continue
        node_roles = []
        ports = node_data.get("ports", [])
        port_numbers = [int(p["port"]) for p in ports] if ports else []
        services = [p.get("service","").lower() for p in ports] if ports else []

        if 53 in port_numbers or "domain" in services:
            node_roles.append("DNS Server")
        if 67 in port_numbers or 68 in port_numbers or "dhcp" in services:
            node_roles.append("DHCP Server")
        dc_ports = [88, 389, 636, 3268, 3269]
        if any(p in port_numbers for p in dc_ports) or any(s in services for s in ("ldap","kerberos")):
            node_roles.append("Domain Controller")
        if 80 in port_numbers or 443 in port_numbers or any(s in services for s in ("http","https")):
            node_roles.append("Web Server")
        mail_ports = [25,110,143,465,587,993,995]
        if any(p in port_numbers for p in mail_ports) or any(s in services for s in ("smtp","pop3","imap")):
            node_roles.append("Mail Server")
        db_ports = [1433,3306,5432,27017,1521]
        if any(p in port_numbers for p in db_ports) or any(s in services for s in ("mysql","postgresql","mssql","mongodb","oracle")):
            node_roles.append("Database Server")
        file_ports = [139,445,2049]
        if any(p in port_numbers for p in file_ports) or any(s in services for s in ("smb","netbios","nfs")):
            node_roles.append("File Server")
        ip = node_data.get("ip","")
        if ip.endswith(".1") or ip.endswith(".254"):
            node_roles.append("Gateway")
        if node_roles:
            roles[node_id] = node_roles
    return roles

# -------------------------------
# Graph conversion + weak highlighting
# -------------------------------
WEAK_SERVICES = {"ftp","telnet","http","pop3","imap","smtp","tftp","rlogin","rsh","finger"}

def graph_to_json(G, scan_info, show_services=False, show_infra=False, weak_highlight=False):
    nodes = []
    links = []
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
                service_name = (port.get("service") or "").lower()
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
                    "service": port.get('service'),
                    "product": port.get('product'),
                    "version": port.get('version')
                }
                # Mark weak services if requested
                if weak_highlight and any(ws in service_name for ws in WEAK_SERVICES):
                    service_node["color"] = "red"
                    service_node["risk"] = "weak"
                nodes.append(service_node)
                links.append({
                    "source": str(node_id),
                    "target": service_id,
                    "relation": "provides"
                })

    # Add infrastructure connections if requested
    if show_infra:
        # Choose gateway candidate(s)
        gateway_candidates = [nid for nid, nroles in roles.items() if "Gateway" in nroles or "DHCP Server" in nroles]
        if gateway_candidates:
            gateway = gateway_candidates[0]
            for node_id, node_data in G.nodes(data=True):
                if node_data.get("type") == "host" and node_id != gateway:
                    links.append({
                        "source": gateway,
                        "target": str(node_id),
                        "relation": "gateway"
                    })

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
# Global graph state
# -------------------------------
current_graph = None
current_scan_info = None

# -------------------------------
# Flask endpoints
# -------------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/check-nmap", methods=["GET"])
def check_nmap():
    return jsonify({"installed": check_nmap_installed()})

@app.route("/api/scan", methods=["POST"])
def start_scan():
    global current_graph, current_scan_info
    try:
        data = request.json
        targets_raw = data.get("targets", "").strip()
        if not targets_raw:
            return jsonify({"error":"No targets specified"}), 400

        # Output prefs
        show_terminal = data.get("show_terminal", True)
        show_webpage = data.get("show_webpage", False)
        hostname_detection = data.get("hostname_detection", False)
        common_services = data.get("common_services", False)
        weak_highlight = data.get("weak_highlight", False)

        # Build target list
        target_list = [t.strip() for t in targets_raw.split(",") if t.strip()]

        # Build nmap options list
        options = []

        # Port selection
        if data.get("all_ports"):
            options.append("-p-")
        elif data.get("top_ports"):
            top = int(data.get("top_ports_count", 100))
            options.extend(["--top-ports", str(top)])
        elif data.get("custom_ports"):
            options.extend(["-p", data.get("custom_ports")])
        else:
            # default: top scan (--top-ports) or full TCP scan
            options.extend(["-p-", "-sS"])

        # Service/version
        if data.get("service_version"):
            options.append("-sV")

        # OS detection
        if data.get("os_detection"):
            options.append("-O")

        # SNMP quick UDP
        script_list = []
        if data.get("snmp_scan"):
            # add UDP scan of 161 (light)
            options.extend(["-sU", "-p", "161"])
            script_list.append("snmp-info")

        # NSE script scans if requested
        if data.get("script_scan"):
            script_list.append("default,discovery")

        # Hostname detection: reverse DNS, NetBIOS, DNS service probe
        if hostname_detection:
            options.append("-R")  # reverse DNS
            # add NetBIOS + DNS broadcast discovery scripts
            script_list.append("nbstat")
            script_list.append("broadcast-dns-service-discovery")

        if common_services:
            # enable UDP scan, but do not replace user port list
            options.append("-sU")

            # Append common ports *only if no -p/-top-ports provided earlier*
            has_port_flag = any(opt.startswith("-p") or opt == "--top-ports" for opt in options)
            tcp_ports = "21,22,23,25,53,67,68,80,110,139,143,161,389,443,445,3389,5353,8080,8443"
            udp_ports = "53,67,68,69,123,161,162,5353,1900"

            if not has_port_flag:
                # If no ports defined yet, define these
                options.extend(["-p", f"T:{tcp_ports},U:{udp_ports}"])
            else:
                # If ports already defined, add these common ones to existing port list
                for i, opt in enumerate(options):
                    if opt == "-p":
                        existing_ports = options[i + 1]
                        merged_ports = f"{existing_ports},T:{tcp_ports},U:{udp_ports}"
                        options[i + 1] = merged_ports
                        break


        # Timing template
        timing = str(data.get("timing", "3"))
        options.append(f"-T{timing}")

        # Merge script_list if any
        if script_list:
            # dedupe and create comma separated
            unique_scripts = ",".join(sorted(set(",".join(script_list).split(","))))
            options.extend(["--script", unique_scripts])

        # For safety, ensure target_list is passed as individual args
        scan_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

        # Run scan - if webpage streaming requested, run in background and stream output
        if show_webpage:
            def thread_scan():
                try:
                    xml_file, output = run_nmap(target_list, options, scan_id, show_terminal, show_webpage)
                    G, scan_info = parse_nmap_xml(xml_file)
                    graph = graph_to_json(G, scan_info, show_services=False, show_infra=False, weak_highlight=weak_highlight)

                    # store results globally
                    nonlocal_vars = globals()
                    nonlocal_vars['current_graph'] = G
                    nonlocal_vars['current_scan_info'] = scan_info

                    # put result in queue for SSE consumer
                    if scan_id in output_queues:
                        output_queues[scan_id].put(f"__RESULT__{json.dumps({'success':True,'graph':graph,'xml_file':os.path.basename(xml_file)})}")
                except Exception as e:
                    if scan_id in output_queues:
                        output_queues[scan_id].put(f"__ERROR__{str(e)}")

            t = threading.Thread(target=thread_scan)
            t.daemon = True
            t.start()

            return jsonify({"success": True, "scan_id": scan_id, "streaming": True})

        else:
            xml_file, output = run_nmap(target_list, options, None, show_terminal, False)
            G, scan_info = parse_nmap_xml(xml_file)
            # convert to JSON graph; keep show_services False by default (frontend can request)
            graph = graph_to_json(G, scan_info, show_services=False, show_infra=False, weak_highlight=weak_highlight)

            # store current graph for further toggles
            current_graph = G
            current_scan_info = scan_info

            return jsonify({"success": True, "graph": graph, "xml_file": os.path.basename(xml_file)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/graph')
def graph_data():
    global current_graph, current_scan_info
    show_infra = request.args.get('show_infra', '0') == '1'
    show_services = request.args.get('show_services', '0') == '1'
    weak_highlight = request.args.get('weak_highlight', '0') == '1'

    if current_graph is None:
        return jsonify({"nodes": [], "links": [], "scan_info": {}})

    graph = graph_to_json(current_graph, current_scan_info, show_services=show_services, show_infra=show_infra, weak_highlight=weak_highlight)
    return jsonify(graph)

@app.route("/api/scan-stream/<scan_id>")
def scan_stream(scan_id):
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
                    # store graph globally
                    global current_graph, current_scan_info
                    if result_data.get('success') and result_data.get('graph'):
                        # rebuild current_graph for toggles: add host nodes with ports
                        G = nx.Graph()
                        for node in result_data['graph']['nodes']:
                            # store original node data as attributes (simple)
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
        if scan_id in output_queues:
            del output_queues[scan_id]
    return Response(generate(), mimetype='text/event-stream')

@app.route("/api/upload", methods=["POST"])
def upload_file():
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
        graph = graph_to_json(G, scan_info, show_services=False, show_infra=False, weak_highlight=False)
        return jsonify({"success": True, "graph": graph, "xml_file": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/download/<filename>")
def download_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

if __name__ == "__main__":
    print("=" * 60)
    print("Network Topology Mapper - server starting")
    print("=" * 60)
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Nmap installed: {check_nmap_installed()}")
    print(f"Open http://localhost:5000")
    app.run(debug=True, host="0.0.0.0", port=5000, threaded=True)
