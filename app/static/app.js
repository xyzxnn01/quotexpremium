/* Quotex Signal Bot — Frontend Application */

const API_BASE = window.location.origin.replace(/\/\/[^@]+@/, '//');
let chart, candleSeries, volumeSeries;
let ws = null;
let currentAsset = 'EURUSD';
let currentTimeframe = '5m';
let allAssets = [];
let currentFilter = 'all';
let quotexConnected = false;

/* ===== Initialization ===== */
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    checkStatus();
    loadAssets();
    setupEventListeners();
    connectWebSocket();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => loadChart(currentAsset, currentTimeframe), 60000);
    setInterval(checkStatus, 30000);
});

/* ===== Status Check ===== */
async function checkStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const status = await res.json();
        quotexConnected = status.quotex_connected;
        const modeEl = document.getElementById('dataMode');
        if (modeEl) {
            modeEl.textContent = quotexConnected ? '🔴 QUOTEX LIVE' : '📊 yFinance';
            modeEl.className = quotexConnected ? 'mode-badge mode-live' : 'mode-badge mode-fallback';
        }
    } catch(e) { /* ignore */ }
}

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
            const isOtcCat = a.category.includes('OTC');
            optgroup.label = a.category + (isOtcCat ? ' 🌙' : '');
            select.appendChild(optgroup);
        }
        const opt = document.createElement('option');
        opt.value = a.symbol;
        const payoutStr = a.payout > 0 ? ` (${a.payout}%)` : '';
        opt.textContent = a.name + payoutStr;
        if (a.symbol === currentAsset) opt.selected = true;
        optgroup.appendChild(opt);
    });

    if (filtered.length > 0 && !filtered.find(a => a.symbol === currentAsset)) {
        currentAsset = filtered[0].symbol;
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

function getAssetInfo(symbol) {
    return allAssets.find(a => a.symbol === symbol) || {};
}

/* ===== Chart Data ===== */
async function loadChart(asset, timeframe) {
    currentAsset = asset;
    currentTimeframe = timeframe;

    const info = getAssetInfo(asset);
    const displayName = info.name || asset;
    const isOtc = info.is_otc || asset.includes('_otc');
    const payout = info.payout || 0;
    const titleEl = document.getElementById('chartTitle');
    let titleHtml = `${displayName} — ${timeframe}`;
    if (isOtc) titleHtml += ` <span class="chart-otc-badge">OTC</span>`;
    if (payout > 0) titleHtml += ` <span class="payout-badge">${payout}%</span>`;
    titleEl.innerHTML = titleHtml;

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
    if (p >= 1000) return p.toFixed(2);
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
    const isOtc = (data.symbol || data.asset || '').includes('_otc') || (data.asset || '').includes('(OTC)');
    const payout = data.payout || 0;

    let otcNote = '';
    if (isOtc) {
        otcNote = `
            <div style="background:rgba(171,71,188,0.1);border:1px solid rgba(171,71,188,0.3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.75rem;color:#ab47bc;">
                🌙 <strong>OTC Market</strong> — Analysis based on real-time tick data from Quotex OTC engine.
            </div>
        `;
    }

    let payoutHtml = '';
    if (payout > 0) {
        payoutHtml = `<div style="font-size:0.8rem;color:var(--green);margin-top:4px;">Payout: <strong>${payout}%</strong></div>`;
    }

    let html = `
        ${otcNote}
        <div class="overall-signal signal-bg-${sigKey}">
            <div class="signal-type signal-color-${sigKey}">${data.overall_signal}</div>
            <div class="signal-strength">Signal Strength: ${data.signal_strength}%</div>
            ${payoutHtml}
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

    let filtered = results;
    if (currentFilter === 'otc') {
        filtered = results.filter(r => (r.symbol || r.asset || '').includes('_otc') || (r.asset || '').includes('(OTC)'));
    } else if (currentFilter === 'regular') {
        filtered = results.filter(r => !(r.symbol || r.asset || '').includes('_otc') && !(r.asset || '').includes('(OTC)'));
    } else if (currentFilter !== 'all') {
        filtered = results.filter(r => {
            const sym = r.symbol || '';
            const info = getAssetInfo(sym);
            return info.category === currentFilter;
        });
    }

    filtered.sort((a, b) => b.signal_strength - a.signal_strength);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="placeholder">No results for this filter</div>';
        return;
    }

    let html = '';
    filtered.forEach(r => {
        const sigKey = r.overall_signal.replace(/\s+/g, '_');
        const barColor = getSignalColor(sigKey);
        const sym = r.symbol || '';
        const isOtc = sym.includes('_otc') || (r.asset || '').includes('(OTC)');
        const otcClass = isOtc ? 'otc-card' : '';
        const otcBadge = isOtc ? '<span class="otc-badge">OTC</span>' : '';
        const payout = r.payout || 0;
        const payoutStr = payout > 0 ? `<span class="payout-small">${payout}%</span>` : '';
        html += `
            <div class="scanner-card ${otcClass}" onclick="selectAsset('${sym || r.asset}')">
                <div class="asset-name">${r.asset}${otcBadge}${payoutStr}</div>
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
    const cleanHost = window.location.host.replace(/^[^@]+@/, '');
    const wsUrl = `${protocol}//${cleanHost}/ws`;

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
    const match = signals.find(s =>
        (s.symbol === currentAsset || s.asset === currentAsset) &&
        s.timeframe === currentTimeframe
    );
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

/* ===== Quotex Bridge Integration ===== */
let qxTickCount = 0;
let qxLiveMode = false;
let qxSessionToken = null;

function setupQuotexBridge() {
    const bridge = window.qxBridge;
    if (!bridge) return;

    bridge.onStatusChange = (status, msg) => {
        const dot = document.getElementById('qxDot');
        const text = document.getElementById('qxStatusText');
        const modeEl = document.getElementById('dataMode');
        const connectBtn = document.getElementById('quotexConnectBtn');
        const disconnectBtn = document.getElementById('quotexDisconnectBtn');
        const infoEl = document.getElementById('qxInfo');

        text.textContent = msg;

        if (status === 'connected') {
            dot.className = 'qx-dot connected';
            modeEl.textContent = '🔴 QUOTEX LIVE';
            modeEl.className = 'mode-badge mode-live';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = '';
            infoEl.style.display = '';
            document.getElementById('quotexLoginBtn').style.display = 'none';
            qxLiveMode = true;
        } else if (status === 'connecting') {
            dot.className = 'qx-dot connecting';
            text.textContent = 'Connecting to Quotex...';
        } else if (status === 'error') {
            dot.className = 'qx-dot error';
        } else {
            dot.className = 'qx-dot';
            modeEl.textContent = '📊 yFinance';
            modeEl.className = 'mode-badge mode-fallback';
            connectBtn.style.display = '';
            disconnectBtn.style.display = 'none';
            infoEl.style.display = 'none';
            document.getElementById('quotexLoginBtn').style.display = '';
            qxLiveMode = false;
        }
    };

    bridge.onConnect = () => {
        // Subscribe to current asset
        bridge.subscribeAsset(currentAsset);
    };

    bridge.onTick = (tick) => {
        qxTickCount++;
        document.getElementById('qxTickCount').textContent = `Ticks: ${qxTickCount}`;

        if (tick.asset === currentAsset) {
            const priceEl = document.getElementById('qxLivePrice');
            priceEl.textContent = `Price: ${formatPrice(tick.price)}`;
            updatePrice(tick.price, tick.direction === 1);

            // Update chart with latest candle
            const candle = bridge.currentCandle[tick.asset];
            if (candle) {
                candleSeries.update({
                    time: candle.time,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                });
            }
        }
    };

    bridge.onCandle = (asset, candle) => {
        const count = (bridge.candles1m[asset] || []).length;
        document.getElementById('qxCandleCount').textContent = `Candles: ${count}`;
    };

    bridge.onHistory = (asset, candles) => {
        if (asset === currentAsset) {
            loadQxChart(asset, currentTimeframe);
        }
    };
}

function loadQxChart(asset, timeframe) {
    const bridge = window.qxBridge;
    if (!bridge) return;

    const candles = bridge.getCandles(asset, timeframe);
    if (!candles || candles.length === 0) return;

    candleSeries.setData(candles.map(c => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    volumeSeries.setData(candles.map(c => ({
        time: c.time, value: c.ticks || 0,
        color: c.close >= c.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
    })));

    const last = candles[candles.length - 1];
    updatePrice(last.close, last.close >= last.open);
    chart.timeScale().fitContent();
}

async function runQxAnalysis() {
    const bridge = window.qxBridge;
    if (!bridge) return;

    const candles = bridge.getCandles(currentAsset, currentTimeframe);
    if (!candles || candles.length < 30) {
        document.getElementById('signalContent').innerHTML =
            '<div class="placeholder">Not enough Quotex data yet. Wait for more ticks...</div>';
        return;
    }

    const panel = document.getElementById('signalContent');
    panel.innerHTML = '<div class="loading"><div class="spinner"></div>Analyzing live data...</div>';

    try {
        const res = await fetch(`${API_BASE}/api/analyze_candles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candles: candles,
                asset: currentAsset,
                timeframe: currentTimeframe,
            }),
        });
        const data = await res.json();
        if (data.error) {
            panel.innerHTML = `<div class="placeholder">${data.error}</div>`;
            return;
        }
        renderAnalysis(data);
    } catch (e) {
        panel.innerHTML = '<div class="placeholder">Analysis failed.</div>';
    }
}

function quotexLogin() {
    const popup = window.open(
        'https://market-qx.trade/en/sign-in',
        'quotex_login',
        'width=500,height=700,scrollbars=yes,resizable=yes'
    );

    // Show connect button after login popup opens
    document.getElementById('quotexConnectBtn').style.display = '';

    // Check if popup closed (user finished login)
    const checker = setInterval(() => {
        if (popup && popup.closed) {
            clearInterval(checker);
        }
    }, 1000);
}

function quotexConnect() {
    const token = prompt(
        'Enter your Quotex session token.\n\n' +
        'How to get it:\n' +
        '1. Login to Quotex in the popup\n' +
        '2. Open DevTools (F12) → Network tab\n' +
        '3. Filter for "socket.io"\n' +
        '4. Look for authorization message with "session" value\n\n' +
        'Or paste the token from your HAR file:'
    );
    if (!token) return;

    qxSessionToken = token.trim();
    const bridge = window.qxBridge;
    bridge.connect(qxSessionToken);
}

function quotexDisconnect() {
    const bridge = window.qxBridge;
    if (bridge) bridge.disconnect();
    qxLiveMode = false;
    qxTickCount = 0;
}

/* ===== Event Listeners ===== */
function setupEventListeners() {
    document.getElementById('assetSelect').addEventListener('change', (e) => {
        currentAsset = e.target.value;
        if (qxLiveMode) {
            window.qxBridge.subscribeAsset(currentAsset);
            loadQxChart(currentAsset, currentTimeframe);
        } else {
            loadChart(currentAsset, currentTimeframe);
        }
    });

    document.getElementById('timeframeSelect').addEventListener('change', (e) => {
        currentTimeframe = e.target.value;
        if (qxLiveMode) {
            loadQxChart(currentAsset, currentTimeframe);
        } else {
            loadChart(currentAsset, currentTimeframe);
        }
    });

    document.getElementById('analyzeBtn').addEventListener('click', () => {
        if (qxLiveMode) {
            runQxAnalysis();
        } else {
            runAnalysis();
        }
    });

    document.getElementById('scanBtn').addEventListener('click', () => {
        runScan();
    });

    // Quotex buttons
    document.getElementById('quotexLoginBtn').addEventListener('click', quotexLogin);
    document.getElementById('quotexConnectBtn').addEventListener('click', quotexConnect);
    document.getElementById('quotexDisconnectBtn').addEventListener('click', quotexDisconnect);

    setupMarketTabs();
    setupQuotexBridge();
}

/* ===== Clock ===== */
function updateClock() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}:${s} UTC`;
}
