# PULSE — API Key Security Setup

## How the Proxy Works
All API calls go through `/api/proxy.js` (Vercel serverless function).
Your keys **never appear in the browser** — not in Network tab, not in localStorage, not in JS bundle.

## Setup on Vercel (one-time)

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add these three variables:

| Name | Value |
|------|-------|
| `VITE_FMP_KEY` | Your FMP API key |
| `VITE_FINNHUB_KEY` | Your Finnhub API key |
| `VITE_AV_KEY` | Your Alpha Vantage key (optional) |

3. **Redeploy** — Vercel will pick up the new env vars automatically.

The Setup screen in PULSE will auto-detect the proxy and skip key entry entirely.

## Local Development
For local dev, you can either:
- Add keys to `.env.local`:
  ```
  VITE_FMP_KEY=your_key_here
  VITE_FINNHUB_KEY=your_key_here
  ```
- Or paste them in the Setup tab (stored in localStorage for local use only)

## Security Model
- Production (Vercel): Keys are server-side env vars, never sent to browser
- Local dev: Keys in localStorage or .env.local (acceptable for personal use)
- The proxy validates all paths and only allows whitelisted providers
