#!/usr/bin/env python3
"""
Network Topology Mapper - updated with hostname/common/weak service toggles
"""

import os
import platform
import sys
import subprocess
import tempfile
import json
import ipaddress
import re
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

# Nmap needs root for some scan types (-sS, -O), so this app sometimes runs
# elevated and sometimes doesn't (see startup.py). A plain shared path like
# tempfile.gettempdir()/"network_mapper_uploads" gets created root:root the
# first time it runs elevated, and every later non-root run then fails to
# write into it with [Errno 13]. Namespacing by uid keeps root and normal
# runs in separate folders so they never collide.
try:
    _owner_id = os.getuid()
except AttributeError:
    # Windows: no getuid, and %TEMP% is already per-user, so no collision risk
    _owner_id = "user"
UPLOAD_FOLDER = Path(tempfile.gettempdir()) / f"network_mapper_uploads_{_owner_id}"
UPLOAD_FOLDER.mkdir(exist_ok=True, mode=0o700)
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

# -------------------------------
# Nmap Execution helpers (UPDATED)
# -------------------------------
def run_nmap(targets, options, scan_id, show_terminal=True, show_webpage=False):
    """
    Runs nmap with the options+targets list.
    Debug: prints the exact command executed so you can troubleshoot missing flags.
    """
    if not check_nmap_installed():
        raise RuntimeError("Nmap is not installed or not in PATH")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = UPLOAD_FOLDER / f"scan_{timestamp}.xml"

    # Build command: nmap -oX <file> [options...] [targets...]
    # Note: options is expected to be a list (flags and their args as separate items)
    cmd = ["nmap", "-oX", str(output_file)] + options + targets

    # DEBUG: print exact command to stdout so you can verify flags/order
    try:
        debug_cmd = " ".join(shlex_quote(p) for p in cmd)
    except Exception:
        # fallback if shlex_quote unavailable
        debug_cmd = " ".join(cmd)
    print(f"[DEBUG] Running nmap command: {debug_cmd}")

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )

        if show_webpage and scan_id:
            # start_scan creates this before the browser can connect; never
            # replace a queue the stream may already be reading from.
            output_queues.setdefault(scan_id, queue.Queue())

        stdout_lines = []
        stderr_lines = []

        # Read stdout in realtime and forward to console/queue if requested
        for line in iter(process.stdout.readline, ''):
            if line:
                stdout_lines.append(line)
                if show_terminal:
                    print(line.rstrip())
                if show_webpage and scan_id and scan_id in output_queues:
                    output_queues[scan_id].put(line.rstrip())

        process.stdout.close()

        # capture stderr too
        stderr = process.stderr.read()
        if stderr:
            stderr_lines.append(stderr)
            if show_terminal:
                print(stderr, file=sys.stderr)
            if show_webpage and scan_id and scan_id in output_queues:
                output_queues[scan_id].put(f"STDERR: {stderr}")

        process.stderr.close()
        return_code = process.wait()

        # No end-of-stream marker here: the caller still has to parse the XML
        # and queue __RESULT__ / __ERROR__, and the stream stops at whichever
        # of those it sees. An early marker made the stream end before the
        # graph was ever sent.
        if return_code != 0:
            error_msg = ''.join(stderr_lines) if stderr_lines else "Unknown error"
            raise RuntimeError(f"Nmap scan failed: {error_msg}")

        return str(output_file), ''.join(stdout_lines)

    except Exception as e:
        if show_webpage and scan_id and scan_id in output_queues:
            output_queues[scan_id].put(f"ERROR: {str(e)}")
        raise RuntimeError(f"Failed to run nmap: {str(e)}")


# small helper to safely quote args when printing (works on both Windows/Linux)
def shlex_quote(s):
    try:
        # prefer shlex.quote if available (POSIX)
        import shlex
        return shlex.quote(s)
    except Exception:
        # fallback: wrap containing spaces in double quotes
        return f"\"{s}\"" if " " in s else s


# -------------------------------
# XML Parsing (unchanged)
# -------------------------------
class NmapXmlError(ValueError):
    pass


def _explain_bad_xml(xml_file, parse_error):
    # Only runs once a file has already failed to parse. Looks for the damage
    # patterns seen in real corrupt scans so the message says what is wrong
    # with the file rather than just quoting the parser.
    problems = []
    try:
        with open(xml_file, encoding="utf-8", errors="replace") as f:
            text = f.read()

        # a start tag that stops mid-way and runs straight into the next tag
        cut_off = len(re.findall(r"<[A-Za-z_][\w:.-]*[^<>]*(?=<)", text))
        if cut_off:
            problems.append(f"{cut_off} entries are cut off partway through")

        addresses = []
        for chunk in text.split("<host ")[1:]:
            m = re.search(r'<address addr="([^"]+)" addrtype="ipv4"', chunk)
            if m:
                addresses.append(m.group(1))
        duplicates = len(addresses) - len(set(addresses))
        if duplicates:
            problems.append(f"{duplicates} host records repeat a host already listed earlier")
    except OSError:
        pass

    message = f"This isn't a readable Nmap XML file ({parse_error})."
    if problems:
        message += " The file is damaged: " + "; ".join(problems) + "."
    message += (" That usually means it was copied while the scan was still running, or two Nmap scans"
                " were writing to the same output file at once. Re-run the scan (one at a time, to its"
                " own -oX file) and upload the finished result.")
    return message


# Matches the CVE IDs NSE's "vuln" script category writes into its plain-text
# output (and, for table-based scripts like vulners, into <elem> text) -
# looked up across a host's whole XML block rather than one script's schema,
# since the scripts in that category don't all format their findings the same way.
CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.IGNORECASE)


def parse_nmap_xml(xml_file):
    G = nx.Graph()
    scan_info = {
        "scan_time": None,
        "nmap_version": None,
        "total_hosts": 0,
        "hosts_up": 0
    }

    try:
        tree = ET.parse(xml_file)
    except ET.ParseError as e:
        raise NmapXmlError(_explain_bad_xml(xml_file, e)) from e
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

        # CVE IDs found anywhere in this host's scripts (NSE "vuln" category,
        # run when the "Vulnerability Scan" option is checked). Only present
        # when that scan ran and something matched - most hosts get [].
        cves = sorted(set(m.upper() for m in CVE_RE.findall(ET.tostring(host, encoding="unicode"))))

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
                   ports=[],
                   cves=cves)

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
# Subnet / VLAN aware role detection
# -------------------------------
# Nmap has no visibility into 802.1Q VLAN tags (that's a layer-2 property only
# visible from a switch trunk port), so we can't recover real VLAN IDs. What we
# *can* recover reliably from an XML scan is which hosts share an IP subnet -
# in practice that lines up with VLAN boundaries almost always, since each
# VLAN is normally given its own subnet. So "VLAN" here == "detected subnet".
GATEWAY_HOSTNAME_HINTS = ("gateway", "router", "firewall", "-gw", "gw.", "fw.", "edge")
GATEWAY_VENDOR_HINTS = ("cisco", "mikrotik", "ubiquiti", "juniper", "fortinet",
                         "netgear", "tp-link", "huawei", "aruba", "paloalto",
                         "sonicwall", "draytek", "asus")
GATEWAY_PRODUCT_HINTS = ("pfsense", "opnsense", "routeros", "junos", "fortios",
                          "ios", "asa", "edgeos", "sonicos")


def _subnet_of_ip(ip, prefix_len):
    """Best-effort subnet for one IP. IPv6 hosts get grouped on /64 since the
    user-configurable prefix is meant for IPv4."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    prefix = prefix_len if addr.version == 4 else 64
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False))


def _subnet_sort_key(cidr):
    if cidr == "unknown":
        return (1, 0, 0)
    net = ipaddress.ip_network(cidr)
    return (0, int(net.network_address), net.prefixlen)


def _gateway_score(node_data, ip, network):
    """Heuristic confidence that a host is the router/firewall for its subnet."""
    try:
        if ipaddress.ip_address(ip).is_loopback:
            return 0
    except (ValueError, TypeError):
        pass
    score = 0
    if network is not None:
        try:
            addr = ipaddress.ip_address(ip)
            if addr == network.network_address + 1 or addr == network.broadcast_address - 1:
                score += 2
        except (ValueError, TypeError):
            pass
    hostname = (node_data.get("hostname") or "").lower()
    if any(h in hostname for h in GATEWAY_HOSTNAME_HINTS):
        score += 3
    vendor = (node_data.get("mac_vendor") or "").lower()
    if any(v in vendor for v in GATEWAY_VENDOR_HINTS):
        score += 1
    for port in node_data.get("ports", []):
        product = (port.get("product") or "").lower()
        if any(p in product for p in GATEWAY_PRODUCT_HINTS):
            score += 3
            break
    return score


def analyze_topology(G, subnet_prefix=24):
    """Returns (roles, subnet_of).

    roles: node_id -> list of role strings (unchanged role set, plus a
        subnet-relative "Gateway" determination instead of the old global
        ip.endswith('.1') guess).
    subnet_of: node_id -> CIDR string the host was grouped into.
    """
    roles = {}
    subnet_of = {}
    subnet_groups = {}
    subnet_networks = {}

    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") != "host":
            continue
        ip = node_data.get("ip") or node_id
        cidr = _subnet_of_ip(ip, subnet_prefix) or "unknown"
        subnet_of[node_id] = cidr
        subnet_groups.setdefault(cidr, []).append(node_id)
        if cidr != "unknown" and cidr not in subnet_networks:
            subnet_networks[cidr] = ipaddress.ip_network(cidr)

        node_roles = []
        ports = node_data.get("ports", [])
        port_numbers = [int(p["port"]) for p in ports] if ports else []
        services = [p.get("service", "").lower() for p in ports] if ports else []

        if 53 in port_numbers or "domain" in services:
            node_roles.append("DNS Server")
        if 67 in port_numbers or 68 in port_numbers or "dhcp" in services:
            node_roles.append("DHCP Server")
        dc_ports = [88, 389, 636, 3268, 3269]
        if any(p in port_numbers for p in dc_ports) or any(s in services for s in ("ldap", "kerberos")):
            node_roles.append("Domain Controller")
        if 80 in port_numbers or 443 in port_numbers or any(s in services for s in ("http", "https")):
            node_roles.append("Web Server")
        mail_ports = [25, 110, 143, 465, 587, 993, 995]
        if any(p in port_numbers for p in mail_ports) or any(s in services for s in ("smtp", "pop3", "imap")):
            node_roles.append("Mail Server")
        db_ports = [1433, 3306, 5432, 27017, 1521]
        if any(p in port_numbers for p in db_ports) or any(s in services for s in ("mysql", "postgresql", "mssql", "mongodb", "oracle")):
            node_roles.append("Database Server")
        file_ports = [139, 445, 2049]
        if any(p in port_numbers for p in file_ports) or any(s in services for s in ("smb", "netbios", "nfs")):
            node_roles.append("File Server")
        roles[node_id] = node_roles

    # Gateway detection is done per-subnet: the winning candidate(s) are
    # whichever host(s) in THAT subnet score highest, not a single global pick.
    for cidr, members in subnet_groups.items():
        network = subnet_networks.get(cidr)
        best_score = 0
        best_nodes = []
        for node_id in members:
            score = _gateway_score(G.nodes[node_id], G.nodes[node_id].get("ip") or node_id, network)
            if score > best_score:
                best_score, best_nodes = score, [node_id]
            elif score > 0 and score == best_score:
                best_nodes.append(node_id)
        if best_score > 0:
            for node_id in best_nodes:
                roles[node_id].append("Gateway")

    return roles, subnet_of

# -------------------------------
# Graph conversion + weak highlighting
# -------------------------------
WEAK_SERVICES = {"ftp","telnet","http","pop3","imap","smtp","tftp","rlogin","rsh","finger"}


def _is_weak_service(service_name):
    # Anchored match: "http" must be the whole name or the part before a
    # "-" (e.g. "http-proxy", "ftp-data"). A plain substring check also
    # matched the encrypted counterparts of these services - "https",
    # "ftps"/"sftp", "pop3s", "imaps" all contain one of the weak names -
    # which flagged secure services as insecure.
    name = (service_name or "").lower().strip()
    if not name:
        return False
    return any(name == weak or name.startswith(weak + "-") for weak in WEAK_SERVICES)

def _ip_sort_key(ip):
    try:
        addr = ipaddress.ip_address(ip)
        return (0, addr.version, int(addr))
    except ValueError:
        return (1, 0, str(ip))


def group_devices_by_mac(G, subnet_of):
    # A MAC address identifies one network card. Hosts that answered with the
    # same MAC are one device with several IPs (a router with a sub-interface
    # per VLAN, a NIC with an alias address, ...), so they become one node.
    # Hosts with no MAC stay individual - Nmap never reports one for the
    # machine it runs on, or for anything beyond a router.
    groups = {}
    for node_id, node_data in G.nodes(data=True):
        if node_data.get("type") != "host":
            continue
        mac = (node_data.get("mac") or "").upper()
        key = ("mac", mac) if mac else ("ip", node_id)
        groups.setdefault(key, []).append(node_id)
    devices = []
    for ids in groups.values():
        ids.sort(key=lambda nid: (_subnet_sort_key(subnet_of.get(nid, "unknown")), _ip_sort_key(nid)))
        devices.append(ids)
    return devices


def graph_to_json(G, scan_info, show_services=False, show_infra=False, weak_highlight=False, subnet_prefix=24):
    nodes = []
    links = []
    roles, subnet_of = analyze_topology(G, subnet_prefix)
    devices = group_devices_by_mac(G, subnet_of)

    subnet_list = sorted(
        {subnet_of.get(nid, "unknown") for ids in devices for nid in ids},
        key=_subnet_sort_key
    )
    vlan_index_of = {cidr: i for i, cidr in enumerate(subnet_list)}
    devices_per_subnet = {cidr: 0 for cidr in subnet_list}

    for ids in devices:
        primary = ids[0]
        members = [G.nodes[nid] for nid in ids]
        interfaces = []
        for nid in ids:
            cidr = subnet_of.get(nid, "unknown")
            interfaces.append({
                "ip": nid,
                "subnet": cidr,
                "vlan_index": vlan_index_of[cidr],
                "gateway": "Gateway" in roles.get(nid, [])
            })
        device_subnets = list(dict.fromkeys(i["subnet"] for i in interfaces))
        for cidr in device_subnets:
            devices_per_subnet[cidr] += 1

        hostname = next((m.get("hostname") for m in members if m.get("hostname")), None)
        node_roles = list(dict.fromkeys(r for nid in ids for r in roles.get(nid, [])))
        mac = next((m.get("mac") for m in members if m.get("mac")), None)
        vendor = next((m.get("mac_vendor") for m in members if m.get("mac_vendor")), None)
        best_os = max(members, key=lambda m: m.get("os_accuracy") or 0)
        cves = sorted(set(c for m in members for c in (m.get("cves") or [])))

        ports = []
        seen_ports = set()
        for m in members:
            for p in m.get("ports", []):
                key = (p.get("protocol"), p.get("port"))
                if key not in seen_ports:
                    seen_ports.add(key)
                    port_entry = dict(p)
                    # Always computed (not gated behind weak_highlight) so the
                    # client has it on every port and can decide when to show
                    # it - "Highlight Weak Services" is a display toggle, not
                    # something that should require a fresh scan/upload to
                    # take effect.
                    port_entry["weak"] = _is_weak_service(port_entry.get("service"))
                    ports.append(port_entry)

        label = hostname or " / ".join(ids)
        if "Gateway" in node_roles:
            label = f"{label} (Gateway)"

        nodes.append({
            "id": str(primary),
            "label": label,
            "type": "host",
            "ip": primary,
            "ips": ids,
            "interfaces": interfaces,
            "hostname": hostname,
            "os": best_os.get("os"),
            "os_accuracy": best_os.get("os_accuracy", 0),
            "mac": mac,
            "mac_vendor": vendor,
            "ports": ports,
            "open_ports_count": len(ports),
            "roles": node_roles,
            "subnet": interfaces[0]["subnet"],
            "vlan_index": interfaces[0]["vlan_index"],
            "vlan_indices": [vlan_index_of[c] for c in device_subnets],
            "cves": cves,
            "vulnerable": bool(cves)
        })

        # Add service nodes if requested
        if show_services:
            for port in ports:
                service_name = (port.get("service") or "").lower()
                service_label = f"{port['service']}:{port['port']}/{port['protocol']}"
                if port.get('product'):
                    service_label = f"{port['product']} ({port['service']}:{port['port']})"

                service_id = f"{primary}_{port['protocol']}_{port['port']}"
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
                if weak_highlight and _is_weak_service(service_name):
                    service_node["color"] = "#e74c3c"
                    service_node["risk"] = "weak"
                nodes.append(service_node)
                links.append({
                    "source": str(primary),
                    "target": service_id,
                    "relation": "provides"
                })

        # One line from the device to each VLAN/subnet it has an interface in.
        # Lines only ever run device -> its own subnet's hub, so isolated
        # VLANs can never end up wired together; a device with the same MAC on
        # two VLANs (e.g. a router) gets one line into each.
        if show_infra:
            for cidr in device_subnets:
                if cidr == "unknown":
                    continue
                is_gateway_here = any(i["gateway"] for i in interfaces if i["subnet"] == cidr)
                links.append({
                    "source": str(primary),
                    "target": f"subnet:{cidr}",
                    "relation": "gateway" if is_gateway_here else "member"
                })

    if show_infra:
        for cidr in subnet_list:
            if cidr == "unknown":
                continue
            nodes.append({
                "id": f"subnet:{cidr}",
                "label": cidr,
                "type": "subnet",
                "subnet": cidr,
                "vlan_index": vlan_index_of[cidr],
                "host_count": devices_per_subnet[cidr]
            })

    return {
        "nodes": nodes,
        "links": links,
        "scan_info": scan_info,
        "subnets": [
            {"cidr": cidr, "vlan_index": vlan_index_of[cidr], "host_count": devices_per_subnet[cidr]}
            for cidr in subnet_list
        ]
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

        # Output prefs & toggles
        show_terminal = data.get("show_terminal", True)
        show_webpage = data.get("show_webpage", False)
        hostname_detection = data.get("hostname_detection", False)
        common_services = data.get("common_services", False)
        weak_highlight = data.get("weak_highlight", False)
        show_infra = data.get("show_infra", False)
        subnet_prefix = int(data.get("subnet_prefix", 24) or 24)

        # Build target list
        target_list = [t.strip() for t in targets_raw.split(",") if t.strip()]

        # Build nmap options list (as tokens)
        options = []

        # --- PORT SELECTION (preserve exactly what user sets) ---
        port_flag_present = False
        if data.get("all_ports"):
            # all ports is -p-
            options.append("-p-")
            port_flag_present = True
        elif data.get("top_ports"):
            top = int(data.get("top_ports_count", 100))
            # top-ports is its own flag with arg
            options.extend(["--top-ports", str(top)])
            port_flag_present = True
        elif data.get("custom_ports"):
            options.extend(["-p", data.get("custom_ports")])
            port_flag_present = True
        else:
            # default behavior: do a full TCP scan (use SYN where available)
            # represent as explicit -sS and -p- so we don't rely on defaults
            # but keep -p- to indicate full TCP port coverage
            options.extend(["-p-", "-sS"])
            port_flag_present = True

        # Service/version detection
        if data.get("service_version"):
            options.append("-sV")

        # OS detection
        if data.get("os_detection"):
            options.append("-O")

        # SNMP quick UDP (light)
        script_list = []
        if data.get("snmp_scan"):
            # request UDP scan and ensure we include UDP scanning
            # but prefer not to overwrite -p/-p- if already set
            if "-sU" not in options:
                options.append("-sU")
            # if user hasn't set specific ports and hasn't set -p-, we add UDP 161
            if not any((opt == "-p-" or opt == "--top-ports" or opt == "-p") for opt in options):
                options.extend(["-p", "U:161"])
            else:
                # If -p exists and is a specific list, merge 161 if feasible
                for i, opt in enumerate(options):
                    if opt == "-p":
                        # merge into existing port string
                        options[i+1] = f"{options[i+1]},U:161"
                        break
            script_list.append("snmp-info")

        # NSE script scans if requested
        if data.get("script_scan"):
            script_list.append("default,discovery")

        # Vulnerability scan: NSE's "vuln" category, which checks services for
        # known CVEs. It's a safe category (no exploitation), but it runs a lot
        # of scripts against every open port, so it's noticeably slower.
        if data.get("vuln_scan"):
            script_list.append("vuln")

        # Hostname detection: reverse DNS, NetBIOS, DNS service probe
        if hostname_detection:
            # reverse DNS lookup
            options.append("-R")
            script_list.append("nbstat")
            script_list.append("broadcast-dns-service-discovery")

        # COMMON SERVICES: add TCP+UDP common ports as augmentation (do NOT override)
        if common_services:
            # ensure both TCP and UDP scans are requested
            # prefer SYN on non-windows, TCP-connect on windows
            if platform.system().lower().startswith("win"):
                if "-sT" not in options and "-sS" not in options:
                    options.append("-sT")
            else:
                if "-sS" not in options and "-sT" not in options:
                    options.append("-sS")
            # ensure UDP scan flag present
            if "-sU" not in options:
                options.append("-sU")

            # Common port lists (strings)
            tcp_ports = "21,22,23,25,53,67,68,80,110,139,143,161,389,443,445,3389,5353,8080,8443"
            udp_ports = "53,67,68,69,123,161,162,5353,1900"

            # If user explicitly asked for -p- or --top-ports, don't add another -p
            if any(opt == "-p-" or opt == "--top-ports" for opt in options):
                # nothing to merge; -p- already covers everything
                pass
            else:
                # If there's an explicit -p <list>, merge the T: and U: segments safely
                found_p_index = None
                for i, opt in enumerate(options):
                    if opt == "-p":
                        found_p_index = i
                        break

                if found_p_index is not None:
                    existing = options[found_p_index + 1]
                    # If existing already contains T: or U:, just append other segments
                    # else append T:... and U:... with a comma
                    merged = existing
                    # Avoid duplicating exact segments — keep simple merge
                    if "T:" not in merged:
                        merged = f"{merged},T:{tcp_ports}"
                    if "U:" not in merged:
                        merged = f"{merged},U:{udp_ports}"
                    options[found_p_index + 1] = merged
                else:
                    # No explicit -p present -> add a -p with both T: and U: lists
                    options.extend(["-p", f"T:{tcp_ports},U:{udp_ports}"])

        # Timing template
        timing = str(data.get("timing", "3"))
        options.append(f"-T{timing}")

        # Merge script_list if any (dedupe)
        if script_list:
            unique_scripts = ",".join(sorted(set(",".join(script_list).split(","))))
            options.extend(["--script", unique_scripts])

        # For safety, ensure targets are passed as separate args
        scan_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

        # DEBUG: show the final options array for troubleshooting
        print(f"[DEBUG] Final nmap options list: {options}")
        print(f"[DEBUG] Targets: {target_list}")

        # Run scan - streaming vs synchronous
        if show_webpage:
            output_queues[scan_id] = queue.Queue()

            def thread_scan():
                try:
                    xml_file, output = run_nmap(target_list, options, scan_id, show_terminal, show_webpage)
                    G, scan_info = parse_nmap_xml(xml_file)
                    graph = graph_to_json(G, scan_info, show_services=False, show_infra=show_infra, weak_highlight=weak_highlight, subnet_prefix=subnet_prefix)

                    # store results globally
                    nonlocal_vars = globals()
                    nonlocal_vars['current_graph'] = G
                    nonlocal_vars['current_scan_info'] = scan_info

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
            graph = graph_to_json(G, scan_info, show_services=False, show_infra=show_infra, weak_highlight=weak_highlight, subnet_prefix=subnet_prefix)

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
    subnet_prefix = int(request.args.get('subnet_prefix', 24) or 24)

    if current_graph is None:
        return jsonify({"nodes": [], "links": [], "scan_info": {}})

    graph = graph_to_json(current_graph, current_scan_info, show_services=show_services, show_infra=show_infra, weak_highlight=weak_highlight, subnet_prefix=subnet_prefix)
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
                    # thread_scan already stored the parsed graph in the
                    # globals; rebuilding it here from the already-processed
                    # (merged, relabelled) JSON would lose information.
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
        subnet_prefix = int(request.args.get('subnet_prefix', 24) or 24)
        show_infra = request.args.get('show_infra', '0') == '1'
        G, scan_info = parse_nmap_xml(str(filepath))
        current_graph = G
        current_scan_info = scan_info
        graph = graph_to_json(G, scan_info, show_services=False, show_infra=show_infra, weak_highlight=False, subnet_prefix=subnet_prefix)
        return jsonify({"success": True, "graph": graph, "xml_file": filename})
    except NmapXmlError as e:
        return jsonify({"error": str(e)}), 400
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
