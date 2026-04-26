"""Quotex WebSocket client for real-time market data."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from typing import Any, Callable

import websockets

logger = logging.getLogger(__name__)

QUOTEX_WS_URL = "wss://ws2.market-qx.trade/socket.io/?EIO=3&transport=websocket"


class QuotexWSClient:
    """Async WebSocket client for Quotex real-time data."""

    def __init__(self, session_token: str, is_demo: bool = True):
        self.session_token = session_token
        self.is_demo = is_demo
        self.ws: Any = None
        self.connected = False
        self.instruments: dict[str, dict] = {}
        self.ticks: dict[str, list[dict]] = defaultdict(list)
        self.candles: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
        self.current_prices: dict[str, float] = {}
        self.subscribed_assets: set[str] = set()
        self._tick_callbacks: list[Callable] = []
        self._candle_callbacks: list[Callable] = []
        self._ping_task: asyncio.Task | None = None
        self._receive_task: asyncio.Task | None = None
        self._max_ticks_per_asset = 5000

    def on_tick(self, callback: Callable) -> None:
        self._tick_callbacks.append(callback)

    def on_candle(self, callback: Callable) -> None:
        self._candle_callbacks.append(callback)

    async def connect(self) -> bool:
        """Connect to Quotex WebSocket."""
        try:
            self.ws = await websockets.connect(
                QUOTEX_WS_URL,
                additional_headers={
                    "Origin": "https://market-qx.trade",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                ping_interval=None,
                max_size=10 * 1024 * 1024,
            )
            logger.info("WebSocket connected to Quotex")

            # Wait for initial handshake
            init_msg = await self.ws.recv()
            if isinstance(init_msg, str) and init_msg.startswith("0{"):
                handshake = json.loads(init_msg[1:])
                logger.info("Quotex handshake: sid=%s", handshake.get("sid"))

            # Wait for session confirmation
            session_msg = await self.ws.recv()
            logger.info("Session msg: %s", session_msg[:50] if isinstance(session_msg, str) else "binary")

            # Send authorization
            auth_payload = json.dumps(
                ["authorization", {"session": self.session_token, "isDemo": 1 if self.is_demo else 0, "tournamentId": 0}]
            )
            await self.ws.send(f"42{auth_payload}")
            logger.info("Sent authorization")

            # Start background tasks
            self._ping_task = asyncio.create_task(self._ping_loop())
            self._receive_task = asyncio.create_task(self._receive_loop())

            self.connected = True
            return True

        except Exception:
            logger.exception("Failed to connect to Quotex WebSocket")
            return False

    async def disconnect(self) -> None:
        """Disconnect from Quotex WebSocket."""
        self.connected = False
        if self._ping_task:
            self._ping_task.cancel()
        if self._receive_task:
            self._receive_task.cancel()
        if self.ws:
            await self.ws.close()

    async def subscribe_asset(self, asset_symbol: str, period: int = 60) -> None:
        """Subscribe to an asset's tick data."""
        if not self.connected or not self.ws:
            return
        self.subscribed_assets.add(asset_symbol)
        msg = json.dumps(["instruments/update", {"asset": asset_symbol, "period": period}])
        await self.ws.send(f"42{msg}")
        logger.info("Subscribed to %s (period=%d)", asset_symbol, period)

    async def subscribe_ticks(self) -> None:
        """Subscribe to global tick stream."""
        if not self.connected or not self.ws:
            return
        await self.ws.send('42["tick"]')
        logger.info("Subscribed to tick stream")

    async def _ping_loop(self) -> None:
        """Send periodic pings to keep connection alive."""
        try:
            while self.connected:
                await asyncio.sleep(25)
                if self.ws:
                    await self.ws.send("2")
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Ping loop error")

    async def _receive_loop(self) -> None:
        """Receive and process messages from Quotex."""
        try:
            while self.connected and self.ws:
                try:
                    msg = await asyncio.wait_for(self.ws.recv(), timeout=35)
                except asyncio.TimeoutError:
                    logger.warning("Receive timeout, connection may be lost")
                    continue

                if isinstance(msg, bytes):
                    await self._handle_binary(msg)
                elif isinstance(msg, str):
                    await self._handle_text(msg)

        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Quotex WebSocket connection closed")
            self.connected = False
        except Exception:
            logger.exception("Receive loop error")
            self.connected = False

    async def _handle_text(self, msg: str) -> None:
        """Handle text WebSocket messages."""
        if msg == "3":  # pong
            return
        if msg.startswith("42"):
            try:
                data = json.loads(msg[2:])
                event = data[0] if isinstance(data, list) else None
                if event == "s_authorization":
                    logger.info("Authorization successful")
                    await self.subscribe_ticks()
                elif event == "s_balance/list":
                    pass  # Balance update
            except (json.JSONDecodeError, IndexError):
                pass

    async def _handle_binary(self, msg: bytes) -> None:
        """Handle binary WebSocket messages (tick data, instrument list, etc.)."""
        try:
            # Binary messages: first byte is type marker, rest is JSON
            text = msg[1:].decode("utf-8", errors="replace")
            data = json.loads(text)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        if isinstance(data, list):
            if len(data) > 10 and isinstance(data[0], list) and len(data[0]) > 5:
                # Instrument list
                self._process_instruments(data)
            elif len(data) == 1 and isinstance(data[0], list):
                inner = data[0]
                if len(inner) == 4 and isinstance(inner[0], str):
                    # Tick data: [asset, timestamp, price, direction]
                    await self._process_tick(inner)
                elif len(inner) == 2 and isinstance(inner[0], str) and isinstance(inner[1], (int, float)):
                    # Depth/sentiment data: [asset, value]
                    pass

        elif isinstance(data, dict):
            if "asset" in data and "history" in data:
                self._process_history(data)

    def _process_instruments(self, instruments: list[list]) -> None:
        """Process the instruments list from Quotex."""
        for item in instruments:
            if len(item) < 6:
                continue
            inst_id, symbol, display_name, category = item[0], item[1], item[2], item[3]
            decimals = item[4] if len(item) > 4 else 5
            payout = item[5] if len(item) > 5 else 0
            is_otc = symbol.endswith("_otc")
            self.instruments[symbol] = {
                "id": inst_id,
                "symbol": symbol,
                "display_name": display_name,
                "category": category,
                "decimals": decimals,
                "payout": payout,
                "is_otc": is_otc,
            }
        logger.info("Loaded %d instruments from Quotex", len(self.instruments))

    async def _process_tick(self, tick: list) -> None:
        """Process a single tick: [asset, timestamp, price, direction]."""
        asset, timestamp, price, direction = tick[0], tick[1], tick[2], tick[3]
        tick_data = {
            "asset": asset,
            "timestamp": timestamp,
            "price": price,
            "direction": direction,  # 0=down, 1=up
        }
        self.current_prices[asset] = price
        self.ticks[asset].append(tick_data)

        # Trim old ticks
        if len(self.ticks[asset]) > self._max_ticks_per_asset:
            self.ticks[asset] = self.ticks[asset][-self._max_ticks_per_asset:]

        # Aggregate into candles
        self._aggregate_candle(asset, tick_data)

        # Notify callbacks
        for cb in self._tick_callbacks:
            try:
                if asyncio.iscoroutinefunction(cb):
                    await cb(tick_data)
                else:
                    cb(tick_data)
            except Exception:
                logger.exception("Tick callback error")

    def _aggregate_candle(self, asset: str, tick: dict) -> None:
        """Aggregate tick data into 1-minute candles."""
        ts = tick["timestamp"]
        price = tick["price"]
        # Round to minute boundary
        candle_time = int(ts) - (int(ts) % 60)

        candles = self.candles[asset]["1m"]
        if candles and candles[-1]["time"] == candle_time:
            # Update existing candle
            c = candles[-1]
            c["high"] = max(c["high"], price)
            c["low"] = min(c["low"], price)
            c["close"] = price
            c["ticks"] += 1
        else:
            # New candle
            candles.append({
                "time": candle_time,
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "ticks": 1,
            })
            # Keep last 500 candles
            if len(candles) > 500:
                self.candles[asset]["1m"] = candles[-500:]

    def _process_history(self, data: dict) -> None:
        """Process historical tick data for an asset."""
        asset = data["asset"]
        history = data.get("history", [])
        logger.info("Received history for %s: %d ticks", asset, len(history))
        for tick_arr in history:
            if len(tick_arr) >= 3:
                tick_data = {
                    "asset": asset,
                    "timestamp": tick_arr[0],
                    "price": tick_arr[1],
                    "direction": tick_arr[2],
                }
                self.ticks[asset].append(tick_data)
                self.current_prices[asset] = tick_arr[1]
                self._aggregate_candle(asset, tick_data)

    def get_candles(self, asset: str, timeframe: str = "1m", limit: int = 200) -> list[dict]:
        """Get aggregated candles for an asset."""
        candles_1m = self.candles[asset]["1m"]

        if timeframe == "1m":
            return candles_1m[-limit:]

        # Aggregate to higher timeframes
        minutes = {"5m": 5, "15m": 15, "1h": 60}.get(timeframe, 5)
        if not candles_1m:
            return []

        aggregated: list[dict] = []
        for c in candles_1m:
            bucket_time = c["time"] - (c["time"] % (minutes * 60))
            if aggregated and aggregated[-1]["time"] == bucket_time:
                agg = aggregated[-1]
                agg["high"] = max(agg["high"], c["high"])
                agg["low"] = min(agg["low"], c["low"])
                agg["close"] = c["close"]
            else:
                aggregated.append({
                    "time": bucket_time,
                    "open": c["open"],
                    "high": c["high"],
                    "low": c["low"],
                    "close": c["close"],
                })

        return aggregated[-limit:]


# Global client instance
quotex_client: QuotexWSClient | None = None


def get_quotex_client() -> QuotexWSClient | None:
    return quotex_client


async def init_quotex_client(session_token: str | None = None, is_demo: bool = True) -> QuotexWSClient | None:
    """Initialize the global Quotex WebSocket client."""
    global quotex_client
    token = session_token or os.environ.get("QUOTEX_SESSION_TOKEN", "")
    if not token:
        logger.warning("No Quotex session token provided. Real-time data unavailable.")
        return None

    client = QuotexWSClient(session_token=token, is_demo=is_demo)
    if await client.connect():
        quotex_client = client
        # Wait a moment for instruments to load
        await asyncio.sleep(2)
        logger.info("Quotex client initialized with %d instruments", len(client.instruments))
        return client
    return None
