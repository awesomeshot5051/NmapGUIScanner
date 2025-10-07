let simulation, svg, g, link, node, label, currentGraph;
let eventSource = null;
let expandedNodes = new Set();
let showInfra = false;
let width = 1200;
let height = 800;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkNmap();
    initVisualization();
});

document.getElementById('toggleInfra').addEventListener('change', (e) => {
    showInfra = e.target.checked;
    refreshGraph();
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

    fetch(`/api/graph?show_infra=${showInfra ? 1 : 0}&show_services=0`)
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

    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    // Initialize simulation
    simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id).distance(d => {
            if (!d.source || !d.target) return 100;
            const sourceType = d.source.type || d.source;
            const targetType = d.target.type || d.target;
            return (sourceType === 'service' || targetType === 'service') ? 60 : 150;
        }).strength(0.5))
        .force('charge', d3.forceManyBody().strength(d => {
            return d.type === 'service' ? -100 : -300;
        }))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(d => {
            return d.type === 'service' ? 20 : 40;
        }));

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
        if (d.ip) content += `<strong>IP:</strong> ${d.ip}<br>`;
        if (d.hostname) content += `<strong>Hostname:</strong> ${d.hostname}<br>`;
        if (d.os) content += `<strong>OS:</strong> ${d.os} ${d.os_accuracy?`(${d.os_accuracy}%)`:''}<br>`;
        if (d.mac) content += `<strong>MAC:</strong> ${d.mac}<br>`;
        if (d.mac_vendor) content += `<strong>Vendor:</strong> ${d.mac_vendor}<br>`;
        if (d.roles && d.roles.length) content += `<strong>Roles:</strong> ${d.roles.join(", ")}<br>`;
        content += `<strong>Open Ports:</strong> ${d.open_ports_count || (d.ports && d.ports.length) || 0}<br>`;
        content += `<em>Click to toggle services</em>`;
    } else if (d.type === "service") {
        content += `<strong>Port:</strong> ${d.port}/${d.protocol || ''}<br>`;
        content += `<strong>Service:</strong> ${d.service || ''}<br>`;
        if (d.product) content += `<strong>Product:</strong> ${d.product}<br>`;
        if (d.version) content += `<strong>Version:</strong> ${d.version}<br>`;
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
function preprocessGraph(graphData) {
    if (!graphData || !graphData.nodes || !graphData.links) return graphData;

    const dhcpNodes = graphData.nodes.filter(n =>
        n.roles && n.roles.some(r => r.toLowerCase().includes('dhcp'))
    );
    const gatewayNodes = graphData.nodes.filter(n =>
        n.roles && n.roles.some(r => r.toLowerCase().includes('gateway'))
    );

    // Helper to avoid duplicate links
    const linkSet = new Set(graphData.links.map(l =>
        `${l.source.id || l.source}-${l.target.id || l.target}`
    ));

    function addLink(a, b) {
        const key1 = `${a.id}-${b.id}`;
        const key2 = `${b.id}-${a.id}`;
        if (!linkSet.has(key1) && !linkSet.has(key2) && a.id !== b.id) {
            graphData.links.push({ source: a.id, target: b.id });
            linkSet.add(key1);
        }
    }

    // Connect DHCP servers to all other hosts
    for (const dhcp of dhcpNodes) {
        for (const node of graphData.nodes) {
            if (node.id !== dhcp.id) addLink(dhcp, node);
        }
    }

    // Connect gateways to all other hosts
    for (const gw of gatewayNodes) {
        for (const node of graphData.nodes) {
            if (node.id !== gw.id) addLink(gw, node);
        }
    }

    return graphData;
}

// -------------------- updateVisualization (fast + stable) --------------------
function updateVisualization(graphData) {
    if (!graphData || !graphData.nodes) {
        console.error('Invalid graph data');
        return;
    }

    currentGraph = graphData;
    const links = graphData.links || [];
    const nodes = graphData.nodes || [];

    // Initialize positions if missing
    nodes.forEach(n => {
        if (typeof n.x !== 'number') n.x = width / 2 + (Math.random() - 0.5) * 100;
        if (typeof n.y !== 'number') n.y = height / 2 + (Math.random() - 0.5) * 100;
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
        .attr('class', 'link')
        .attr('stroke', '#999')
        .attr('stroke-width', 1.5)
        .style('pointer-events', 'none'); // let clicks fall through to nodes

    const linkMerged = linkEnter.merge(linkSel);

    // ---- NODES (grouped: circle + label) ----
    // Use <g> wrapper so circle+label move together (fixes label lag)
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

    // circle inside group
    nodeEnter.append('circle')
        .attr('class', 'node')
        .attr('r', d => d.type === 'host' ? 14 : 8)
        .attr('fill', d => d.type === 'host' ? '#667eea' : '#f093fb')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d){ showTooltip(event, d); })
        .on('mouseout', function(){ hideTooltip(); })
        .on('click', function(event, d){
            event.stopPropagation();
            if (d.type === 'host') toggleNodeServices(d);
        });

    // label inside group
    nodeEnter.append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', d => d.type === 'host' ? -20 : -12)
        .attr('fill', '#fff')
        .attr('font-size', '10px')
        .style('pointer-events', 'none')
        .text(d => d.label);

    const nodeMerged = nodeEnter.merge(nodeSel);

    // ---- Sync text on updates (in case labels change) ----
    nodeMerged.select('text.node-label').text(d => d.label);

    // ---- Simulation ----
    simulation.nodes(nodes);
    simulation.force('link').links(links);

    // Gentle restart to avoid jank; lower heavy resets
    simulation.alphaTarget(0.2).restart();
    setTimeout(() => simulation.alphaTarget(0), 600);

    simulation.on('tick', () => {
        // update links (d.source/d.target can be objects or ids resolved by force)
        linkMerged
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        // move groups: circle+label will follow together
        nodeMerged
            .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Ensure links are under nodes and labels on top
    g.selectAll('line.link').lower();
    g.selectAll('g.node-group').raise();
    simulation.alphaTarget(0.1).restart();
    setTimeout(() => simulation.stop(), 4000);
}
// --- Force setup (place this once, outside the updateVisualization) ---
simulation = d3.forceSimulation()
    .force('link', d3.forceLink()
        .id(d => d.id)
        .distance(d => d.type === 'service' ? 60 : 150)
        .strength(0.3)
    )
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => d.type === 'host' ? 30 : 20).strength(1));

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
        const distance = 100;
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

    updateVisualization(currentGraph);
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
        timing: document.getElementById('timing').value,
        show_terminal: showTerminal,
        show_webpage: showWebpage,
        // NEW flags
        hostname_detection: hostnameToggle,
        common_services: commonServicesToggle,
        weak_highlight: weakServicesToggle
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
                    const processed = preprocessGraph(msg.graph); // optional infra connect on client
                    updateVisualization(processed);
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
            const processed = preprocessGraph(data.graph); // client-side infra linking
            updateVisualization(processed);
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
}7

async function uploadFile() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) return;

    showLoading(true);
    showStatus('Parsing XML file...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            showStatus(data.error, 'error');
        } else {
            showStatus('File loaded successfully!', 'success');
            const processed = preprocessGraph(data.graph);
            updateVisualization(processed);
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
    if (!svg) return;
    svg.transition().duration(750).call(
        d3.zoom().transform,
        d3.zoomIdentity
    );
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