# What Exactly does this do?

Network Topology Mapper runs Nmap for you and turns the result into a map you can look at. You give it some addresses, it scans them, and instead of a few hundred lines of text you get a diagram. Every device is a dot, every subnet gets its own colour and its own cluster, and clicking a device shows what it's running.

It also opens scans you already have. If someone sends you an Nmap XML file, you can drop it in and get the same map without scanning anything.

This page goes through what it does in some detail. The [README](README.md) has the short version and the install steps.

## How it works

It's a small Python (Flask) app that runs on your own machine, and you use it through a browser at `http://localhost:5000`. When you start a scan, the app runs `nmap` as a normal subprocess and asks it to write its results as XML. The app reads that XML, works out which devices belong together, and hands the result to the page, where D3.js draws it.

Your scan data stays on your machine. The one thing the page fetches from outside is the D3 library itself, which is loaded from a public CDN, so the browser needs internet access for that.

## Running a scan

**Targets.** Type one or more targets separated by commas: single addresses, CIDR ranges like `192.168.1.0/24`, or hostnames. `192.168.1.0/24, 10.0.0.1` works.

**Ports.** Pick one of three:

- Top ports, with a number you can change. The default is the top 100.
- All ports, 1 through 65535.
- A custom list, like `22,80,443,8080`.

**Options.** Each of these is a checkbox that turns on the matching Nmap behaviour:

- *Service Version Detection* (`-sV`) asks each open port what software is behind it, so you see "OpenSSH 9.2" instead of just "ssh".
- *OS Detection* (`-O`) tries to guess the operating system. It needs root or administrator rights.
- *Script Scanning* runs Nmap's `default` and `discovery` script categories.
- *SNMP Discovery* scans UDP port 161 and runs the `snmp-info` script.
- *Attempt Hostname Detection* forces reverse DNS lookups on every address and also runs the NetBIOS (`nbstat`) and DNS service discovery scripts. This is what fills in names for devices that would otherwise only show an IP.
- *Detect Common TCP & UDP Services* turns on UDP scanning and, if you gave a custom port list, adds a fixed set of common TCP and UDP ports to it (FTP, SSH, Telnet, SMTP, DNS, DHCP, HTTP, SMB, RDP, mDNS, and so on). UDP scans are slow, so expect this one to take a while.
- *Timing* is Nmap's T0 to T5 template, from Paranoid to Insane. T3 is the default.

**Watching it run.** Nmap's output can go to the terminal where you started the app, into a panel on the page as it happens, or both. If you don't tick "Show Output on Webpage", the page just shows a spinner until the scan is done.

**If Nmap isn't installed,** the page tells you when it loads. Uploading existing scans still works without it.

**Permissions.** OS detection and SYN scans need elevated rights. `startup.py` handles that: it re-launches itself with `sudo` on Linux or a UAC prompt on Windows, and it runs the setup script first if there's no virtual environment yet. The setup scripts on their own don't elevate.

## Loading an existing scan

Choose an Nmap XML file (the `-oX` format, up to 50 MB) and it's parsed the same way as a live scan. This is the way to go if you scanned from somewhere else, for example a server with no browser, or a scheduled job that writes XML every night.

## What the map shows

**Devices.** Only hosts that Nmap reported as up are drawn. Each one is a circle, labelled with its hostname if one was found and its IP address if not. Only open ports are kept. Closed and filtered ports are ignored.

**Subnets.** Devices are grouped by subnet. Each subnet gets its own colour, its own cluster on the map, and a labelled hub in the middle that the devices sit around. The legend lists every subnet with a count of the devices in it. There are eight colours, and they repeat if you have more subnets than that.

The "Subnet / VLAN grouping" box sets the prefix length used for grouping. It defaults to 24, so `192.168.1.x` and `192.168.2.x` land in different groups. It accepts 8 to 30 and applies to the whole map, so you can't mix /24 and /16 groups. IPv6 addresses are always grouped by /64. Changing it takes effect the next time you scan or load a file.

One thing to be clear about: the tool calls these groups VLANs, but they are really subnets. Nmap has no way to see 802.1Q VLAN tags, since those only exist on the switch side. Most networks give each VLAN its own subnet, so the two line up in practice. If yours doesn't do that (two VLANs sharing a subnet, or one VLAN spread over several), the picture will be wrong in the same way.

**One device, several addresses.** A router with an interface in every VLAN will answer on a different IP in each one, but all of those replies carry the same MAC address. The tool spots that and draws a single node instead of one per address. It sits between the subnets it belongs to, gets a line to each subnet's hub, and its tooltip lists every interface with the subnet it's in. This is how a duplicate MAC address ends up as one device with several subnets instead of several separate devices.

Nmap only reports a MAC address for machines on the same local network segment as the one running the scan, and never for the machine it's running on. Devices without a MAC are never merged, so a router seen from another subnet may still show up as several dots.

**Network connections.** The lines and hubs come from the "Show Network Connections" checkbox, which is on by default. Turn it off if you just want the dots. These lines mean "this device is in this subnet". They don't represent cables or the route packets take.

**Gateways.** For each subnet the tool guesses which device is the gateway and puts a gold ring around it. It's a scoring system. A device gets points for having the first or last usable address in the subnet (`.1` or `.254` in a /24), for a hostname containing things like "gateway", "router" or "firewall", for a MAC vendor that makes network gear (Cisco, MikroTik, Ubiquiti, Fortinet and similar), and for a service banner naming a router or firewall OS such as pfSense or RouterOS. The highest score in each subnet wins, and a tie marks both. It's a guess and it's usually right, but check it before you rely on it.

**Roles.** Based on open ports and service names, devices are tagged as DNS Server, DHCP Server, Domain Controller (Kerberos and LDAP ports), Web Server, Mail Server, Database Server or File Server (SMB and NFS). These show up in the tooltip.

**Services.** Click a device and its open ports appear around it as pink dots, labelled with the product name when Nmap found one. Click the device again to collapse them.

**Tooltips.** Hover over a device for its IP addresses, subnet, hostname, OS guess with Nmap's confidence percentage, MAC address and vendor, roles, and number of open ports.

**Moving around.** Drag devices to rearrange them, scroll to zoom, and drag the background to pan. "Reset View" fits the whole map back into the window. Labels are scaled so they stay readable when you zoom out. After a scan, a panel on the left shows the scan time, the Nmap version, and how many hosts were scanned and how many were up.

## Getting results out

- **Export JSON** saves the graph the page is drawing: devices, interfaces, subnets, ports and links. Handy if you want to feed it into something else.
- **Export Image** saves the whole map, not only the part on screen, as PNG, JPG or SVG. It gets a dark background and a legend listing the subnets and the gateway marker. Use SVG if you want to edit it afterwards.
- The XML from each live scan is kept in a temporary folder and can be downloaded again from `/api/download/<filename>`.
- Scans can also be started without the page, by posting to `/api/scan`. The README has the details.

## How is this different from Zenmap?

Zenmap is the official GUI that comes with Nmap. It's a good tool and this one isn't a replacement for it. They're trying to do different things.

Zenmap is a front end for Nmap. You build a command (or pick a saved profile), run it, and read the output. Everything Nmap can do is available, and the graphical parts are there to help you read the results. This tool is a mapper. The map is the main thing, and the scan options exist to feed it.

Where this tool does something Zenmap doesn't:

- **It groups by subnet.** Zenmap's Topology tab is built from traceroute data and centres everything on the machine that ran the scan. That's great for seeing hops. It doesn't tell you at a glance which devices live in which subnet, which is the question you're usually asking on a network with several VLANs. Here, every subnet is its own colour and cluster.
- **It merges multi-homed devices.** A router or firewall with a leg in several VLANs shows up as one device with several interfaces, sitting between the subnets it connects.
- **It guesses gateways and roles.** You see which box is probably the router and which are probably DNS, mail or file servers, without reading port lists.
- **It exports the map as an image,** with a legend, ready to drop into a document.
- **It runs in a browser,** with live scan output beside the map. Zenmap is a desktop application.

Where Zenmap is better, and you should use it instead:

- **Full control.** Zenmap lets you type any Nmap command. This tool has a fixed set of checkboxes. There's no option for skipping host discovery (`-Pn`), no traceroute, and you can't choose individual scripts.
- **Working with several scans.** Zenmap can keep multiple scans open, save them, and compare two of them to show what changed. This tool holds one scan at a time, and a new scan or upload replaces it. There's no comparison.
- **Detail per host.** Zenmap shows the complete raw output and a full details page for each host. This tool shows a tooltip.
- **Maturity.** Zenmap is maintained by the Nmap project and has been used for years. This is a much smaller project.

They also work together. You can run a carefully built scan in Zenmap or on the command line, save it as XML, and upload it here to get the map.

## Limits worth knowing

- One scan lives in memory at a time, and it's shared. It's meant to be used by one person at a time.
- The lines on the map show which subnet a device belongs to. They aren't discovered links, so don't read them as a wiring diagram.
- Gateway and role labels are guesses from ports, names and vendors. They can be wrong.
- Subnet grouping uses one prefix length for everything.
