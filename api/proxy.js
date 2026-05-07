/**
 * PULSE API Proxy — Vercel Serverless Function
 * Keeps FMP, Finnhub, and AlphaVantage keys server-side only.
 * Frontend calls /api/proxy?provider=fmp&path=/quote?symbol=AAPL
 * This function appends the real API key and forwards the request.
 */

const ALLOWED_PROVIDERS = ['fmp', 'fmp_v3', 'fmp_v4', 'finnhub', 'av', 'polygon', 'polymarket']

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

export default async function handler(req, res) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end()
  }

  const { provider, path: apiPath } = req.query

  if (!provider || !apiPath) {
    return res.status(400).json({ error: 'Missing provider or path' })
  }

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' })
  }

  // Sanitize path — no external URLs allowed, must start with /
  if (!apiPath.startsWith('/') || apiPath.includes('://')) {
    return res.status(400).json({ error: 'Invalid path' })
  }

  try {
    let url

    if (provider === 'fmp') {
      const key = process.env.FMP_KEY || process.env.VITE_FMP_KEY
      if (!key) return res.status(500).json({ error: 'FMP key not configured' })
      const sep = apiPath.includes('?') ? '&' : '?'
      url = `https://financialmodelingprep.com/stable${apiPath}${sep}apikey=${key}`

    } else if (provider === 'fmp_v3') {
      const key = process.env.FMP_KEY || process.env.VITE_FMP_KEY
      if (!key) return res.status(500).json({ error: 'FMP key not configured' })
      const sep = apiPath.includes('?') ? '&' : '?'
      url = `https://financialmodelingprep.com/api/v3${apiPath}${sep}apikey=${key}`

    } else if (provider === 'fmp_v4') {
      const key = process.env.FMP_KEY || process.env.VITE_FMP_KEY
      if (!key) return res.status(500).json({ error: 'FMP key not configured' })
      const sep = apiPath.includes('?') ? '&' : '?'
      url = `https://financialmodelingprep.com/api/v4${apiPath}${sep}apikey=${key}`

    } else if (provider === 'finnhub') {
      const key = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY
      if (!key) return res.status(500).json({ error: 'Finnhub key not configured' })
      url = `https://finnhub.io/api/v1${apiPath}&token=${key}`

    } else if (provider === 'av') {
      const key = process.env.AV_KEY || process.env.VITE_AV_KEY
      if (!key) return res.status(500).json({ error: 'AV key not configured' })
      // AV uses query params differently
      url = `https://www.alphavantage.co/query${apiPath}&apikey=${key}`

    } else if (provider === 'polygon') {
      const key = process.env.POLYGON_KEY || process.env.VITE_POLYGON_KEY
      if (!key) return res.status(500).json({ error: 'Polygon key not configured' })
      // Polygon uses apiKey query param
      const sep = apiPath.includes('?') ? '&' : '?'
      url = `https://api.polygon.io${apiPath}${sep}apiKey=${key}`

    } else if (provider === 'polymarket') {
      // Public API — no key required, proxy to bypass browser CORS restriction
      url = `https://gamma-api.polymarket.com${apiPath}`
    }

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'PULSE-PWA/1.0' },
      signal: AbortSignal.timeout(12000),
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
    }

    const data = await upstream.json()

    // Polymarket: never cache — prediction prices change by the minute
    if (provider === 'polymarket') {
      res.setHeader('Cache-Control', 'no-store')
    } else {
      const ttl = getCacheTTL(apiPath)
      res.setHeader('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`)
    }

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(200).json(data)

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Upstream timeout' })
    }
    return res.status(500).json({ error: 'Proxy error' })
  }
}

// Match TTLs from useApi.js in-memory cache
function getCacheTTL(path) {
  if (path.includes('/quote'))                return 30
  if (path.includes('/news'))                 return 120
  if (path.includes('/historical-price'))     return 600
  if (path.includes('/economic-calendar'))    return 1800
  if (path.includes('/economic-indicators'))  return 3600
  if (path.includes('/dividends-calendar'))   return 1800
  if (path.includes('/sector-performance'))   return 1800
  if (path.includes('/treasury'))             return 3600
  if (path.includes('/profile'))              return 3600
  if (path.includes('/ratios-ttm'))           return 3600
  if (path.includes('/earnings'))             return 300
  if (path.includes('/insider'))              return 300
  if (path.includes('/senate'))               return 300
  if (path.includes('/house'))                return 300
  return 300 // default 5 min
}
