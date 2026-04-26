"""Market data fetcher using yfinance."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from app.config import ASSETS, TIMEFRAMES

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[pd.DataFrame, float]] = {}
CACHE_TTL_SECONDS = 30


def fetch_ohlcv(asset: str, timeframe: str) -> pd.DataFrame | None:
    """Fetch OHLCV data for an asset and timeframe. Returns a DataFrame or None."""
    if asset not in ASSETS:
        logger.warning("Unknown asset: %s", asset)
        return None
    if timeframe not in TIMEFRAMES:
        logger.warning("Unknown timeframe: %s", timeframe)
        return None

    cache_key = f"{asset}:{timeframe}"
    now = datetime.now(timezone.utc).timestamp()
    if cache_key in _cache:
        cached_df, cached_at = _cache[cache_key]
        if now - cached_at < CACHE_TTL_SECONDS:
            return cached_df

    symbol = ASSETS[asset]["yf_symbol"]
    tf_cfg = TIMEFRAMES[timeframe]

    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=tf_cfg["yf_period"], interval=tf_cfg["yf_interval"])
        if df is None or df.empty:
            logger.warning("No data returned for %s (%s)", asset, symbol)
            return None
        df = df.dropna(subset=["Close"])
        if len(df) < 2:
            return None
        _cache[cache_key] = (df, now)
        return df
    except Exception:
        logger.exception("Failed to fetch data for %s", asset)
        return None


def get_chart_data(asset: str, timeframe: str) -> list[dict[str, Any]]:
    """Return OHLCV data as a list of dicts for the frontend chart."""
    df = fetch_ohlcv(asset, timeframe)
    if df is None or df.empty:
        return []

    records: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        ts = idx
        if isinstance(ts, pd.Timestamp):
            epoch = int(ts.timestamp())
        else:
            epoch = int(pd.Timestamp(ts).timestamp())
        records.append(
            {
                "time": epoch,
                "open": round(float(row["Open"]), 6),
                "high": round(float(row["High"]), 6),
                "low": round(float(row["Low"]), 6),
                "close": round(float(row["Close"]), 6),
                "volume": round(float(row.get("Volume", 0)), 2),
            }
        )
    return records


def get_asset_list() -> list[dict[str, str]]:
    """Return available assets grouped by category."""
    return [
        {"name": name, "category": info["category"]}
        for name, info in ASSETS.items()
    ]
