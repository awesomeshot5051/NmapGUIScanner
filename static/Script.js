    let simulation, svg, link, node, nodeText, label, currentGraph;
    let eventSource = null;
    let expandedNodes = new Set();
    let showInfra = false;

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

    function toggleNodeServices(nodeId) {
    if (expandedNodes.has(nodeId)) {
    expandedNodes.delete(nodeId);
} else {
    expandedNodes.add(nodeId);
}

    // Fetch graph with current state
    fetch(`/api/graph?show_infra=${showInfra ? 1 : 0}&show_services=1`)
    .then(r => r.json())
    .then(data => {
    // Create a deep copy of the data to modify
    const modifiedData = JSON.parse(JSON.stringify(data));

    // Process each host node
    modifiedData.nodes.forEach(node => {
    if (node.type === 'host' && node.ports) {
    // Only show service nodes for expanded hosts
    if (expandedNodes.has(node.id)) {
    node.ports.forEach(port => {
    const serviceId = `${node.id}_${port.protocol}_${port.port}`;
    let serviceLabel = `${port.service}:${port.port}/${port.protocol}`;

    if (port.product) {
    serviceLabel = `${port.product} (${port.service}:${port.port})`;
}

    // Add service node if it doesn't exist
    if (!modifiedData.nodes.find(n => n.id === serviceId)) {
    modifiedData.nodes.push({
    id: serviceId,
    label: serviceLabel,
    type: 'service',
    port: port.port,
    protocol: port.protocol,
    service: port.service,
    product: port.product,
    version: port.version,
    parentNode: node.id
});

    // Add link to parent node
    modifiedData.links.push({
    source: node.id,
    target: serviceId,
    relation: 'provides'
});
}
});
} else {
    // Remove service nodes and their links when collapsing
    modifiedData.nodes = modifiedData.nodes.filter(n =>
    n.type !== 'service' || n.parentNode !== node.id
    );
    modifiedData.links = modifiedData.links.filter(l =>
    !(l.source === node.id && l.relation === 'provides')
    );
}
}
});

    updateVisualization(modifiedData);
});
}
    function initVisualization() {
    const container = document.getElementById('graph');
    let width = Math.max(600, container.clientWidth);
    let height = Math.max(400, container.clientHeight);

    svg = d3.select('#graph')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g');

    const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
    g.attr('transform', event.transform);
});

    svg.call(zoom);

    link = g.append('g').attr('class', 'links').selectAll('.link');
    node = g.append('g').attr('class', 'nodes').selectAll('.node');
    nodeText = g.append('g').attr('class', 'node-texts').selectAll('.node-os-label');
    label = g.append('g').attr('class', 'labels').selectAll('.node-label');

    simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(d => {
    // Increase distance for service nodes
    return d.source.type === 'service' || d.target.type === 'service' ? 60 : 100;
}).strength(0.5))
    .force('charge', d3.forceManyBody().strength(d => {
    // Adjust repulsion based on node type
    return d.type === 'service' ? -50 : -150;
}))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => {
    // Adjust collision radius based on node type
    return d.type === 'service' ? 15 : 35;
}));

    window.addEventListener('resize', () => {
    const w = Math.max(400, container.clientWidth);
    const h = Math.max(300, container.clientHeight);
    svg.attr('width', w).attr('height', h);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    simulation.force('center', d3.forceCenter(w/2, h/2));
    simulation.alpha(0.3).restart();
});
}

    function updateVisualization(graphData) {
    currentGraph = graphData;

    // Update links
    link = link.data(graphData.links, d => `${d.source}-${d.target}`);
    link.exit().remove();
    const linkEnter = link.enter().append('line')
    .attr('class', d => `link ${d.relation}`)
    .attr('stroke-width', d => d.relation === 'gateway' ? 2 : 1.5);
    link = linkEnter.merge(link);

    // Update nodes
    node = node.data(graphData.nodes, d => d.id);
    node.exit().remove();

    const nodeEnter = node.enter().append('circle')
    .attr('class', d => `node ${d.type}`)
    .attr('r', d => d.type === 'host' ? 18 : 11)
    .on('click', (event, d) => {
    try {
    if (d.type === 'host') {
    event.stopPropagation(); // Prevent multiple handlers
    toggleNodeServices(d.id);
}
    showNodeDetails(event, d);
} catch (error) {
    console.error('Error handling node click:', error);
    showStatus('Error handling node click: ' + error.message, 'error');
}
})
    .on('mouseover', showTooltip)
    .on('mouseout', hideTooltip)
    .call(d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended));

    node = nodeEnter.merge(node);

    // Update node text (OS labels inside circles)
    nodeText = nodeText.data(graphData.nodes.filter(n => n.type === 'host'), d => d.id);
    nodeText.exit().remove();

    const nodeTextEnter = nodeText.enter().append('text')
    .attr('class', 'node-os-label')
    .each(function(d) {
    const text = d3.select(this);

    // Show OS if available, otherwise show role
    let displayText = '';
    if (d.os) {
    // Shorten OS name
    const osShort = d.os.split(' ')[0].substring(0, 8);
    displayText = osShort;
} else if (d.roles && d.roles.length > 0) {
    // Show first role abbreviation
    const roleMap = {
    'DNS Server': 'DNS',
    'DHCP Server': 'DHCP',
    'Domain Controller': 'DC',
    'Web Server': 'WEB',
    'Mail Server': 'MAIL',
    'Database Server': 'DB',
    'File Server': 'FILE',
    'Gateway': 'GW'
};
    displayText = roleMap[d.roles[0]] || d.roles[0].substring(0, 4);
}

    text.text(displayText);
});

    nodeText = nodeTextEnter.merge(nodeText);

    // Update labels (below nodes)
    label = label.data(graphData.nodes, d => d.id);
    label.exit().remove();

    const labelEnter = label.enter().append('text')
    .attr('class', 'node-label')
    .attr('dy', 30)
    .attr('text-anchor', 'middle')
    .text(d => {
    // For hosts with roles, show role in label
    if (d.type === 'host' && d.roles && d.roles.length > 0) {
    return `${d.label} [${d.roles[0]}]`;
}
    return d.label;
});

    label = labelEnter.merge(label);

    // Update simulation
    simulation.nodes(graphData.nodes).on('tick', ticked);
    simulation.force('link').links(graphData.links);
    simulation.alpha(1).restart();
}

    function ticked() {
    link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    node
    .attr('cx', d => {
    // Keep service nodes near their parent
    if (d.type === 'service' && d.parent) {
    const parent = currentGraph.nodes.find(n => n.id === d.parent);
    if (parent) {
    const dx = d.x - parent.x;
    const dy = d.y - parent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 100) { // Max distance from parent
    const angle = Math.atan2(dy, dx);
    d.x = parent.x + 100 * Math.cos(angle);
}
}
}
    return d.x;
})
    .attr('cy', d => {
    // Similar constraint for y-coordinate
    if (d.type === 'service' && d.parent) {
    const parent = currentGraph.nodes.find(n => n.id === d.parent);
    if (parent) {
    const dx = d.x - parent.x;
    const dy = d.y - parent.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 100) {
    const angle = Math.atan2(dy, dx);
    d.y = parent.y + 100 * Math.sin(angle);
}
}
}
    return d.y;
});

    nodeText
    .attr('x', d => d.x)
    .attr('y', d => d.y);

    label
    .attr('x', d => d.x)
    .attr('y', d => d.y + (d.type === 'service' ? 25 : 30));
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
    d.fx = null;
    d.fy = null;
}

    function showTooltip(event, d) {
    const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('left', (event.pageX + 15) + 'px')
    .style('top', (event.pageY - 15) + 'px');

    let content = `<div class="tooltip-title">${d.label}</div><div class="tooltip-content">`;

    if (d.type === 'host') {
    content += `<strong>IP:</strong> ${d.ip}<br>`;
    if (d.hostname) content += `<strong>Hostname:</strong> ${d.hostname}<br>`;
    if (d.os) content += `<strong>OS:</strong> ${d.os} (${d.os_accuracy}%)<br>`;
    if (d.mac) content += `<strong>MAC:</strong> ${d.mac}<br>`;
    if (d.mac_vendor) content += `<strong>Vendor:</strong> ${d.mac_vendor}<br>`;
    if (d.roles && d.roles.length > 0) {
    content += `<strong>Roles:</strong> ${d.roles.join(', ')}<br>`;
}
    content += `<strong>Open Ports:</strong> ${d.open_ports_count}<br>`;
    content += `<em>Click to toggle services</em>`;
} else if (d.type === 'service') {
    content += `<strong>Port:</strong> ${d.port}/${d.protocol}<br>`;
    content += `<strong>Service:</strong> ${d.service}<br>`;
    if (d.product) content += `<strong>Product:</strong> ${d.product}<br>`;
    if (d.version) content += `<strong>Version:</strong> ${d.version}`;
}

    content += '</div>';
    tooltip.html(content);
}

    function hideTooltip() {
    d3.selectAll('.tooltip').remove();
}

    function showNodeDetails(event, d) {
    try {
    let details = `<div class="scan-info">`;
    details += `<div class="section-title">Node Details</div>`;

    if (!d) {
    throw new Error('No node data provided');
}

    if (d.type === 'host') {
    details += `<div class="scan-info-item">
                <span class="scan-info-label">IP Address:</span>
                <span class="scan-info-value">${d.ip || 'N/A'}</span>
            </div>`;

    if (d.hostname) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">Hostname:</span>
                    <span class="scan-info-value">${d.hostname}</span>
                </div>`;
}

    if (d.os) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">OS:</span>
                    <span class="scan-info-value">${d.os} ${d.os_accuracy ? `(${d.os_accuracy}% confidence)` : ''}</span>
                </div>`;
}

    if (d.mac) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">MAC:</span>
                    <span class="scan-info-value">${d.mac}</span>
                </div>`;
}

    if (d.mac_vendor) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">Vendor:</span>
                    <span class="scan-info-value">${d.mac_vendor}</span>
                </div>`;
}

    if (d.roles && Array.isArray(d.roles) && d.roles.length > 0) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">Detected Roles:</span>
                    <span class="scan-info-value">${d.roles.join(', ')}</span>
                </div>`;
}

    if (d.ports && Array.isArray(d.ports) && d.ports.length > 0) {
    details += `<div style="margin-top: 15px;"><strong>Open Ports (${d.ports.length}):</strong></div>`;
    d.ports.forEach(port => {
    if (port) {
    details += `<div style="margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">`;
    details += `<strong>${port.port || 'N/A'}/${port.protocol || 'N/A'}</strong> - ${port.service || 'N/A'}`;
    if (port.product) {
    details += `<br><small>${port.product}${port.version ? ' ' + port.version : ''}</small>`;
}
    details += `</div>`;
}
});
}
} else if (d.type === 'service') {
    details += `<div class="scan-info-item">
                <span class="scan-info-label">Port:</span>
                <span class="scan-info-value">${d.port || 'N/A'}/${d.protocol || 'N/A'}</span>
            </div>`;

    details += `<div class="scan-info-item">
                <span class="scan-info-label">Service:</span>
                <span class="scan-info-value">${d.service || 'N/A'}</span>
            </div>`;

    if (d.product) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">Product:</span>
                    <span class="scan-info-value">${d.product}</span>
                </div>`;
}

    if (d.version) {
    details += `<div class="scan-info-item">
                    <span class="scan-info-label">Version:</span>
                    <span class="scan-info-value">${d.version}</span>
                </div>`;
}
}

    details += `</div>`;

    const container = document.getElementById('scan-info-container');
    if (!container) {
    throw new Error('Scan info container not found');
}
    container.innerHTML = details;

} catch (error) {
    console.error('Error showing node details:', error);
    showStatus('Error showing node details: ' + error.message, 'error');

    // Show minimal error state in the details panel
    const container = document.getElementById('scan-info-container');
    if (container) {
    container.innerHTML = `<div class="scan-info">
                <div class="section-title">Node Details</div>
                <div class="scan-info-item error">
                    Unable to display node details: ${error.message}
                </div>
            </div>`;
}
}
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

    const scanData = {
    targets: targets,
    service_version: document.getElementById('service_version').checked,
    os_detection: document.getElementById('os_detection').checked,
    script_scan: document.getElementById('script_scan').checked,
    snmp_scan: document.getElementById('snmp_scan').checked,
    timing: document.getElementById('timing').value,
    show_terminal: showTerminal,
    show_webpage: showWebpage
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
    // Specific handling for OS detection errors
    if (data.error.includes('OS detection') || data.error.includes('Failed to run nmap')) {
    showStatus('OS detection requires root/administrator privileges. Try running without OS detection or with elevated privileges.', 'error');
} else {
    showStatus(data.error, 'error');
}
    if (showWebpage) {
    appendConsoleOutput('ERROR: ' + data.error);
}
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
