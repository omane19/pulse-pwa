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

export function scoreAsset(quote, candles, ma50, metrics, news, rec, earn, smartMoney) {
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
    if (rsi < 30) { ms += .3; mr.push(`RSI ${rsi} — oversold, bounce potential`) }
    else if (rsi > 70) { ms -= .2; mr.push(`RSI ${rsi} — overbought, pullback risk`) }
    else mr.push(`RSI ${rsi} — neutral`)
  }
  S.momentum = Math.max(-1, Math.min(1, ms)); R.momentum = mr

  // Trend
  let ts = 0; const tr = []
  const price = quote?.c || 0
  if (price && ma50) {
    const pct = (price - ma50) / ma50 * 100; ts = Math.max(-1, Math.min(1, pct / 10))
    tr.push(`Price ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'} 50-day MA ($${ma50})`)
  }
  S.trend = ts; R.trend = tr

  // Valuation
  let vs = 0; const vr = []
  const pe = metrics?.peTTM > 0 ? metrics.peTTM : null
  const pb = metrics?.pbAnnual; const roe = metrics?.roeTTM
  if (pe) {
    if (pe < 12)       { vs += .6;  vr.push(`P/E ${pe.toFixed(1)}× — deep value`) }
    else if (pe < 20)  { vs += .3;  vr.push(`P/E ${pe.toFixed(1)}× — fair value`) }
    else if (pe < 35)  { vs -= .2;  vr.push(`P/E ${pe.toFixed(1)}× — growth premium`) }
    else               { vs -= .55; vr.push(`P/E ${pe.toFixed(1)}× — expensive, miss-prone`) }
  } else vr.push('P/E unavailable')
  if (pb > 0) { if (pb < 2) vs += .15; else if (pb > 10) vs -= .15 }
  if (roe > 15) { vs += .15; vr.push(`ROE ${roe.toFixed(1)}%`) }
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
  S.analyst = as_; R.analyst = ar

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
    const cb = smartMoney.congressBuys || 0
    const cluster = smartMoney.cluster
    if (cluster?.level === 'strong') { sms += 0.8; smr.push(cluster.label) }
    else if (cluster?.level === 'moderate') { sms += 0.5; smr.push(cluster.label) }
    else if (ib >= 1) { sms += 0.3; smr.push(`${ib} insider buy${ib > 1 ? 's' : ''} recently`) }
    if (cb >= 3) { sms += 0.4; smr.push(`${cb} congressional purchases`) }
    else if (cb >= 1) { sms += 0.2; smr.push(`${cb} congressional purchase${cb > 1 ? 's' : ''}`) }
    if (sms === 0) smr.push('No smart money activity found')
    S.smartmoney = Math.max(-1, Math.min(1, sms)); R.smartmoney = smr
  }

  const total = Object.entries(W).reduce((sum, [k, w]) => sum + (S[k] || 0) * w, 0)
  const pct = Math.round((total + 1) / 2 * 100 * 10) / 10
  const verdict = total >= .30 ? 'BUY' : total >= .05 ? 'HOLD' : 'AVOID'
  const color = verdict === 'BUY' ? '#00C805' : verdict === 'HOLD' ? '#FFD700' : '#FF5000'
  const factorsAgree = Object.values(S).filter(v => v > 0.1).length
  const totalFactors = Object.keys(S).length
  const conviction = parseFloat((factorsAgree / totalFactors * 60 + pct * 0.4).toFixed(1))
  const uncertainty = []
  if (pe && pe > 35) uncertainty.push('high P/E leaves little margin for error')
  if (S.sentiment < 0 && S.analyst > 0) uncertainty.push('news and analyst signals diverge')
  if (S.momentum < -.2) uncertainty.push('price momentum is weak')
  if (nw < 3) uncertainty.push('limited news coverage')

  return { scores: S, reasons: R, total: parseFloat(total.toFixed(3)), pct, verdict, color,
    mom, avgSent, scoredNews, conviction, uncertainty, factorsAgree, pe }
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
