import { useState, useCallback } from 'react'
import { TICKER_NAMES } from '../utils/constants.js'

/* ── Key resolution ── */
function getKey(name) {
  try { return localStorage.getItem(name) || import.meta.env[name] || '' } catch { return import.meta.env[name] || '' }
}

let FH_KEY      = () => getKey('VITE_FINNHUB_KEY')
let AV_KEY      = () => getKey('VITE_AV_KEY')
let FMP_KEY     = () => getKey('VITE_FMP_KEY')
let TRADIER_KEY  = () => getKey('VITE_TRADIER_KEY')  // kept for fallback compat
let POLYGON_KEY  = () => getKey('VITE_POLYGON_KEY')

export function hasKeys() {
  // All keys are server-side in Vercel env vars — proxy handles them
  // Client-side key detection is always true when deployed
  return { fh: true, av: true, fmp: true, polygon: true }
}

/* ── Cache (max 500 entries, evict oldest 100 on overflow) ── */
const cache = new Map()
const MAX_CACHE = 500
function cGet(k, ttl) { const e = cache.get(k); return e && Date.now()-e.ts < ttl ? e.d : null }
function cSet(k, d)   {
  if (cache.size >= MAX_CACHE) {
    // Evict oldest 100 entries to reduce churn during Screener runs
    const keys = [...cache.keys()].slice(0, 100)
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

/* ── Finnhub — routed through /api/proxy (key stays server-side) ── */
async function fh(path, ttl = 30000) {
  const url = `/api/proxy?provider=finnhub&path=${encodeURIComponent(path)}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url, 1)
  if (data !== null) cSet(url, data)
  return data
}

/* ── Alpha Vantage — always proxied ── */
async function av(params, ttl = 3600000) {
  const { apikey, ...rest } = params
  const qs = new URLSearchParams(rest)
  const url = `/api/proxy?provider=av&path=${encodeURIComponent('?' + qs.toString())}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (!data || data.Information || data.Note) return null
  cSet(url, data); return data
}

/* ── FMP stable — always proxied, key server-side only ── */
async function fmp(path, ttl = 300000) {
  const url = `/api/proxy?provider=fmp&path=${encodeURIComponent(path)}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ── FMP v3 — always proxied ── */
async function fmpv3(path, ttl = 300000) {
  const url = `/api/proxy?provider=fmp_v3&path=${encodeURIComponent(path)}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ── FMP v4 — always proxied ── */
async function fmpv4(path, ttl = 300000) {
  const url = `/api/proxy?provider=fmp_v4&path=${encodeURIComponent(path)}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url)
  if (data !== null) cSet(url, data)
  return data
}

/* ── Polygon.io — routed through /api/proxy (key stays server-side) ── */
async function polygon(path, ttl = 60000) {
  const url = `/api/proxy?provider=polygon&path=${encodeURIComponent(path)}`
  const hit = cGet(url, ttl); if (hit !== null) return hit
  const data = await go(url, 1)
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
      let ma50 = null, ma200 = null, ma200Partial = false
      if (closes.length >= 50) {
        const sl = closes.slice(-50)
        ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
      }
      if (closes.length >= 200) {
        const sl = closes.slice(-200)
        ma200 = parseFloat((sl.reduce((a, b) => a + b, 0) / 200).toFixed(2))
      } else if (closes.length >= 100) {
        // Partial MA200 — less reliable, flag for display
        ma200 = parseFloat((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2))
        ma200Partial = true
      }
      return { closes, highs, lows, opens, volumes, timestamps, ma50, ma200, ma200Partial, source: 'fmp' }
    }
  }
  // Finnhub fallback
  const from = Math.floor(Date.now() / 1000 - days * 86400)
  const to   = Math.floor(Date.now() / 1000)
  const d    = await fh(`/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}`, 600000)
  if (!d || d.s === 'no_data' || !d.c?.length) return null
  let ma50 = null, ma200 = null, ma200Partial = false
  if (d.c.length >= 50) {
    const sl = d.c.slice(-50)
    ma50 = parseFloat((sl.reduce((a, b) => a + b, 0) / 50).toFixed(2))
  }
  if (d.c.length >= 200) {
    const sl = d.c.slice(-200)
    ma200 = parseFloat((sl.reduce((a, b) => a + b, 0) / 200).toFixed(2))
  } else if (d.c.length >= 100) {
    ma200 = parseFloat((d.c.reduce((a, b) => a + b, 0) / d.c.length).toFixed(2))
    ma200Partial = true
  }
  const _arr = v => Array.isArray(v) ? v : []
  return { closes: _arr(d.c), highs: _arr(d.h), lows: _arr(d.l), opens: _arr(d.o || d.c), volumes: _arr(d.v), timestamps: _arr(d.t), ma50, ma200, ma200Partial, source: 'finnhub' }
}

/* ══════════════════════════════════════════
   METRICS — FMP /stable/profile primary
══════════════════════════════════════════ */
export async function fetchMetrics(ticker) {
  if (hasKeys().fmp) {
    const [profileArr, ratiosArr, cashFlowArr, incomeArr, balanceArr, keyMetricsArr] = await Promise.all([
      fmp(`/profile?symbol=${ticker}`, 3600000),
      fmp(`/ratios-ttm?symbol=${ticker}`, 3600000),
      fmp(`/cash-flow-statement?symbol=${ticker}&period=annual&limit=2`, 3600000),
      fmp(`/income-statement?symbol=${ticker}&period=annual&limit=2`, 3600000),
      fmp(`/balance-sheet-statement?symbol=${ticker}&period=annual&limit=1`, 3600000),
      fmp(`/key-metrics-ttm?symbol=${ticker}`, 3600000),
    ])
    const p   = Array.isArray(profileArr)   ? profileArr[0]  : profileArr
    const r   = Array.isArray(ratiosArr)    ? ratiosArr[0]   : ratiosArr
    const km  = Array.isArray(keyMetricsArr)? keyMetricsArr[0]: keyMetricsArr
    const cf  = Array.isArray(cashFlowArr)  ? cashFlowArr[0] : cashFlowArr
    const inc = Array.isArray(incomeArr)    ? incomeArr      : []
    const bs  = Array.isArray(balanceArr)   ? balanceArr[0]  : balanceArr
    if (p?.symbol) {
      // Revenue growth YoY — validate both statements are annual to avoid quarterly mix
      let revenueGrowthYoY = null
      if (inc.length >= 2 && inc[0].revenue && inc[1].revenue) {
        // Confirm annual period: FMP annual statements have dates ~12 months apart
        const d0 = inc[0].date ? new Date(inc[0].date) : null
        const d1 = inc[1].date ? new Date(inc[1].date) : null
        const monthsApart = (d0 && d1) ? Math.abs((d0 - d1) / (1000 * 60 * 60 * 24 * 30)) : 12
        if (monthsApart >= 9) { // only compute if statements are at least 9 months apart
          revenueGrowthYoY = parseFloat(((inc[0].revenue - inc[1].revenue) / Math.abs(inc[1].revenue) * 100).toFixed(1))
        }
      }
      // FCF per share
      const sharesOutstanding = p.sharesOutstanding || cf?.weightedAverageShsOut || (p.mktCap && p.price ? p.mktCap / p.price : null)
      const fcf = cf?.freeCashFlow || 
        (cf?.operatingCashFlow && cf?.capitalExpenditure 
          ? cf.operatingCashFlow - Math.abs(cf.capitalExpenditure) 
          : null)
      const fcfPerShare = (fcf && sharesOutstanding && sharesOutstanding > 0)
        ? parseFloat((fcf / sharesOutstanding).toFixed(2)) 
        : (r?.freeCashFlowPerShareTTM ? parseFloat(r.freeCashFlowPerShareTTM.toFixed(2)) : null)
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
        : ((p.lastDividend || p.lastDiv) && p.price ? parseFloat(((p.lastDividend || p.lastDiv) * 4 / p.price * 100).toFixed(2)) : null)
      // Extract additional ratios from ratios-ttm
      const evEbitda       = r?.enterpriseValueMultipleTTM || null
      const priceToFCF     = r?.priceToFreeCashFlowRatioTTM || null
      const roic           = km?.returnOnInvestedCapitalTTM != null
        ? parseFloat((km.returnOnInvestedCapitalTTM * 100).toFixed(2))
        : (() => {
            const ebit = inc[0]?.operatingIncome || null
            const taxRate = r?.effectiveTaxRateTTM || 0.21
            const nopat = ebit != null ? ebit * (1 - taxRate) : null
            const ic = (totalEquity != null && totalDebt != null && totalEquity + totalDebt > 0) ? totalEquity + totalDebt : null
            return (nopat != null && ic) ? parseFloat((nopat / ic * 100).toFixed(2)) : null
          })()
      const quickRatio     = r?.quickRatioTTM || null
      const cashRatio      = r?.cashRatioTTM || null
      const grossMargin    = r?.grossProfitMarginTTM ? r.grossProfitMarginTTM * 100 : null
      const operatingMargin = r?.operatingProfitMarginTTM ? r.operatingProfitMarginTTM * 100 : null
      const netMargin      = r?.netProfitMarginTTM ? r.netProfitMarginTTM * 100 : null
      const assetTurnover  = r?.assetTurnoverTTM || null

      // True TTM values from key-metrics-ttm (all return as decimals, multiply by 100 for %)
      const roeTTM         = km?.returnOnEquityTTM != null ? parseFloat((km.returnOnEquityTTM * 100).toFixed(2)) : null
      const roaTTM         = km?.returnOnAssetsTTM != null ? parseFloat((km.returnOnAssetsTTM * 100).toFixed(2)) : null
      const incomeQuality  = km?.incomeQualityTTM || null
      const grahamNumber   = km?.grahamNumberTTM ? parseFloat(km.grahamNumberTTM.toFixed(2)) : null

      return {
        peTTM:           r?.priceToEarningsRatioTTM || null,
        pbAnnual:        r?.priceToBookRatioTTM || null,
        roeTTM,
        payoutRatio:     r?.dividendPayoutRatioTTM != null ? parseFloat((r.dividendPayoutRatioTTM * 100).toFixed(1)) : null,
        marketCap:       p.mktCap || p.marketCap || null,
        beta:            p.beta || null,
        fcfPerShare,
        pegRatio,
        revenueGrowthYoY,
        debtToEquity,
        currentRatio,
        netCash,
        divYield,
        evEbitda,
        priceToFCF,
        roic,
        roaTTM,
        incomeQuality,
        grahamNumber,
        quickRatio,
        cashRatio,
        grossMargin,
        operatingMargin,
        netMargin,
        assetTurnover,
        _fmp: {
          sector:       p.sector || null,
          description:  p.description || null,
          divYield,
          targetPrice:  null,  // analyst target fetched separately via fetchPriceTarget
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
  // Try FMP analyst stock recommendations first (available on FMP Starter+)
  try {
    const d = await fmp(`/analyst-stock-recommendations?symbol=${ticker}&limit=12`, 300000)
    if (Array.isArray(d) && d.length) {
      const normalize = (r) => ({
        strongBuy:  r.analystRatingsStrongBuy  || 0,
        buy:        r.analystRatingsBuy         || 0,
        hold:       r.analystRatingsHold        || 0,
        sell:       r.analystRatingsSell        || 0,
        strongSell: r.analystRatingsStrongSell  || 0,
        period:     r.date || null,
      })
      return { current: normalize(d[0]), history: d.slice(0, 12).map(normalize) }
    }
  } catch {}
  // Finnhub fallback
  const d = await fh(`/stock/recommendation?symbol=${ticker}`, 300000)
  if (!Array.isArray(d) || !d.length) return { current: {}, history: [] }
  return { current: d[0] || {}, history: Array.isArray(d) ? d.slice(0, 12) : [] }
}

export async function fetchEarnings(ticker) {
  if (hasKeys().fmp) {
    const raw = await fmp(`/earnings?symbol=${ticker}&limit=8`, 300000)
    // FMP may return array, object with earnings key, or single object
    const d = Array.isArray(raw) ? raw
      : Array.isArray(raw?.earnings) ? raw.earnings
      : raw && typeof raw === 'object' && raw.date ? [raw]
      : null
    if (d?.length) {
      return d.map(q => ({
        date:        q.date || null,
        period:      q.period || q.date?.slice(0,7) || null,
        actual:      q.epsActual ?? q.actual ?? null,
        estimate:    q.epsEstimated ?? q.estimate ?? null,
        revActual:   q.revenueActual ?? null,
        revEstimate: q.revenueEstimated ?? null,
      }))
    }
  }
  const d = await fh(`/stock/earnings?symbol=${ticker}`, 300000)
  return Array.isArray(d) ? d.slice(0, 8) : []
}

export async function fetchProfile(ticker) {
  // FMP /profile is already fetched inside fetchMetrics — cache makes this free
  const d = await fmp(`/profile?symbol=${ticker}`, 3600000)
  const p = Array.isArray(d) ? d[0] : d
  if (!p?.symbol) return {}
  return {
    name:                  p.companyName || ticker,
    companyName:           p.companyName || ticker,
    finnhubIndustry:       p.industry || p.sector || '',   // DeepDive reads finnhubIndustry
    sector:                p.sector || '',
    industry:              p.industry || '',
    marketCapitalization:  p.mktCap || p.marketCap || null,
    weburl:                p.website || null,
    logo:                  p.image || null,
    exchange:              p.exchangeShortName || null,
    country:               p.country || null,
    currency:              p.currency || null,
    ipo:                   p.ipoDate || null,
  }
}

export async function fetchInsider(ticker) {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const d    = await fh(`/stock/insider-transactions?symbol=${ticker}&from=${from}`, 300000)
  return Array.isArray(d?.data) ? d.data.slice(0, 15) : []
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
    fmp(`/economic-indicators?name=GDP&limit=4`, 3600000),
    fmp(`/economic-indicators?name=CPI&limit=4`, 3600000),
    fmp(`/economic-indicators?name=unemploymentRate&limit=4`, 3600000),
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
  // GDP comes as level in $B — compute QoQ growth rate for display
  const gdpGrowth = (() => {
    const cur  = Array.isArray(gdpRaw)  && gdpRaw.length     ? gdpRaw[0].value  : null
    const prev = Array.isArray(gdpRaw)  && gdpRaw.length >= 2 ? gdpRaw[1].value  : null
    if (cur == null || !prev) return null
    return parseFloat(((cur - prev) / Math.abs(prev) * 100).toFixed(2))
  })()
  const latestVal = (arr) => Array.isArray(arr) && arr.length ? parseFloat(arr[0].value || 0) : null
  const prevVal   = (arr) => Array.isArray(arr) && arr.length >= 2 ? parseFloat(arr[1].value || 0) : null
  const econData = {
    gdp:      { value: gdpGrowth,              prev: null,                  label: 'GDP Growth (QoQ)', unit: '%' },
    cpi:      { value: latestVal(cpiRaw),      prev: prevVal(cpiRaw),      label: 'CPI Inflation',    unit: '%' },
    unemploy: { value: latestVal(unemployRaw), prev: prevVal(unemployRaw), label: 'Unemployment',     unit: '%' },
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
   DIVIDEND SCREENER — sorted by dividend yield descending
   Uses FMP company-screener with dividendMoreThan filter
══════════════════════════════════════════ */
export async function fetchDividendScreener({ minYield = 0, limit = 100 } = {}) {
  try {
    // Use stable dividends-calendar — available on FMP paid plans
    // Routes through proxy — key stays server-side
    const now = new Date()
    const from = now.toISOString().slice(0, 10)
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10)
    const apiPath = `/dividends-calendar?from=${from}&to=${to}`
    const d = await fmp(apiPath, 3600000)
    if (!Array.isArray(d) || !d.length) throw new Error('empty')

    // Deduplicate by ticker (calendar has multiple entries per stock), keep highest yield
    const seen = {}
    for (const r of d) {
      const ticker = r.symbol
      if (!ticker) continue
      // Normalize yield: some entries decimal (0.045), some percentage (4.5)
      const rawYield = r.yield ?? r.dividendYield ?? null
      const yieldPct = rawYield != null
        ? parseFloat((rawYield > 1 ? rawYield : rawYield * 100).toFixed(2))
        : null
      if (!yieldPct || yieldPct <= 0) continue
      if (!seen[ticker] || yieldPct > seen[ticker].divYield) {
        seen[ticker] = {
          ticker,
          name:        r.name || r.companyName || ticker,
          sector:      r.sector || 'Unknown',
          price:       r.price || 0,
          mcap:        r.marketCap || 0,
          divYield:    yieldPct,
          dividend:    r.dividend || r.adjDividend || null,
          exDivDate:   r.date || r.exDividendDate || null,
          paymentDate: r.paymentDate || null,
          frequency:   r.frequency || null,
          pe:          r.pe || null,
        }
      }
    }

    const results = Object.values(seen)
      .filter(s => s.divYield >= minYield)
      .sort((a, b) => (b.divYield || 0) - (a.divYield || 0))
      .slice(0, limit)

    // Fallback: if calendar returns nothing, use screener
    if (!results.length) {
      const apiPath2 = `/company-screener?dividendMoreThan=${minYield || 1}&limit=200&isEtf=false&isActivelyTrading=true&country=US`
      const d2 = await fmp(apiPath2, 3600000)
      if (!Array.isArray(d2) || !d2.length) return []
      return d2.map(r => {
        const rawYield = r.dividendYield ?? null
        const yieldPct = rawYield != null ? parseFloat((rawYield < 1 ? rawYield * 100 : rawYield).toFixed(2)) : null
        if (!yieldPct || yieldPct <= 0) return null
        return { ticker: r.symbol, name: r.companyName || r.symbol, sector: r.sector || 'Unknown',
          price: r.price || 0, mcap: r.marketCap || 0, divYield: yieldPct,
          dividend: r.lastAnnualDividend || null, exDivDate: null, paymentDate: null, frequency: null, pe: r.pe || null }
      }).filter(Boolean).sort((a,b) => b.divYield - a.divYield).slice(0, limit)
    }

    return results
  } catch {
    return []
  }
}

/* ══════════════════════════════════════════
   FMP SMART MONEY
   Congressional: /stable/senate-trading
   Insider: /api/v4/insider-trading (confirmed v4)
══════════════════════════════════════════ */
export async function fetchFMPCongressional(ticker) {
  const d = await fmp(`/senate-trades?symbol=${ticker}`, 3600000)
  if (!Array.isArray(d) || !d.length) return []
  return d.slice(0, 20).map(t => {
    const rawT = t.ticker || t.symbol || t.asset || ticker
    const match = rawT.match(/\(([A-Z]{1,5})\)/) || rawT.match(/^([A-Z]{1,5})$/)
    return {
      name:    ((t.firstName || '') + ' ' + (t.lastName || '')).trim() || 'Unknown',
      party:   t.party || '?',
      type:    t.type || t.transactionType || '?',
      amount:  t.amount || '?',
      date:    t.transactionDate || t.disclosureDate || '?',
      ticker:  match ? match[1] : (rawT.length <= 5 ? rawT.toUpperCase() : ticker),
      isBuy:   (t.type || t.transactionType || '').toLowerCase().includes('purchase') ||
               (t.type || t.transactionType || '').toLowerCase().includes('buy'),
    }
  })
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
  return all.slice(0, 50).map(t => {
    // FMP field name variations: ticker, symbol, asset, assetDescription
    const rawTicker = t.ticker || t.symbol || t.asset || ''
    // Extract ticker from asset description like "Apple Inc (AAPL)" or plain "AAPL"
    const tickerMatch = rawTicker.match(/\(([A-Z]{1,5})\)/) || rawTicker.match(/^([A-Z]{1,5})$/)
    const ticker = tickerMatch ? tickerMatch[1] : (rawTicker.length > 0 && rawTicker.length <= 5 ? rawTicker.toUpperCase() : null)
    return {
      name:   ((t.firstName || '') + ' ' + (t.lastName || '')).trim() || 'Unknown',
      party:  t.party || '?',
      ticker: ticker || t.assetDescription?.slice(0, 10) || '?',
      type:   t.type || t.transactionType || '?',
      amount: t.amount || '?',
      date:   t.transactionDate || t.disclosureDate || '?',
      isBuy:  (() => {
        const type = (t.type || t.transactionType || '').toLowerCase()
        return type.includes('purchase') || type.includes('buy')
      })(),
    }
  })
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
  return null  // endpoint not available on current FMP plan
}

export async function fetchAnalystEstimates(ticker) {
  return null  // requires FMP paid plan — disabled
}

export async function fetchUpgradesDowngrades(ticker) {
  return null  // endpoint not available on current FMP plan
}

// Calculate MACD from closes array (no extra API call needed)
export function calcMACD(closes) {
  if (!Array.isArray(closes) || closes.length < 30) return null
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
    const raw = Array.isArray(d) ? (d[0]?.peersList || d[0]?.peers || d) : Array.isArray(d?.peersList) ? d.peersList : []
    const peers = raw.map(p => typeof p === 'string' ? p : (p?.symbol || p?.ticker || null)).filter(Boolean)
    return peers.filter(p => p !== ticker).slice(0, 4)  // top 4, exclude self
  } catch { return [] }
}

export async function fetchTickerLite(ticker) {
  try {
    const [quote, candles, metrics, rec, earnings, news, score, rating] = await Promise.all([
      fetchQuote(ticker), fetchCandles(ticker, 260), fetchMetrics(ticker),
      fetchRec(ticker), fetchEarnings(ticker), fetchNews(ticker, 5),
      fetchScore(ticker), fetchRating(ticker)
    ])
    if (!quote) return null
    const ea = v => Array.isArray(v) ? v : []
    return { ticker, quote, candles, metrics: metrics || {}, news: ea(news), rec: rec || {}, earnings: ea(earnings), priceTarget: null, upgrades: [], score: score || null, rating: rating || null }
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
    const ea = v => Array.isArray(v) ? v : []
    return {
      ticker, quote, candles, metrics: metrics || {}, news: ea(news), rec: rec || {},
      earnings: ea(earnings), name: profile?.name || ticker,
      priceTarget: priceTarget || null, upgrades: ea(upgrades),
      sector: profile?.finnhubIndustry || '', mcap: profile?.marketCapitalization
    }
  } catch { return null }
}


/* ══════════════════════════════════════════
   PIOTROSKI + ALTMAN Z SCORE
══════════════════════════════════════════ */
export async function fetchScore(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/financial-scores?symbol=${ticker}`, 3600000)
    const s = Array.isArray(d) ? d[0] : d
    if (!s) return null
    const piotroski = s.piotroskiScore ?? s.piotroski ?? null
    const altmanZ   = s.altmanZScore  ?? s.altmanZ   ?? null
    return {
      piotroski,
      altmanZ,
      piotroskiLabel: piotroski >= 7 ? 'Strong' : piotroski >= 4 ? 'Neutral' : 'Weak',
      altmanLabel:    altmanZ >= 3 ? 'Safe' : altmanZ >= 1.8 ? 'Grey Zone' : 'Distress',
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   FMP COMPANY RATING (S+ to D)
══════════════════════════════════════════ */
export async function fetchRating(ticker) {
  // FMP /company-rating not available on current plan — returns null
  // Implementation preserved below for when plan is upgraded:
  // const d = await fmp(`/company-rating?symbol=${ticker}`, 3600000)
  // const r = Array.isArray(d) ? d[0] : d
  // if (!r) return null
  // return { rating: r.rating, ratingScore: r.ratingScore ?? r.score ?? null, ... }
  return null
}

/* ══════════════════════════════════════════
   DCF INTRINSIC VALUE
══════════════════════════════════════════ */
export async function fetchDCF(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/discounted-cash-flow?symbol=${ticker}`, 3600000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r?.dcf) return null
    const price = r.stockPrice || r.price || 0
    return {
      dcf:    parseFloat(r.dcf.toFixed(2)),
      price:  parseFloat(price.toFixed(2)),
      upside: price ? parseFloat(((r.dcf - price) / price * 100).toFixed(1)) : null,
      date:   r.date || null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   SHARES FLOAT (short interest, float shares)
══════════════════════════════════════════ */
export async function fetchSharesFloat(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/shares-float?symbol=${ticker}`, 3600000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r) return null
    return {
      floatShares:      r.floatShares || null,
      outstandingShares: r.outstandingShares || null,
      freeFloat:        r.freeFloat != null ? parseFloat(r.freeFloat.toFixed(2)) : null,
      lastUpdated:      r.date || null,
      source:           r.source || null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   STOCK PRICE CHANGE (multi-period returns)
══════════════════════════════════════════ */
export async function fetchPriceChange(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/stock-price-change?symbol=${ticker}`, 300000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r) return null
    return {
      '1D':  r['1D']  ?? null,
      '5D':  r['5D']  ?? null,
      '1M':  r['1M']  ?? null,
      '3M':  r['3M']  ?? null,
      '6M':  r['6M']  ?? null,
      '1Y':  r['1Y']  ?? null,
      '3Y':  r['3Y']  ?? null,
      '5Y':  r['5Y']  ?? null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   KEY EXECUTIVES
══════════════════════════════════════════ */
export async function fetchExecutives(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/key-executives?symbol=${ticker}`, 86400000)
    if (!Array.isArray(d) || !d.length) return null
    return d.slice(0, 5).map(e => ({
      name:         e.name || '',
      title:        e.title || '',
      pay:          e.pay || null,
      gender:       e.gender || null,
      yearBorn:     e.yearBorn || null,
    }))
  } catch { return null }
}

/* ══════════════════════════════════════════
   OWNER EARNINGS (Buffett-style)
══════════════════════════════════════════ */
export async function fetchOwnerEarnings(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/owner-earnings?symbol=${ticker}`, 3600000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r) return null
    return {
      ownerEarnings:        r.ownerEarnings || null,
      averageInvestment:    r.averageInvestment || null,
      ownerEarningsPerShare: r.ownerEarningsPerShare || null,
      growthCapex:          r.growthCapex || null,
      maintenanceCapex:     r.maintenanceCapex || null,
      date:                 r.date || null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   ESG SCORES
══════════════════════════════════════════ */
export async function fetchESG(ticker) {
  // FMP /esg-disclosures requires paid plan (returns 402) — disabled to avoid noise
  // Implementation preserved below for when plan is upgraded:
  // const d = await fmp(`/esg-disclosures?symbol=${ticker}`, 86400000)
  // const r = Array.isArray(d) ? d[0] : d
  // if (!r) return null
  // return { esgScore: r.ESGScore ?? r.esgScore ?? null, environmentScore: ..., socialScore: ..., governanceScore: ..., rating: ..., year: ... }
  return null
}

/* ══════════════════════════════════════════
   EARNINGS TRANSCRIPT (latest summary)
══════════════════════════════════════════ */
export async function fetchEarningsTranscript(ticker) {
  return null // Earnings transcripts require FMP Premium — not available on Starter plan
}


/* ══════════════════════════════════════════
   KEY METRICS TTM (EV, Revenue/Share etc.)
══════════════════════════════════════════ */
export async function fetchKeyMetrics(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/key-metrics-ttm?symbol=${ticker}`, 3600000)
    const r = Array.isArray(d) ? d[0] : d
    if (!r) return null
    return {
      evTTM:               r.enterpriseValueTTM || null,
      evEbitdaTTM:         r.evToEBITDATTM || null,
      evSalesTTM:          r.evToSalesTTM || null,
      evFCFTTM:            r.evToFreeCashFlowTTM || null,
      evOpCFTTM:           r.evToOperatingCashFlowTTM || null,
      netDebtToEbitda:     r.netDebtToEBITDATTM || null,
      roeTTM:              r.returnOnEquityTTM != null ? parseFloat((r.returnOnEquityTTM * 100).toFixed(2)) : null,
      roicTTM:             r.returnOnInvestedCapitalTTM != null ? parseFloat((r.returnOnInvestedCapitalTTM * 100).toFixed(2)) : null,
      roaTTM:              r.returnOnAssetsTTM != null ? parseFloat((r.returnOnAssetsTTM * 100).toFixed(2)) : null,
      roceTTM:             r.returnOnCapitalEmployedTTM != null ? parseFloat((r.returnOnCapitalEmployedTTM * 100).toFixed(2)) : null,
      incomeQualityTTM:    r.incomeQualityTTM || null,
      grahamNumber:        r.grahamNumberTTM ? parseFloat(r.grahamNumberTTM.toFixed(2)) : null,
      earningsYield:       r.earningsYieldTTM ? parseFloat((r.earningsYieldTTM * 100).toFixed(2)) : null,
      fcfYield:            r.freeCashFlowYieldTTM ? parseFloat((r.freeCashFlowYieldTTM * 100).toFixed(2)) : null,
      workingCapitalTTM:   r.workingCapitalTTM || null,
      investedCapitalTTM:  r.investedCapitalTTM || null,
      capexToRevenue:      r.capexToRevenueTTM ? parseFloat((r.capexToRevenueTTM * 100).toFixed(2)) : null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   INCOME STATEMENT GROWTH
══════════════════════════════════════════ */
export async function fetchIncomeGrowth(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/income-statement-growth?symbol=${ticker}&period=annual&limit=3`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    return d.slice(0, 3).map(r => ({
      date:              r.date || null,
      revenueGrowth:     r.growthRevenue ? parseFloat((r.growthRevenue * 100).toFixed(1)) : null,
      netIncomeGrowth:   r.growthNetIncome ? parseFloat((r.growthNetIncome * 100).toFixed(1)) : null,
      epsGrowth:         r.growthEPS ? parseFloat((r.growthEPS * 100).toFixed(1)) : null,
      grossProfitGrowth: r.growthGrossProfit ? parseFloat((r.growthGrossProfit * 100).toFixed(1)) : null,
      ebitdaGrowth:      r.growthEBITDA ? parseFloat((r.growthEBITDA * 100).toFixed(1)) : null,
    }))
  } catch { return null }
}

/* ══════════════════════════════════════════
   CASH FLOW STATEMENT GROWTH
══════════════════════════════════════════ */
export async function fetchCashFlowGrowth(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/cash-flow-statement-growth?symbol=${ticker}&period=annual&limit=3`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    return d.slice(0, 3).map(r => ({
      date:          r.date || null,
      fcfGrowth:     r.growthFreeCashFlow ? parseFloat((r.growthFreeCashFlow * 100).toFixed(1)) : null,
      opCFGrowth:    r.growthNetCashProvidedByOperatingActivities ? parseFloat((r.growthNetCashProvidedByOperatingActivities * 100).toFixed(1)) : null,
      capexGrowth:   r.growthCapitalExpenditure ? parseFloat((r.growthCapitalExpenditure * 100).toFixed(1)) : null,
    }))
  } catch { return null }
}

/* ══════════════════════════════════════════
   BALANCE SHEET GROWTH
══════════════════════════════════════════ */
export async function fetchBalanceSheetGrowth(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/balance-sheet-statement-growth?symbol=${ticker}&period=annual&limit=3`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    return d.slice(0, 3).map(r => ({
      date:           r.date || null,
      totalAssetsGrowth: r.growthTotalAssets ? parseFloat((r.growthTotalAssets * 100).toFixed(1)) : null,
      totalDebtGrowth:   r.growthTotalDebt ? parseFloat((r.growthTotalDebt * 100).toFixed(1)) : null,
      cashGrowth:        r.growthCashAndCashEquivalents ? parseFloat((r.growthCashAndCashEquivalents * 100).toFixed(1)) : null,
      equityGrowth:      r.growthTotalStockholdersEquity ? parseFloat((r.growthTotalStockholdersEquity * 100).toFixed(1)) : null,
    }))
  } catch { return null }
}

/* ══════════════════════════════════════════
   REVENUE PRODUCT SEGMENTATION
══════════════════════════════════════════ */
export async function fetchRevenueSegments(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/revenue-product-segmentation?symbol=${ticker}&period=annual`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    const latest = d[0]
    if (!latest) return null
    // FMP stable returns: [{ fiscalYear, period, reportedCurrency, data: { "iPhone": 123, ... } }]
    // OR legacy: [{ date, iPhone: 123, Services: 456, ... }]
    const SKIP = new Set(['fiscalYear','period','reportedCurrency','date','symbol','reportDate'])
    let rawSegments = null
    if (latest.data && typeof latest.data === 'object') {
      rawSegments = latest.data
    } else {
      rawSegments = latest
    }
    const entries = Object.entries(rawSegments)
      .filter(([k, v]) => !SKIP.has(k) && typeof v === 'number' && v > 0)
      .sort((a, b) => b[1] - a[1])
    if (!entries.length) return null
    const total = entries.reduce((s, [, v]) => s + v, 0)
    return {
      date:     latest.fiscalYear || latest.date || null,
      segments: entries.map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? parseFloat((value / total * 100).toFixed(1)) : null
      }))
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   DIVIDEND HISTORY
══════════════════════════════════════════ */
export async function fetchDividends(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/dividends?symbol=${ticker}&limit=8`, 3600000)
    if (!Array.isArray(d) || !d.length) return null
    return d.slice(0, 8).map(r => ({
      date:          r.date || r.paymentDate || null,
      dividend:      r.dividend || r.adjDividend || null,
      declarationDate: r.declarationDate || null,
      recordDate:    r.recordDate || null,
      paymentDate:   r.paymentDate || null,
    }))
  } catch { return null }
}

// ── SECTOR MAP — ticker → sector ETF ─────────────────────────────────────────
const SECTOR_ETF_MAP = {
  // Tech
  AAPL:'XLK', MSFT:'XLK', NVDA:'XLK', AMD:'XLK', INTC:'XLK', AVGO:'XLK',
  ORCL:'XLK', CRM:'XLK', ADBE:'XLK', NOW:'XLK', SNOW:'XLK', PLTR:'XLK',
  UBER:'XLK', META:'XLK', GOOGL:'XLK', GOOG:'XLK',
  // Consumer Discretionary
  AMZN:'XLY', TSLA:'XLY', HD:'XLY', MCD:'XLY', NKE:'XLY', SBUX:'XLY', TGT:'XLY',
  // Consumer Staples
  WMT:'XLP', COST:'XLP', PG:'XLP', KO:'XLP', PEP:'XLP',
  // Financials
  JPM:'XLF', GS:'XLF', MS:'XLF', BAC:'XLF', WFC:'XLF', AXP:'XLF', BLK:'XLF', V:'XLF', MA:'XLF', SCHW:'XLF',
  // Healthcare
  JNJ:'XLV', UNH:'XLV', LLY:'XLV', ABBV:'XLV', MRK:'XLV', PFE:'XLV', TMO:'XLV',
  // Energy
  XOM:'XLE', CVX:'XLE', COP:'XLE', SLB:'XLE',
  // Industrials
  CAT:'XLI', DE:'XLI', HON:'XLI', UPS:'XLI', BA:'XLI',
  // Real Estate
  AMT:'XLRE', PLD:'XLRE', SPG:'XLRE',
  // Utilities
  NEE:'XLU', DUK:'XLU', SO:'XLU',
  // Materials
  LIN:'XLB', APD:'XLB', SHW:'XLB',
  // ETFs — use SPY as regime check
  SPY:'SPY', QQQ:'XLK', IWM:'SPY', GLD:'SPY', TLT:'SPY',
  XLK:'XLK', XLF:'XLF', XLE:'XLE', XLV:'XLV', XLY:'XLY', XLP:'XLP',
}

/* ── REGIME DATA — SPY + sector ETF vs their 50-day MAs ─────────────────────
   Called once per ticker analysis to gate BUY signals during market downtrends
   Returns: { spyPrice, spyMA50, sectorETF, sectorPrice, sectorMA50 }         */
export async function fetchRegimeData(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const sectorETF = SECTOR_ETF_MAP[ticker?.toUpperCase()] || 'SPY'
    const tickers = sectorETF === 'SPY' ? ['SPY'] : ['SPY', sectorETF]

    const quotes = await Promise.all(
      tickers.map(t => fmp(`/quote?symbol=${t}`, 60000))
    )

    const spyQuote    = Array.isArray(quotes[0]) ? quotes[0][0] : quotes[0]
    const sectorQuote = tickers.length > 1
      ? (Array.isArray(quotes[1]) ? quotes[1][0] : quotes[1])
      : spyQuote

    if (!spyQuote) return null

    return {
      sectorETF,
      spyPrice:    spyQuote.price    || spyQuote.c || null,
      spyMA50:     spyQuote.priceAvg50 || null,
      sectorPrice: sectorQuote.price   || sectorQuote.c || null,
      sectorMA50:  sectorQuote.priceAvg50 || null,
    }
  } catch { return null }
}

/* ══════════════════════════════════════════
   MARKET MOVERS (biggest gainers/losers)
══════════════════════════════════════════ */
export async function fetchMarketMovers() {
  if (!hasKeys().fmp) return null
  try {
    const [gainers, losers] = await Promise.all([
      fmp(`/biggest-gainers`, 180000),
      fmp(`/biggest-losers`, 180000),
    ])
    const mapMovers = arr => Array.isArray(arr) ? arr.slice(0, 10).map(r => ({
      ticker:  r.symbol || r.ticker,
      name:    r.name || r.companyName || '',
      price:   r.price || null,
      change:  r.change || null,
      changePct: r.changesPercentage || r.changePercentage || null,
    })) : []
    return { gainers: mapMovers(gainers), losers: mapMovers(losers) }
  } catch { return null }
}


/* ══════════════════════════════════════════
   REAL OPTIONS CHAIN — via Polygon.io free API
   Returns expiry dates + full chain for one expiry
   Requires POLYGON_KEY in Vercel env vars (no VITE_ prefix)
   Free tier: 15-min delayed, unlimited calls
══════════════════════════════════════════ */
export async function fetchOptionsExpirations(ticker) {
  if (!hasKeys().polygon) return []
  try {
    // Polygon: GET /v3/reference/options/contracts?underlying_ticker=AAPL&expired=false&limit=50
    const d = await polygon(`/v3/reference/options/contracts?underlying_ticker=${ticker}&expired=false&limit=200`, 3600000)
    if (!d?.results?.length) return []
    // Extract unique expiry dates, sorted ascending
    const dates = [...new Set(d.results.map(c => c.expiration_date))].sort()
    return dates.slice(0, 12) // next 12 expiries
  } catch { return [] }
}

export async function fetchOptionsChain(ticker, expiration) {
  if (!expiration || !hasKeys().polygon) return null
  try {
    // Polygon snapshot: GET /v3/snapshot/options/{underlyingAsset}?expiration_date=YYYY-MM-DD&limit=250
    const d = await polygon(`/v3/snapshot/options/${ticker}?expiration_date=${expiration}&limit=250`, 60000)
    if (!d?.results?.length) return null

    return d.results.map(o => {
      const det  = o.details   || {}
      const day  = o.day       || {}
      const greeks = o.greeks  || {}
      const iv   = o.implied_volatility
      return {
        symbol:     det.ticker,
        type:       det.contract_type,           // 'call' | 'put'
        strike:     det.strike_price,
        expiration: det.expiration_date,
        bid:        o.last_quote?.bid   ?? null,
        ask:        o.last_quote?.ask   ?? null,
        last:       o.last_trade?.price ?? day.close ?? null,
        volume:     day.volume          ?? null,
        oi:         o.open_interest     ?? null,
        iv:         iv != null ? Math.round(iv * 100) : null,
        delta:      greeks.delta  != null ? +greeks.delta.toFixed(3)  : null,
        gamma:      greeks.gamma  != null ? +greeks.gamma.toFixed(4)  : null,
        theta:      greeks.theta  != null ? +greeks.theta.toFixed(3)  : null,
        vega:       greeks.vega   != null ? +greeks.vega.toFixed(3)   : null,
        midpoint:   (o.last_quote?.bid != null && o.last_quote?.ask != null)
                      ? +((o.last_quote.bid + o.last_quote.ask) / 2).toFixed(2)
                      : null,
      }
    })
  } catch { return null }
}

/* ══════════════════════════════════════════
   UNUSUAL OPTIONS FLOW — FMP /stable/options
   Flags contracts where Vol/OI >= 2x AND volume >= 500
   Sorted by Vol/OI ratio descending
══════════════════════════════════════════ */
export async function fetchUnusualFlow(ticker) {
  if (!hasKeys().fmp) return null
  try {
    const d = await fmp(`/options?symbol=${ticker}`, 120000)
    // FMP returns array of option contracts
    const arr = Array.isArray(d) ? d : (d?.optionChain ? d.optionChain : [])
    if (!arr.length) return null

    const contracts = arr.map(o => {
      const vol = o.volume || o.vol || 0
      const oi  = o.openInterest || o.oi || 1
      const ratio = oi > 0 ? +(vol / oi).toFixed(2) : 0
      return {
        type:       (o.callPut || o.optionType || '').toLowerCase().includes('c') ? 'call' : 'put',
        strike:     o.strike || o.strikePrice,
        expiry:     o.expirationDate || o.expiry || o.expirtyDate,
        volume:     vol,
        oi,
        ratio,
        iv:         o.impliedVolatility ? Math.round(o.impliedVolatility * 100) : null,
        last:       o.lastPrice || o.last,
        inTheMoney: o.inTheMoney || false,
      }
    })
    // Unusual = Vol/OI >= 2 AND volume >= 500
    const unusual = contracts
      .filter(c => c.ratio >= 2 && c.volume >= 500)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 20)

    return unusual.length ? unusual : null
  } catch { return null }
}

/* ══════════════════════════════════════════
   TICKER SEARCH — company name → symbol autocomplete
   Local TICKER_NAMES dict first (instant), FMP API fallback for unknowns
══════════════════════════════════════════ */
export async function fetchTickerSearch(query) {
  if (!query || query.length < 2) return []
  const q = query.toLowerCase().trim()

  // Search local dictionary: match ticker prefix OR any word in the description
  const local = Object.entries(TICKER_NAMES)
    .filter(([ticker, desc]) => {
      if (ticker.toLowerCase().startsWith(q)) return true
      const companyName = desc.split(' — ')[0].toLowerCase()
      return companyName.split(/[\s,]+/).some(word => word.startsWith(q))
    })
    .slice(0, 6)
    .map(([ticker, desc]) => ({ ticker, name: desc.split(' — ')[0], exchange: '' }))

  if (local.length >= 4) return local  // enough local hits, skip API

  // FMP API fallback — relax filter to just exclude foreign listings (dots in symbol)
  try {
    const d = await fmpv3(`/search?query=${encodeURIComponent(query)}&limit=10`, 60000)
    if (Array.isArray(d) && d.length) {
      const seen = new Set(local.map(l => l.ticker))
      const api = d
        .filter(r => r.symbol && r.name && !r.symbol.includes('.') && !seen.has(r.symbol))
        .slice(0, 6 - local.length)
        .map(r => ({ ticker: r.symbol, name: r.name, exchange: r.exchangeShortName || '' }))
      return [...local, ...api].slice(0, 6)
    }
  } catch {}

  return local
}

/* ── React hook ── */
export function useTickerData() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (ticker) => {
    if (!ticker) return
    setLoading(true); setError(null); setData(null)
    try {
      const quote = await fetchQuote(ticker)
      if (!quote) {
        setError(`No data found for "${ticker}". Check the ticker is a valid US stock or ETF.`)
        return
      }
      const [candles, metrics, news, rec, earnings, profile, insider, ec,
             peers, score, dcf, sharesFloat,
             priceChange, incomeGrowth, cfGrowth,
             revenueSegments, dividends, regimeData] = await Promise.all([
        fetchCandles(ticker), fetchMetrics(ticker), fetchNews(ticker),
        fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker),
        fetchFMPInsider(ticker), fetchEarningsCalendar(ticker),
        fetchPeers(ticker), fetchScore(ticker),
        fetchDCF(ticker), fetchSharesFloat(ticker), fetchPriceChange(ticker),
        fetchIncomeGrowth(ticker),
        fetchCashFlowGrowth(ticker),
        fetchRevenueSegments(ticker), fetchDividends(ticker),
        fetchRegimeData(ticker)
      ])
      // Compute MACD locally from candles — no extra API call
      const macd = Array.isArray(candles?.closes) && candles.closes.length >= 30 ? calcMACD(candles.closes) : null
      // Defensive: ensure all array fields are actually arrays
      const ensureArr = v => Array.isArray(v) ? v : []
      setData({
        ticker, quote, candles, metrics: metrics || {}, news: ensureArr(news),
        rec: rec || {}, earnings: ensureArr(earnings), profile: profile || {},
        insider: ensureArr(insider), ec,
        priceTarget: null, upgrades: [],
        macd: macd || null, peers: ensureArr(peers),
        score: score || null, rating: null,
        dcf: dcf || null, sharesFloat: sharesFloat || null,
        priceChange: priceChange || null,
        keyMetrics: null, incomeGrowth: incomeGrowth || null,
        cfGrowth: cfGrowth || null, bsGrowth: null,
        revenueSegments: revenueSegments || null, dividends: dividends || null,
        regimeData: regimeData || null
      })
    } catch { setError('Network error — check your connection and try again.') }
    finally  { setLoading(false) }
  }, [])

  return { data, loading, error, fetch: load }
}
