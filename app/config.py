"""Configuration for the Quotex Signal Bot."""

ASSETS = {
    # ─── Forex ───
    "EUR/USD": {"yf_symbol": "EURUSD=X", "category": "Forex", "is_otc": False},
    "GBP/USD": {"yf_symbol": "GBPUSD=X", "category": "Forex", "is_otc": False},
    "USD/JPY": {"yf_symbol": "JPY=X", "category": "Forex", "is_otc": False},
    "AUD/USD": {"yf_symbol": "AUDUSD=X", "category": "Forex", "is_otc": False},
    "EUR/GBP": {"yf_symbol": "EURGBP=X", "category": "Forex", "is_otc": False},
    "USD/CAD": {"yf_symbol": "CAD=X", "category": "Forex", "is_otc": False},
    "NZD/USD": {"yf_symbol": "NZDUSD=X", "category": "Forex", "is_otc": False},
    "EUR/JPY": {"yf_symbol": "EURJPY=X", "category": "Forex", "is_otc": False},
    "GBP/JPY": {"yf_symbol": "GBPJPY=X", "category": "Forex", "is_otc": False},
    "CHF/JPY": {"yf_symbol": "CHFJPY=X", "category": "Forex", "is_otc": False},
    "USD/CHF": {"yf_symbol": "CHF=X", "category": "Forex", "is_otc": False},
    "AUD/CAD": {"yf_symbol": "AUDCAD=X", "category": "Forex", "is_otc": False},
    # ─── Forex OTC ───
    "EUR/USD (OTC)": {"yf_symbol": "EURUSD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "EUR/USD"},
    "GBP/USD (OTC)": {"yf_symbol": "GBPUSD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "GBP/USD"},
    "USD/JPY (OTC)": {"yf_symbol": "JPY=X", "category": "Forex OTC", "is_otc": True, "base_asset": "USD/JPY"},
    "AUD/USD (OTC)": {"yf_symbol": "AUDUSD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "AUD/USD"},
    "EUR/GBP (OTC)": {"yf_symbol": "EURGBP=X", "category": "Forex OTC", "is_otc": True, "base_asset": "EUR/GBP"},
    "USD/CAD (OTC)": {"yf_symbol": "CAD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "USD/CAD"},
    "NZD/USD (OTC)": {"yf_symbol": "NZDUSD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "NZD/USD"},
    "EUR/JPY (OTC)": {"yf_symbol": "EURJPY=X", "category": "Forex OTC", "is_otc": True, "base_asset": "EUR/JPY"},
    "GBP/JPY (OTC)": {"yf_symbol": "GBPJPY=X", "category": "Forex OTC", "is_otc": True, "base_asset": "GBP/JPY"},
    "CHF/JPY (OTC)": {"yf_symbol": "CHFJPY=X", "category": "Forex OTC", "is_otc": True, "base_asset": "CHF/JPY"},
    "USD/CHF (OTC)": {"yf_symbol": "CHF=X", "category": "Forex OTC", "is_otc": True, "base_asset": "USD/CHF"},
    "AUD/CAD (OTC)": {"yf_symbol": "AUDCAD=X", "category": "Forex OTC", "is_otc": True, "base_asset": "AUD/CAD"},
    # ─── Crypto ───
    "BTC/USD": {"yf_symbol": "BTC-USD", "category": "Crypto", "is_otc": False},
    "ETH/USD": {"yf_symbol": "ETH-USD", "category": "Crypto", "is_otc": False},
    # ─── Crypto OTC ───
    "BTC/USD (OTC)": {"yf_symbol": "BTC-USD", "category": "Crypto OTC", "is_otc": True, "base_asset": "BTC/USD"},
    "ETH/USD (OTC)": {"yf_symbol": "ETH-USD", "category": "Crypto OTC", "is_otc": True, "base_asset": "ETH/USD"},
    # ─── Commodity ───
    "Gold": {"yf_symbol": "GC=F", "category": "Commodity", "is_otc": False},
    "Silver": {"yf_symbol": "SI=F", "category": "Commodity", "is_otc": False},
    # ─── Commodity OTC ───
    "Gold (OTC)": {"yf_symbol": "GC=F", "category": "Commodity OTC", "is_otc": True, "base_asset": "Gold"},
    "Silver (OTC)": {"yf_symbol": "SI=F", "category": "Commodity OTC", "is_otc": True, "base_asset": "Silver"},
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
