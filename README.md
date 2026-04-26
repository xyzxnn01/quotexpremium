# 📊 Quotex Signal Bot — Live Trading Signals & Analysis

A real-time trading signal dashboard that provides technical analysis and Buy/Sell signals for assets available on the Quotex trading platform.

## Features

- **Live Candlestick Charts** — Powered by TradingView Lightweight Charts
- **Multi-Asset Support** — Forex (EUR/USD, GBP/USD, USD/JPY, etc.), Crypto (BTC, ETH), Commodities (Gold, Silver)
- **5 Technical Indicators**:
  - RSI (Relative Strength Index)
  - EMA Cross (9/21 Exponential Moving Average)
  - MACD (Moving Average Convergence Divergence)
  - Bollinger Bands
  - Stochastic Oscillator
- **Signal Scanner** — Scan all assets at once to find the strongest signals
- **Real-time WebSocket Updates** — Automatic signal refresh every 2 minutes
- **Multiple Timeframes** — 1m, 5m, 15m, 1h
- **Responsive Design** — Works on desktop and mobile

## Quick Start

```bash
# Clone the repository
git clone https://github.com/xyzxnn01/quotex-signal-bot.git
cd quotex-signal-bot

# Install dependencies
pip install -e .

# Run the application
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Open http://localhost:8000 in your browser
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python, FastAPI |
| Frontend | HTML/CSS/JS, TradingView Lightweight Charts |
| Data Source | Yahoo Finance (yfinance) |
| Analysis | pandas-ta (Technical Analysis) |
| Real-time | WebSocket |

## How It Works

1. Select an asset (e.g., EUR/USD) and timeframe (e.g., 5m)
2. Click **Analyze** to get detailed technical analysis with 5 indicators
3. Use **Scan All Assets** to find the strongest buy/sell signals across all assets
4. The bot automatically updates signals every 2 minutes via WebSocket

## Signal Types

| Signal | Meaning | Action |
|--------|---------|--------|
| 🟢 STRONG BUY | Multiple indicators bullish | Consider CALL option |
| 🟢 BUY | Majority indicators bullish | Consider CALL option |
| ⚪ NEUTRAL | Mixed signals | Wait for clearer trend |
| 🔴 SELL | Majority indicators bearish | Consider PUT option |
| 🔴 STRONG SELL | Multiple indicators bearish | Consider PUT option |

## Disclaimer

⚠️ This tool is for **educational purposes only**. Trading involves significant risk. Past performance does not guarantee future results. Always do your own research before making trading decisions.
