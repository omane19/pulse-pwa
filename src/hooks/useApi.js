import { useState, useCallback } from 'react'

// Keys: localStorage (entered via Setup UI) takes priority over .env
function getKey(name) {
  try { return localStorage.getItem(name) || import.meta.env[name] || '' } catch { return import.meta.env[name] || '' }
}
const FH_KEY = getKey('VITE_FINNHUB_KEY')
const AV_KEY  = getKey('VITE_AV_KEY')

export function hasKeys() {
  return {
    fh: FH_KEY.length > 8 && !FH_KEY.includes('your_'),
    av: AV_KEY.length > 8 && !AV_KEY.includes('your_'),
  }
}

/* ── Cache ── */
const cache = new Map()
function cGet(k, ttl) { const e = cache.get(k); return e && Date.now()-e.ts < ttl ? e.d : null }
function cSet(k, d)   { cache.set(k, { d, ts: Date.now() }) }

/* ── Safe fetch (no AbortSignal.timeout — not supported in all browsers) ── */
async function go(url, opts = {}) {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), 9000)
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal })
    clearTimeout(tid)
    if (!r.ok) return null
    return await r.json()
  } catch { clearTimeout(tid); return null }
}

/* ── Finnhub ── */
async function fh(path, ttl = 30000) {
  if (!FH_KEY || FH_KEY.length < 8) return null
  const url = `https://finnhub.io/api/v1${path}&token=${FH_KEY}`
  const hit  = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ── Alpha Vantage ── */
async function av(params, ttl = 3600000) {
  if (!AV_KEY || AV_KEY.length < 8) return null
  const qs   = new URLSearchParams({ ...params, apikey: AV_KEY })
  const url  = `https://www.alphavantage.co/query?${qs}`
  const hit  = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (!data || data.Information || data.Note) return null
  cSet(url, data); return data
}

/* ── Public fetchers ── */
export async function fetchQuote(ticker) {
  const d = await fh(`/quote?symbol=${ticker}`, 30000)
  if (d?.c && d.c !== 0) return { ...d, source:'finnhub' }
  const a = await av({ function:'GLOBAL_QUOTE', symbol:ticker })
  const q = a?.['Global Quote']
  if (!q?.['05. price']) return null
  const price = parseFloat(q['05. price'])
  return {
    c: price, pc: parseFloat(q['08. previous close']||price),
    d: parseFloat(q['09. change']||0),
    dp: parseFloat((q['10. change percent']||'0%').replace('%','')),
    h: parseFloat(q['03. high']||price), l: parseFloat(q['04. low']||price),
    source:'alphavantage'
  }
}

export async function fetchCandles(ticker, days = 120) {
  const from = Math.floor(Date.now()/1000 - days*86400)
  const to   = Math.floor(Date.now()/1000)
  const d    = await fh(`/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}`, 120000)
  if (!d || d.s==='no_data' || !d.c?.length) return null
  let ma50 = null
  if (d.c.length >= 50) {
    const sl = d.c.slice(-50)
    ma50 = parseFloat((sl.reduce((a,b)=>a+b,0)/50).toFixed(2))
  }
  return { closes:d.c, highs:d.h, lows:d.l, opens:d.o||d.c, volumes:d.v, timestamps:d.t, ma50 }
}

export async function fetchMetrics(ticker) {
  const d  = await fh(`/stock/metric?symbol=${ticker}&metric=ALL`, 120000)
  const mt = d?.metric || {}
  try {
    const a = await av({ function:'OVERVIEW', symbol:ticker }, 3600000)
    if (a?.Symbol) {
      if (!mt.peTTM    && a.PERatio)           mt.peTTM    = parseFloat(a.PERatio)||null
      if (!mt.pbAnnual && a.PriceToBookRatio)  mt.pbAnnual = parseFloat(a.PriceToBookRatio)||null
      if (!mt.roeTTM   && a.ReturnOnEquityTTM) mt.roeTTM   = (parseFloat(a.ReturnOnEquityTTM)||0)*100
      mt._av = {
        forwardPE:a.ForwardPE, targetPrice:a.AnalystTargetPrice,
        divYield:a.DividendYield, profitMargin:a.ProfitMargin,
        description:a.Description, sector:a.Sector
      }
    }
  } catch {}
  return mt
}

export async function fetchNews(ticker, days = 10) {
  const from = new Date(Date.now()-days*86400000).toISOString().split('T')[0]
  const to   = new Date().toISOString().split('T')[0]
  const d    = await fh(`/company-news?symbol=${ticker}&from=${from}&to=${to}`, 60000)
  if (!Array.isArray(d)) return []
  return d.slice(0,30).filter(a=>a.headline).map(a=>({
    title:a.headline, body:(a.summary||'').slice(0,700),
    link:a.url||'#', source:a.source||'Unknown', ts:a.datetime||0
  }))
}

export async function fetchRec(ticker) {
  const d = await fh(`/stock/recommendation?symbol=${ticker}`, 300000)
  return Array.isArray(d) && d.length ? d[0] : {}
}

export async function fetchEarnings(ticker) {
  const d = await fh(`/stock/earnings?symbol=${ticker}`, 300000)
  return Array.isArray(d) ? d.slice(0,4) : []
}

export async function fetchProfile(ticker) {
  return await fh(`/stock/profile2?symbol=${ticker}`, 3600000) || {}
}

export async function fetchInsider(ticker) {
  const from = new Date(Date.now()-90*86400000).toISOString().split('T')[0]
  const d    = await fh(`/stock/insider-transactions?symbol=${ticker}&from=${from}`, 300000)
  return d?.data?.slice(0,15) || []
}

export async function fetchEarningsCalendar(ticker) {
  const from = new Date().toISOString().split('T')[0]
  const to   = new Date(Date.now()+60*86400000).toISOString().split('T')[0]
  const d    = await fh(`/calendar/earnings?from=${from}&to=${to}&symbol=${ticker}`, 3600000)
  return d?.earningsCalendar?.[0] || null
}

/* NOTE: SEC EDGAR API is CORS-blocked in browsers — removed from PWA.
   Available in the Streamlit version only (server-side Python). */

/* ── Parallel screener ── */
export async function fetchTickerFull(ticker) {
  try {
    const [quote, candles, metrics, news, rec, earnings, profile] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker,90), fetchMetrics(ticker),
      fetchNews(ticker,7), fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker)
    ])
    if (!quote) return null
    return { ticker, quote, candles, metrics:metrics||{}, news:news||[], rec:rec||{},
      earnings:earnings||[], name:profile?.name||ticker,
      sector:profile?.finnhubIndustry||'', mcap:profile?.marketCapitalization }
  } catch { return null }
}

/* ── React hook ── */
export function useTickerData() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (ticker) => {
    if (!ticker) return
    if (!hasKeys().fh) {
      setError('Finnhub API key missing — add VITE_FINNHUB_KEY to your .env file then restart npm run dev')
      return
    }
    setLoading(true); setError(null); setData(null)
    try {
      const quote = await fetchQuote(ticker)
      if (!quote) {
        setError(`No data for "${ticker}". Check: (1) ticker is a valid US stock or ETF, (2) VITE_FINNHUB_KEY is set in .env and npm run dev was restarted. Try: AAPL, SPY, NVDA.`)
        return
      }
      const [candles, metrics, news, rec, earnings, profile, insider, ec] = await Promise.all([
        fetchCandles(ticker), fetchMetrics(ticker), fetchNews(ticker),
        fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker),
        fetchInsider(ticker), fetchEarningsCalendar(ticker)
      ])
      setData({ ticker, quote, candles, metrics:metrics||{}, news:news||[],
        rec:rec||{}, earnings:earnings||[], profile:profile||{},
        insider:insider||[], ec })
    } catch { setError('Network error — check your connection.') }
    finally  { setLoading(false) }
  }, [])

  return { data, loading, error, fetch: load }
}
