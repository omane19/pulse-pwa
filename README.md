# ◈ PULSE · Market Intelligence

> Real-time stock scoring, credibility-weighted news, smart money tracking — installable as a PWA on iPhone and Android.

**Live app:** [pulse-pwa.vercel.app](https://pulse-pwa.vercel.app)

---

## What PULSE does

PULSE scores any stock 0–100 using 7 independent factors and gives a BUY / HOLD / AVOID verdict with full reasoning. It is built for retail investors who want a fast, data-backed read on a stock — not just a price chart.

The score is not a recommendation. It is a structured signal that combines what the data says right now across multiple dimensions.

---

## Scoring engine

Every stock is scored across 7 factors. Weights are data-driven, calibrated against a 735-signal, 24-month backtest.

| Factor | Weight | What it measures |
|---|---|---|
| Trend | 20% | Price vs 50-day and 200-day MA |
| Analyst | 24% | Wall St consensus — context-aware, not blindly bullish |
| Momentum | 18% | 1d / 1m / 3m returns, RSI, volume, MACD |
| Valuation | 18% | P/E, PEG, FCF, ROE, debt/equity — growth-adjusted |
| Sentiment | 14% | Credibility-weighted news scoring across 10+ articles |
| Earnings | 6% | EPS beat rate, streak, magnitude, revenue surprises |
| Smart Money | conditional | Insider buys/sells + congressional trades (when available) |

**Verdict thresholds:**
- Score ≥ 66 → **BUY**
- Score 52–66 → **HOLD**
- Score < 52 → **AVOID**

**Important:** PULSE reads the current technical and fundamental picture. A stock can be a great long-term business (analysts right at 12 months) and still be a bad entry point today (PULSE right at the current moment). Both can be true simultaneously.

---

## Market regime gate

If SPY is below its 50-day MA, all BUY signals are suppressed to HOLD. Commodity ETFs (GLD, SLV), bonds (TLT), and crypto ETFs (IBIT) are exempt from this gate as they are uncorrelated with SPY.

This was added after backtesting showed 7 of the 10 worst signals all fired on the same day (Jan 17, 2025 — DeepSeek crash) with no macro awareness.

---

## Tabs

| Tab | What it does |
|---|---|
| **Dive** | Full analysis — score, chart, news, financials, earnings, options, DCF |
| **Watch** | Watchlist with live scores across all your tickers |
| **Screen** | Market screener — filter by sector, score, market cap |
| **Options** | Options chain via Polygon.io |
| **Money** | Smart Money — congressional trades + insider Form 4 filings |
| **VS** | Side-by-side comparison of two tickers |
| **Global** | Macro dashboard — treasury yields, GDP, CPI, sector performance |
| **Learn** | DCA calculator, options education, glossary |
| **Track** | Signal log — tracks every BUY/HOLD call and measures outcomes at 30/60/90 days |
| **Portfolio** | P&L tracker for your actual holdings |

---

## Tech stack

- **Frontend:** React 18 + Vite, PWA (installable on iOS and Android)
- **Proxy:** Vercel serverless function — all API keys are server-side, never exposed to browser
- **Data:** Financial Modeling Prep (primary), Finnhub, Polygon.io
- **Storage:** Supabase (signal tracking) with localStorage fallback
- **Deployment:** Vercel (auto-deploy on push to main)

---

## Run locally

```bash
git clone https://github.com/omane19/pulse-pwa.git
cd pulse-pwa
npm install
npm run dev
```

App opens at `http://localhost:5173`

For local API calls, add keys to `.env.local`:

```
FMP_KEY=your_fmp_key
FINNHUB_KEY=your_finnhub_key
POLYGON_KEY=your_polygon_key
```

---

## Deploy to Vercel

1. Push repo to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add environment variables in Vercel → Settings → Environment Variables:

| Variable | Required |
|---|---|
| `FMP_KEY` | Yes |
| `FINNHUB_KEY` | Yes |
| `POLYGON_KEY` | Options tab only |
| `VITE_SUPABASE_URL` | Signal tracking (optional) |
| `VITE_SUPABASE_ANON_KEY` | Signal tracking (optional) |

4. Redeploy — Vercel picks up env vars automatically

---

## Install on phone

**iPhone:** Safari → Share → Add to Home Screen

**Android:** Chrome → ⋮ menu → Add to Home Screen

---

## Known limitations

- Sentiment scoring uses keyword matching — context-aware NLP would improve accuracy
- Backtest used approximate historical fundamentals (point-in-time data requires a higher API plan)
- Earnings surprise magnitude data requires FMP premium plan — currently using beat/miss rate only
- Signal accuracy should be validated over 90+ days of forward tracking before using for real trading decisions

---

## Backtest results (v27 baseline, 735 signals, 24 months)

| Verdict | Signals | Win Rate | Avg Return |
|---|---|---|---|
| BUY | 292 | 58% | +3.6% |
| HOLD | 271 | 63% | +3.5% |
| AVOID | 172 | 69% | +9.0% |

BUY alpha vs SPY was -0.8% on the baseline. v28/v29 fixes (regime gate, contrarian analyst, weight rebalance, sentiment cleanup) are expected to improve this — forward validation ongoing.

---

## Version history

| Version | Key changes |
|---|---|
| v29 | Fixed sentiment false negatives, P/E valuation for hypergrowth stocks, tab state persistence, removed dead code |
| v28 | Market regime gate (SPY + sector ETF), weight rebalance from backtest data, context-aware analyst scoring, raised BUY threshold |
| v27 | Always-proxy architecture, Polygon options fix, dividend calendar |
| v26 | Smart money 7th factor, insider sell tracking |
| v25 | Supabase signal tracking, Track Record tab |

---

## License

Private project. Not for redistribution.
