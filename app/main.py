"""FastAPI application for the Quotex Signal Bot."""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import pandas as pd

from app.analyzer import analyze
from app.config import QUOTEX_INSTRUMENTS, YF_SYMBOLS
from app.data import fetch_ohlcv, get_asset_list, get_chart_data
from app.quotex_ws import init_quotex_client, get_quotex_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

signal_history: list[dict[str, Any]] = []
MAX_HISTORY = 100

active_connections: list[WebSocket] = []

# Token relay storage: {connect_id: {"token": str, "ts": float}}
_token_store: dict[str, dict[str, Any]] = {}


async def broadcast(message: dict[str, Any]) -> None:
    """Send a JSON message to all connected WebSocket clients."""
    dead: list[WebSocket] = []
    payload = json.dumps(message)
    for ws in active_connections:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in active_connections:
            active_connections.remove(ws)


def _scannable_assets() -> list[str]:
    """Get assets that have yfinance fallback or Quotex WS data."""
    qx = get_quotex_client()
    if qx and qx.connected:
        # When connected to Quotex, scan subscribed assets with data
        return [s for s in qx.subscribed_assets if s in qx.current_prices]

    # Fallback: only assets with yfinance symbols
    result = []
    for sym in QUOTEX_INSTRUMENTS:
        base = sym.replace("_otc", "")
        if sym in YF_SYMBOLS or base in YF_SYMBOLS:
            result.append(sym)
    return result


async def signal_loop() -> None:
    """Periodically compute signals for all assets and broadcast them."""
    while True:
        try:
            all_signals: list[dict[str, Any]] = []
            assets = _scannable_assets()
            for asset in assets:
                for tf in ["5m", "15m"]:
                    df = fetch_ohlcv(asset, tf)
                    if df is None:
                        continue
                    inst = QUOTEX_INSTRUMENTS.get(asset, {})
                    display_name = inst.get("name", asset)
                    result = analyze(df, display_name, tf)
                    if result is None:
                        continue
                    sig_dict = result.to_dict()
                    sig_dict["symbol"] = asset
                    all_signals.append(sig_dict)
                    signal_history.insert(0, sig_dict)

            while len(signal_history) > MAX_HISTORY:
                signal_history.pop()

            if all_signals:
                await broadcast({"type": "signals_update", "data": all_signals})
                logger.info("Broadcasted %d signals", len(all_signals))
        except Exception:
            logger.exception("Error in signal loop")

        await asyncio.sleep(120)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try to connect to Quotex WebSocket
    qx = await init_quotex_client()
    if qx:
        logger.info("Connected to Quotex WebSocket with %d instruments", len(qx.instruments))
    else:
        logger.info("Running in yfinance fallback mode (no Quotex session token)")

    task = asyncio.create_task(signal_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    # Disconnect Quotex WS
    qx_client = get_quotex_client()
    if qx_client:
        await qx_client.disconnect()


app = FastAPI(title="Quotex Signal Bot", version="2.0.0", lifespan=lifespan)

# Allow CORS from Quotex domain so the console command can send the token
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://market-qx.trade", "https://quotex.io", "*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("app/templates/index.html") as f:
        return HTMLResponse(content=f.read())


@app.get("/api/assets")
async def api_assets():
    return get_asset_list()


@app.get("/api/status")
async def api_status():
    """Return connection status."""
    qx = get_quotex_client()
    return {
        "quotex_connected": bool(qx and qx.connected),
        "instruments_count": len(qx.instruments) if qx else len(QUOTEX_INSTRUMENTS),
        "live_prices": len(qx.current_prices) if qx else 0,
        "mode": "quotex_live" if (qx and qx.connected) else "yfinance_fallback",
    }


@app.get("/api/chart/{asset:path}/{timeframe}")
async def api_chart(asset: str, timeframe: str):
    data = get_chart_data(asset, timeframe)
    return {"asset": asset, "timeframe": timeframe, "data": data}


@app.get("/api/analyze/{asset:path}/{timeframe}")
async def api_analyze(asset: str, timeframe: str):
    df = fetch_ohlcv(asset, timeframe)
    if df is None:
        return {"error": "No data available for this asset/timeframe"}
    inst = QUOTEX_INSTRUMENTS.get(asset, {})
    display_name = inst.get("name", asset)
    result = analyze(df, display_name, timeframe)
    if result is None:
        return {"error": "Insufficient data for analysis"}
    data = result.to_dict()
    data["symbol"] = asset
    data["payout"] = inst.get("payout", 0)
    return data


@app.get("/api/signals/history")
async def api_signal_history():
    return signal_history[:50]


@app.get("/api/scan")
async def api_scan():
    """Scan all assets on 5m timeframe and return signals."""
    results: list[dict[str, Any]] = []
    assets = _scannable_assets()
    for asset in assets:
        df = fetch_ohlcv(asset, "5m")
        if df is None:
            continue
        inst = QUOTEX_INSTRUMENTS.get(asset, {})
        display_name = inst.get("name", asset)
        result = analyze(df, display_name, "5m")
        if result is not None:
            data = result.to_dict()
            data["symbol"] = asset
            data["payout"] = inst.get("payout", 0)
            results.append(data)
    return results


@app.post("/api/analyze_candles")
async def api_analyze_candles(request: Request):
    """Analyze candle data sent from the browser-side Quotex bridge."""
    body = await request.json()
    candles = body.get("candles", [])
    asset = body.get("asset", "")
    timeframe = body.get("timeframe", "5m")

    if not candles or len(candles) < 30:
        return {"error": "Need at least 30 candles for analysis"}

    df = pd.DataFrame(candles)
    required = {"open", "high", "low", "close", "time"}
    if not required.issubset(set(df.columns)):
        return {"error": "Candles must have time, open, high, low, close fields"}

    df = df.rename(columns={"open": "Open", "high": "High", "low": "Low", "close": "Close"})
    df["Volume"] = df.get("ticks", 0)
    df.index = pd.to_datetime(df["time"], unit="s", utc=True)

    inst = QUOTEX_INSTRUMENTS.get(asset, {})
    display_name = inst.get("name", asset)
    result = analyze(df, display_name, timeframe)
    if result is None:
        return {"error": "Insufficient data for analysis"}

    data = result.to_dict()
    data["symbol"] = asset
    data["payout"] = inst.get("payout", 0)
    return data


@app.get("/api/connect-id")
async def api_connect_id():
    """Generate a unique connect ID for the token relay."""
    connect_id = secrets.token_urlsafe(16)
    _token_store[connect_id] = {"token": None, "ts": time.time()}
    # Clean old entries (>10 min)
    cutoff = time.time() - 600
    stale = [k for k, v in _token_store.items() if v["ts"] < cutoff]
    for k in stale:
        del _token_store[k]
    return {"connect_id": connect_id}


@app.get("/api/set-token")
async def api_set_token(connect_id: str = "", token: str = ""):
    """Receive token from Quotex console command (GET for simplicity)."""
    if not connect_id or not token:
        return JSONResponse({"error": "Missing connect_id or token"}, status_code=400)
    if connect_id in _token_store:
        _token_store[connect_id]["token"] = token
        _token_store[connect_id]["ts"] = time.time()
        logger.info("Token received for connect_id %s", connect_id[:8])
        return {"ok": True, "message": "Token received! Go back to Signal Bot — it will auto-connect."}
    return JSONResponse({"error": "Invalid connect_id"}, status_code=404)


@app.get("/api/get-token")
async def api_get_token(connect_id: str = ""):
    """Poll for token (called by frontend)."""
    if not connect_id or connect_id not in _token_store:
        return {"token": None}
    entry = _token_store[connect_id]
    token = entry.get("token")
    if token:
        del _token_store[connect_id]
    return {"token": token}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    logger.info("WebSocket client connected (%d total)", len(active_connections))
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "get_chart":
                asset = msg.get("asset", "EURUSD")
                timeframe = msg.get("timeframe", "5m")
                chart_data = get_chart_data(asset, timeframe)
                await ws.send_text(
                    json.dumps({"type": "chart_data", "asset": asset, "timeframe": timeframe, "data": chart_data})
                )
            elif msg.get("type") == "get_analysis":
                asset = msg.get("asset", "EURUSD")
                timeframe = msg.get("timeframe", "5m")
                df = fetch_ohlcv(asset, timeframe)
                if df is not None:
                    result = analyze(df, asset, timeframe)
                    if result:
                        await ws.send_text(json.dumps({"type": "analysis", **result.to_dict()}))
    except WebSocketDisconnect:
        pass
    finally:
        if ws in active_connections:
            active_connections.remove(ws)
        logger.info("WebSocket client disconnected (%d total)", len(active_connections))
