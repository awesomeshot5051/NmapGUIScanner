let simulation, svg, g, link, node, label, currentGraph;
let eventSource = null;
let expandedNodes = new Set();
let showInfra = true;
let weakHighlightEnabled = false;
let width = 1200;
let height = 800;
let vlanCentroids = {};
let zoomBehavior;

// Roughly one inch (96 CSS px) of clear space between neighbouring nodes:
// node radius 14 + collision radius 62 on each side.
const NODE_COLLIDE_RADIUS = 62;
const HUB_COLLIDE_RADIUS = 50;
const SERVICE_COLLIDE_RADIUS = 30;

// Labels are sized in map units, so zooming out shrinks them along with
// everything else. Counter-scale them (partially) so they stay readable when
// zoomed out, but grow more slowly than the map when zoomed in - at zoom k the
// on-screen size is roughly 13px * k^0.15 instead of 13px * k.
// The base size lives in Style.css (.node-label), scaled by --label-scale.
let currentLabelScale = 1;

function labelScale(k) {
    return Math.max(0.3, Math.min(2.5, Math.pow(k, -0.85)));
}

function setLabelScale(scale) {
    currentLabelScale = scale;
    if (g) g.style('--label-scale', scale);
}

// Distance from a VLAN hub to its devices; grows with the number of devices
// so bigger VLANs get a bigger ring instead of a cramped one.
function ringRadius(deviceCount) {
    return Math.max(170, ((deviceCount || 0) * 2 * NODE_COLLIDE_RADIUS) / (2 * Math.PI));
}

// Script.js is loaded in <head>, so DOM lookups must wait for DOMContentLoaded;
// doing them at top level throws and aborts the rest of the script.
document.addEventListener('DOMContentLoaded', () => {
    checkNmap();
    initVisualization();

    const infraToggle = document.getElementById('toggleInfra');
    showInfra = infraToggle.checked;
    infraToggle.addEventListener('change', (e) => {
        showInfra = e.target.checked;
        refreshGraph();
    });

    const weakToggle = document.getElementById('toggle-weak-services');
    weakHighlightEnabled = weakToggle.checked;
    weakToggle.addEventListener('change', (e) => {
        weakHighlightEnabled = e.target.checked;
        // Just re-sync colors on whatever's already drawn - no need to
        // refetch or re-run the layout for a display-only toggle.
        if (currentGraph) updateVisualization(currentGraph, { reheat: 0, fit: false });
    });
});

function checkNmap() {
    fetch('/api/check-nmap')
        .then(res => res.json())
        .then(data => {
            if (!data.installed) {
                showStatus('Nmap not detected. Please install Nmap to run scans.', 'error');
            }
        });
}

function showStatus(message, type = 'info') {
    const container = document.getElementById('status-container');
    container.innerHTML = `<div class="status ${type}">${message}</div>`;
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('active', show);
}

function closeConsole() {
    document.getElementById('output-console').classList.remove('active');
}

function showConsole() {
    const console = document.getElementById('output-console');
    console.classList.add('active');
    const content = document.getElementById('output-console-content');
    content.innerHTML = '';
}

function appendConsoleOutput(text) {
    const content = document.getElementById('output-console-content');
    const line = document.createElement('div');
    line.className = 'output-console-line';
    line.textContent = text;
    content.appendChild(line);
    content.scrollTop = content.scrollHeight;
}

function refreshGraph() {
    if (!currentGraph) return;

    const subnetPrefix = document.getElementById('subnet_prefix').value || 24;
    fetch(`/api/graph?show_infra=${showInfra ? 1 : 0}&show_services=0&subnet_prefix=${subnetPrefix}`)
        .then(r => r.json())
        .then(data => {
            updateVisualization(data);
        });
}

function initVisualization() {
    const container = document.getElementById('graph');
    width = Math.max(1200, container.clientWidth);
    height = Math.max(800, container.clientHeight);

    svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    g = svg.append('g');

    zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            setLabelScale(labelScale(event.transform.k));
        });

    svg.call(zoomBehavior);

    // Initialize simulation
    simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id).distance(d => {
            const s = d.source || {}, t = d.target || {};
            if (s.type === 'service' || t.type === 'service') return 120;
            if (t.type === 'subnet') return ringRadius(t.host_count);
            return 200;
        }).strength(0.7))
        .force('charge', d3.forceManyBody().strength(d => {
            if (d.type === 'service') return -100;
            return d.type === 'subnet' ? -200 : -400;
        }))
        .force('collision', d3.forceCollide().radius(d => {
            if (d.type === 'service') return SERVICE_COLLIDE_RADIUS;
            return d.type === 'subnet' ? HUB_COLLIDE_RADIUS : NODE_COLLIDE_RADIUS;
        }).strength(1))
        .force('cluster', forceCluster());

    window.addEventListener('resize', () => {
        const w = Math.max(1200, container.clientWidth);
        const h = Math.max(800, container.clientHeight);
        width = w;
        height = h;
        svg.attr('width', w).attr('height', h);
        svg.attr('viewBox', `0 0 ${w} ${h}`);
        simulation.force('center', d3.forceCenter(w/2, h/2));
        simulation.alpha(0.3).restart();
    });
}

// -------------------- Top-level helpers (tooltip + drag) --------------------
function showTooltip(event, d) {
    hideTooltip();
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("left", (event.pageX + 12) + "px")
        .style("top",  (event.pageY - 12) + "px")
        .style("z-index", 10000);

    let content = `<div class="tooltip-title">${d.label || d.id}</div><div class="tooltip-content">`;
    if (d.type === "host") {
        if (d.interfaces && d.interfaces.length > 1) {
            content += `<strong>Interfaces (same MAC):</strong><br>` +
                d.interfaces.map(i => `&nbsp;&nbsp;${i.ip} &rarr; ${i.subnet}${i.gateway ? ' (gateway)' : ''}`).join('<br>') + '<br>';
        } else {
            if (d.ip) content += `<strong>IP:</strong> ${d.ip}<br>`;
            if (d.subnet) content += `<strong>Subnet/VLAN:</strong> ${d.subnet}<br>`;
        }
        if (d.hostname) content += `<strong>Hostname:</strong> ${d.hostname}<br>`;
        if (d.os) content += `<strong>OS:</strong> ${d.os} ${d.os_accuracy?`(${d.os_accuracy}%)`:''}<br>`;
        if (d.mac) content += `<strong>MAC:</strong> ${d.mac}<br>`;
        if (d.mac_vendor) content += `<strong>Vendor:</strong> ${d.mac_vendor}<br>`;
        if (d.roles && d.roles.length) content += `<strong>Roles:</strong> ${d.roles.join(", ")}<br>`;
        content += `<strong>Open Ports:</strong> ${d.open_ports_count || (d.ports && d.ports.length) || 0}<br>`;
        if (d.cves && d.cves.length) {
            // CVE ids only ever come from the server's CVE_RE match (CVE-####-####...),
            // so this is safe to drop straight into the link/text without escaping.
            content += `<strong style="color:#e74c3c">&#9888; Vulnerabilities:</strong><br>` +
                d.cves.map(id => `&nbsp;&nbsp;<a href="https://nvd.nist.gov/vuln/detail/${id}" target="_blank" rel="noopener noreferrer">${id}</a>`).join('<br>') +
                '<br>';
        }
        content += `<em>Click to toggle services</em>`;
    } else if (d.type === "subnet") {
        content += `<strong>Subnet / VLAN:</strong> ${d.subnet}<br>`;
        content += `<strong>Devices:</strong> ${d.host_count}<br>`;
    } else if (d.type === "service") {
        content += `<strong>Port:</strong> ${d.port}/${d.protocol || ''}<br>`;
        content += `<strong>Service:</strong> ${d.service || ''}<br>`;
        if (d.product) content += `<strong>Product:</strong> ${d.product}<br>`;
        if (d.version) content += `<strong>Version:</strong> ${d.version}<br>`;
        if (weakHighlightEnabled && d.weak) content += `<strong>&#9888; Weak / insecure service</strong><br>`;
    } else {
        // generic
        if (d.info) content += `${d.info}<br>`;
    }
    content += "</div>";
    tooltip.html(content);
}

function hideTooltip() {
    d3.selectAll(".tooltip").remove();
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    // keep positions fixed only if user wants; here we release to let simulation settle
    d.fx = null;
    d.fy = null;
}
// VLAN/subnet color palette - stable order, cycles if there are more subnets
// than colors. Gateway/DNS/trunk connections are now computed server-side,
// strictly within each detected subnet - see analyze_topology() in
// network_mapper_main.py. No client-side "connect everything" pass anymore.
const VLAN_COLORS = ['#667eea', '#2ecc71', '#f39c12', '#e74c3c', '#1abc9c', '#9b59b6', '#3498db', '#e67e22'];

function vlanColor(vlanIndex) {
    if (typeof vlanIndex !== 'number') return VLAN_COLORS[0];
    return VLAN_COLORS[vlanIndex % VLAN_COLORS.length];
}

function updateVlanLegend(graphData) {
    const container = document.getElementById('vlan-legend');
    if (!container) return;
    const subnets = graphData.subnets || [];
    container.innerHTML = subnets.map(s => `
        <div class="legend-item legend-vlan-item">
            <div class="legend-color" style="background: ${vlanColor(s.vlan_index)};"></div>
            <span>${s.cidr} (${s.host_count})</span>
        </div>
    `).join('');
}

// -------------------- updateVisualization (fast + stable) --------------------
function nodeFill(d) {
    if (d.type === 'host') return d.vulnerable ? '#e74c3c' : vlanColor(d.vlan_index);
    if (d.type === 'subnet') return vlanColor(d.vlan_index);
    if (d.type === 'service' && weakHighlightEnabled && d.weak) return '#e74c3c';
    return '#f093fb';
}

function labelOffset(d) {
    return (d.type === 'host' || d.type === 'subnet') ? -24 : -12;
}

// opts.reheat: how hard to re-run the layout (1 = full, lower = gentle nudge)
// opts.fit: zoom the view to fit everything once the layout settles
function updateVisualization(graphData, opts = {}) {
    if (!graphData || !graphData.nodes) {
        console.error('Invalid graph data');
        return;
    }

    currentGraph = graphData;
    const links = graphData.links || [];
    const nodes = graphData.nodes || [];

    // Cluster layout first, so new nodes can be seeded inside their own VLAN's
    // cluster instead of all starting on top of each other in the middle.
    vlanCentroids = computeVlanCentroids(graphData);
    nodes.forEach(n => {
        const target = clusterTarget(n);
        const cx = target ? target.x : width / 2;
        const cy = target ? target.y : height / 2;
        if (typeof n.x !== 'number') n.x = cx + (Math.random() - 0.5) * 120;
        if (typeof n.y !== 'number') n.y = cy + (Math.random() - 0.5) * 120;
    });

    // Normalize link key helper
    function linkKey(d) {
        const s = (typeof d.source === 'object') ? (d.source.id || d.source) : d.source;
        const t = (typeof d.target === 'object') ? (d.target.id || d.target) : d.target;
        return `${s}-${t}`;
    }

    // ---- LINKS ----
    const linkSel = g.selectAll('line.link')
        .data(links, linkKey);

    linkSel.exit().remove();

    const linkEnter = linkSel.enter()
        .append('line')
        .attr('class', d => `link ${d.relation || ''}`)
        .style('pointer-events', 'none'); // let clicks fall through to nodes

    const linkMerged = linkEnter.merge(linkSel);
    linkMerged.attr('class', d => `link ${d.relation || ''}`);

    // ---- NODES (grouped: shape + label) ----
    // Use <g> wrapper so shape+label move together (fixes label lag)
    const nodeSel = g.selectAll('g.node-group')
        .data(nodes, d => d.id);

    nodeSel.exit().remove();

    const nodeEnter = nodeSel.enter()
        .append('g')
        .attr('class', 'node-group')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
        );

    // hosts and services: circles
    nodeEnter.filter(d => d.type !== 'subnet').append('circle')
        .attr('class', 'node')
        .attr('r', d => d.type === 'host' ? 14 : 8)
        .attr('fill', nodeFill)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d){ showTooltip(event, d); })
        .on('mouseout', function(){ hideTooltip(); })
        .on('click', function(event, d){
            event.stopPropagation();
            if (d.type === 'host') toggleNodeServices(d);
        });

    // VLAN/subnet hubs: a rounded square in the VLAN's colour, captioned "VLAN"
    nodeEnter.filter(d => d.type === 'subnet').append('rect')
        .attr('class', 'node subnet-node')
        .attr('x', -28).attr('y', -16)
        .attr('width', 56).attr('height', 32)
        .attr('rx', 8)
        .attr('fill', nodeFill)
        .on('mouseover', function(event, d){ showTooltip(event, d); })
        .on('mouseout', function(){ hideTooltip(); });

    nodeEnter.filter(d => d.type === 'subnet').append('text')
        .attr('class', 'hub-caption')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .text('VLAN');

    // gold ring around gateway nodes - drawn between the node and its label
    // so the label always stays readable
    nodeEnter.append('circle')
        .attr('class', 'gateway-ring')
        .attr('r', 19)
        .style('display', d => isGateway(d) ? null : 'none');

    // label inside group
    nodeEnter.append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', labelOffset)
        .attr('fill', '#fff')
        .style('pointer-events', 'none')
        .text(d => d.label);

    const nodeMerged = nodeEnter.merge(nodeSel);

    // ---- Sync mutable visuals on updates (label, VLAN color, gateway ring) ----
    nodeMerged.select('text.node-label').text(d => d.label);
    nodeMerged.select('.node').attr('fill', nodeFill);
    nodeMerged.select('circle.gateway-ring')
        .style('display', d => isGateway(d) ? null : 'none');

    updateVlanLegend(graphData);

    // ---- Simulation ----
    simulation.nodes(nodes);
    simulation.force('link').links(links);

    simulation.on('tick', () => {
        // update links (d.source/d.target can be objects or ids resolved by force)
        linkMerged
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        // move groups: shape+label will follow together
        nodeMerged
            .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Once the layout has cooled down on its own, frame everything in view
    simulation.on('end', () => {
        if (opts.fit !== false) zoomToFit();
    });

    // Ensure links are under nodes and labels on top
    g.selectAll('line.link').lower();
    g.selectAll('g.node-group').raise();

    simulation.alpha(opts.reheat === undefined ? 1 : opts.reheat).alphaTarget(0).restart();
}

function isGateway(d) {
    return d.type === 'host' && d.roles && d.roles.includes('Gateway');
}

// Frame every node in the visible area. Never zooms out below 0.45 or in
// above 1, so spacing between nodes stays readable.
function zoomToFit() {
    if (!svg || !zoomBehavior || !currentGraph) return;
    const placed = currentGraph.nodes.filter(n => typeof n.x === 'number' && typeof n.y === 'number');
    if (!placed.length) return;

    const pad = 100;
    const x0 = Math.min(...placed.map(n => n.x)) - pad;
    const x1 = Math.max(...placed.map(n => n.x)) + pad;
    const y0 = Math.min(...placed.map(n => n.y)) - pad;
    const y1 = Math.max(...placed.map(n => n.y)) + pad;

    const k = Math.max(0.45, Math.min(1, 0.95 * Math.min(width / (x1 - x0), height / (y1 - y0))));
    const tx = width / 2 - k * (x0 + x1) / 2;
    const ty = height / 2 - k * (y0 + y1) / 2;

    svg.transition().duration(600)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

// One cluster centre per detected VLAN/subnet, spaced around a circle far
// enough apart that clusters (sized by how many devices they hold) can't
// overlap - so isolated VLANs visually separate instead of merging into a blob.
function computeVlanCentroids(graphData) {
    const subnets = (graphData.subnets || []).slice().sort((a, b) => a.vlan_index - b.vlan_index);
    const cx = width / 2, cy = height / 2;
    const centroids = {};
    if (subnets.length <= 1) {
        subnets.forEach(s => centroids[s.vlan_index] = { x: cx, y: cy });
        return centroids;
    }
    const outer = Math.max(...subnets.map(s => ringRadius(s.host_count) + NODE_COLLIDE_RADIUS));
    const gap = 80;
    const radius = (2 * outer + gap) / (2 * Math.sin(Math.PI / subnets.length));
    subnets.forEach((s, i) => {
        const angle = (i / subnets.length) * 2 * Math.PI - Math.PI / 2;
        centroids[s.vlan_index] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    return centroids;
}

// Where a node wants to sit: its VLAN's centre, or midway between the centres
// of every VLAN it belongs to (a router with a leg in two VLANs sits between).
function clusterTarget(d) {
    if (d.type !== 'host' && d.type !== 'subnet') return null;
    const indices = (d.vlan_indices && d.vlan_indices.length) ? d.vlan_indices : [d.vlan_index];
    const points = indices.map(i => vlanCentroids[i]).filter(Boolean);
    if (!points.length) return null;
    return {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length
    };
}

// Custom D3 force: pulls hosts toward their VLAN(s), and hubs firmly to the
// middle of their VLAN so the devices ring around them.
function forceCluster() {
    let nodes;
    function force(alpha) {
        for (const d of nodes) {
            const target = clusterTarget(d);
            if (!target) continue;
            const strength = (d.type === 'subnet' ? 0.5 : 0.08) * alpha;
            d.vx += (target.x - d.x) * strength;
            d.vy += (target.y - d.y) * strength;
        }
    }
    force.initialize = (_nodes) => { nodes = _nodes; };
    return force;
}

function toggleNodeServices(hostNode) {
    if (!currentGraph || !hostNode) return;

    const nodeId = hostNode.id;
    const existingServices = currentGraph.nodes.filter(n => n.parent === nodeId);

    if (existingServices.length > 0) {
        // Collapse - remove service nodes
        currentGraph.nodes = currentGraph.nodes.filter(n => n.parent !== nodeId);
        currentGraph.links = currentGraph.links.filter(l => {
            const sourceId = l.source.id || l.source;
            const targetId = l.target.id || l.target;
            return sourceId !== nodeId || !existingServices.find(s => s.id === targetId);
        });
        expandedNodes.delete(nodeId);
    } else if (hostNode.ports && hostNode.ports.length > 0) {
        // Expand - add service nodes
        const distance = 120;
        const ports = hostNode.ports;

        ports.forEach((port, i) => {
            const angle = (i / ports.length) * 2 * Math.PI;
            const serviceId = `${nodeId}-service-${port.port}-${port.protocol}`;
            const serviceLabel = port.product ?
                `${port.product} (${port.service}:${port.port})` :
                `${port.service}:${port.port}/${port.protocol}`;

            // Add service node positioned around the host
            currentGraph.nodes.push({
                id: serviceId,
                label: serviceLabel,
                type: 'service',
                port: port.port,
                protocol: port.protocol,
                service: port.service,
                product: port.product,
                version: port.version,
                weak: !!port.weak,
                parent: nodeId,
                x: hostNode.x + distance * Math.cos(angle),
                y: hostNode.y + distance * Math.sin(angle)
            });

            // Add link from host to service
            currentGraph.links.push({
                source: nodeId,
                target: serviceId,
                relation: 'provides'
            });
        });

        expandedNodes.add(nodeId);
    }

    // gentle nudge only - don't re-run the whole layout or move the view
    updateVisualization(currentGraph, { reheat: 0.3, fit: false });
}

function displayScanInfo(scanInfo) {
    let info = `<div class="scan-info">`;
    info += `<div class="section-title">Scan Information</div>`;
    if (scanInfo.scan_time) info += `<div class="scan-info-item"><span class="scan-info-label">Scan Time:</span><span class="scan-info-value">${scanInfo.scan_time}</span></div>`;
    if (scanInfo.nmap_version) info += `<div class="scan-info-item"><span class="scan-info-label">Nmap Version:</span><span class="scan-info-value">${scanInfo.nmap_version}</span></div>`;
    info += `<div class="scan-info-item"><span class="scan-info-label">Total Hosts:</span><span class="scan-info-value">${scanInfo.total_hosts}</span></div>`;
    info += `<div class="scan-info-item"><span class="scan-info-label">Hosts Up:</span><span class="scan-info-value">${scanInfo.hosts_up}</span></div>`;
    info += `</div>`;
    document.getElementById('scan-info-container').innerHTML = info;
}

async function startScan() {
    const targets = document.getElementById('targets').value.trim();
    if (!targets) {
        showStatus('Please enter target addresses', 'error');
        return;
    }

    const portMode = document.querySelector('input[name="port_mode"]:checked').value;
    const showTerminal = document.getElementById('show_terminal').checked;
    const showWebpage = document.getElementById('show_webpage').checked;

    // NEW toggles
    const hostnameToggle = document.getElementById('toggle-hostnames').checked;
    const commonServicesToggle = document.getElementById('toggle-common-services').checked;
    const weakServicesToggle = document.getElementById('toggle-weak-services').checked;

    const scanData = {
        targets: targets,
        service_version: document.getElementById('service_version').checked,
        os_detection: document.getElementById('os_detection').checked,
        script_scan: document.getElementById('script_scan').checked,
        snmp_scan: document.getElementById('snmp_scan').checked,
        vuln_scan: document.getElementById('vuln_scan').checked,
        timing: document.getElementById('timing').value,
        show_terminal: showTerminal,
        show_webpage: showWebpage,
        // NEW flags
        hostname_detection: hostnameToggle,
        common_services: commonServicesToggle,
        weak_highlight: weakServicesToggle,
        show_infra: showInfra,
        subnet_prefix: parseInt(document.getElementById('subnet_prefix').value || 24, 10)
    };

    if (portMode === 'top') {
        scanData.top_ports = true;
        scanData.top_ports_count = parseInt(document.getElementById('top_ports_count').value);
    } else if (portMode === 'all') {
        scanData.all_ports = true;
    } else if (portMode === 'custom') {
        scanData.custom_ports = document.getElementById('custom_ports').value.trim();
    }

    showLoading(true);
    showStatus('Scanning network...', 'info');
    document.getElementById('scan-btn').disabled = true;

    if (showWebpage) {
        showConsole();
        appendConsoleOutput('Starting Nmap scan...');
    }

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scanData)
        });

        const data = await response.json();

        if (data.error) {
            if (data.error.includes('OS detection') || data.error.includes('Failed to run nmap')) {
                showStatus('OS detection requires root/administrator privileges. Try running without OS detection or with elevated privileges.', 'error');
            } else {
                showStatus(data.error, 'error');
            }
            if (showWebpage) {
                appendConsoleOutput('ERROR: ' + data.error);
            }
            showLoading(false);
            document.getElementById('scan-btn').disabled = false;
        } else if (data.streaming && data.scan_id) {
            eventSource = new EventSource(`/api/scan-stream/${data.scan_id}`);

            eventSource.onmessage = function(event) {
                const msg = JSON.parse(event.data);

                if (msg.output) {
                    appendConsoleOutput(msg.output);
                } else if (msg.success) {
                    showStatus('Scan completed successfully!', 'success');
                    updateVisualization(msg.graph);
                    displayScanInfo(msg.graph.scan_info);
                    eventSource.close();
                    showLoading(false);
                    document.getElementById('scan-btn').disabled = false;
                } else if (msg.error) {
                    showStatus(msg.error, 'error');
                    appendConsoleOutput('ERROR: ' + msg.error);
                    eventSource.close();
                    showLoading(false);
                    document.getElementById('scan-btn').disabled = false;
                }
            };

            eventSource.onerror = function() {
                showStatus('Connection to server lost', 'error');
                eventSource.close();
                showLoading(false);
                document.getElementById('scan-btn').disabled = false;
            };
        } else {
            showStatus('Scan completed successfully!', 'success');
            updateVisualization(data.graph);
            displayScanInfo(data.graph.scan_info);
            showLoading(false);
            document.getElementById('scan-btn').disabled = false;
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        if (showWebpage) {
            appendConsoleOutput('ERROR: ' + error.message);
        }
        showLoading(false);
        document.getElementById('scan-btn').disabled = false;
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) return;

    showLoading(true);
    showStatus('Parsing XML file...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    const subnetPrefix = document.getElementById('subnet_prefix').value || 24;
    const uploadUrl = `/api/upload?show_infra=${showInfra ? 1 : 0}&subnet_prefix=${subnetPrefix}`;

    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            showStatus(data.error, 'error');
        } else {
            showStatus('File loaded successfully!', 'success');
            updateVisualization(data.graph);
            displayScanInfo(data.graph.scan_info);
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
        fileInput.value = '';
    }
}

function resetZoom() {
    zoomToFit();
}

function exportData() {
    if (!currentGraph) {
        showStatus('No data to export', 'error');
        return;
    }

    const dataStr = JSON.stringify(currentGraph, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `network_topology_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showStatus('Data exported successfully!', 'success');
}

// -------------------- Export as image (PNG / JPG / SVG) --------------------
// Style.css isn't available to a standalone SVG file, so the computed style of
// every element is copied onto the exported copy.
const EXPORT_STYLE_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
    'stroke-linejoin', 'paint-order', 'opacity', 'display',
    'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor'
];
const SVG_NS = 'http://www.w3.org/2000/svg';

function inlineComputedStyles(live, clone) {
    const computed = getComputedStyle(live);
    EXPORT_STYLE_PROPS.forEach(p => clone.style.setProperty(p, computed.getPropertyValue(p)));
    for (let i = 0; i < live.children.length; i++) {
        inlineComputedStyles(live.children[i], clone.children[i]);
    }
}

function svgEl(name, attrs, text) {
    const e = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
    if (text !== undefined) e.textContent = text;
    return e;
}

// Standalone copy of the WHOLE map (not just the visible part), framed with
// padding, a background and a VLAN legend.
function buildExportSvg() {
    const gNode = g.node();
    const savedScale = currentLabelScale;
    const pad = 60;

    // Size the labels as the fit-to-window view would, not as whatever zoom
    // level the user happens to be at right now.
    let bbox = gNode.getBBox();
    const fitK = Math.max(0.45, Math.min(1, Math.min(width / (bbox.width + 2 * pad), height / (bbox.height + 2 * pad))));
    setLabelScale(labelScale(fitK));
    bbox = gNode.getBBox();

    const subnets = (currentGraph && currentGraph.subnets) || [];
    const legendH = (subnets.length + 1) * 26 + 24;
    const vbX = bbox.x - pad;
    const vbY = bbox.y - pad - legendH;
    const vbW = Math.max(bbox.width + 2 * pad, 320);
    const vbH = bbox.height + 2 * pad + legendH;

    const clone = svg.node().cloneNode(true);
    const cloneG = clone.firstElementChild;
    cloneG.removeAttribute('transform');      // undo the on-screen pan/zoom
    cloneG.style.removeProperty('--label-scale');
    inlineComputedStyles(gNode, cloneG);
    setLabelScale(savedScale);

    const defs = svgEl('defs', {});
    const gradient = svgEl('linearGradient', { id: 'export-bg', x1: 0, y1: 0, x2: 1, y2: 1 });
    gradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#1a1a2e' }));
    gradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#16213e' }));
    defs.appendChild(gradient);
    clone.insertBefore(defs, cloneG);
    clone.insertBefore(svgEl('rect', { x: vbX, y: vbY, width: vbW, height: vbH, fill: 'url(#export-bg)' }), cloneG);

    const legend = svgEl('g', {
        'font-family': getComputedStyle(document.body).fontFamily,
        'font-size': 15,
        fill: '#e0e0e0'
    });
    subnets.forEach((s, i) => {
        const y = vbY + 30 + i * 26;
        legend.appendChild(svgEl('rect', { x: vbX + 24, y: y - 13, width: 16, height: 16, rx: 4, fill: vlanColor(s.vlan_index) }));
        legend.appendChild(svgEl('text', { x: vbX + 50, y }, `${s.cidr} (${s.host_count} devices)`));
    });
    const gy = vbY + 30 + subnets.length * 26;
    legend.appendChild(svgEl('circle', { cx: vbX + 32, cy: gy - 5, r: 8, fill: 'none', stroke: '#ffd700', 'stroke-width': 2 }));
    legend.appendChild(svgEl('text', { x: vbX + 50, y: gy }, 'Gateway'));
    clone.appendChild(legend);

    return { clone, vbX, vbY, vbW, vbH };
}

function serializeExportSvg(built, pixelScale) {
    const c = built.clone;
    c.setAttribute('viewBox', `${built.vbX} ${built.vbY} ${built.vbW} ${built.vbH}`);
    c.setAttribute('width', Math.round(built.vbW * pixelScale));
    c.setAttribute('height', Math.round(built.vbH * pixelScale));
    return new XMLSerializer().serializeToString(c);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('could not render the map to an image'));
        img.src = src;
    });
}

async function exportImage() {
    if (!currentGraph || !currentGraph.nodes || !currentGraph.nodes.length) {
        showStatus('No data to export', 'error');
        return;
    }

    const format = document.getElementById('export-format').value;
    const filename = `network_topology_${Date.now()}.${format}`;

    try {
        const built = buildExportSvg();

        if (format === 'svg') {
            const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeExportSvg(built, 1);
            downloadBlob(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), filename);
        } else {
            // 2x for sharpness, capped so a very large map can't exceed browser canvas limits
            const scale = Math.min(2, 8000 / Math.max(built.vbW, built.vbH), Math.sqrt(16e6 / (built.vbW * built.vbH)));
            const svgText = serializeExportSvg(built, scale);
            const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText));

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(built.vbW * scale);
            canvas.height = Math.round(built.vbH * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

            const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92));
            if (!blob) throw new Error('the browser could not encode the image');
            downloadBlob(blob, filename);
        }
        showStatus(`Map exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
        showStatus('Export failed: ' + error.message, 'error');
    }
}