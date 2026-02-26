import { SOURCE_TIERS } from './constants.js'

// ── Simple sentiment (AFINN-style word list, no external lib) ────
const POS_WORDS = new Set(["beat","beats","surge","surged","soar","soared","rally","rallied","profit","profits","gain","gains","growth","grew","strong","record","upgrade","upgraded","buy","outperform","raised","raise","exceeds","exceeded","positive","bullish","recovery","recovered","expand","expanding","revenue","solid","robust","better","improved","improvement","boost","boosted","higher","rise","rose","increase","increased","top","topped","above","ahead"])
const NEG_WORDS = new Set(["miss","misses","missed","fall","falls","fell","drop","dropped","decline","declined","loss","losses","weak","weaker","cut","cuts","downgrade","downgraded","sell","underperform","lower","below","warning","concern","risk","risks","disappointing","disappointed","miss","missed","reduce","reduced","layoff","layoffs","restructure","debt","lawsuit","investigation","fraud","recall","suspended","suspension","bankruptcy","negative","bearish","shortage","supply","demand"])

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
  const trimmed = ws.length >= 6 ? sorted.slice(1, -1) : sorted
  const avg = trimmed.length > 0 ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : 0
  return [parseFloat(avg.toFixed(3)), scored]
}

export function calcMom(candles, quote) {
  const out = {}
  if (!candles || !quote) return out
  const closes = candles.closes
  const price = quote.c
  if (!price || !closes || closes.length === 0) return out
  if (closes.length >= 20) out['1m'] = parseFloat(((price / closes[closes.length - 20] - 1) * 100).toFixed(2))
  if (closes.length >= 60) out['3m'] = parseFloat(((price / closes[closes.length - 60] - 1) * 100).toFixed(2))
  out['1d'] = quote.dp || 0
  if (closes.length >= 15) {
    const diffs = closes.slice(-14).map((c, i, arr) => i === 0 ? 0 : c - arr[i - 1]).slice(1)
    const gains = diffs.map(d => d > 0 ? d : 0)
    const losses = diffs.map(d => d < 0 ? -d : 0)
    const ag = gains.reduce((a, b) => a + b, 0) / gains.length
    const al = losses.reduce((a, b) => a + b, 0) / losses.length
    const rs = al > 0 ? ag / al : 100
    out['rsi'] = parseFloat((100 - 100 / (1 + rs)).toFixed(1))
  }
  return out
}

export function scoreAsset(quote, candles, ma50, metrics, news, rec, earn, smartMoney, extras = {}) {
  // smartMoney: { insiderBuys, congressBuys, cluster } — optional 7th factor
  const hasSmartMoney = smartMoney?.insiderBuys != null
  const W = hasSmartMoney
    ? { momentum:.18, trend:.13, valuation:.18, sentiment:.13, analyst:.18, earnings:.08, smartmoney:.12 }
    : { momentum:.20, trend:.15, valuation:.20, sentiment:.15, analyst:.20, earnings:.10 }
  const S = {}; const R = {}
  const [avgSent, scoredNews] = credibilitySentiment(news)
  const mom = calcMom(candles, quote)

  // Momentum
  let ms = 0; const mr = []
  if ('1d' in mom) { ms += Math.max(-.3, Math.min(.3, mom['1d'] / 5)); mr.push(`1-day ${mom['1d'] > 0 ? '+' : ''}${mom['1d']}%`) }
  if ('1m' in mom) { ms += Math.max(-.4, Math.min(.4, mom['1m'] / 15)); mr.push(`1-month ${mom['1m'] > 0 ? '+' : ''}${mom['1m']}%`) }
  if ('3m' in mom) { ms += Math.max(-.3, Math.min(.3, mom['3m'] / 20)); mr.push(`3-month ${mom['3m'] > 0 ? '+' : ''}${mom['3m']}%`) }
  if ('rsi' in mom) {
    const rsi = mom['rsi']
    const inDowntrend = (mom['3m'] || 0) < -15  // deeply falling = falling knife, not a bounce
    if (rsi < 30 && !inDowntrend) { ms += .3; mr.push(`RSI ${rsi} — oversold, bounce potential`) }
    else if (rsi < 30 && inDowntrend) { ms -= .1; mr.push(`RSI ${rsi} — oversold but in downtrend (falling knife risk)`) }
    else if (rsi > 70) { ms -= .2; mr.push(`RSI ${rsi} — overbought, pullback risk`) }
    else mr.push(`RSI ${rsi} — neutral`)
  }
  // Volume spike — direction-aware confirmation
  const vols = candles?.volumes
  if (vols && vols.length >= 20) {
    const recent = vols[vols.length - 1] || 0
    const avgVol = vols.slice(-20, -1).reduce((a, b) => a + b, 0) / 19
    if (avgVol > 0) {
      const volRatio = recent / avgVol
      const dayUp = (mom['1d'] || 0) >= 0  // was today up or down?
      if (volRatio >= 2.5) {
        if (dayUp)  { ms += 0.3;  mr.push(`🔥 Volume ${volRatio.toFixed(1)}× avg on UP day — strong buying`) }
        else        { ms -= 0.3;  mr.push(`🔥 Volume ${volRatio.toFixed(1)}× avg on DOWN day — distribution signal`) }
      } else if (volRatio >= 1.5) {
        if (dayUp)  { ms += 0.15; mr.push(`Volume ${volRatio.toFixed(1)}× avg — above-normal buying`) }
        else        { ms -= 0.15; mr.push(`Volume ${volRatio.toFixed(1)}× avg on down day — selling pressure`) }
      } else if (volRatio < 0.5) { ms -= 0.1; mr.push(`Low volume — weak conviction`) }
    }
  }
  // MACD — trend confirmation via EMA crossover
  const macd = extras?.macd
  if (macd) {
    if (macd.bullishCross) { ms += 0.25; mr.push(`MACD bullish crossover — momentum turning positive`) }
    else if (macd.bearishCross) { ms -= 0.25; mr.push(`MACD bearish crossover — momentum turning negative`) }
    else if (macd.trend === 'bullish') { ms += 0.1; mr.push(`MACD above zero — bullish momentum`) }
    else if (macd.trend === 'bearish') { ms -= 0.1; mr.push(`MACD below zero — bearish momentum`) }
  }
  // 52-week high/low proximity
  const yearHigh = quote?.yearHigh; const yearLow = quote?.yearLow
  //const currentPrice = quote?.c
  if (currentPrice && yearHigh && yearLow) {
    const pctFromHigh = (currentPrice - yearHigh) / yearHigh * 100
    const pctFromLow  = (currentPrice - yearLow)  / yearLow  * 100
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
    else                 { vs -= 0.4; vr.push(`PEG ${peg.toFixed(2)} — expensive vs growth`) }
  } else if (pe) {
    // Fallback: raw P/E with growth context
    if (pe < 12)       { vs += .6;  vr.push(`P/E ${pe.toFixed(1)}× — deep value`) }
    else if (pe < 20)  { vs += .3;  vr.push(`P/E ${pe.toFixed(1)}× — fair value`) }
    else if (pe < 35)  { vs -= .2;  vr.push(`P/E ${pe.toFixed(1)}× — growth premium`) }
    else {
      // High P/E ok if revenue growing fast (>20%)
      if (revenueGrowth && revenueGrowth > 20) {
        vs -= .15; vr.push(`P/E ${pe.toFixed(1)}× — high but revenue +${revenueGrowth.toFixed(0)}% YoY`)
      } else {
        vs -= .55; vr.push(`P/E ${pe.toFixed(1)}× — expensive, miss-prone`)
      }
    }
  } else vr.push('P/E unavailable')

  if (pb > 0) { if (pb < 2) vs += .15; else if (pb > 10) vs -= .15 }
  if (roe > 15) { vs += .15; vr.push(`ROE ${roe.toFixed(1)}%`) }

  // FCF per share — positive FCF is quality signal
  if (fcf != null) {
    if (fcf > 5)        { vs += 0.2; vr.push(`FCF/share $${fcf.toFixed(2)} — strong cash generation`) }
    else if (fcf > 0)   { vs += 0.1; vr.push(`FCF/share $${fcf.toFixed(2)} — positive FCF`) }
    else                { vs -= 0.2; vr.push(`Negative FCF — cash burn risk`) }
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

  // Dividend yield — positive signal for value/income stocks (non-growth context)
  if (divYield != null && divYield > 0 && (!peg || peg > 1.5)) {
    if (divYield > 4)       { vs += 0.2; vr.push(`Dividend yield ${divYield.toFixed(1)}% — strong income signal`) }
    else if (divYield > 2)  { vs += 0.1; vr.push(`Dividend yield ${divYield.toFixed(1)}%`) }
  }

  S.valuation = Math.max(-1, Math.min(1, vs)); R.valuation = vr

  // Sentiment
  const nw = news?.length || 0; const wt = Math.min(nw / 8, 1.5)
  const ss = Math.max(-1, Math.min(1, avgSent * 1.5 * wt))
  const lb = avgSent > .08 ? 'Bullish' : avgSent < -.08 ? 'Bearish' : 'Neutral'
  S.sentiment = ss; R.sentiment = [`Credibility-weighted ${avgSent > 0 ? '+' : ''}${avgSent} (${lb}) · ${nw} articles`]

  // Analyst — rec may be {current, history} (new format) or direct object (old)
  const recData = rec?.current || rec || {}
  let as_ = 0; const ar = []
  if (recData && Object.keys(recData).length) {
    const sb = recData.strongBuy || 0; const b_ = recData.buy || 0; const h = recData.hold || 0
    const s = recData.sell || 0; const ss2 = recData.strongSell || 0; const tot = sb + b_ + h + s + ss2
    if (tot > 0) {
      as_ = Math.max(-1, Math.min(1, ((sb + b_ * .5) / tot - (ss2 + s * .5) / tot) * 2))
      ar.push(`Wall St: ${sb} Strong Buy · ${b_} Buy · ${h} Hold · ${s} Sell · ${ss2} Strong Sell`)
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
      const epsSurp = withEst.map(q =>
        ((q.actual - q.estimate) / Math.abs(q.estimate || 1)) * 100)

      const recent4 = epsSurp.slice(0, 4)
      const avgS    = recent4.reduce((a, b) => a + b, 0) / recent4.length
      const beats   = recent4.filter(x => x > 0).length

      // Base score from beat rate and magnitude
      es += (beats / recent4.length - 0.5) * 1.2   // -0.6 to +0.6
      es += Math.max(-0.3, Math.min(0.3, avgS / 20)) // magnitude bonus

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
  // When key directional signals disagree, confidence must drop
  let contradictionPenalty = 0; const contradictions = []
  if (S.trend < -0.3 && S.analyst > 0.5) {
    contradictionPenalty += 0.08
    contradictions.push('Price downtrend conflicts with analyst optimism')
  }
  if (S.momentum < -0.3 && S.earnings > 0.4) {
    contradictionPenalty += 0.06
    contradictions.push('Weak momentum despite strong earnings')
  }
  if (S.sentiment < -0.3 && S.analyst > 0.3) {
    contradictionPenalty += 0.05
    contradictions.push('News sentiment contradicts analyst ratings')
  }
  if (S.trend < -0.5 && S.valuation > 0.4) {
    contradictionPenalty += 0.06
    contradictions.push('Value signal but price in confirmed downtrend')
  }

  // ── MARKET REGIME WEIGHTING ──
  // Detect regime from SPY-like signals: if the asset's own 3m momentum is strongly negative
  // we're likely in a bear regime for this stock — weight trend/momentum more heavily
  const ownMom3m = mom['3m'] || 0
  const inBearRegime = ownMom3m < -15 && (S.trend < -0.2)
  // Bear regime: same 6 factors as normal, reweighted toward trend+momentum
  // Removed smartmoney from bear weights — bear stocks rarely have insider buys,
  // so including it would silently lose 10% of weight when data is absent
  const bearW6 = { momentum:.28, trend:.28, valuation:.14, sentiment:.10, analyst:.12, earnings:.08 }
  const bearW7 = { momentum:.25, trend:.25, valuation:.13, sentiment:.09, analyst:.11, earnings:.07, smartmoney:.10 }
  const regimeW = inBearRegime
    ? (hasSmartMoney ? bearW7 : bearW6)
    : W  // bull/neutral — use original weights

  const total = Object.entries(regimeW).reduce((sum, [k, w]) => sum + (S[k] || 0) * w, 0) - contradictionPenalty

  // ── MINIMUM THRESHOLD ENFORCEMENT (Piotroski-inspired) ──
  // BUY requires score AND independent factor agreement
  // Prevents single dominant factor from overriding everything
  const factorsPositive = Object.values(S).filter(v => v > 0.1).length
  const factorsNegative = Object.values(S).filter(v => v < -0.1).length
  const totalFactors = Object.keys(S).length
  const trendOrMomPositive = S.trend > 0 || S.momentum > 0  // at least one directional factor positive

  let rawVerdict = total >= .30 ? 'BUY' : total >= .05 ? 'HOLD' : 'AVOID'
  // Enforce BUY gates: must have factor breadth AND directional confirmation
  if (rawVerdict === 'BUY') {
    if (factorsPositive < 3)          rawVerdict = 'HOLD'  // too few factors agree
    if (!trendOrMomPositive)          rawVerdict = 'HOLD'  // buying against trend
    if (factorsNegative >= 4)         rawVerdict = 'HOLD'  // too many red flags
  }
  // Enforce AVOID gates
  if (rawVerdict === 'HOLD' && total < -0.15) rawVerdict = 'AVOID'

  const pct = Math.round((total + 1) / 2 * 100 * 10) / 10
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

  const upside = extras?.priceTarget?.target && currentPrice ? parseFloat(((extras.priceTarget.target - currentPrice) / currentPrice * 100).toFixed(1)) : null
  return { scores: S, reasons: R, total: parseFloat(total.toFixed(3)), pct, verdict, color, upside,
    mom, avgSent, scoredNews, conviction, uncertainty, factorsAgree: factorsPositive, pe,
    contradictions, inBearRegime }
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
  if (!m) return 'N/A'
  if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(2)}T`
  if (m >= 1_000) return `$${(m / 1_000).toFixed(1)}B`
  return `$${m.toFixed(0)}M`
}
