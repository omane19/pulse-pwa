import { useState, useCallback } from 'react'

/* ── Key resolution ── */
function getKey(name) {
  try { return localStorage.getItem(name) || import.meta.env[name] || '' } catch { return import.meta.env[name] || '' }
}

let FH_KEY  = () => getKey('VITE_FINNHUB_KEY')
let AV_KEY  = () => getKey('VITE_AV_KEY')
let FMP_KEY = () => getKey('VITE_FMP_KEY')

export function hasKeys() {
  const fh  = FH_KEY()
  const fmp = FMP_KEY()
  return {
    fh:  fh.length  > 8 && !fh.includes('your_'),
    av:  AV_KEY().length > 8,
    fmp: fmp.length > 8 && !fmp.includes('your_'),
  }
}

/* ── Cache ── */
const cache = new Map()
function cGet(k, ttl) { const e = cache.get(k); return e && Date.now()-e.ts < ttl ? e.d : null }
function cSet(k, d)   { cache.set(k, { d, ts: Date.now() }) }

/* ── Fetch with timeout + retry ── */
async function go(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const tid  = setTimeout(() => ctrl.abort(), 12000)
    try {
      const r = await fetch(url, { signal: ctrl.signal })
      clearTimeout(tid)
      if (r.status === 429) {
        await new Promise(res => setTimeout(res, 2000))
        continue
      }
      if (!r.ok) return null
      return await r.json()
    } catch { clearTimeout(tid); if (attempt < retries) await new Promise(res => setTimeout(res, 1000)) }
  }
  return null
}

/* ── Finnhub ── */
async function fh(path, ttl = 30000) {
  const key = FH_KEY()
  if (!key || key.length < 8) return null
  const url = `https://finnhub.io/api/v1${path}&token=${key}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url, 1)
  if (data !== null) cSet(url, data)
  return data
}

/* ── Alpha Vantage ── */
async function av(params, ttl = 3600000) {
  const key = AV_KEY()
  if (!key || key.length < 8) return null
  const qs   = new URLSearchParams({ ...params, apikey: key })
  const url  = `https://www.alphavantage.co/query?${qs}`
  const hit  = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (!data || data.Information || data.Note) return null
  cSet(url, data); return data
}

/* ── FMP ── */
async function fmp(path, ttl = 300000) {
  const key = FMP_KEY()
  if (!key || key.length < 8) return null
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://financialmodelingprep.com/stable${path}${sep}apikey=${key}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ── FMP v3 (some endpoints still on v3) ── */
async function fmpv3(path, ttl = 300000) {
  const key = FMP_KEY()
  if (!key || key.length < 8) return null
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://financialmodelingprep.com/api/v3${path}${sep}apikey=${key}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ══════════════════════════════════════════
   QUOTE
══════════════════════════════════════════ */
export async function fetchQuote(ticker) {
  // Try FMP first if key available
  if (hasKeys().fmp) {
    const d = await fmp(`/quote?symbol=${ticker}`, 30000)
    if (Array.isArray(d) && d[0]?.price) {
      const q = d[0]
      return {
        c: q.price, pc: q.previousClose || q.price,
        d: q.change || 0, dp: q.changesPercentage || 0,
        h: q.dayHigh || q.price, l: q.dayLow || q.price,
        v: q.volume || 0, mc: q.marketCap || 0,
        source: 'fmp'
      }
    }
  }
  // Fallback to Finnhub
  const d = await fh(`/quote?symbol=${ticker}`, 30000)
  if (d?.c && d.c !== 0) return { ...d, source: 'finnhub' }
  // Fallback to Alpha Vantage
  const a = await av({ function: 'GLOBAL_QUOTE', symbol: ticker })
  const q = a?.['Global Quote']
  if (!q?.['05. price']) return null
  const price = parseFloat(q['05. price'])
  return {
    c: price, pc: parseFloat(q['08. previous close'] || price),
    d: parseFloat(q['09. change'] || 0),
    dp: parseFloat((q['10. change percent'] || '0%').replace('%', '')),
    h: parseFloat(q['03. high'] || price), l: parseFloat(q['04. low'] || price),
    source: 'alphavantage'
  }
}

/* ══════════════════════════════════════════
   CANDLES — FMP primary, Finnhub fallback
══════════════════════════════════════════ */
export async function fetchCandles(ticker, days = 120) {
  // Try FMP first — more reliable, higher rate limit
  if (hasKeys().fmp) {
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    const d = await fmp(`/historical-price-eod/full?symbol=${ticker}&from=${from}`, 600000)
    if (Array.isArray(d) && d.length >= 10) {
      // FMP returns newest first — reverse to oldest first
      const sorted = [...d].reverse()
      const closes    = sorted.map(c => c.close)
      const highs     = sorted.map(c => c.high)
      const lows      = sorted.map(c => c.low)
      const opens     = sorted.map(c => c.open)
      const volumes   = sorted.map(c => c.volume || 0)
      const timestamps = sorted.map(c => Math.floor(new Date(c.date).getTime() / 1000))
      let ma50 = null
      if (closes.length >= 50) {
        const sl = closes.slice(-50)
        ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
      }
      return { closes, highs, lows, opens, volumes, timestamps, ma50, source: 'fmp' }
    }
  }
  // Fallback to Finnhub
  const from = Math.floor(Date.now() / 1000 - days * 86400)
  const to   = Math.floor(Date.now() / 1000)
  const d    = await fh(`/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}`, 600000)
  if (!d || d.s === 'no_data' || !d.c?.length) return null
  let ma50 = null
  if (d.c.length >= 50) {
    const sl = d.c.slice(-50)
    ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
  }
  return { closes: d.c, highs: d.h, lows: d.l, opens: d.o || d.c, volumes: d.v, timestamps: d.t, ma50, source: 'finnhub' }
}

/* ══════════════════════════════════════════
   METRICS
══════════════════════════════════════════ */
export async function fetchMetrics(ticker) {
  // Try FMP key metrics first
  if (hasKeys().fmp) {
    const [profile, ratios] = await Promise.all([
      fmp(`/profile?symbol=${ticker}`, 3600000),
      fmpv3(`/ratios-ttm/${ticker}`, 3600000),
    ])
    const p = Array.isArray(profile) ? profile[0] : profile
    const r = Array.isArray(ratios)  ? ratios[0]  : ratios
    if (p?.symbol) {
      return {
        peTTM:      p.pe || r?.peRatioTTM || null,
        pbAnnual:   p.priceToBookRatio || r?.priceToBookRatioTTM || null,
        roeTTM:     r?.returnOnEquityTTM ? r.returnOnEquityTTM * 100 : null,
        marketCap:  p.mktCap || null,
        beta:       p.beta || null,
        _fmp: {
          forwardPE:    p.forwardPE || null,
          targetPrice:  p.dcfDiff ? p.dcf : null,
          profitMargin: p.netProfitMargin || (r?.netProfitMarginTTM || null),
          divYield:     p.lastDiv || null,
          sector:       p.sector || null,
          description:  p.description || null,
          analystTarget: p.priceTarget || null,
        },
        source: 'fmp'
      }
    }
  }
  // Fallback to Finnhub + AV
  const d  = await fh(`/stock/metric?symbol=${ticker}&metric=ALL`, 120000)
  const mt = d?.metric || {}
  try {
    const a = await av({ function: 'OVERVIEW', symbol: ticker }, 3600000)
    if (a?.Symbol) {
      if (!mt.peTTM    && a.PERatio)           mt.peTTM    = parseFloat(a.PERatio) || null
      if (!mt.pbAnnual && a.PriceToBookRatio)  mt.pbAnnual = parseFloat(a.PriceToBookRatio) || null
      if (!mt.roeTTM   && a.ReturnOnEquityTTM) mt.roeTTM   = (parseFloat(a.ReturnOnEquityTTM) || 0) * 100
      mt._av = {
        forwardPE: a.ForwardPE, targetPrice: a.AnalystTargetPrice,
        divYield: a.DividendYield, profitMargin: a.ProfitMargin,
        description: a.Description, sector: a.Sector
      }
    }
  } catch {}
  return mt
}

/* ══════════════════════════════════════════
   NEWS
══════════════════════════════════════════ */
export async function fetchNews(ticker, days = 10) {
  // Try FMP news first
  if (hasKeys().fmp) {
    const d = await fmp(`/news/stock?symbols=${ticker}&limit=30`, 120000)
    if (Array.isArray(d) && d.length) {
      return d.slice(0, 30).filter(a => a.title).map(a => ({
        title: a.title, body: (a.text || a.content || '').slice(0, 700),
        link: a.url || '#', source: a.site || a.source || 'Unknown',
        ts: a.publishedDate ? new Date(a.publishedDate).getTime() / 1000 : 0
      }))
    }
  }
  // Fallback to Finnhub
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const to   = new Date().toISOString().split('T')[0]
  const d    = await fh(`/company-news?symbol=${ticker}&from=${from}&to=${to}`, 60000)
  if (!Array.isArray(d)) return []
  return d.slice(0, 30).filter(a => a.headline).map(a => ({
    title: a.headline, body: (a.summary || '').slice(0, 700),
    link: a.url || '#', source: a.source || 'Unknown', ts: a.datetime || 0
  }))
}

/* ══════════════════════════════════════════
   REGION NEWS — for Global tab
══════════════════════════════════════════ */
export async function fetchRegionNews(proxy) {
  // Get recent news for a proxy ticker (FXI for China, EWJ for Japan, etc.)
  if (hasKeys().fmp) {
    const d = await fmp(`/news/stock?symbols=${proxy}&limit=5`, 600000)
    if (Array.isArray(d) && d.length) {
      return d.slice(0, 5).map(a => ({
        title: a.title, source: a.site || 'Unknown',
        link: a.url || '#',
        ts: a.publishedDate ? new Date(a.publishedDate).getTime() / 1000 : 0
      }))
    }
  }
  // Fallback to Finnhub
  const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const to   = new Date().toISOString().split('T')[0]
  const d    = await fh(`/company-news?symbol=${proxy}&from=${from}&to=${to}`, 600000)
  if (!Array.isArray(d)) return []
  return d.slice(0, 5).map(a => ({
    title: a.headline, source: a.source || 'Unknown',
    link: a.url || '#', ts: a.datetime || 0
  }))
}

/* ══════════════════════════════════════════
   ANALYST RECS + EARNINGS
══════════════════════════════════════════ */
export async function fetchRec(ticker) {
  const d = await fh(`/stock/recommendation?symbol=${ticker}`, 300000)
  if (!Array.isArray(d) || !d.length) return { current: {}, history: [] }
  return { current: d[0], history: d.slice(0, 12) }
}

export async function fetchEarnings(ticker) {
  const d = await fh(`/stock/earnings?symbol=${ticker}`, 300000)
  return Array.isArray(d) ? d.slice(0, 4) : []
}

export async function fetchProfile(ticker) {
  return await fh(`/stock/profile2?symbol=${ticker}`, 3600000) || {}
}

export async function fetchInsider(ticker) {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const d    = await fh(`/stock/insider-transactions?symbol=${ticker}&from=${from}`, 300000)
  return d?.data?.slice(0, 15) || []
}

export async function fetchEarningsCalendar(ticker) {
  const from = new Date().toISOString().split('T')[0]
  const to   = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const d    = await fh(`/calendar/earnings?from=${from}&to=${to}&symbol=${ticker}`, 3600000)
  return d?.earningsCalendar?.[0] || null
}

/* ══════════════════════════════════════════
   MACRO — live economic data via FMP
══════════════════════════════════════════ */
export async function fetchMacroLive() {
  if (!hasKeys().fmp) return null
  const from = new Date().toISOString().split('T')[0]
  const to   = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0]
  const past = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [calendar, sectors, treasury] = await Promise.all([
    fmpv3(`/economic_calendar?from=${past}&to=${to}`, 1800000),
    fmpv3(`/sector-performance`, 1800000),
    fmpv3(`/historical-chart/1day/^TNX?from=${past}&to=${from}`, 1800000),
  ])

  // Economic calendar — filter key events
  const KEY_EVENTS = ['FOMC','Federal Reserve','CPI','GDP','Nonfarm','Unemployment','PCE','PPI','Retail Sales','ISM']
  const events = Array.isArray(calendar)
    ? calendar
        .filter(e => KEY_EVENTS.some(k => (e.event || '').includes(k)))
        .filter(e => new Date(e.date) >= new Date(Date.now() - 7 * 86400000))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 12)
        .map(e => ({
          date: e.date,
          event: e.event,
          actual: e.actual,
          estimate: e.estimate,
          previous: e.previous,
          impact: e.impact || 'Medium',
          isPast: new Date(e.date) < new Date(),
        }))
    : []

  // Sector performance
  const sectorData = Array.isArray(sectors)
    ? sectors
        .map(s => ({ name: s.sector, change: parseFloat(s.changesPercentage || 0) }))
        .sort((a, b) => b.change - a.change)
    : []

  // 10yr Treasury yield
  const yieldData = Array.isArray(treasury) && treasury.length
    ? parseFloat(treasury[0].close || treasury[0].price || 0)
    : null

  return { events, sectorData, yieldData }
}

/* ══════════════════════════════════════════
   FMP SCREENER — bulk, 500+ tickers
══════════════════════════════════════════ */
export async function fetchFMPScreener({ minMcap = 500, limit = 500 } = {}) {
  // minMcap in millions
  const d = await fmpv3(
    `/stock-screener?marketCapMoreThan=${minMcap * 1e6}&country=US&isEtf=false&isActivelyTrading=true&limit=${limit}`,
    3600000
  )
  if (!Array.isArray(d)) return []
  return d.map(s => ({
    ticker:   s.symbol,
    name:     s.companyName,
    sector:   s.sector || 'Unknown',
    price:    s.price || 0,
    mcap:     s.marketCap || 0,
    volume:   s.volume || 0,
    pe:       s.pe || null,
    beta:     s.beta || null,
  }))
}

/* ══════════════════════════════════════════
   FMP SMART MONEY
══════════════════════════════════════════ */
export async function fetchFMPCongressional(ticker) {
  const d = await fmp(`/senate-trades?symbol=${ticker}`, 3600000)
  if (!Array.isArray(d) || !d.length) return []
  return d.slice(0, 20).map(t => ({
    name:    (t.firstName || '') + ' ' + (t.lastName || t.office || ''),
    party:   t.district || '?',
    chamber: 'Senate',
    type:    t.type || '?',
    amount:  t.amount || '?',
    date:    t.transactionDate || t.disclosureDate || '?',
    ticker:  t.symbol || ticker,
    asset:   t.assetDescription || ticker,
    isBuy:   (t.type || '').toLowerCase().includes('purchase') || (t.type || '').toLowerCase().includes('buy'),
  }))
}

export async function fetchFMPInsider(ticker) {
  const d = await fmp(`/insider-trading/search?symbol=${ticker}&limit=30`, 300000)
  if (!Array.isArray(d) || !d.length) return []
  return d.slice(0, 30).map(t => ({
    name:        t.reportingName || 'Unknown',
    title:       t.typeOfOwner || '?',
    type:        t.transactionType || '?',
    shares:      t.securitiesTransacted || 0,
    price:       t.price || 0,
    value:       (t.securitiesTransacted || 0) * (t.price || 0),
    date:        t.transactionDate || t.filingDate || '?',
    ticker:      t.symbol || ticker,
    isBuy:       (t.acquisitionOrDisposition || '').toUpperCase() === 'A',
    sharesOwned: t.securitiesOwned || 0,
  }))
}

export async function fetchFMPRecentInsider() {
  const d = await fmp(`/insider-trading?transactionType=P-Purchase&limit=50`, 120000)
  if (!Array.isArray(d)) return []
  return d.slice(0, 50).map(t => ({
    name:   t.reportingName || 'Unknown',
    title:  t.typeOfOwner || '?',
    ticker: t.symbol || '?',
    shares: t.securitiesTransacted || 0,
    price:  t.price || 0,
    value:  (t.securitiesTransacted || 0) * (t.price || 0),
    date:   t.transactionDate || t.filingDate || '?',
    isBuy:  true,
  }))
}

export async function fetchFMPRecentCongress() {
  const d = await fmp(`/senate-trades?limit=50`, 120000)
  if (!Array.isArray(d)) return []
  return d.filter(t => {
    const type = (t.type || t.transactionType || '').toLowerCase()
    return type.includes('purchase') || type.includes('buy')
  }).slice(0, 40).map(t => ({
    name:   (t.firstName || '') + ' ' + (t.lastName || ''),
    party:  t.party || t.district || '?',
    ticker: t.ticker || t.symbol || '?',
    type:   t.type || '?',
    amount: t.amount || '?',
    date:   t.transactionDate || t.disclosureDate || '?',
    isBuy:  true,
  }))
}

/* ── Cluster signal ── */
export function computeClusterSignal(insiderData) {
  if (!insiderData?.length) return null
  const thirtyDays = Date.now() - 30 * 86400000
  const recentBuys = insiderData.filter(t => t.isBuy && new Date(t.date).getTime() > thirtyDays)
  if (recentBuys.length >= 3) return { level:'strong',   count:recentBuys.length, label:`🚨 Cluster Buy — ${recentBuys.length} insiders bought in 30 days` }
  if (recentBuys.length === 2) return { level:'moderate', count:2,                 label:`⚠️ 2 insiders bought in 30 days` }
  if (recentBuys.length === 1) return { level:'weak',     count:1,                 label:'1 insider bought recently' }
  return null
}

/* ══════════════════════════════════════════
   LITE + FULL FETCHERS
══════════════════════════════════════════ */
export async function fetchTickerLite(ticker) {
  try {
    const [quote, candles, metrics] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker, 90), fetchMetrics(ticker)
    ])
    if (!quote) return null
    return { ticker, quote, candles, metrics: metrics || {}, news: [], rec: {}, earnings: [] }
  } catch { return null }
}

export async function fetchTickerFull(ticker) {
  try {
    const [quote, candles, metrics, news, rec, earnings, profile] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker, 120), fetchMetrics(ticker),
      fetchNews(ticker, 7), fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker)
    ])
    if (!quote) return null
    return {
      ticker, quote, candles, metrics: metrics || {}, news: news || [], rec: rec || {},
      earnings: earnings || [], name: profile?.name || ticker,
      sector: profile?.finnhubIndustry || '', mcap: profile?.marketCapitalization
    }
  } catch { return null }
}

/* ── React hook ── */
export function useTickerData() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (ticker) => {
    if (!ticker) return
    if (!hasKeys().fh && !hasKeys().fmp) {
      setError('No API key found — go to Setup tab to add your Finnhub key.')
      return
    }
    setLoading(true); setError(null); setData(null)
    try {
      const quote = await fetchQuote(ticker)
      if (!quote) {
        setError(`No data found for "${ticker}". Check the ticker is a valid US stock or ETF.`)
        return
      }
      const [candles, metrics, news, rec, earnings, profile, insider, ec] = await Promise.all([
        fetchCandles(ticker), fetchMetrics(ticker), fetchNews(ticker),
        fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker),
        fetchInsider(ticker), fetchEarningsCalendar(ticker)
      ])
      setData({
        ticker, quote, candles, metrics: metrics || {}, news: news || [],
        rec: rec || {}, earnings: earnings || [], profile: profile || {},
        insider: insider || [], ec
      })
    } catch { setError('Network error — check your connection and try again.') }
    finally  { setLoading(false) }
  }, [])

  return { data, loading, error, fetch: load }
}
