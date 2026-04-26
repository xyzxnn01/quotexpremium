"""FastAPI application for the Quotex Signal Bot."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.analyzer import analyze
from app.config import ASSETS
from app.data import fetch_ohlcv, get_asset_list, get_chart_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

signal_history: list[dict[str, Any]] = []
MAX_HISTORY = 100

active_connections: list[WebSocket] = []


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


async def signal_loop() -> None:
    """Periodically compute signals for all assets and broadcast them."""
    while True:
        try:
            all_signals: list[dict[str, Any]] = []
            for asset in ASSETS:
                for tf in ["5m", "15m"]:
                    df = fetch_ohlcv(asset, tf)
                    if df is None:
                        continue
                    result = analyze(df, asset, tf)
                    if result is None:
                        continue
                    sig_dict = result.to_dict()
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
    task = asyncio.create_task(signal_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Quotex Signal Bot", version="1.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("app/templates/index.html") as f:
        return HTMLResponse(content=f.read())


@app.get("/api/assets")
async def api_assets():
    return get_asset_list()


@app.get("/api/chart/{asset:path}/{timeframe}")
async def api_chart(asset: str, timeframe: str):
    data = get_chart_data(asset, timeframe)
    return {"asset": asset, "timeframe": timeframe, "data": data}


@app.get("/api/analyze/{asset:path}/{timeframe}")
async def api_analyze(asset: str, timeframe: str):
    df = fetch_ohlcv(asset, timeframe)
    if df is None:
        return {"error": "No data available for this asset/timeframe"}
    result = analyze(df, asset, timeframe)
    if result is None:
        return {"error": "Insufficient data for analysis"}
    return result.to_dict()


@app.get("/api/signals/history")
async def api_signal_history():
    return signal_history[:50]


@app.get("/api/scan")
async def api_scan():
    """Scan all assets on a given timeframe and return signals."""
    results: list[dict[str, Any]] = []
    for asset in ASSETS:
        df = fetch_ohlcv(asset, "5m")
        if df is None:
            continue
        result = analyze(df, asset, "5m")
        if result is not None:
            results.append(result.to_dict())
    return results


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
                asset = msg.get("asset", "EUR/USD")
                timeframe = msg.get("timeframe", "5m")
                chart_data = get_chart_data(asset, timeframe)
                await ws.send_text(
                    json.dumps({"type": "chart_data", "asset": asset, "timeframe": timeframe, "data": chart_data})
                )
            elif msg.get("type") == "get_analysis":
                asset = msg.get("asset", "EUR/USD")
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
