/**
 * Quotex Browser Bridge
 * Connects to Quotex WebSocket directly from the user's browser.
 * This bypasses Cloudflare since the connection comes from a real browser.
 *
 * Protocol: Socket.IO v2 (EIO=3)
 * - Text frames: "42[event, data]" for JSON events
 * - Binary frames: base64-encoded, first byte is type, rest is JSON
 * - Heartbeat: "2" ping, "3" pong
 */

const QX_WS_URL = 'wss://ws2.market-qx.trade/socket.io/?EIO=3&transport=websocket';

class QuotexBridge {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.sessionToken = null;
        this.pingInterval = null;
        this.instruments = {};
        this.currentPrices = {};
        this.subscribedAsset = null;

        // Candle aggregation
        this.ticks = {};          // asset -> [tick, ...]
        this.candles1m = {};      // asset -> [{time, open, high, low, close}, ...]
        this.currentCandle = {};  // asset -> {time, open, high, low, close, ticks}

        // Callbacks
        this.onTick = null;
        this.onCandle = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.onInstruments = null;
        this.onHistory = null;
        this.onStatusChange = null;
    }

    connect(sessionToken) {
        if (this.ws) {
            this.disconnect();
        }
        this.sessionToken = sessionToken;
        this._setStatus('connecting');

        try {
            this.ws = new WebSocket(QX_WS_URL);
        } catch (e) {
            console.error('QX Bridge: WebSocket creation failed:', e);
            this._setStatus('error', 'Failed to create WebSocket');
            return;
        }

        this.ws.onopen = () => {
            console.log('QX Bridge: WebSocket opened');
        };

        this.ws.onmessage = (event) => {
            this._handleMessage(event.data);
        };

        this.ws.onclose = (event) => {
            console.log('QX Bridge: WebSocket closed', event.code, event.reason);
            this.connected = false;
            this.authenticated = false;
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
            this._setStatus('disconnected');
            if (this.onDisconnect) this.onDisconnect();
        };

        this.ws.onerror = (error) => {
            console.error('QX Bridge: WebSocket error:', error);
            this._setStatus('error', 'Connection failed');
        };
    }

    disconnect() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this._setStatus('disconnected');
    }

    subscribeAsset(asset, period = 60) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.subscribedAsset = asset;
        this._send(`42["instruments/update",{"asset":"${asset}","period":${period}}]`);
        this._send(`42["tick"]`);
        console.log('QX Bridge: Subscribed to', asset);
    }

    _send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(msg);
        }
    }

    _handleMessage(data) {
        if (typeof data !== 'string') {
            // Binary frame — could be ArrayBuffer
            this._handleBinaryFrame(data);
            return;
        }

        // Socket.IO text protocol
        if (data === '2') {
            // Server ping, respond with pong
            this._send('3');
            return;
        }

        if (data.startsWith('0{')) {
            // Handshake
            try {
                const handshake = JSON.parse(data.substring(1));
                console.log('QX Bridge: Handshake SID:', handshake.sid);
                const pingInt = handshake.pingInterval || 25000;
                this.pingInterval = setInterval(() => this._send('2'), pingInt);
            } catch (e) { /* ignore */ }
            return;
        }

        if (data === '40') {
            // Socket.IO connect — send authorization
            this.connected = true;
            this._sendAuth();
            return;
        }

        // Binary attachment indicator: 451-[event, {_placeholder:true, num:N}]
        if (data.startsWith('451-')) {
            // Next message will be binary with the actual data
            try {
                const parsed = JSON.parse(data.substring(4));
                this._pendingBinaryEvent = parsed[0];
            } catch (e) { /* ignore */ }
            return;
        }

        // Regular event: 42[event, data]
        if (data.startsWith('42')) {
            try {
                const parsed = JSON.parse(data.substring(2));
                if (Array.isArray(parsed) && parsed.length >= 1) {
                    this._handleEvent(parsed[0], parsed[1]);
                }
            } catch (e) { /* ignore */ }
            return;
        }

        // Base64-encoded binary data (often follows a 451- frame)
        if (data.length > 10 && /^[A-Za-z0-9+/]/.test(data[0])) {
            this._decodeBinaryPayload(data);
        }
    }

    _handleBinaryFrame(data) {
        // Convert ArrayBuffer to base64 string and decode
        if (data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
                const text = reader.result;
                if (typeof text === 'string') {
                    this._decodeBinaryPayload(text);
                }
            };
            reader.readAsText(data);
        } else if (data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data);
            let text = '';
            for (let i = 0; i < bytes.length; i++) {
                text += String.fromCharCode(bytes[i]);
            }
            this._decodeBinaryPayload(text);
        }
    }

    _decodeBinaryPayload(b64str) {
        try {
            // Pad base64 if needed
            let b64 = b64str;
            const pad = b64.length % 4;
            if (pad) b64 += '='.repeat(4 - pad);

            const raw = atob(b64);
            // Skip first byte (type indicator), rest is JSON
            const jsonStr = raw.substring(1);
            const data = JSON.parse(jsonStr);
            this._handleBinaryData(data);
        } catch (e) {
            // Not valid base64/JSON, ignore
        }
    }

    _handleBinaryData(data) {
        const event = this._pendingBinaryEvent;
        this._pendingBinaryEvent = null;

        if (event === 'instruments/list') {
            this._handleInstrumentList(data);
        } else if (event === 'quotes/stream') {
            this._handleQuoteStream(data);
        } else if (event === 'history/list/v2') {
            this._handleHistory(data);
        } else if (!event) {
            // No pending event — try to guess from data structure
            if (Array.isArray(data) && data.length > 0) {
                if (Array.isArray(data[0]) && data[0].length === 4 && typeof data[0][0] === 'string') {
                    this._handleQuoteStream(data);
                } else if (data[0].length > 10 && typeof data[0][0] === 'number') {
                    this._handleInstrumentList(data);
                }
            } else if (data && data.asset && data.history) {
                this._handleHistory(data);
            }
        }
    }

    _sendAuth() {
        if (!this.sessionToken) return;
        const authMsg = `42["authorization",{"session":"${this.sessionToken}","isDemo":1,"tournamentId":0}]`;
        this._send(authMsg);
        console.log('QX Bridge: Authorization sent');
    }

    _handleEvent(event, data) {
        if (event === 's_authorization') {
            this.authenticated = true;
            this._setStatus('connected');
            console.log('QX Bridge: Authorized successfully');
            // Request tick stream
            this._send('42["tick"]');
            if (this.onConnect) this.onConnect();
        } else if (event === 'quotes/stream') {
            // Sometimes comes as text JSON
            if (data) this._handleQuoteStream(data);
        }
    }

    _handleInstrumentList(data) {
        // data is array: [id, symbol, name, category, decimals, payout, ...]
        if (!Array.isArray(data)) return;

        // Could be a single instrument or list
        if (Array.isArray(data) && data.length > 5 && typeof data[0] === 'number') {
            // Single instrument: [id, symbol, name, category, decimals, payout, ...]
            const inst = {
                id: data[0],
                symbol: data[1],
                name: data[2],
                category: data[3],
                decimals: data[4],
                payout: data[5],
            };
            this.instruments[inst.symbol] = inst;
        }

        if (this.onInstruments) this.onInstruments(this.instruments);
        console.log('QX Bridge: Instruments loaded:', Object.keys(this.instruments).length);
    }

    _handleQuoteStream(data) {
        // data = [[asset, timestamp, price, direction], ...]
        if (!Array.isArray(data)) return;

        for (const tick of data) {
            if (!Array.isArray(tick) || tick.length < 4) continue;
            const [asset, timestamp, price, direction] = tick;

            this.currentPrices[asset] = price;

            // Aggregate into 1-minute candles
            this._aggregateTick(asset, timestamp, price);

            if (this.onTick) {
                this.onTick({ asset, timestamp, price, direction });
            }
        }
    }

    _handleHistory(data) {
        // data = {asset, period, history: [[time, price, dir], ...]}
        if (!data || !data.history) return;

        const asset = data.asset;
        const history = data.history;
        console.log(`QX Bridge: History for ${asset}: ${history.length} ticks`);

        // Process history ticks into candles
        for (const [time, price, dir] of history) {
            this._aggregateTick(asset, time, price);
        }

        if (this.onHistory) {
            this.onHistory(asset, this.candles1m[asset] || []);
        }
    }

    _aggregateTick(asset, timestamp, price) {
        const minuteTs = Math.floor(timestamp / 60) * 60;

        if (!this.currentCandle[asset] || this.currentCandle[asset].time !== minuteTs) {
            // New candle — save the old one
            if (this.currentCandle[asset]) {
                if (!this.candles1m[asset]) this.candles1m[asset] = [];
                this.candles1m[asset].push({ ...this.currentCandle[asset] });

                // Keep max 500 candles
                if (this.candles1m[asset].length > 500) {
                    this.candles1m[asset] = this.candles1m[asset].slice(-500);
                }

                if (this.onCandle) {
                    this.onCandle(asset, this.currentCandle[asset]);
                }
            }

            this.currentCandle[asset] = {
                time: minuteTs,
                open: price,
                high: price,
                low: price,
                close: price,
                ticks: 1,
            };
        } else {
            const c = this.currentCandle[asset];
            c.high = Math.max(c.high, price);
            c.low = Math.min(c.low, price);
            c.close = price;
            c.ticks++;
        }
    }

    getCandles(asset, timeframe = '1m') {
        const candles1m = [...(this.candles1m[asset] || [])];
        // Add current partial candle
        if (this.currentCandle[asset]) {
            candles1m.push({ ...this.currentCandle[asset] });
        }

        if (timeframe === '1m') return candles1m;

        // Aggregate into higher timeframes
        const minutes = { '5m': 5, '15m': 15, '1h': 60 };
        const interval = minutes[timeframe] || 1;
        if (interval === 1) return candles1m;

        const aggregated = [];
        const intervalSec = interval * 60;
        let current = null;

        for (const c of candles1m) {
            const bucketTime = Math.floor(c.time / intervalSec) * intervalSec;
            if (!current || current.time !== bucketTime) {
                if (current) aggregated.push(current);
                current = { time: bucketTime, open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks };
            } else {
                current.high = Math.max(current.high, c.high);
                current.low = Math.min(current.low, c.low);
                current.close = c.close;
                current.ticks += c.ticks;
            }
        }
        if (current) aggregated.push(current);
        return aggregated;
    }

    _setStatus(status, message) {
        if (this.onStatusChange) {
            this.onStatusChange(status, message || status);
        }
    }
}

// Global instance
window.qxBridge = new QuotexBridge();
