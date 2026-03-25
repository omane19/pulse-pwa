# ◈ PULSE · Market Intelligence

> Real-time stock scoring, plain English analysis, smart money tracking — installable as a PWA on iPhone and Android.

**Live app:** [om-sn.vercel.app](https://om-sn.vercel.app)
**GitHub:** [github.com/omane19/pulse-pwa](https://github.com/omane19/pulse-pwa)

---

## What PULSE does

PULSE scores any US stock or ETF 0–100 across 7 independent factors and gives a **BUY / HOLD / AVOID** verdict — with a plain English explanation of what the data means and exactly what price levels to watch.

Built for retail investors who want a fast, data-backed read on a stock before making a decision. Not just a chart. Not just numbers. An actual answer.

**The score is not a recommendation. It is a structured signal.**

---

## Scoring engine

Every stock is scored across 7 factors. Weights are data-driven, calibrated against a 735-signal, 24-month backtest.

| Factor | Weight | What it measures |
|---|---|---|
| Trend | 20% | Price vs 50-day and 200-day MA |
| Analyst | 24% | Wall St consensus — context-aware, not blindly bullish |
| Momentum | 18% | 1m / 3m / 6m / 1y returns, RSI, volume, MACD |
| Valuation | 18% | P/E, PEG, FCF, ROE, debt/equity — growth-adjusted |
| Sentiment | 14% | Credibility-weighted news scoring |
| Earnings | 6% | EPS beat rate, streak, magnitude, revenue surprises |
| Smart Money | conditional | Insider buys/sells + congressional trades |

**Verdict thresholds:**
- Score ≥ 66 → **BUY**
- Score 52–66 → **HOLD**
- Score < 52 → **AVOID**

**Quality Dip override:** When a stock has strong fundamentals (revenue growth >20% or PEG <1.5), is down >15% from its 52-week high, RSI is not in freefall, and has no recent earnings miss — PULSE applies a Quality Dip bonus and floors the verdict at HOLD. This prevents penalizing great companies for short-term price weakness.

---

## Tabs

| Tab | What it does |
|---|---|
| **Dive** | Full analysis — score, plain English synthesis, Watch For signals, chart, news, financials, earnings, DCF fair value |
| **Watch** | Watchlist with live scores, one-line signal reason per ticker, price alerts, earnings countdowns |
| **Screen** | Market screener — filter by sector, verdict, P/E, Quality Dip |
| **Options** | Volatility intelligence (HV20, expected move), earnings IV crush warning, options chain via Polygon.io |
| **Money** | Smart Money — congressional trades, insider cluster alerts, buy-only filter |
| **VS** | Side-by-side comparison of two tickers |
| **Global** | Macro environment synthesis, sector heatmap, watchlist cross-reference, economic calendar, yield curve |
| **Learn** | DCA calculator, options education, glossary |
| **Track** | Signal log — tracks every call and measures outcomes at 30/60/90 days vs SPY benchmark |
| **Portfolio** | P&L tracker with live PULSE scores and exit signal alerts per holding |

---

## Tech stack

- **Frontend:** React 18 + Vite, PWA (installable on iOS and Android)
- **Proxy:** Vercel serverless function — all API keys server-side, never exposed to browser
- **Data:** Financial Modeling Prep (primary), Finnhub, Polygon.io
- **Storage:** Supabase (signal tracking) with localStorage fallback
- **Deployment:** Vercel — auto-deploys on every push to main

---

## Run locally

```bash
git clone https://github.com/omane19/pulse-pwa.git
cd pulse-pwa
npm install
npm run dev
```

App opens at `http://localhost:5173`

Add keys to `.env.local`:

```
FMP_KEY=your_fmp_key
FINNHUB_KEY=your_finnhub_key
POLYGON_KEY=your_polygon_key
```

---

## Deploy to Vercel

1. Push repo to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add environment variables — Settings → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `FMP_KEY` | Yes | All fundamental data |
| `FINNHUB_KEY` | Yes | Company profiles, earnings calendar |
| `POLYGON_KEY` | Yes | Options chain, unusual flow |
| `VITE_SUPABASE_URL` | Optional | Cross-device signal tracking |
| `VITE_SUPABASE_ANON_KEY` | Optional | Cross-device signal tracking |

**All keys have no `VITE_` prefix — server-side only.**

---

## Install on phone

**iPhone:** Safari → Share → Add to Home Screen

**Android:** Chrome → ⋮ menu → Add to Home Screen

---

## Known limitations

- Sentiment scoring uses keyword matching — LLM-based analysis planned as next major feature
- Backtest used approximate historical fundamentals
- Signal accuracy should be validated over 90+ days before committing real capital
- Options chain requires Polygon.io free key in Vercel env vars

---

## Backtest results (v27 baseline — 735 signals, 24 months)

| Verdict | Signals | Win Rate | Avg Return |
|---|---|---|---|
| BUY | 292 | 58% | +3.6% |
| HOLD | 271 | 63% | +3.5% |
| AVOID | 172 | 69% | +9.0% |

BUY alpha vs SPY was -0.8% at baseline. Chunk 1-3 improvements are expected to increase this — forward validation ongoing.

---

## Version history

| Version | Key changes |
|---|---|
| Chunk 3 | Watch For signals, macro×watchlist cross-reference, factor accuracy breakdown, buy-only filter on Smart Money |
| Chunk 2 | Options volatility intelligence, Quality Dip screener filter, DCF fair value at top of Dive, SPY benchmark, Polygon key fix |
| Chunk 1 | Plain English synthesis, SPY gate removed, one-line Watchlist reasons, insider cluster alerts, macro synthesis, Portfolio scores |
| v29 | Quality Dip signal, 6m+1y momentum, sentiment cleanup, valuation fix for hypergrowth, tab state persistence |
| v28 | Weight rebalance from backtest, context-aware analyst scoring, raised BUY threshold |
| v27 | Always-proxy architecture, Polygon options fix |
| v26 | Smart money 7th factor, insider sell tracking |
| v25 | Supabase signal tracking, Track Record tab |

---

## License

Private project. Not for redistribution.
