"""Market data fetcher — Quotex WebSocket (primary) with yfinance fallback."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from app.config import CATEGORY_DISPLAY, QUOTEX_INSTRUMENTS, TIMEFRAMES, YF_SYMBOLS

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[pd.DataFrame, float]] = {}
CACHE_TTL_SECONDS = 30


def _get_quotex_client():
    """Lazy import to avoid circular imports."""
    from app.quotex_ws import get_quotex_client
    return get_quotex_client()


def fetch_ohlcv(asset_symbol: str, timeframe: str) -> pd.DataFrame | None:
    """Fetch OHLCV data. Uses Quotex WS candles if available, falls back to yfinance."""
    if asset_symbol not in QUOTEX_INSTRUMENTS:
        return None
    if timeframe not in TIMEFRAMES:
        return None

    # Try Quotex WebSocket candles first
    qx = _get_quotex_client()
    if qx and qx.connected:
        candles = qx.get_candles(asset_symbol, timeframe, limit=200)
        if candles and len(candles) >= 10:
            df = pd.DataFrame(candles)
            df.columns = ["time", "Open", "High", "Low", "Close"] + (["ticks"] if "ticks" in candles[0] else [])
            if "ticks" in df.columns:
                df["Volume"] = df["ticks"]
                df = df.drop(columns=["ticks"])
            else:
                df["Volume"] = 0
            df.index = pd.to_datetime(df["time"], unit="s", utc=True)
            df = df.drop(columns=["time"])
            return df

    # Fallback to yfinance
    # For OTC, use the base pair symbol
    base_symbol = asset_symbol.replace("_otc", "")
    yf_sym = YF_SYMBOLS.get(asset_symbol) or YF_SYMBOLS.get(base_symbol)
    if not yf_sym:
        return None

    cache_key = f"{yf_sym}:{timeframe}"
    now = datetime.now(timezone.utc).timestamp()
    if cache_key in _cache:
        cached_df, cached_at = _cache[cache_key]
        if now - cached_at < CACHE_TTL_SECONDS:
            return cached_df

    tf_cfg = TIMEFRAMES[timeframe]
    try:
        ticker = yf.Ticker(yf_sym)
        df = ticker.history(period=tf_cfg["yf_period"], interval=tf_cfg["yf_interval"])
        if df is None or df.empty:
            return None
        df = df.dropna(subset=["Close"])
        if len(df) < 2:
            return None
        _cache[cache_key] = (df, now)
        return df
    except Exception:
        logger.exception("Failed to fetch yfinance data for %s", yf_sym)
        return None


def get_chart_data(asset_symbol: str, timeframe: str) -> list[dict[str, Any]]:
    """Return OHLCV data as chart-ready dicts."""
    df = fetch_ohlcv(asset_symbol, timeframe)
    if df is None or df.empty:
        return []

    records: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        ts = idx
        if isinstance(ts, pd.Timestamp):
            epoch = int(ts.timestamp())
        else:
            epoch = int(pd.Timestamp(ts).timestamp())
        records.append({
            "time": epoch,
            "open": round(float(row["Open"]), 6),
            "high": round(float(row["High"]), 6),
            "low": round(float(row["Low"]), 6),
            "close": round(float(row["Close"]), 6),
            "volume": round(float(row.get("Volume", 0)), 2),
        })
    return records


def get_asset_list() -> list[dict[str, Any]]:
    """Return all Quotex instruments grouped by display category."""
    qx = _get_quotex_client()
    instruments = QUOTEX_INSTRUMENTS

    # If connected to Quotex, use live instrument data (payouts may change)
    if qx and qx.connected and qx.instruments:
        instruments = {}
        for sym, info in qx.instruments.items():
            instruments[sym] = info

    result: list[dict[str, Any]] = []
    for symbol, info in (instruments or QUOTEX_INSTRUMENTS).items():
        cat = info.get("category", "currency")
        is_otc = info.get("is_otc", symbol.endswith("_otc"))
        cat_display = CATEGORY_DISPLAY.get(cat, {"regular": cat.title(), "otc": f"{cat.title()} OTC"})
        display_cat = cat_display["otc"] if is_otc else cat_display["regular"]

        result.append({
            "symbol": symbol,
            "name": info.get("display_name", info.get("name", symbol)),
            "category": display_cat,
            "is_otc": is_otc,
            "payout": info.get("payout", 0),
            "decimals": info.get("decimals", 5),
        })

    # Sort: Regular first, then OTC, alphabetical within each
    result.sort(key=lambda x: (x["is_otc"], x["category"], x["name"]))
    return result


def get_live_price(asset_symbol: str) -> float | None:
    """Get the latest price for an asset."""
    qx = _get_quotex_client()
    if qx and qx.connected:
        return qx.current_prices.get(asset_symbol)
    return None
