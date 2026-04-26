/* Quotex Signal Bot — Frontend Application */

const API_BASE = '';
let chart, candleSeries, volumeSeries;
let ws = null;
let currentAsset = 'EUR/USD';
let currentTimeframe = '5m';
let allAssets = [];
let currentFilter = 'all';

/* ===== Initialization ===== */
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadAssets();
    setupEventListeners();
    connectWebSocket();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => loadChart(currentAsset, currentTimeframe), 60000);
});

/* ===== TradingView Lightweight Chart ===== */
function initChart() {
    const container = document.getElementById('chart');
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 450,
        layout: {
            background: { type: 'solid', color: '#1a2332' },
            textColor: '#8b9bb0',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
        },
        grid: {
            vertLines: { color: '#243042' },
            horzLines: { color: '#243042' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#2196f3', width: 1, style: 2 },
            horzLine: { color: '#2196f3', width: 1, style: 2 },
        },
        timeScale: {
            borderColor: '#2d3d50',
            timeVisible: true,
            secondsVisible: false,
        },
        rightPriceScale: {
            borderColor: '#2d3d50',
            scaleMargins: { top: 0.1, bottom: 0.2 },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#2196f3',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.85, bottom: 0 },
    });

    window.addEventListener('resize', () => {
        chart.applyOptions({ width: container.clientWidth });
    });
}

/* ===== Load Assets ===== */
async function loadAssets() {
    try {
        const res = await fetch(`${API_BASE}/api/assets`);
        allAssets = await res.json();
        populateAssetSelect(allAssets);
        loadChart(currentAsset, currentTimeframe);
    } catch (e) {
        console.error('Failed to load assets:', e);
    }
}

function populateAssetSelect(assets) {
    const select = document.getElementById('assetSelect');
    select.innerHTML = '';
    let currentCategory = '';
    let optgroup = null;

    const filtered = filterAssets(assets, currentFilter);

    filtered.forEach(a => {
        if (a.category !== currentCategory) {
            currentCategory = a.category;
            optgroup = document.createElement('optgroup');
            optgroup.label = a.category + (a.category.includes('OTC') ? ' 🌙' : '');
            select.appendChild(optgroup);
        }
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = a.name;
        if (a.name === currentAsset) opt.selected = true;
        optgroup.appendChild(opt);
    });

    // If current asset not in filtered list, select first
    if (filtered.length > 0 && !filtered.find(a => a.name === currentAsset)) {
        currentAsset = filtered[0].name;
        select.value = currentAsset;
        loadChart(currentAsset, currentTimeframe);
    }
}

function filterAssets(assets, filter) {
    if (filter === 'all') return assets;
    if (filter === 'otc') return assets.filter(a => a.is_otc);
    if (filter === 'regular') return assets.filter(a => !a.is_otc);
    return assets.filter(a => a.category === filter);
}

/* ===== Chart Data ===== */
async function loadChart(asset, timeframe) {
    currentAsset = asset;
    currentTimeframe = timeframe;

    const isOtc = asset.includes('(OTC)');
    const titleEl = document.getElementById('chartTitle');
    if (isOtc) {
        titleEl.innerHTML = `${asset} — ${timeframe} <span class="chart-otc-badge">OTC</span>`;
    } else {
        titleEl.textContent = `${asset} — ${timeframe}`;
    }

    try {
        const res = await fetch(`${API_BASE}/api/chart/${encodeURIComponent(asset)}/${timeframe}`);
        const json = await res.json();
        if (!json.data || json.data.length === 0) {
            console.warn('No chart data');
            return;
        }

        candleSeries.setData(json.data.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        })));

        volumeSeries.setData(json.data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
        })));

        const last = json.data[json.data.length - 1];
        updatePrice(last.close, last.close >= last.open);
        chart.timeScale().fitContent();
    } catch (e) {
        console.error('Failed to load chart:', e);
    }
}

function updatePrice(price, isUp) {
    const el = document.getElementById('currentPrice');
    el.textContent = formatPrice(price);
    el.style.color = isUp ? 'var(--green)' : 'var(--red)';
}

function formatPrice(p) {
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
}

/* ===== Analysis ===== */
async function runAnalysis() {
    const panel = document.getElementById('signalContent');
    panel.innerHTML = '<div class="loading"><div class="spinner"></div>Analyzing...</div>';

    try {
        const res = await fetch(`${API_BASE}/api/analyze/${encodeURIComponent(currentAsset)}/${currentTimeframe}`);
        const data = await res.json();
        if (data.error) {
            panel.innerHTML = `<div class="placeholder">${data.error}</div>`;
            return;
        }
        renderAnalysis(data);
    } catch (e) {
        panel.innerHTML = '<div class="placeholder">Analysis failed. Please try again.</div>';
    }
}

function renderAnalysis(data) {
    const panel = document.getElementById('signalContent');
    const sigKey = data.overall_signal.replace(/\s+/g, '_');
    const isOtc = data.asset.includes('(OTC)');

    let otcNote = '';
    if (isOtc) {
        otcNote = `
            <div style="background:rgba(171,71,188,0.1);border:1px solid rgba(171,71,188,0.3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.75rem;color:#ab47bc;">
                🌙 <strong>OTC Market</strong> — Analysis based on base pair data. OTC prices may vary slightly from regular market.
            </div>
        `;
    }

    let html = `
        ${otcNote}
        <div class="overall-signal signal-bg-${sigKey}">
            <div class="signal-type signal-color-${sigKey}">${data.overall_signal}</div>
            <div class="signal-strength">Signal Strength: ${data.signal_strength}%</div>
            <div class="recommendation">${data.recommendation}</div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;">
            ${data.asset} • ${data.timeframe} • ${data.timestamp}
        </div>
        <div class="indicator-list">
    `;

    data.indicators.forEach(ind => {
        const indKey = ind.signal.replace(/\s+/g, '_');
        html += `
            <div class="indicator-item">
                <div>
                    <div class="indicator-name">${ind.name}</div>
                    <div class="indicator-desc">${ind.description}</div>
                </div>
                <span class="indicator-signal signal-bg-${indKey} signal-color-${indKey}">${ind.signal}</span>
            </div>
        `;
    });

    html += '</div>';
    panel.innerHTML = html;
}

/* ===== Scanner ===== */
async function runScan() {
    const container = document.getElementById('scannerContent');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Scanning all assets...</div>';
    document.getElementById('scanTime').textContent = 'Scanning...';

    try {
        const res = await fetch(`${API_BASE}/api/scan`);
        const results = await res.json();
        renderScanner(results);
        document.getElementById('scanTime').textContent = `Last scan: ${new Date().toLocaleTimeString()}`;
    } catch (e) {
        container.innerHTML = '<div class="placeholder">Scan failed. Please try again.</div>';
    }
}

function renderScanner(results) {
    const container = document.getElementById('scannerContent');
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="placeholder">No results available</div>';
        return;
    }

    // Apply current filter to scanner results
    let filtered = results;
    if (currentFilter === 'otc') {
        filtered = results.filter(r => r.asset.includes('(OTC)'));
    } else if (currentFilter === 'regular') {
        filtered = results.filter(r => !r.asset.includes('(OTC)'));
    } else if (currentFilter !== 'all') {
        filtered = results.filter(r => {
            const assetInfo = allAssets.find(a => a.name === r.asset);
            return assetInfo && assetInfo.category === currentFilter;
        });
    }

    // Sort: strongest signals first
    filtered.sort((a, b) => b.signal_strength - a.signal_strength);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="placeholder">No results for this filter</div>';
        return;
    }

    let html = '';
    filtered.forEach(r => {
        const sigKey = r.overall_signal.replace(/\s+/g, '_');
        const barColor = getSignalColor(sigKey);
        const isOtc = r.asset.includes('(OTC)');
        const otcClass = isOtc ? 'otc-card' : '';
        const otcBadge = isOtc ? '<span class="otc-badge">OTC</span>' : '';
        html += `
            <div class="scanner-card ${otcClass}" onclick="selectAsset('${r.asset}')">
                <div class="asset-name">${r.asset}${otcBadge}</div>
                <div class="asset-price">${formatPrice(r.current_price)}</div>
                <div class="asset-signal signal-color-${sigKey}">${r.overall_signal}</div>
                <div class="asset-strength">
                    <div class="bar" style="width:${r.signal_strength}%;background:${barColor}"></div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function getSignalColor(key) {
    const colors = {
        'STRONG_BUY': '#00c853',
        'BUY': '#26a69a',
        'NEUTRAL': '#78909c',
        'SELL': '#ef5350',
        'STRONG_SELL': '#d50000',
    };
    return colors[key] || '#78909c';
}

function selectAsset(asset) {
    currentAsset = asset;
    document.getElementById('assetSelect').value = asset;
    loadChart(asset, currentTimeframe);
    runAnalysis();
}

/* ===== WebSocket ===== */
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        const badge = document.getElementById('statusBadge');
        badge.textContent = '● LIVE';
        badge.classList.add('connected');
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'signals_update') {
                handleSignalsUpdate(msg.data);
            }
        } catch (e) {
            console.error('WS message error:', e);
        }
    };

    ws.onclose = () => {
        const badge = document.getElementById('statusBadge');
        badge.textContent = '● DISCONNECTED';
        badge.classList.remove('connected');
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = () => {
        ws.close();
    };
}

function handleSignalsUpdate(signals) {
    const match = signals.find(s => s.asset === currentAsset && s.timeframe === currentTimeframe);
    if (match) {
        renderAnalysis(match);
    }
}

/* ===== Market Tab Filtering ===== */
function setupMarketTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            populateAssetSelect(allAssets);
        });
    });
}

/* ===== Event Listeners ===== */
function setupEventListeners() {
    document.getElementById('assetSelect').addEventListener('change', (e) => {
        currentAsset = e.target.value;
        loadChart(currentAsset, currentTimeframe);
    });

    document.getElementById('timeframeSelect').addEventListener('change', (e) => {
        currentTimeframe = e.target.value;
        loadChart(currentAsset, currentTimeframe);
    });

    document.getElementById('analyzeBtn').addEventListener('click', () => {
        runAnalysis();
    });

    document.getElementById('scanBtn').addEventListener('click', () => {
        runScan();
    });

    setupMarketTabs();
}

/* ===== Clock ===== */
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toUTCString().slice(0, -4) + ' UTC';
}
