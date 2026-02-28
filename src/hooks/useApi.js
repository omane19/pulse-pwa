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

/* ── Cache (max 300 entries, evict oldest on overflow) ── */
const cache = new Map()
const MAX_CACHE = 300
function cGet(k, ttl) { const e = cache.get(k); return e && Date.now()-e.ts < ttl ? e.d : null }
function cSet(k, d)   {
  if (cache.size >= MAX_CACHE) {
    // Evict oldest 50 entries
    const keys = [...cache.keys()].slice(0, 50)
    keys.forEach(key => cache.delete(key))
  }
  cache.set(k, { d, ts: Date.now() })
}

/* ── Fetch with timeout + retry ── */
async function go(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const tid  = setTimeout(() => ctrl.abort(), 12000)
    try {
      const r = await fetch(url, { signal: ctrl.signal })
      clearTimeout(tid)
      if (r.status === 429) { await new Promise(res => setTimeout(res, 2000)); continue }
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

/* ── FMP stable (modern endpoints) ── */
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

/* ── FMP v4 (insider trading, congressional) ── */
async function fmpv4(path, ttl = 300000) {
  const key = FMP_KEY()
  if (!key || key.length < 8) return null
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://financialmodelingprep.com/api/v4${path}${sep}apikey=${key}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ══════════════════════════════════════════
   QUOTE — FMP /stable/quote primary
══════════════════════════════════════════ */
export async function fetchQuote(ticker) {
  if (hasKeys().fmp) {
    const d = await fmp(`/quote?symbol=${ticker}`, 30000)
    const q = Array.isArray(d) ? d[0] : d
    if (q?.price) {
      return {
        c: q.price, pc: q.previousClose || q.price,
        d: q.change || 0, dp: q.changePercentage || q.changesPercentage || 0,
        h: q.dayHigh || q.price, l: q.dayLow || q.price,
        v: q.volume || 0, mc: q.marketCap || 0,
        yearHigh: q.yearHigh || null, yearLow: q.yearLow || null,
        source: 'fmp'
      }
    }
  }
  // Finnhub fallback
  const d = await fh(`/quote?symbol=${ticker}`, 30000)
  if (d?.c && d.c !== 0) return { ...d, source: 'finnhub' }
  // Alpha Vantage fallback
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
   CANDLES — FMP /stable/historical-price-eod/full primary
══════════════════════════════════════════ */
export async function fetchCandles(ticker, days = 260) {
  if (hasKeys().fmp) {
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    const d = await fmp(`/historical-price-eod/full?symbol=${ticker}&from=${from}`, 600000)
    // Response is array of {date, open, high, low, close, volume}
    const hist = Array.isArray(d) ? d : d?.historical
    if (Array.isArray(hist) && hist.length >= 10) {
      const sorted = [...hist].sort((a, b) => new Date(a.date) - new Date(b.date))
      const closes    = sorted.map(c => c.close)
      const highs     = sorted.map(c => c.high)
      const lows      = sorted.map(c => c.low)
      const opens     = sorted.map(c => c.open)
      const volumes   = sorted.map(c => c.volume || 0)
      const timestamps = sorted.map(c => Math.floor(new Date(c.date).getTime() / 1000))
      let ma50 = null, ma200 = null
      if (closes.length >= 50) {
        const sl = closes.slice(-50)
        ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
      }
      if (closes.length >= 100) {
        const sl = closes.slice(-200)
        ma200 = parseFloat((sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(2))
      }
      return { closes, highs, lows, opens, volumes, timestamps, ma50, ma200, source: 'fmp' }
    }
  }
  // Finnhub fallback
  const from = Math.floor(Date.now() / 1000 - days * 86400)
  const to   = Math.floor(Date.now() / 1000)
  const d    = await fh(`/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}`, 600000)
  if (!d || d.s === 'no_data' || !d.c?.length) return null
  let ma50 = null, ma200 = null
  if (d.c.length >= 50) {
    const sl = d.c.slice(-50)
    ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
  }
  if (d.c.length >= 100) {
    const sl = d.c.slice(-200)
    ma200 = parseFloat((sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(2))
  }
  return { closes: d.c, highs: d.h, lows: d.l, opens: d.o || d.c, volumes: d.v, timestamps: d.t, ma50, ma200, source: 'finnhub' }
}

/* ══════════════════════════════════════════
   METRICS — FMP /stable/profile primary
══════════════════════════════════════════ */
export async function fetchMetrics(ticker) {
  if (hasKeys().fmp) {
    const [profileArr, ratiosArr, cashFlowArr, incomeArr, balanceArr] = await Promise.all([
      fmp(`/profile?symbol=${ticker}`, 3600000),
      fmp(`/ratios-ttm?symbol=${ticker}`, 3600000),
      fmp(`/cash-flow-statement?symbol=${ticker}&period=annual&limit=2`, 3600000),
      fmp(`/income-statement?symbol=${ticker}&period=annual&limit=2`, 3600000),
      fmp(`/balance-sheet-statement?symbol=${ticker}&period=annual&limit=1`, 3600000),
    ])
    const p   = Array.isArray(profileArr)  ? profileArr[0]  : profileArr
    const r   = Array.isArray(ratiosArr)   ? ratiosArr[0]   : ratiosArr
    const cf  = Array.isArray(cashFlowArr) ? cashFlowArr[0] : cashFlowArr
    const inc = Array.isArray(incomeArr)   ? incomeArr      : []
    const bs  = Array.isArray(balanceArr)  ? balanceArr[0]  : balanceArr
    if (p?.symbol) {
      // Revenue growth YoY
      let revenueGrowthYoY = null
      if (inc.length >= 2 && inc[0].revenue && inc[1].revenue) {
        revenueGrowthYoY = parseFloat(((inc[0].revenue - inc[1].revenue) / Math.abs(inc[1].revenue) * 100).toFixed(1))
      }
      // FCF per share
      const sharesOutstanding = p.sharesOutstanding || cf?.weightedAverageShsOut || null
      const fcf = cf?.freeCashFlow || 
        (cf?.operatingCashFlow && cf?.capitalExpenditure 
          ? cf.operatingCashFlow - Math.abs(cf.capitalExpenditure) 
          : null)
      const fcfPerShare = (fcf && sharesOutstanding && sharesOutstanding > 0)
        ? parseFloat((fcf / sharesOutstanding).toFixed(2)) : null
      // PEG = P/E / earnings growth rate
      const pegRatio = r?.priceToEarningsGrowthRatioTTM || null
      // Balance sheet derived metrics
      const totalDebt        = bs ? (bs.shortTermDebt || 0) + (bs.longTermDebt || 0) : null
      const totalEquity      = bs?.totalStockholdersEquity || null
      const totalCurrentAssets = bs?.totalCurrentAssets || null
      const totalCurrentLiab   = bs?.totalCurrentLiabilities || null
      const cashAndEquiv     = bs?.cashAndCashEquivalents || bs?.cashAndShortTermInvestments || null
      const debtToEquity     = (totalDebt != null && totalEquity && totalEquity > 0)
        ? parseFloat((totalDebt / totalEquity).toFixed(2)) : null
      const currentRatio     = (totalCurrentAssets && totalCurrentLiab && totalCurrentLiab > 0)
        ? parseFloat((totalCurrentAssets / totalCurrentLiab).toFixed(2)) : null
      const netCash          = (cashAndEquiv != null && totalDebt != null)
        ? parseFloat(((cashAndEquiv - totalDebt) / 1e9).toFixed(2)) : null  // in billions
      // Dividend yield — use ratios TTM first, fallback to lastDiv/price
      const divYield = r?.dividendYieldTTM
        ? parseFloat((r.dividendYieldTTM * 100).toFixed(2))
        : (p.lastDiv && p.price ? parseFloat((p.lastDiv / p.price * 100).toFixed(2)) : null)
      return {
        peTTM:           r?.priceToEarningsRatioTTM || null,
        pbAnnual:        r?.priceToBookRatioTTM || null,
        roeTTM:          r?.returnOnEquityTTM ? r.returnOnEquityTTM * 100 : null,
        marketCap:       p.mktCap || null,
        beta:            p.beta || null,
        fcfPerShare,
        pegRatio,
        revenueGrowthYoY,
        debtToEquity,
        currentRatio,
        netCash,
        divYield,
        _fmp: {
          sector:       p.sector || null,
          description:  p.description || null,
          divYield,
          targetPrice:  p.dcf || null,
        },
        source: 'fmp'
      }
    }
  }
  // Finnhub + AV fallback
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
   NEWS — FMP /stable/stock-news primary
══════════════════════════════════════════ */
export async function fetchNews(ticker, days = 10) {
  if (hasKeys().fmp) {
    const d = await fmp(`/news/stock?symbols=${ticker}&limit=30`, 120000)
    if (Array.isArray(d) && d.length) {
      return d.slice(0, 30).filter(a => a.title).map(a => ({
        title: a.title, body: (a.text || '').slice(0, 700),
        link: a.url || '#', source: a.site || 'Unknown',
        ts: a.publishedDate ? new Date(a.publishedDate).getTime() / 1000 : 0
      }))
    }
  }
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const to   = new Date().toISOString().split('T')[0]
  const d    = await fh(`/company-news?symbol=${ticker}&from=${from}&to=${to}`, 60000)
  if (!Array.isArray(d)) return []
  return d.slice(0, 30).filter(a => a.headline).map(a => ({
    title: a.headline, body: (a.summary || '').slice(0, 700),
    link: a.url || '#', source: a.source || 'Unknown', ts: a.datetime || 0
  }))
}

/* ── Region news for Global tab ── */
export async function fetchRegionNews(proxy) {
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
   ANALYST, EARNINGS, PROFILE, INSIDER
══════════════════════════════════════════ */
export async function fetchRec(ticker) {
  // FMP primary — /stable/analyst-stock-recommendations
  if (hasKeys().fmp) {
    try {
      const d = await fmp(`/analyst-stock-recommendations?symbol=${ticker}&limit=12`, 300000)
      if (Array.isArray(d) && d.length) {
        // FMP returns array sorted newest first
        // Normalize field names to match what scoreAsset expects
        const normalize = (r) => ({
          strongBuy:   r.analystRatingsStrongBuy  || 0,
          buy:         r.analystRatingsBuy         || 0,
          hold:        r.analystRatingsHold        || 0,
          sell:        r.analystRatingsSell        || 0,
          strongSell:  r.analystRatingsStrongSell  || 0,
          period:      r.date || null,
        })
        return { current: normalize(d[0]), history: d.slice(0, 12).map(normalize) }
      }
    } catch {}
  }
  // Finnhub fallback
  const d = await fh(`/stock/recommendation?symbol=${ticker}`, 300000)
  if (!Array.isArray(d) || !d.length) return { current: {}, history: [] }
  return { current: d[0], history: d.slice(0, 12) }
}

export async function fetchEarnings(ticker) {
  if (hasKeys().fmp) {
    const d = await fmp(`/earnings?symbol=${ticker}&limit=8`, 300000)
    if (Array.isArray(d) && d.length) {
      return d.map(q => ({
        date:        q.date,
        actual:      q.epsActual,
        estimate:    q.epsEstimated,
        revActual:   q.revenueActual,
        revEstimate: q.revenueEstimated,
      }))
    }
  }
  const d = await fh(`/stock/earnings?symbol=${ticker}`, 300000)
  return Array.isArray(d) ? d.slice(0, 8) : []
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
   MACRO — FMP live economic data
══════════════════════════════════════════ */
export async function fetchMacroLive() {
  if (!hasKeys().fmp) return null
  const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const to   = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0]

  const [calendar, sectors, treasuryRaw, gdpRaw, cpiRaw, unemployRaw] = await Promise.all([
    fmp(`/economic-calendar?from=${from}&to=${to}`, 1800000),
    fmp(`/sector-performance`, 1800000),
    fmp(`/treasury-rates`, 3600000),
    fmp(`/economic-indicator?name=GDP&limit=4`, 3600000),
    fmp(`/economic-indicator?name=CPI&limit=4`, 3600000),
    fmp(`/economic-indicator?name=unemploymentRate&limit=4`, 3600000),
  ])

  const KEY_EVENTS = ['FOMC','Federal Reserve','CPI','GDP','Nonfarm','Unemployment','PCE','PPI','Retail Sales','ISM']
  const events = Array.isArray(calendar)
    ? calendar
        .filter(e => KEY_EVENTS.some(k => (e.event || '').includes(k)))
        .filter(e => new Date(e.date) >= new Date(Date.now() - 7 * 86400000))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 12)
        .map(e => ({
          date: e.date, event: e.event,
          actual: e.actual, estimate: e.estimate, previous: e.previous,
          impact: e.impact || 'Medium',
          isPast: new Date(e.date) < new Date(),
        }))
    : []

  const sectorData = Array.isArray(sectors)
    ? sectors.map(s => ({ name: s.sector, change: parseFloat(s.changesPercentage || 0) })).sort((a, b) => b.change - a.change)
    : []

  // Treasury yield curve
  const treasury = Array.isArray(treasuryRaw) ? treasuryRaw[0] : (treasuryRaw || null)
  const yieldCurve = treasury ? {
    y1:  parseFloat(treasury.year1  || 0),
    y2:  parseFloat(treasury.year2  || 0),
    y5:  parseFloat(treasury.year5  || 0),
    y10: parseFloat(treasury.year10 || 0),
    y30: parseFloat(treasury.year30 || 0),
    inverted: (treasury.year2 || 0) > (treasury.year10 || 0),
    spread10_2: parseFloat(((treasury.year10 || 0) - (treasury.year2 || 0)).toFixed(2)),
    date: treasury.date || null,
  } : null

  // Economic indicators — latest reading
  const latestVal = (arr) => Array.isArray(arr) && arr.length ? parseFloat(arr[0].value || 0) : null
  const prevVal   = (arr) => Array.isArray(arr) && arr.length >= 2 ? parseFloat(arr[1].value || 0) : null
  const econData = {
    gdp:        { value: latestVal(gdpRaw),     prev: prevVal(gdpRaw),     label: 'GDP Growth', unit: '%' },
    cpi:        { value: latestVal(cpiRaw),     prev: prevVal(cpiRaw),     label: 'CPI Inflation', unit: '%' },
    unemploy:   { value: latestVal(unemployRaw),prev: prevVal(unemployRaw),label: 'Unemployment', unit: '%' },
  }

  return { events, sectorData, yieldCurve, econData }
}

/* ══════════════════════════════════════════
   FMP SCREENER — bulk 500+ tickers
   /stable/company-screener
══════════════════════════════════════════ */
export async function fetchFMPScreener({ minMcap = 500, limit = 500 } = {}) {
  const d = await fmp(
    `/company-screener?marketCapMoreThan=${minMcap * 1e6}&country=US&isEtf=false&isActivelyTrading=true&limit=${limit}`,
    3600000
  )
  if (!Array.isArray(d)) return []
  return d.map(s => ({
    ticker:  s.symbol,
    name:    s.companyName,
    sector:  s.sector || 'Unknown',
    price:   s.price || 0,
    mcap:    s.marketCap || 0,
    volume:  s.volume || 0,
    pe:      s.pe || null,
  }))
}

/* ══════════════════════════════════════════
   FMP SMART MONEY
   Congressional: /stable/senate-trading
   Insider: /api/v4/insider-trading (confirmed v4)
══════════════════════════════════════════ */
export async function fetchFMPCongressional(ticker) {
  const d = await fmp(`/senate-trades?symbol=${ticker}`, 3600000)
  if (!Array.isArray(d) || !d.length) return []
  return d.slice(0, 20).map(t => ({
    name:    (t.firstName || '') + ' ' + (t.lastName || ''),
    party:   t.party || '?',
    type:    t.type || t.transactionType || '?',
    amount:  t.amount || '?',
    date:    t.transactionDate || t.disclosureDate || '?',
    ticker:  t.ticker || t.symbol || ticker,
    isBuy:   (t.type || t.transactionType || '').toLowerCase().includes('purchase') ||
             (t.type || t.transactionType || '').toLowerCase().includes('buy'),
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
    isBuy:       (t.acquistionOrDisposition || t.acquisitionOrDisposition || '').toUpperCase() === 'A',
    sharesOwned: t.securitiesOwned || 0,
  }))
}

export async function fetchFMPRecentInsider() {
  const d = await fmp(`/insider-trading/latest?page=0&limit=50`, 120000)
  if (!Array.isArray(d)) return []
  return d.slice(0, 50).map(t => ({
    name:   t.reportingName || 'Unknown',
    title:  t.typeOfOwner || '?',
    ticker: t.symbol || '?',
    shares: t.securitiesTransacted || 0,
    price:  t.price || 0,
    value:  (t.securitiesTransacted || 0) * (t.price || 0),
    date:   t.transactionDate || t.filingDate || '?',
    isBuy:  (t.acquistionOrDisposition || t.acquisitionOrDisposition || '').toUpperCase() === 'A',
  }))
}

export async function fetchFMPRecentCongress() {
  // senate-latest and house-latest = market-wide feed, no symbol required
  const [senate, house] = await Promise.all([
    fmp(`/senate-latest?page=0&limit=50`, 120000),
    fmp(`/house-latest?page=0&limit=50`, 120000),
  ])
  const all = [...(Array.isArray(senate) ? senate : []), ...(Array.isArray(house) ? house : [])]
  return all.filter(t => {
    const type = (t.type || t.transactionType || '').toLowerCase()
    return type.includes('purchase') || type.includes('buy')
  }).slice(0, 50).map(t => ({
    name:   (t.firstName || '') + ' ' + (t.lastName || ''),
    party:  t.party || '?',
    ticker: t.ticker || t.symbol || '?',
    type:   t.type || t.transactionType || '?',
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

export async function fetchPriceTarget(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/price-target?symbol=${ticker}`, 3600000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r) return null
    return {
      target:    r.priceTarget || r.targetPrice || null,
      consensus: r.targetConsensus || null,
      high:      r.targetHigh || null,
      low:       r.targetLow || null,
      analysts:  r.numberOfAnalysts || null,
    }
  } catch { return null }
}

export async function fetchAnalystEstimates(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/analyst-estimates?symbol=${ticker}&period=quarter&limit=4`, 300000)
    if (!Array.isArray(d) || !d.length) return null
    return d.map(q => ({
      date:        q.date,
      epsAvg:      q.estimatedEpsAverage,
      epsHigh:     q.estimatedEpsHigh,
      epsLow:      q.estimatedEpsLow,
      revAvg:      q.estimatedRevenueAverage,
      numAnalysts: q.numberAnalystEstimatedEps,
    }))
  } catch { return null }
}

export async function fetchUpgradesDowngrades(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/upgrades-downgrades?symbol=${ticker}&limit=10`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    return d.map(u => ({
      date:      u.publishedDate?.split('T')[0],
      company:   u.gradingCompany,
      action:    u.action, // upgrade | downgrade | initiated | reiterated
      fromGrade: u.previousGrade,
      toGrade:   u.newGrade,
    }))
  } catch { return null }
}

// Calculate MACD from closes array (no extra API call needed)
export function calcMACD(closes) {
  if (!closes || closes.length < 30) return null
  function ema(arr, period) {
    const k = 2 / (period + 1)
    let val = arr.slice(0, period).reduce((a, b) => a + b, 0) / period
    const result = [val]
    for (let i = period; i < arr.length; i++) {
      val = arr[i] * k + val * (1 - k)
      result.push(val)
    }
    return result
  }
  const ema12arr = ema(closes, 12)
  const ema26arr = ema(closes, 26)
  // Align arrays (ema26 is shorter by 14)
  const diff = ema12arr.length - ema26arr.length
  const macdLine = ema26arr.map((v, i) => ema12arr[i + diff] - v)
  const cur  = macdLine[macdLine.length - 1]
  const prev = macdLine[macdLine.length - 2]
  return {
    macd:         parseFloat(cur.toFixed(4)),
    macdPrev:     parseFloat(prev.toFixed(4)),
    bullishCross: prev <= 0 && cur > 0,
    bearishCross: prev >= 0 && cur < 0,
    trend:        cur > 0 ? 'bullish' : 'bearish',
    ema12:        parseFloat(ema12arr[ema12arr.length - 1].toFixed(2)),
    ema26:        parseFloat(ema26arr[ema26arr.length - 1].toFixed(2)),
  }
}

export async function fetchMACD(ticker) {
  return null // computed from candles in useTickerData instead
}

export async function fetchPeers(ticker) {
  if (!hasKeys().fmp) return []
  try {
    const d = await fmp(`/stock-peers?symbol=${ticker}`, 3600000)
    const raw = Array.isArray(d) ? d[0]?.peersList || d : []
    const peers = raw.map(p => typeof p === 'string' ? p : (p?.symbol || p?.ticker || null)).filter(Boolean)
    return peers.filter(p => p !== ticker).slice(0, 4)  // top 4, exclude self
  } catch { return [] }
}

export async function fetchTickerLite(ticker) {
  try {
    const [quote, candles, metrics, rec, earnings, news, priceTarget, upgrades] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker, 260), fetchMetrics(ticker),
      fetchRec(ticker), fetchEarnings(ticker), fetchNews(ticker, 5),
      fetchPriceTarget(ticker), fetchUpgradesDowngrades(ticker)
    ])
    if (!quote) return null
    return { ticker, quote, candles, metrics: metrics || {}, news: news || [], rec: rec || {}, earnings: earnings || [], priceTarget: priceTarget || null, upgrades: upgrades || [] }
  } catch { return null }
}

export async function fetchTickerFull(ticker) {
  try {
    const [quote, candles, metrics, news, rec, earnings, profile, priceTarget, upgrades] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker, 260), fetchMetrics(ticker),
      fetchNews(ticker, 7), fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker),
      fetchPriceTarget(ticker), fetchUpgradesDowngrades(ticker)
    ])
    if (!quote) return null
    return {
      ticker, quote, candles, metrics: metrics || {}, news: news || [], rec: rec || {},
      earnings: earnings || [], name: profile?.name || ticker,
      priceTarget: priceTarget || null, upgrades: upgrades || [],
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
      const [candles, metrics, news, rec, earnings, profile, insider, ec, priceTarget, upgrades, peers] = await Promise.all([
        fetchCandles(ticker), fetchMetrics(ticker), fetchNews(ticker),
        fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker),
        fetchFMPInsider(ticker), fetchEarningsCalendar(ticker),
        fetchPriceTarget(ticker), fetchUpgradesDowngrades(ticker),
        fetchPeers(ticker)
      ])
      // Compute MACD locally from candles — no extra API call
      const macd = candles?.closes ? calcMACD(candles.closes) : null
      setData({
        ticker, quote, candles, metrics: metrics || {}, news: news || [],
        rec: rec || {}, earnings: earnings || [], profile: profile || {},
        insider: insider || [], ec,
        priceTarget: priceTarget || null, upgrades: upgrades || [],
        macd: macd || null, peers: peers || []
      })
    } catch { setError('Network error — check your connection and try again.') }
    finally  { setLoading(false) }
  }, [])

  return { data, loading, error, fetch: load }
}
