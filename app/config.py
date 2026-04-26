"""Configuration for the Quotex Signal Bot."""

ASSETS = {
    "EUR/USD": {"yf_symbol": "EURUSD=X", "category": "Forex"},
    "GBP/USD": {"yf_symbol": "GBPUSD=X", "category": "Forex"},
    "USD/JPY": {"yf_symbol": "JPY=X", "category": "Forex"},
    "AUD/USD": {"yf_symbol": "AUDUSD=X", "category": "Forex"},
    "EUR/GBP": {"yf_symbol": "EURGBP=X", "category": "Forex"},
    "USD/CAD": {"yf_symbol": "CAD=X", "category": "Forex"},
    "NZD/USD": {"yf_symbol": "NZDUSD=X", "category": "Forex"},
    "EUR/JPY": {"yf_symbol": "EURJPY=X", "category": "Forex"},
    "GBP/JPY": {"yf_symbol": "GBPJPY=X", "category": "Forex"},
    "CHF/JPY": {"yf_symbol": "CHFJPY=X", "category": "Forex"},
    "BTC/USD": {"yf_symbol": "BTC-USD", "category": "Crypto"},
    "ETH/USD": {"yf_symbol": "ETH-USD", "category": "Crypto"},
    "Gold": {"yf_symbol": "GC=F", "category": "Commodity"},
    "Silver": {"yf_symbol": "SI=F", "category": "Commodity"},
}

TIMEFRAMES = {
    "1m": {"yf_interval": "1m", "yf_period": "1d", "label": "1 Minute"},
    "5m": {"yf_interval": "5m", "yf_period": "5d", "label": "5 Minutes"},
    "15m": {"yf_interval": "15m", "yf_period": "5d", "label": "15 Minutes"},
    "1h": {"yf_interval": "1h", "yf_period": "1mo", "label": "1 Hour"},
}

SIGNAL_THRESHOLDS = {
    "rsi_overbought": 70,
    "rsi_oversold": 30,
    "rsi_period": 14,
    "ema_fast": 9,
    "ema_slow": 21,
    "macd_fast": 12,
    "macd_slow": 26,
    "macd_signal": 9,
    "bb_period": 20,
    "bb_std": 2.0,
    "stoch_k": 14,
    "stoch_d": 3,
    "stoch_overbought": 80,
    "stoch_oversold": 20,
}
