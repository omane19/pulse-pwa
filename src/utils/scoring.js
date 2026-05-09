import { SOURCE_TIERS } from './constants.js'

// ── Simple sentiment (AFINN-style word list, no external lib) ────
const POS_WORDS = new Set(["beat","beats","surge","surged","soar","soared","rally","rallied","profit","profits","gain","gains","growth","grew","strong","record","upgrade","upgraded","buy","outperform","raised","raise","exceeds","exceeded","positive","bullish","recovery","recovered","expand","expanding","revenue","solid","robust","better","improved","improvement","boost","boosted","higher","rise","rose","increase","increased","top","topped","above","ahead","breakout","accelerating","momentum","blowout","outpaced"])
// NEG_WORDS v29 — removed generic business words: "risk","demand","supply","debt","concern","shortage"
// These appear in every AI/tech/pharma article regardless of tone and were killing scores unfairly
// Only keeping words that are unambiguously negative in a financial context
const NEG_WORDS = new Set(["miss","misses","missed","fall","falls","fell","drop","dropped","decline","declined","loss","losses","weak","weaker","cut","cuts","downgrade","downgraded","sell","underperform","lower","below","warning","disappointing","disappointed","reduce","reduced","layoff","layoffs","restructure","lawsuit","investigation","fraud","recall","suspended","suspension","bankruptcy","negative","bearish","shortfall","write-down","impairment","defaulted","delinquent","breach","violation","penalty","fine","subpoena","restatement"])

export function simpleSentiment(text) {
  if (!text) return 0
  const words = text.toLowerCase().split(/\W+/)
  let score = 0; let count = 0
  for (const w of words) {
    if (POS_WORDS.has(w)) { score++; count++ }
    if (NEG_WORDS.has(w)) { score--; count++ }
  }
  return count > 0 ? Math.max(-1, Math.min(1, score / Math.max(count, 3))) : 0
}

export function getTier(source) {
  const src = (source || '').toLowerCase()
  for (const [tier, info] of Object.entries(SOURCE_TIERS)) {
    if (parseInt(tier) === 4) continue
    if (info.sources && info.sources.some(s => src.includes(s.toLowerCase()))) return parseInt(tier)
  }
  return 4
}

export function credibilitySentiment(news) {
  if (!news || news.length === 0) return [0, []]
  const scored = news.map(n => {
    const raw = simpleSentiment((n.title || '') + ' ' + (n.body || ''))
    const tier = getTier(n.source)
    const w = SOURCE_TIERS[tier].weight
    return { score: raw, weighted: raw * w, tier }
  })
  const ws = scored.map(s => s.weighted)
  const sorted = [...ws].sort((a, b) => a - b)
  const trimmed = ws.length >= 6 ? (Array.isArray(sorted) ? sorted : []).slice(1, -1) : sorted
  const avg = trimmed.length > 0 ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : 0
  return [parseFloat(avg.toFixed(3)), scored]
}

export function calcMom(candles, quote) {
  const out = {}
  if (!candles || !quote) return out
  const closes = candles.closes
  const price = quote.c
  if (!price || !Array.isArray(closes) || closes.length === 0) return out
  if (closes.length >= 21)  out['1m']  = parseFloat(((price / closes[closes.length - 21]  - 1) * 100).toFixed(2))
  if (closes.length >= 61)  out['3m']  = parseFloat(((price / closes[closes.length - 61]  - 1) * 100).toFixed(2))
  if (closes.length >= 126) out['6m']  = parseFloat(((price / closes[closes.length - 126] - 1) * 100).toFixed(2))
  if (closes.length >= 252) out['1y']  = parseFloat(((price / closes[closes.length - 252] - 1) * 100).toFixed(2))
  // 1-day kept for display and volume-direction signal only — NOT used in scoring
  out['1d'] = quote.dp || 0
  if (closes.length >= 15) {
    const diffs = (Array.isArray(closes) ? closes : []).slice(-15).map((c, i, arr) => i === 0 ? 0 : c - arr[i - 1]).slice(1)
    const gains = diffs.map(d => d > 0 ? d : 0)
    const losses = diffs.map(d => d < 0 ? -d : 0)
    const ag = gains.reduce((a, b) => a + b, 0) / gains.length
    const al = losses.reduce((a, b) => a + b, 0) / losses.length
    const rs = al > 0 ? ag / al : 100
    out['rsi'] = parseFloat((100 - 100 / (1 + rs)).toFixed(1))
  }
  return out
}


// ── ETF detection ────────────────────────────────────────────────────────────
// ETFs cannot be scored with the stock model — no earnings, no P/E, no analyst coverage
// Explicit set of all ETFs in the PULSE universe
const ETF_TICKERS = new Set([
  'SPY','QQQ','IWM','VTI','DIA','RSP','VOO','MDY','IJR','IVV','SCHB','ITOT','SCHA',
  'XLK','XLE','XLF','XLV','XLY','XLP','XLRE','XLB','XLI','XLU','XLC','XBI','IBB','KRE','ITB','XHB','XRT','XME',
  'EFA','EEM','VEA','VWO','EWJ','FXI','EWZ','EWY','EWG','EWU','EWC','EWA','INDA','KWEB',
  'TLT','AGG','HYG','LQD','BND','SHY','IEF','VCIT','VCSH','MUB','TIP','GOVT','EMB','JNK',
  'GLD','SLV','IAU','USO','DBA','PDBC','CPER','UNG','WEAT','CORN','SOYB','DBB',
])

export function isETF(ticker) {
  if (!ticker) return false
  // Explicit list check
  if (ETF_TICKERS.has(ticker.toUpperCase())) return true
  // Heuristic: no P/E, no earnings estimates, no analyst coverage = likely ETF/fund
  return false
}

// ── ETF Scoring model ────────────────────────────────────────────────────────
// ETFs are scored purely on price signals: momentum, trend, relative strength
// Valuation, earnings, analyst are irrelevant for funds
export function scoreETF(quote, candles, ma50, extras = {}) {
  const _a = v => Array.isArray(v) ? v : []
  const mom = calcMom(candles || { closes:[], volumes:[], highs:[], lows:[], opens:[], timestamps:[] }, quote)
  const S = {}; const R = {}

  // Momentum — same logic as stock model
  let ms = 0; const mr = []
  if ('1m' in mom) { const w = Math.max(-.35, Math.min(.35, mom['1m'] / 15)); ms += w; mr.push(`1-month ${mom['1m'] > 0 ? '+' : ''}${mom['1m']}%`) }
  if ('3m' in mom) { const w = Math.max(-.35, Math.min(.35, mom['3m'] / 20)); ms += w; mr.push(`3-month ${mom['3m'] > 0 ? '+' : ''}${mom['3m']}%`) }
  if ('6m' in mom) { const w = Math.max(-.25, Math.min(.25, mom['6m'] / 30)); ms += w; mr.push(`6-month ${mom['6m'] > 0 ? '+' : ''}${mom['6m']}%`) }
  if ('1y' in mom) { const w = Math.max(-.20, Math.min(.20, mom['1y'] / 50)); ms += w; mr.push(`1-year ${mom['1y'] > 0 ? '+' : ''}${mom['1y']}%`) }
  if ('rsi' in mom) {
    const rsi = mom['rsi']
    if (rsi < 30) { ms += .3; mr.push(`RSI ${rsi} — oversold`) }
    else if (rsi > 70) { ms -= .2; mr.push(`RSI ${rsi} — overbought`) }
    else mr.push(`RSI ${rsi}`)
  }
  S.momentum = Math.max(-1, Math.min(1, ms)); R.momentum = mr

  // Trend — MA50 and MA200
  let ts = 0; const tr = []
  const price = quote?.c || 0
  const ma200 = candles?.ma200 || null
  if (price && ma50) { const pct = (price - ma50) / ma50 * 100; ts += Math.max(-0.7, Math.min(0.7, pct / 10)); tr.push(`Price ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'} 50-day MA ($${ma50})`) }
  if (price && ma200) { const pct200 = (price - ma200) / ma200 * 100; ts += Math.max(-0.3, Math.min(0.3, pct200 / 15)); tr.push(`200-day MA: $${ma200}`) }
  S.trend = Math.max(-1, Math.min(1, ts)); R.trend = tr

  // Volume confirmation
  const vols = _a(candles?.volumes)
  let vs2 = 0
  if (vols.length >= 20) {
    const liveVol = (quote?.v && quote.v > 0) ? quote.v : (vols[vols.length - 1] || 0)
    const avgVol = vols.slice(-20, -1).reduce((a, b) => a + b, 0) / 19
    if (avgVol > 0) {
      const ratio = liveVol / avgVol
      const trendUp = (mom['1m'] || 0) >= 0
      if (ratio >= 2.0) vs2 = trendUp ? 0.3 : -0.3
      else if (ratio >= 1.5) vs2 = trendUp ? 0.15 : -0.15
    }
  }
  S.volume = Math.max(-1, Math.min(1, vs2)); R.volume = ['Volume confirmation']

  // ETF weights — only 3 real factors
  const W = { momentum: 0.45, trend: 0.40, volume: 0.15 }
  const total = Object.entries(W).reduce((sum, [k, w]) => sum + (S[k] || 0) * w, 0)
  const pct = Math.min(100, Math.max(0, Math.round((total + 1) / 2 * 100 * 10) / 10))

  const verdict = total >= 0.25 ? 'BUY' : total >= -0.10 ? 'HOLD' : 'AVOID'
  const color = verdict === 'BUY' ? '#00C805' : verdict === 'HOLD' ? '#FFD700' : '#FF5000'
  const conviction = parseFloat(Math.max(0, Math.min(100,
    ((S.momentum > 0 ? 1 : 0) + (S.trend > 0 ? 1 : 0)) / 2 * 60 +
    (Math.abs(S.momentum) + Math.abs(S.trend)) / 2 * 40
  )).toFixed(1))

  return {
    scores: S, reasons: R, total: parseFloat(total.toFixed(3)), pct, verdict, color,
    mom, avgSent: 0, scoredNews: [], conviction, uncertainty: ['ETF — scored on momentum + trend only'],
    factorsAgree: Object.values(S).filter(v => v > 0.1).length,
    pe: null, contradictions: [], inBearRegime: false, marketRegimeWeak: false, regimeLabel: null,
    isQualityDip: false, qualityDipLabel: null, qualityDipBonus: 0, upside: null,
    isETF: true
  }
}

export function scoreAsset(quote, candles, ma50, metrics, news, rec, earn, smartMoney, extras = {}) {
  // Debug logging to find crash source
  try {
    console.log('[PULSE scoreAsset] inputs:', {
      hasQuote: !!quote,
      candlesClosesType: candles ? typeof candles.closes + (Array.isArray(candles.closes) ? `[${candles.closes?.length}]` : '') : 'no candles',
      newsType: typeof news + (Array.isArray(news) ? `[${news?.length}]` : ''),
      recType: typeof rec,
      recHistoryType: rec ? typeof rec.history + (Array.isArray(rec.history) ? `[${rec.history?.length}]` : '') : 'no rec',
      earnType: typeof earn + (Array.isArray(earn) ? `[${earn?.length}]` : ''),
      extrasUpgradesType: extras ? typeof extras.upgrades + (Array.isArray(extras.upgrades) ? `[${extras.upgrades?.length}]` : '') : 'no extras',
    })
  } catch(e) {}
  // Safety: normalize ALL inputs that must be arrays or objects
  const _a = v => Array.isArray(v) ? v : []
  const _o = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
  news    = _a(news)
  earn    = _a(earn)
  metrics = _o(metrics)
  // Normalize rec
  if (rec && typeof rec === 'object') {
    if (!Array.isArray(rec.history)) rec = { ...rec, history: [] }
  } else { rec = {} }
  // Normalize extras — full deep guard
  if (!extras || typeof extras !== 'object') extras = {}
  if (!Array.isArray(extras.upgrades)) extras = { ...extras, upgrades: [] }
  // Normalize candles — ALL array fields
  if (candles && typeof candles === 'object') {
    if (!Array.isArray(candles.closes))     candles = { ...candles, closes: [] }
    if (!Array.isArray(candles.volumes))    candles = { ...candles, volumes: [] }
    if (!Array.isArray(candles.highs))      candles = { ...candles, highs: [] }
    if (!Array.isArray(candles.lows))       candles = { ...candles, lows: [] }
    if (!Array.isArray(candles.opens))      candles = { ...candles, opens: [] }
    if (!Array.isArray(candles.timestamps)) candles = { ...candles, timestamps: [] }
  } else {
    candles = { closes: [], volumes: [], highs: [], lows: [], opens: [], timestamps: [] }
  }
  // ETF routing — ETFs use a simplified momentum+trend model
  // Running the stock model on ETFs produces structurally biased scores (no P/E, no earnings, no analysts)
  const _tickerUpper = (extras?.ticker || '').toUpperCase()
  const _companyName = extras?.companyName || ''
  if (isETF(_tickerUpper) || /\betf\b/i.test(_companyName)) {
    return scoreETF(quote, candles, ma50, extras)
  }

  // smartMoney: { insiderBuys, congressBuys, cluster } — optional 7th factor
  const hasSmartMoney = smartMoney?.insiderBuys != null
  // Weights v28 — data-driven from 735-signal backtest (Mar 2026)
  // Earnings cut 10%→6% (noise, +0.028 correlation), analyst boosted to 24% (strongest signal)
  // Trend boosted 15%→20% (more predictive than momentum in mean-reversion markets)
  const W = hasSmartMoney
    ? { momentum:.16, trend:.18, valuation:.16, sentiment:.12, analyst:.26, earnings:.06, smartmoney:.06 }
    : { momentum:.18, trend:.20, valuation:.18, sentiment:.14, analyst:.24, earnings:.06 }
  const S = {}; const R = {}
  const [avgSent, scoredNews] = credibilitySentiment(news)
  const mom = calcMom(candles, quote)

  // Momentum — 1m/3m/6m/1y only. 1-day removed (noise, reverses constantly)
  // Weights: 1m=30%, 3m=35%, 6m=20%, 1y=15% — medium-term most predictive
  let ms = 0; const mr = []
  if ('1m' in mom) {
    const w = Math.max(-.35, Math.min(.35, mom['1m'] / 15))
    ms += w
    mr.push(`1-month ${mom['1m'] > 0 ? '+' : ''}${mom['1m']}%`)
  }
  if ('3m' in mom) {
    const w = Math.max(-.35, Math.min(.35, mom['3m'] / 20))
    ms += w
    mr.push(`3-month ${mom['3m'] > 0 ? '+' : ''}${mom['3m']}%`)
  }
  if ('6m' in mom) {
    const w = Math.max(-.25, Math.min(.25, mom['6m'] / 30))
    ms += w
    mr.push(`6-month ${mom['6m'] > 0 ? '+' : ''}${mom['6m']}%`)
  }
  if ('1y' in mom) {
    const w = Math.max(-.20, Math.min(.20, mom['1y'] / 50))
    ms += w
    mr.push(`1-year ${mom['1y'] > 0 ? '+' : ''}${mom['1y']}%`)
  }
  if ('rsi' in mom) {
    const rsi = mom['rsi']
    const inDowntrend = (mom['6m'] || mom['3m'] || 0) < -20  // use 6m for more reliable downtrend signal
    if (rsi < 30 && !inDowntrend) { ms += .3; mr.push(`RSI ${rsi} — oversold, bounce potential`) }
    else if (rsi < 30 && inDowntrend) { ms -= .1; mr.push(`RSI ${rsi} — oversold but in downtrend (falling knife risk)`) }
    else if (rsi > 70) { ms -= .2; mr.push(`RSI ${rsi} — overbought, pullback risk`) }
    else mr.push(`RSI ${rsi} — neutral`)
  }
  // Volume spike — direction-aware confirmation using 1m trend context not 1-day
  // Use quote.v (today's live volume) not candle[-1] which is yesterday's EOD close
  const vols = Array.isArray(candles?.volumes) ? candles.volumes : []
  if (vols.length >= 20) {
    const liveVol = (quote?.v && quote.v > 0) ? quote.v : (vols[vols.length - 1] || 0)
    const avgVol = vols.slice(-20, -1).reduce((a, b) => a + b, 0) / 19
    if (avgVol > 0) {
      const volRatio = liveVol / avgVol
      const trendUp = (mom['1m'] || 0) >= 0
      if (volRatio >= 2.5) {
        if (trendUp)  { ms += 0.3;  mr.push(`🔥 Volume ${volRatio.toFixed(1)}× avg — strong buying pressure`) }
        else          { ms -= 0.3;  mr.push(`🔥 Volume ${volRatio.toFixed(1)}× avg — distribution signal`) }
      } else if (volRatio >= 1.5) {
        if (trendUp)  { ms += 0.15; mr.push(`Volume ${volRatio.toFixed(1)}× avg — above-normal buying`) }
        else          { ms -= 0.15; mr.push(`Volume ${volRatio.toFixed(1)}× avg — selling pressure`) }
      } else if (volRatio < 0.5) { ms -= 0.1; mr.push(`Low volume — weak conviction`) }
    }
  }
  // MACD — trend confirmation via EMA crossover
  const macd = extras?.macd
  if (macd) {
    if (macd.bullishCross) { ms += 0.25; mr.push(`MACD crossed above zero — bullish momentum shift`) }
    else if (macd.bearishCross) { ms -= 0.25; mr.push(`MACD crossed below zero — bearish momentum shift`) }
    else if (macd.trend === 'bullish') { ms += 0.1; mr.push(`MACD above zero — bullish momentum`) }
    else if (macd.trend === 'bearish') { ms -= 0.1; mr.push(`MACD below zero — bearish momentum`) }
  }
  // 52-week high/low proximity
  const yearHigh = quote?.yearHigh; const yearLow = quote?.yearLow
  if (quote?.c && yearHigh && yearLow) {
    const pctFromHigh = (quote.c - yearHigh) / yearHigh * 100
    const pctFromLow  = (quote.c - yearLow)  / yearLow  * 100
    if (pctFromHigh >= -5)  { ms += 0.2; mr.push(`Near 52-week high — price strength`) }
    else if (pctFromHigh >= -15) { ms += 0.05; mr.push(`Within 15% of 52-week high`) }
    if (pctFromLow <= 10) { ms -= 0.15; mr.push(`Near 52-week low — price weakness`) }
  }
  S.momentum = Math.max(-1, Math.min(1, ms)); R.momentum = mr

  // Trend — 50-day and 200-day MA
  let ts = 0; const tr = []
  const price = quote?.c || 0
  const ma200 = candles?.ma200 || null
  if (price && ma50) {
    const pct = (price - ma50) / ma50 * 100
    ts += Math.max(-0.7, Math.min(0.7, pct / 10))
    tr.push(`Price ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'} 50-day MA ($${ma50})`)
  }
  if (price && ma200) {
    const pct200 = (price - ma200) / ma200 * 100
    ts += Math.max(-0.3, Math.min(0.3, pct200 / 15))
    // Golden cross signal: price above both MAs
    if (ma50 && price > ma50 && price > ma200) {
      tr.push(`Above both 50d & 200d MA — strong uptrend`)
    } else if (ma50 && price < ma50 && price < ma200) {
      tr.push(`Below both MAs — confirmed downtrend`)
    } else {
      tr.push(`200-day MA: $${ma200} (${pct200 >= 0 ? '+' : ''}${pct200.toFixed(1)}%)`)
    }
  }
  S.trend = Math.max(-1, Math.min(1, ts)); R.trend = tr

  // Valuation — P/E, PEG, P/B, ROE, FCF
  let vs = 0; const vr = []
  const pe  = metrics?.peTTM > 0 ? metrics.peTTM : null
  const pb  = metrics?.pbAnnual
  const roe = metrics?.roeTTM
  const fcf = metrics?.fcfPerShare || null
  const peg = metrics?.pegRatio || null
  const revenueGrowth = metrics?.revenueGrowthYoY || null
  const debtToEquity  = metrics?.debtToEquity ?? null
  const currentRatio  = metrics?.currentRatio  ?? null
  const divYield      = metrics?.divYield      ?? null

  // PEG ratio — growth-adjusted P/E (most accurate valuation signal)
  if (peg != null && peg > 0) {
    if (peg < 0.8)       { vs += 0.6; vr.push(`PEG ${peg.toFixed(2)} — undervalued vs growth`) }
    else if (peg < 1.2)  { vs += 0.3; vr.push(`PEG ${peg.toFixed(2)} — fairly valued`) }
    else if (peg < 2.0)  { vs -= 0.15; vr.push(`PEG ${peg.toFixed(2)} — growth premium`) }
    else if (revenueGrowth && revenueGrowth > 40) { vs -= 0.1; vr.push(`PEG ${peg.toFixed(2)} — high but hypergrowth +${revenueGrowth.toFixed(0)}% supports premium`) }
    else                 { vs -= 0.4; vr.push(`PEG ${peg.toFixed(2)} — expensive vs growth`) }
  } else if (pe) {
    // Fallback: raw P/E with growth context
    if (pe < 12)       { vs += .6;  vr.push(`P/E ${pe.toFixed(1)}× — deep value`) }
    else if (pe < 20)  { vs += .3;  vr.push(`P/E ${pe.toFixed(1)}× — fair value`) }
    else if (pe < 35)  { vs -= .1;  vr.push(`P/E ${pe.toFixed(1)}× — growth premium`) }
    else {
      // High P/E — must check growth before penalizing
      if (revenueGrowth && revenueGrowth > 40) {
        vs += 0.1; vr.push(`P/E ${pe.toFixed(1)}× — high but hypergrowth +${revenueGrowth.toFixed(0)}% justifies premium`)
      } else if (revenueGrowth && revenueGrowth > 20) {
        vs -= .05; vr.push(`P/E ${pe.toFixed(1)}× — growth premium, revenue +${revenueGrowth.toFixed(0)}% YoY`)
      } else if (revenueGrowth && revenueGrowth > 10) {
        vs -= .25; vr.push(`P/E ${pe.toFixed(1)}× — elevated, moderate growth only`)
      } else {
        vs -= .45; vr.push(`P/E ${pe.toFixed(1)}× — expensive without strong growth`)
      }
    }
  } else vr.push('P/E unavailable')

  // P/B: exclude distressed range (<0.3) where low P/B signals insolvency risk, not value
  if (pb > 0.3 && pb < 2) { vs += .15 }
  else if (pb > 0 && pb < 0.3) { vs -= .1; vr.push(`P/B ${pb.toFixed(2)} — extremely low, possible distress`) }
  else if (pb > 10) { vs -= .15 }
  if (roe > 15) { vs += .15; vr.push(`ROE ${roe.toFixed(1)}%`) }

  // FCF yield — normalized to price so a $5 FCF/share on a $100 stock scores the same as $1 on a $20 stock
  if (fcf != null && price > 0) {
    const fcfYield = (fcf / price) * 100
    if (fcfYield > 8)       { vs += 0.3;  vr.push(`FCF yield ${fcfYield.toFixed(1)}% — exceptional cash generation`) }
    else if (fcfYield > 5)  { vs += 0.2;  vr.push(`FCF yield ${fcfYield.toFixed(1)}% — strong free cash flow`) }
    else if (fcfYield > 2)  { vs += 0.1;  vr.push(`FCF yield ${fcfYield.toFixed(1)}% — positive FCF`) }
    else if (fcfYield > 0)  { vs += 0.05; vr.push(`FCF yield ${fcfYield.toFixed(1)}% — minimal free cash flow`) }
    else                    { vs -= 0.2;  vr.push(`Negative FCF yield — cash burn risk`) }
  } else if (fcf != null) {
    if (fcf > 0) { vs += 0.1; vr.push(`FCF/share $${fcf.toFixed(2)} — positive FCF`) }
    else         { vs -= 0.2; vr.push(`Negative FCF — cash burn risk`) }
  }

  // Debt/equity — balance sheet health
  if (debtToEquity != null) {
    if (debtToEquity < 0.3)      { vs += 0.15; vr.push(`Debt/equity ${debtToEquity.toFixed(2)} — low leverage`) }
    else if (debtToEquity < 1.0) { /* neutral, no push */ }
    else if (debtToEquity < 2.0) { vs -= 0.15; vr.push(`Debt/equity ${debtToEquity.toFixed(2)} — elevated leverage`) }
    else                          { vs -= 0.35; vr.push(`Debt/equity ${debtToEquity.toFixed(2)} — high leverage risk`) }
  }

  // Current ratio — liquidity health
  if (currentRatio != null) {
    if (currentRatio < 1.0)      { vs -= 0.2; vr.push(`Current ratio ${currentRatio.toFixed(2)} — liquidity risk`) }
    else if (currentRatio >= 2.0){ vs += 0.1; vr.push(`Current ratio ${currentRatio.toFixed(2)} — strong liquidity`) }
  }

  // Dividend yield — check for dividend traps before rewarding yield
  const payoutRatio = metrics?.payoutRatio ?? null
  const isDividendTrap = payoutRatio != null && payoutRatio > 80 && (revenueGrowth == null || revenueGrowth < 5)
  if (divYield != null && divYield > 0 && (!peg || peg > 1.5)) {
    if (isDividendTrap) {
      vs -= 0.1; vr.push(`Dividend ${divYield.toFixed(1)}% but payout ratio ${payoutRatio.toFixed(0)}% — sustainability risk`)
    } else if (divYield > 4) { vs += 0.2; vr.push(`Dividend yield ${divYield.toFixed(1)}% — strong income signal`) }
    else if (divYield > 2)   { vs += 0.1; vr.push(`Dividend yield ${divYield.toFixed(1)}%`) }
  }

  S.valuation = Math.max(-1, Math.min(1, vs)); R.valuation = vr

  // Sentiment — log-scaled weight so 30 articles doesn't dominate over 10
  const nw = news?.length || 0
  const wt = nw >= 10 ? Math.min(1.0 + Math.log(nw / 10) * 0.2, 1.3) : nw / 10
  const ss = Math.max(-1, Math.min(1, avgSent * 1.5 * wt))
  const lb = avgSent > .08 ? 'Bullish' : avgSent < -.08 ? 'Bearish' : 'Neutral'
  S.sentiment = ss; R.sentiment = [`Credibility-weighted ${avgSent > 0 ? '+' : ''}${avgSent} (${lb}) · ${nw} articles`]

  // Analyst — context-aware consensus scoring
  // Rule: high consensus is only a red flag when fundamentals DON'T justify it
  // If growth is strong, consensus is earned — not a crowding problem
  // If growth is weak/expensive, high consensus = overcrowded = mean-reversion risk
  const recData = rec?.current || rec || {}
  let as_ = 0; const ar = []

  // Fundamentals context — needed to interpret consensus correctly
  const _revenueGrowth = metrics?.revenueGrowthYoY || null  // % YoY
  const _pegRatio      = metrics?.pegRatio || null
  const _peRatio       = metrics?.peTTM > 0 ? metrics.peTTM : null
  // "Strong fundamentals" = high revenue growth OR reasonable PEG
  // These are stocks where Wall St consensus is likely earned, not blind
  const strongFundamentals = (
    (_revenueGrowth != null && _revenueGrowth > 20) ||  // >20% revenue growth
    (_pegRatio != null && _pegRatio > 0 && _pegRatio < 1.5)  // PEG under 1.5 = fairly priced for growth
  )
  // "Expensive without growth" = high P/E + weak/no revenue growth
  const expensiveWithoutGrowth = (
    _peRatio != null && _peRatio > 30 &&
    (_revenueGrowth == null || _revenueGrowth < 10)
  )

  if (recData && Object.keys(recData).length) {
    const sb = recData.strongBuy || 0; const b_ = recData.buy || 0; const h = recData.hold || 0
    const s = recData.sell || 0; const ss2 = recData.strongSell || 0; const tot = sb + b_ + h + s + ss2
    if (tot > 0) {
      const bullishRatio = (sb + b_ * .5) / tot
      const bearishRatio = (ss2 + s * .5) / tot

      if (bullishRatio > 0.80) {
        if (strongFundamentals) {
          // High consensus + strong fundamentals = analysts are right, not just crowded
          as_ = 0.25
          ar.push(`Wall St ${Math.round(bullishRatio*100)}% bullish — consensus backed by strong fundamentals`)
        } else if (expensiveWithoutGrowth) {
          // High consensus + expensive + weak growth = crowding risk is real
          as_ = -0.20
          ar.push(`Wall St ${Math.round(bullishRatio*100)}% bullish but valuation stretched without growth — crowding risk`)
        } else {
          // High consensus, fundamentals neutral — mild positive, flag the crowding
          as_ = 0.05
          ar.push(`Wall St ${Math.round(bullishRatio*100)}% bullish — consensus high, watch for crowding`)
        }
      } else if (bullishRatio > 0.60) {
        as_ = 0.20   // healthy bullish — not overcrowded
        ar.push(`Wall St: ${sb} Strong Buy · ${b_} Buy · ${h} Hold — healthy consensus`)
      } else if (bullishRatio > 0.40) {
        as_ = 0.10   // mixed — underowned, potential upside
        ar.push(`Wall St mixed sentiment — underowned, potential catalyst upside`)
      } else if (bearishRatio > 0.50) {
        as_ = 0.25   // heavily bearish = contrarian BUY if fundamentals hold
        ar.push(`Wall St bearish majority — contrarian opportunity if fundamentals hold`)
      } else {
        as_ = 0
        ar.push(`Wall St: ${sb} Strong Buy · ${b_} Buy · ${h} Hold · ${s} Sell · ${ss2} Strong Sell`)
      }
    }
  } else ar.push('No analyst coverage')
  // Price target upside boost
  const pt = extras?.priceTarget
  const currentPrice = quote?.c || 0
  if (pt?.target && currentPrice) {
    const upside = (pt.target - currentPrice) / currentPrice * 100
    if (upside > 20)       { as_ += 0.3; ar.push(`Analyst target $${pt.target.toFixed(0)} — ${upside.toFixed(0)}% upside`) }
    else if (upside > 10)  { as_ += 0.15; ar.push(`Analyst target $${pt.target.toFixed(0)} — ${upside.toFixed(0)}% upside`) }
    else if (upside < -10) { as_ -= 0.2; ar.push(`Analyst target $${pt.target.toFixed(0)} — below current price`) }
  }

  // Upgrades/downgrades (last 30 days)
  const upgrades = extras?.upgrades || []
  const recent = upgrades.filter(u => u.date && (Date.now() - new Date(u.date).getTime()) < 30 * 86400000)
  const ups   = recent.filter(u => u.action === 'upgrade' || u.action === 'initiated').length
  const downs = recent.filter(u => u.action === 'downgrade').length
  if (ups > downs + 1)   { as_ += 0.25; ar.push(`${ups} analyst upgrades in last 30 days`) }
  else if (downs > ups)  { as_ -= 0.25; ar.push(`${downs} analyst downgrades in last 30 days`) }

  // Analyst momentum — is consensus improving or deteriorating?
  const recHistory = rec?.history || []
  if (recHistory.length >= 2) {
    const prev = recHistory[1]
    const curr = recHistory[0]
    const prevTot = (prev.strongBuy||0)+(prev.buy||0)+(prev.hold||0)+(prev.sell||0)+(prev.strongSell||0)
    const currTot = (curr.strongBuy||0)+(curr.buy||0)+(curr.hold||0)+(curr.sell||0)+(curr.strongSell||0)
    if (prevTot > 0 && currTot > 0) {
      const prevBullish = ((prev.strongBuy||0) + (prev.buy||0)*0.5) / prevTot
      const currBullish = ((curr.strongBuy||0) + (curr.buy||0)*0.5) / currTot
      const drift = currBullish - prevBullish
      if (drift > 0.08)       { as_ += 0.15; ar.push(`Analyst sentiment improving month-over-month`) }
      else if (drift < -0.08) { as_ -= 0.15; ar.push(`Analyst sentiment deteriorating month-over-month`) }
    }
  }
  S.analyst = Math.max(-1, Math.min(1, as_)); R.analyst = ar

  // Earnings — deep momentum scoring
  let es = 0; const er = []
  if (earn?.length) {
    const withEst = earn.filter(q => q.estimate != null && q.actual != null)
    if (withEst.length) {
      // EPS surprise % per quarter
      const epsSurp = withEst.map(q => {
        const raw = ((q.actual - q.estimate) / Math.abs(q.estimate || 1)) * 100
        return Math.max(-100, Math.min(100, raw))  // cap at ±100% to avoid penny-EPS distortion
      })

      const recent4 = (Array.isArray(epsSurp) ? epsSurp : []).slice(0, 4)
      const avgS    = recent4.reduce((a, b) => a + b, 0) / recent4.length
      const beats   = recent4.filter(x => x > 0).length

      // Base score from beat rate and magnitude (min 2 quarters for reliability)
      if (recent4.length >= 2) {
        es += (beats / recent4.length - 0.5) * 1.2   // -0.6 to +0.6
        es += Math.max(-0.3, Math.min(0.3, avgS / 20)) // magnitude bonus
      } else if (recent4.length === 1) {
        es += (beats > 0 ? 0.15 : -0.15)  // small nudge for single quarter
      }

      // Consecutive beats bonus — most powerful signal
      let streak = 0
      for (const s of epsSurp) { if (s > 0) streak++; else break }
      if (streak >= 6) { es += 0.5; er.push(`🔥 ${streak} consecutive beats — rare consistency`) }
      else if (streak >= 4) { es += 0.3; er.push(`${streak} consecutive EPS beats`) }
      else if (streak >= 2) { es += 0.15; er.push(`${streak} consecutive EPS beats`) }

      // Acceleration — is the beat getting bigger?
      if (epsSurp.length >= 3) {
        const accel = epsSurp[0] - epsSurp[2] // recent vs 2 qtrs ago
        if (accel > 5) { es += 0.2; er.push(`Beat acceleration +${accel.toFixed(1)}% vs 2 qtrs ago`) }
        else if (accel < -5) { es -= 0.15; er.push(`Beat shrinking vs prior quarters`) }
      }

      // Revenue surprise bonus
      const revWithEst = withEst.filter(q => q.revActual && q.revEstimate)
      if (revWithEst.length) {
        const revBeats = revWithEst.filter(q => q.revActual > q.revEstimate).length
        const revRate  = revBeats / revWithEst.length
        if (revRate >= 0.75) { es += 0.2; er.push(`Revenue beat ${revBeats}/${revWithEst.length} qtrs`) }
        else if (revRate < 0.4) { es -= 0.15; er.push(`Revenue misses ${revWithEst.length - revBeats}/${revWithEst.length} qtrs`) }
      }

      er.unshift(`EPS beat ${beats}/${recent4.length} qtrs · avg ${avgS > 0 ? '+' : ''}${avgS.toFixed(1)}%`)
    }
  } else er.push('No earnings data')
  S.earnings = Math.max(-1, Math.min(1, es)); R.earnings = er

  // Smart Money (7th factor — only when FMP data available)
  if (hasSmartMoney) {
    let sms = 0; const smr = []
    const ib = smartMoney.insiderBuys || 0
    const is_ = smartMoney.insiderSells || 0   // ← now tracked
    const cb = smartMoney.congressBuys || 0
    const cluster = smartMoney.cluster
    if (cluster?.level === 'strong') { sms += 0.8; smr.push(cluster.label) }
    else if (cluster?.level === 'moderate') { sms += 0.5; smr.push(cluster.label) }
    else if (ib >= 1) { sms += 0.3; smr.push(`${ib} insider buy${ib > 1 ? 's' : ''} recently`) }
    // Insider sells — meaningful negative (especially if outnumber buys)
    if (is_ > 0 && is_ > ib) { sms -= 0.35; smr.push(`${is_} insider sell${is_ > 1 ? 's' : ''} outnumber buys — caution`) }
    else if (is_ >= 3)        { sms -= 0.2;  smr.push(`${is_} insider sells in 90 days`) }
    if (cb >= 3) { sms += 0.4; smr.push(`${cb} congressional purchases`) }
    else if (cb >= 1) { sms += 0.2; smr.push(`${cb} congressional purchase${cb > 1 ? 's' : ''}`) }
    if (sms === 0) smr.push('No smart money activity found')
    S.smartmoney = Math.max(-1, Math.min(1, sms)); R.smartmoney = smr
  }

  // ── CONTRADICTION PENALTY ──
  // Only fire when signals genuinely conflict AND fundamentals don't explain the divergence
  // Do NOT penalize high-growth stocks where analyst optimism is justified despite price weakness
  const highGrowthStock = (metrics?.revenueGrowthYoY || 0) > 20
  let contradictionPenalty = 0; const contradictions = []
  if (S.trend < -0.3 && S.analyst > 0.5 && !highGrowthStock) {
    contradictionPenalty += 0.08
    contradictions.push('Price downtrend conflicts with analyst optimism')
  }
  if (S.momentum < -0.3 && S.earnings > 0.4) {
    contradictionPenalty += 0.04
    contradictions.push('Weak momentum despite strong earnings')
  }
  if (S.sentiment < -0.3 && S.analyst > 0.3 && !highGrowthStock) {
    contradictionPenalty += 0.04
    contradictions.push('News sentiment contradicts analyst ratings')
  }
  if (S.trend < -0.5 && S.valuation > 0.4) {
    contradictionPenalty += 0.05
    contradictions.push('Value signal but price in confirmed downtrend')
  }

  // ── MARKET REGIME WEIGHTING ──
  // Use SPY regimeData (passed from useTickerData) not the stock's own momentum
  // Using own momentum was circular — it penalised quality dip stocks (down 25%) as "bear"
  // even though the broader market is healthy and the dip is a buying opportunity
  const regimeData = extras?.regimeData || null
  const spyBelowMA = regimeData?.spyPrice && regimeData?.spyMA50
    ? regimeData.spyPrice < regimeData.spyMA50
    : false
  const sectorBelowMA = regimeData?.sectorPrice && regimeData?.sectorMA50
    ? regimeData.sectorPrice < regimeData.sectorMA50
    : false
  // Bear regime: SPY itself is below its 50-day MA AND sector is also weak
  // Do NOT fire bear regime purely because this stock is down (that's a dip, not a regime)
  const inBearRegime = spyBelowMA && sectorBelowMA
  // Bear regime: same 6 factors as normal, reweighted toward trend+momentum
  // Removed smartmoney from bear weights — bear stocks rarely have insider buys,
  // so including it would silently lose 10% of weight when data is absent
  const bearW6 = { momentum:.28, trend:.28, valuation:.14, sentiment:.10, analyst:.12, earnings:.08 }
  const bearW7 = { momentum:.25, trend:.25, valuation:.13, sentiment:.09, analyst:.11, earnings:.07, smartmoney:.10 }
  const regimeW = inBearRegime
    ? (hasSmartMoney ? bearW7 : bearW6)
    : W  // bull/neutral — use original weights

  // Factor confidence weighting — exclude factors with no data from denominator
  // When analyst/earnings/valuation has no data, S[k] = 0 which looks neutral
  // but it's actually "unknown" — don't penalize the stock for missing data
  // Detect missing data per factor:
  const factorHasData = {
    momentum:   Array.isArray(candles?.closes) && candles.closes.length >= 21,
    trend:      !!(ma50),
    valuation:  !!(metrics?.peTTM || metrics?.pegRatio || metrics?.fcfPerShare),
    sentiment:  (news?.length || 0) >= 2,
    analyst:    !!(rec?.current && Object.keys(rec.current || {}).length > 0 && ((rec.current.strongBuy||0)+(rec.current.buy||0)+(rec.current.hold||0)+(rec.current.sell||0)+(rec.current.strongSell||0)) > 0),
    earnings:   (earn?.filter(q => q.estimate != null && q.actual != null).length || 0) >= 1,
    smartmoney: hasSmartMoney,
  }
  // Compute effective weights — zero out missing factors then renormalize
  const effectiveW = {}
  let weightSum = 0
  for (const [k, w] of Object.entries(regimeW)) {
    const ew = factorHasData[k] !== false ? w : 0
    effectiveW[k] = ew
    weightSum += ew
  }
  // Renormalize to sum to 1.0
  if (weightSum > 0 && weightSum < 0.99) {
    for (const k of Object.keys(effectiveW)) effectiveW[k] = effectiveW[k] / weightSum
  }
  const total = Object.entries(effectiveW).reduce((sum, [k, w]) => sum + (S[k] || 0) * w, 0) - contradictionPenalty
  // Confidence penalty: fewer factors with data = lower conviction
  const dataCompleteness = Object.values(factorHasData).filter(Boolean).length / Object.keys(factorHasData).length

  // ── MINIMUM THRESHOLD ENFORCEMENT (Piotroski-inspired) ──
  // BUY requires score AND independent factor agreement
  // Prevents single dominant factor from overriding everything
  const factorsPositive = Object.values(S).filter(v => v > 0.1).length
  const factorsNegative = Object.values(S).filter(v => v < -0.1).length
  const totalFactors = Object.keys(S).length
  const trendOrMomPositive = S.trend > 0 || S.momentum > 0  // at least one directional factor positive

  const marketRegimeWeak = false  // SPY gate removed v29 — quality dip signal handles weak market context
  const regimeLabel = null

  let rawVerdict = total >= .33 ? 'BUY' : total >= .05 ? 'HOLD' : 'AVOID'

  // ── QUALITY DIP DETECTION (v29) ──────────────────────────────────────────
  // "Buy great companies when they're cheap" — Buffett / Lynch logic
  // When fundamentals are strong BUT price is down, that's an opportunity not a warning
  // Conditions: strong business + significant price drop + not in freefall + no earnings miss
  const pctFromHigh52 = quote?.yearHigh && quote?.c
    ? (quote.c - quote.yearHigh) / quote.yearHigh * 100
    : null
  const recentEarningsMiss = earn?.length
    ? earn.slice(0, 2).some(q => q.actual != null && q.estimate != null && q.actual < q.estimate * 0.95)
    : false
  const rsiValue = mom['rsi'] || 50
  const notInFreefall = rsiValue > 25  // RSI below 25 = genuine panic, wait for stabilization
  const priceDownFromHigh = pctFromHigh52 != null && pctFromHigh52 < -15  // >15% off highs
  const momentumNotCrashing = (mom['1m'] || 0) > -20  // not dropping more than 20% in a month

  const isQualityDip = (
    strongFundamentals &&          // revenue >20% growth OR PEG < 1.5
    priceDownFromHigh &&            // >15% below 52-week high
    notInFreefall &&                // RSI not below 25
    momentumNotCrashing &&          // not in a crash
    !recentEarningsMiss &&          // company didn't just miss earnings
    S.earnings >= 0 &&              // earnings factor not negative
    S.analyst > -0.5               // analysts not outright bearish
  )

  // Quality Dip bonus — add to total score before verdict
  // In bear regime, halve the bonus: stock may be down because the whole market is down, not company-specific
  let qualityDipBonus = 0
  let qualityDipLabel = null
  if (isQualityDip) {
    const regimeMult = inBearRegime ? 0.5 : 1
    if (pctFromHigh52 < -40)      { qualityDipBonus = 0.22 * regimeMult; qualityDipLabel = `Quality Dip — down ${Math.abs(pctFromHigh52).toFixed(0)}% from high, strong fundamentals${inBearRegime?' (bear regime — bonus halved)':''}` }
    else if (pctFromHigh52 < -25) { qualityDipBonus = 0.16 * regimeMult; qualityDipLabel = `Quality Dip — down ${Math.abs(pctFromHigh52).toFixed(0)}% from high, business intact${inBearRegime?' (bear regime)':''}` }
    else                           { qualityDipBonus = 0.10 * regimeMult; qualityDipLabel = `Quality Dip — pullback on strong business${inBearRegime?' (bear regime — bonus halved)':''}` }
  }
  const adjustedTotal = total + qualityDipBonus

  // Re-evaluate verdict with quality dip bonus applied
  if (qualityDipBonus > 0) {
    if      (adjustedTotal >= .33) rawVerdict = 'BUY'
    else if (adjustedTotal >= .05) rawVerdict = 'HOLD'
    else                           rawVerdict = 'AVOID'
  }

  // Enforce BUY gates: must have factor breadth AND directional confirmation
  if (rawVerdict === 'BUY') {
    if (factorsPositive < 3)          rawVerdict = 'HOLD'  // too few factors agree
    if (!trendOrMomPositive)          rawVerdict = 'HOLD'  // buying against trend
    if (factorsNegative >= 4)         rawVerdict = 'HOLD'  // too many red flags
  }
  // Enforce AVOID gates — only truly negative total scores
  // Quality dip stocks with strong fundamentals should never show AVOID — worst case is HOLD
  if (rawVerdict === 'HOLD' && adjustedTotal < -0.20) rawVerdict = 'AVOID'
  if (rawVerdict === 'AVOID' && isQualityDip) rawVerdict = 'HOLD'  // quality dip floor is HOLD

  const pct = Math.min(100, Math.max(0, Math.round((adjustedTotal + 1) / 2 * 100 * 10) / 10))
  const verdict = rawVerdict
  const color = verdict === 'BUY' ? '#00C805' : verdict === 'HOLD' ? '#FFD700' : '#FF5000'

  // ── CONVICTION — independent measure, not circular ──
  // Measures: how many factors agree × how strong the agreement is × regime clarity
  const agreementStrength = Object.values(S).reduce((sum, v) => sum + Math.abs(v), 0) / totalFactors
  const breadthScore = (factorsPositive - factorsNegative) / totalFactors   // -1 to +1
  const conviction = parseFloat(Math.max(0, Math.min(100,
    (breadthScore * 0.5 + 0.5) * 60 +           // factor breadth: 0-60
    agreementStrength * 25 +                      // signal strength: 0-25
    (contradictionPenalty === 0 ? 15 : 15 * (1 - contradictionPenalty * 5))  // consistency bonus: 0-15
  )).toFixed(1))

  const uncertainty = [...contradictions]
  if (pe && pe > 35 && !peg) uncertainty.push('High P/E without PEG context')
  if (S.sentiment < 0 && S.analyst > 0) uncertainty.push('News sentiment diverges from analyst view')
  if (S.momentum < -.2) uncertainty.push('Price momentum is weak')
  if (nw < 3) uncertainty.push('Limited news coverage — signal unreliable')
  if (inBearRegime) uncertainty.push('Bear regime detected — weights shifted to trend/momentum')
  if (isQualityDip) uncertainty.push(`${qualityDipLabel}`)

  const upside = extras?.priceTarget?.target && currentPrice ? parseFloat(((extras.priceTarget.target - currentPrice) / currentPrice * 100).toFixed(1)) : null
  // Stale data detection
  const now = Date.now() / 1000  // unix seconds
  const newestNews = news?.length ? Math.max(...news.map(n => n.ts || 0)) : 0
  const newsAgeDays = newestNews > 0 ? Math.floor((Date.now() / 1000 - newestNews) / 86400) : null
  const analystPeriod = rec?.current?.period || rec?.history?.[0]?.period || null
  const analystAgeDays = analystPeriod ? Math.floor((Date.now() - new Date(analystPeriod).getTime()) / 86400000) : null
  const stalenessFlags = []
  if (newsAgeDays === null || newsAgeDays > 10) stalenessFlags.push({ field: 'news', label: newsAgeDays === null ? 'No news data' : `News ${newsAgeDays}d old`, severity: newsAgeDays > 20 ? 'high' : 'medium' })
  if (analystAgeDays !== null && analystAgeDays > 60) stalenessFlags.push({ field: 'analyst', label: `Analyst data ${analystAgeDays}d old`, severity: analystAgeDays > 120 ? 'high' : 'medium' })
  if (!factorHasData.earnings) stalenessFlags.push({ field: 'earnings', label: 'No earnings estimates', severity: 'medium' })
  if (!factorHasData.valuation) stalenessFlags.push({ field: 'valuation', label: 'No valuation data', severity: 'medium' })
  const dataCompletenessScore = Math.round(dataCompleteness * 100)

  return { scores: S, reasons: R, total: parseFloat(adjustedTotal.toFixed(3)), pct, verdict, color, upside,
    mom, avgSent, scoredNews, conviction, uncertainty, factorsAgree: factorsPositive, pe,
    contradictions, inBearRegime, marketRegimeWeak, regimeLabel,
    isQualityDip, qualityDipLabel, qualityDipBonus,
    stalenessFlags, dataCompletenessScore, factorHasData, isETF: false }
}

export function smartSummary(title, body) {
  const text = (body || '').trim()
  if (text.length < 60) return null
  const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.length >= 50 && s.length <= 250)
  if (!sents.length) return null
  const kws = ['revenue','profit','earnings','growth','beat','miss','raised','lowered','expects','guidance','acquisition','deal','billion','million','percent','%','quarter','fiscal','rose','fell','surged','dropped','shares','dividend','buyback','forecast','upgraded','downgraded']
  const best = sents.reduce((best, s) => {
    const sl = s.toLowerCase()
    const sc = kws.filter(k => sl.includes(k)).length * 2 + (s.length > 80 && s.length < 200 ? 1 : 0)
    return sc > best.score ? { s, score: sc } : best
  }, { s: sents[0], score: 0 }).s
  return best.length > 200 ? best.slice(0, 200).replace(/\s\S+$/, '') + '…' : best
}

export function marketStatus() {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const wd = et.getDay(); const h = et.getHours(); const m = et.getMinutes()
  if (wd === 0 || wd === 6) return { open: false, label: 'Weekend', detail: 'Opens Monday 9:30 AM ET' }
  if (h < 9 || (h === 9 && m < 30)) return { open: false, label: 'Pre-Market', detail: `Opens at 9:30 AM ET` }
  if (h < 16) return { open: true, label: 'Open', detail: 'Closes 4:00 PM ET' }
  return { open: false, label: 'After-Hours', detail: 'Closed · Pre-market 4 AM ET' }
}

export function timeAgo(ts) {
  if (!ts) return { label: '?', badge: 'old' }
  const secs = (Date.now() - ts * 1000) / 1000
  const mins = Math.floor(secs / 60); const hrs = Math.floor(secs / 3600); const days = Math.floor(secs / 86400)
  if (secs < 60)  return { label: 'just now', badge: 'live' }
  if (mins < 10)  return { label: `${mins}m`, badge: 'breaking' }
  if (mins < 60)  return { label: `${mins}m ago`, badge: 'new' }
  if (hrs < 24)   return { label: `${hrs}h ago`, badge: hrs < 6 ? 'new' : 'today' }
  if (days === 1) return { label: 'Yesterday', badge: 'today' }
  return { label: `${days}d ago`, badge: 'old' }
}

export function fmtMcap(m) {
  if (!m || m <= 0) return 'N/A'
  // FMP returns marketCap in raw dollars (e.g. 2.8T = 2,800,000,000,000)
  if (m >= 1e12) return `$${(m / 1e12).toFixed(2)}T`
  if (m >= 1e9)  return `$${(m / 1e9).toFixed(1)}B`
  if (m >= 1e6)  return `$${(m / 1e6).toFixed(0)}M`
  return `$${(m / 1e3).toFixed(0)}K`
}
