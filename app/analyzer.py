"""Technical analysis engine for generating trading signals."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import numpy as np
import pandas as pd
import pandas_ta as ta

from app.config import SIGNAL_THRESHOLDS

logger = logging.getLogger(__name__)


class SignalType(str, Enum):
    STRONG_BUY = "STRONG BUY"
    BUY = "BUY"
    NEUTRAL = "NEUTRAL"
    SELL = "SELL"
    STRONG_SELL = "STRONG SELL"


@dataclass
class IndicatorResult:
    name: str
    value: float
    signal: SignalType
    description: str


@dataclass
class AnalysisResult:
    asset: str
    timeframe: str
    timestamp: str
    current_price: float
    indicators: list[IndicatorResult] = field(default_factory=list)
    overall_signal: SignalType = SignalType.NEUTRAL
    signal_strength: float = 0.0
    recommendation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "asset": self.asset,
            "timeframe": self.timeframe,
            "timestamp": self.timestamp,
            "current_price": self.current_price,
            "indicators": [
                {
                    "name": i.name,
                    "value": round(i.value, 4),
                    "signal": i.signal.value,
                    "description": i.description,
                }
                for i in self.indicators
            ],
            "overall_signal": self.overall_signal.value,
            "signal_strength": round(self.signal_strength, 2),
            "recommendation": self.recommendation,
        }


def _compute_rsi(df: pd.DataFrame) -> IndicatorResult | None:
    period = SIGNAL_THRESHOLDS["rsi_period"]
    rsi_series = ta.rsi(df["Close"], length=period)
    if rsi_series is None or rsi_series.empty:
        return None
    val = rsi_series.iloc[-1]
    if np.isnan(val):
        return None
    ob = SIGNAL_THRESHOLDS["rsi_overbought"]
    os_ = SIGNAL_THRESHOLDS["rsi_oversold"]
    if val >= ob:
        sig = SignalType.STRONG_SELL
        desc = f"RSI({period}) = {val:.1f} — Overbought zone (>{ob})"
    elif val >= 60:
        sig = SignalType.SELL
        desc = f"RSI({period}) = {val:.1f} — Approaching overbought"
    elif val <= os_:
        sig = SignalType.STRONG_BUY
        desc = f"RSI({period}) = {val:.1f} — Oversold zone (<{os_})"
    elif val <= 40:
        sig = SignalType.BUY
        desc = f"RSI({period}) = {val:.1f} — Approaching oversold"
    else:
        sig = SignalType.NEUTRAL
        desc = f"RSI({period}) = {val:.1f} — Neutral zone"
    return IndicatorResult(name="RSI", value=val, signal=sig, description=desc)


def _compute_ema(df: pd.DataFrame) -> IndicatorResult | None:
    fast = SIGNAL_THRESHOLDS["ema_fast"]
    slow = SIGNAL_THRESHOLDS["ema_slow"]
    ema_fast = ta.ema(df["Close"], length=fast)
    ema_slow = ta.ema(df["Close"], length=slow)
    if ema_fast is None or ema_slow is None:
        return None
    vf = ema_fast.iloc[-1]
    vs = ema_slow.iloc[-1]
    if np.isnan(vf) or np.isnan(vs):
        return None
    diff_pct = ((vf - vs) / vs) * 100
    if vf > vs:
        if diff_pct > 0.1:
            sig = SignalType.STRONG_BUY
            desc = f"EMA({fast}) > EMA({slow}) — Strong bullish crossover (+{diff_pct:.3f}%)"
        else:
            sig = SignalType.BUY
            desc = f"EMA({fast}) > EMA({slow}) — Bullish (+{diff_pct:.3f}%)"
    elif vf < vs:
        if diff_pct < -0.1:
            sig = SignalType.STRONG_SELL
            desc = f"EMA({fast}) < EMA({slow}) — Strong bearish crossover ({diff_pct:.3f}%)"
        else:
            sig = SignalType.SELL
            desc = f"EMA({fast}) < EMA({slow}) — Bearish ({diff_pct:.3f}%)"
    else:
        sig = SignalType.NEUTRAL
        desc = f"EMA({fast}) ≈ EMA({slow}) — No clear trend"
    return IndicatorResult(name="EMA Cross", value=diff_pct, signal=sig, description=desc)


def _compute_macd(df: pd.DataFrame) -> IndicatorResult | None:
    fast = SIGNAL_THRESHOLDS["macd_fast"]
    slow = SIGNAL_THRESHOLDS["macd_slow"]
    signal = SIGNAL_THRESHOLDS["macd_signal"]
    macd_df = ta.macd(df["Close"], fast=fast, slow=slow, signal=signal)
    if macd_df is None or macd_df.empty:
        return None
    macd_line = macd_df.iloc[-1, 0]
    signal_line = macd_df.iloc[-1, 2]
    histogram = macd_df.iloc[-1, 1]
    if np.isnan(macd_line) or np.isnan(signal_line):
        return None
    if macd_line > signal_line and histogram > 0:
        sig = SignalType.BUY
        desc = f"MACD above signal line, histogram positive ({histogram:.5f})"
    elif macd_line > signal_line:
        sig = SignalType.BUY
        desc = f"MACD above signal line ({macd_line:.5f} > {signal_line:.5f})"
    elif macd_line < signal_line and histogram < 0:
        sig = SignalType.SELL
        desc = f"MACD below signal line, histogram negative ({histogram:.5f})"
    elif macd_line < signal_line:
        sig = SignalType.SELL
        desc = f"MACD below signal line ({macd_line:.5f} < {signal_line:.5f})"
    else:
        sig = SignalType.NEUTRAL
        desc = "MACD and signal line converging"
    return IndicatorResult(name="MACD", value=histogram, signal=sig, description=desc)


def _compute_bollinger(df: pd.DataFrame) -> IndicatorResult | None:
    period = SIGNAL_THRESHOLDS["bb_period"]
    std = SIGNAL_THRESHOLDS["bb_std"]
    bb = ta.bbands(df["Close"], length=period, std=std)
    if bb is None or bb.empty:
        return None
    upper = bb.iloc[-1, 0]
    mid = bb.iloc[-1, 1]
    lower = bb.iloc[-1, 2]
    price = df["Close"].iloc[-1]
    if np.isnan(upper) or np.isnan(lower):
        return None
    bb_pct = (price - lower) / (upper - lower) if (upper - lower) != 0 else 0.5
    if price >= upper:
        sig = SignalType.STRONG_SELL
        desc = f"Price at/above upper band — Overbought (BB%: {bb_pct:.2f})"
    elif price >= mid + (upper - mid) * 0.5:
        sig = SignalType.SELL
        desc = f"Price approaching upper band (BB%: {bb_pct:.2f})"
    elif price <= lower:
        sig = SignalType.STRONG_BUY
        desc = f"Price at/below lower band — Oversold (BB%: {bb_pct:.2f})"
    elif price <= mid - (mid - lower) * 0.5:
        sig = SignalType.BUY
        desc = f"Price approaching lower band (BB%: {bb_pct:.2f})"
    else:
        sig = SignalType.NEUTRAL
        desc = f"Price in middle of bands (BB%: {bb_pct:.2f})"
    return IndicatorResult(name="Bollinger Bands", value=bb_pct, signal=sig, description=desc)


def _compute_stochastic(df: pd.DataFrame) -> IndicatorResult | None:
    k = SIGNAL_THRESHOLDS["stoch_k"]
    d = SIGNAL_THRESHOLDS["stoch_d"]
    stoch = ta.stoch(df["High"], df["Low"], df["Close"], k=k, d=d)
    if stoch is None or stoch.empty:
        return None
    k_val = stoch.iloc[-1, 0]
    d_val = stoch.iloc[-1, 1]
    if np.isnan(k_val) or np.isnan(d_val):
        return None
    ob = SIGNAL_THRESHOLDS["stoch_overbought"]
    os_ = SIGNAL_THRESHOLDS["stoch_oversold"]
    if k_val >= ob and d_val >= ob:
        sig = SignalType.STRONG_SELL
        desc = f"Stochastic K={k_val:.1f}, D={d_val:.1f} — Overbought"
    elif k_val >= ob:
        sig = SignalType.SELL
        desc = f"Stochastic K={k_val:.1f}, D={d_val:.1f} — Near overbought"
    elif k_val <= os_ and d_val <= os_:
        sig = SignalType.STRONG_BUY
        desc = f"Stochastic K={k_val:.1f}, D={d_val:.1f} — Oversold"
    elif k_val <= os_:
        sig = SignalType.BUY
        desc = f"Stochastic K={k_val:.1f}, D={d_val:.1f} — Near oversold"
    else:
        sig = SignalType.NEUTRAL
        desc = f"Stochastic K={k_val:.1f}, D={d_val:.1f} — Neutral"
    return IndicatorResult(name="Stochastic", value=k_val, signal=sig, description=desc)


SIGNAL_WEIGHTS = {
    SignalType.STRONG_BUY: 2,
    SignalType.BUY: 1,
    SignalType.NEUTRAL: 0,
    SignalType.SELL: -1,
    SignalType.STRONG_SELL: -2,
}


def analyze(df: pd.DataFrame, asset: str, timeframe: str) -> AnalysisResult | None:
    """Run all indicators and produce an overall signal."""
    if df is None or len(df) < 30:
        return None

    current_price = float(df["Close"].iloc[-1])
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    indicators: list[IndicatorResult] = []
    for fn in (_compute_rsi, _compute_ema, _compute_macd, _compute_bollinger, _compute_stochastic):
        result = fn(df)
        if result is not None:
            indicators.append(result)

    if not indicators:
        return None

    total = sum(SIGNAL_WEIGHTS[ind.signal] for ind in indicators)
    max_score = 2 * len(indicators)
    strength = abs(total) / max_score * 100 if max_score else 0

    if total >= 4:
        overall = SignalType.STRONG_BUY
        rec = "📈 Strong BUY signal — Multiple indicators confirm bullish momentum. Consider CALL option."
    elif total >= 2:
        overall = SignalType.BUY
        rec = "📈 BUY signal — Majority of indicators are bullish. Consider CALL option."
    elif total <= -4:
        overall = SignalType.STRONG_SELL
        rec = "📉 Strong SELL signal — Multiple indicators confirm bearish momentum. Consider PUT option."
    elif total <= -2:
        overall = SignalType.SELL
        rec = "📉 SELL signal — Majority of indicators are bearish. Consider PUT option."
    else:
        overall = SignalType.NEUTRAL
        rec = "⏸ NEUTRAL — Mixed signals. Wait for clearer trend before entering a trade."

    return AnalysisResult(
        asset=asset,
        timeframe=timeframe,
        timestamp=now,
        current_price=current_price,
        indicators=indicators,
        overall_signal=overall,
        signal_strength=strength,
        recommendation=rec,
    )
