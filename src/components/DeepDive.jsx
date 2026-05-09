import React, { useState, useEffect, useCallback } from 'react'
import { useTickerData, fetchFMPCongressional, fetchFMPInsider, computeClusterSignal, hasKeys, fetchAnalystEstimates, fetchQuote, fetchUnusualFlow } from '../hooks/useApi.js'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { trackSignal } from '../hooks/useSignalLog.js'
import Chart from './Chart.jsx'
import { VerdictPill, FactorBars, MetricCell, NewsCard, EarningsWarning, LoadingBar, SectionHeader, Toast, PullToRefresh } from './shared.jsx'
import { loadSignals } from '../hooks/useSignalLog.js'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const CYAN='#00E5FF'

/* ── Manipulation flags ───────────────────────────────────────── */
function getFlags(news, scoredNews, insider, quote) {
  const flags = []
  if (!news?.length) return flags
  const t4 = (scoredNews||[]).filter(s=>s.tier===4).length
  if (t4 >= 4) flags.push({ title:'⚠ Unverified Source Concentration',
    body:`${t4}/${scoredNews.length} articles from unverified sources — pattern seen in pump campaigns. Verify with Reuters or WSJ.` })
  const avgRaw = (scoredNews||[]).reduce((s,n)=>s+n.score,0)/Math.max(scoredNews?.length||1,1)
  const insSells = (insider||[]).filter(x => x.isBuy === false).length
  const insBuys  = (insider||[]).filter(x => x.isBuy === true).length
  if (avgRaw > 0.2 && insSells > insBuys+2)
    flags.push({ title:'⚠ Bullish News / Insider Selling Divergence',
      body:'Positive news coverage while insiders net selling — classic distribution pattern. Investigate.' })
  if (quote?.c && quote.c < 20 && avgRaw > 0.3)
    flags.push({ title:'⚠ High Sentiment on Low-Price Stock',
      body:`Strong positive coverage on sub-$20 stock — matches pump-and-dump profile. Extra caution.` })
  return flags
}


/* ── Chart Explainer ────────────────────────────────────────────── */
function ChartExplainer({ result, ma50, price }) {
  const rsi = result.mom?.rsi
  const mom1m = result.mom?.['1m']
  const mom3m = result.mom?.['3m']
  const mom6m = result.mom?.['6m']
  const mom1y = result.mom?.['1y']
  const aboveMA = price && ma50 ? price > ma50 : null

  const signals = []
  if (aboveMA !== null) signals.push({
    icon: aboveMA ? '📈' : '📉',
    label: `${aboveMA ? 'Above' : 'Below'} 50-Day MA`,
    detail: aboveMA
      ? `Price ($${price?.toFixed(2)}) is above the 50-day average ($${ma50}). The MA acts as dynamic support — as long as price stays above it, the trend is intact. A close below MA50 is a warning signal.`
      : `Price ($${price?.toFixed(2)}) is below the 50-day average ($${ma50}). The MA is acting as resistance. The trend is not confirmed — wait for a sustained close above $${ma50} before buying.`,
    color: aboveMA ? '#00C805' : '#FF5000'
  })
  if (rsi != null) signals.push({
    icon: rsi > 70 ? '🔴' : rsi < 30 ? '🟢' : '🟡',
    label: `RSI ${rsi} — ${rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral'}`,
    detail: rsi > 70
      ? `RSI above 70 means the stock has moved up quickly and may be due for a pause or pullback. This doesn't mean sell immediately, but avoid chasing. Options buyers: premiums are elevated here.`
      : rsi < 30
      ? `RSI below 30 means the stock is oversold — sellers may be exhausted. Often signals a bounce opportunity, but can stay oversold in strong downtrends. Look for price stabilisation before entering.`
      : `RSI in the 30–70 range is healthy — no extreme readings. The move has room to continue in either direction. Not a timing signal on its own.`,
    color: rsi > 70 ? '#FF5000' : rsi < 30 ? '#00C805' : '#FFD700'
  })
  if (mom1m != null) signals.push({
    icon: mom1m > 5 ? '🚀' : mom1m < -5 ? '⚠️' : '➡️',
    label: `1-Month: ${mom1m > 0 ? '+' : ''}${mom1m}%`,
    detail: mom1m > 10
      ? `Strong 1-month gain. Momentum is working in your favour if you're already in. As a new entry point, be aware you may be buying after the move — look for a pullback to the MA for a better entry.`
      : mom1m > 0
      ? `Modest positive momentum — price is rising steadily. This is a healthy pace, not a blow-off top. Supports the current trend.`
      : mom1m > -10
      ? `Slight decline over the past month. Not a crash, but trend is under pressure. Watch the 50-day MA as the key line — if it holds, this could be a buying opportunity.`
      : `Significant 1-month loss. High-risk entry here. If you want in, wait for signs of stabilisation (RSI < 35, price holds a key level for 2–3 days) before committing.`,
    color: mom1m > 0 ? '#00C805' : '#FF5000'
  })
  if (mom3m != null) signals.push({
    icon: mom3m > 0 ? '📊' : '📉',
    label: `3-Month: ${mom3m > 0 ? '+' : ''}${mom3m}%`,
    detail: mom3m > 20
      ? `Exceptional 3-month run. Institutions have been accumulating. This kind of move often pauses but the underlying trend is strong.`
      : mom3m > 0
      ? `Positive 3-month trend confirms the medium-term uptrend. Dips toward the 50-day MA are likely buy opportunities in an uptrend like this.`
      : `Negative 3-month trend — the medium-term trend is down. Even if the stock bounces short-term, the broader trend is working against buyers.`,
    color: mom3m > 0 ? '#00C805' : '#FF5000'
  })
  if (mom6m != null) signals.push({
    icon: mom6m > 0 ? '📈' : '📉',
    label: `6-Month: ${mom6m > 0 ? '+' : ''}${mom6m}%`,
    detail: mom6m > 30
      ? `Strong 6-month trend — institutional positioning is clearly bullish. This is the most reliable momentum window for swing trading.`
      : mom6m > 0
      ? `Positive 6-month trend. The stock has been in a sustained uptrend — pullbacks to support are likely buying opportunities.`
      : `Negative 6-month trend. The stock has been in a distribution phase. Requires a clear reversal signal before entering.`,
    color: mom6m > 0 ? '#00C805' : '#FF5000'
  })
  if (mom1y != null) signals.push({
    icon: mom1y > 0 ? '🏆' : '⚠️',
    label: `1-Year: ${mom1y > 0 ? '+' : ''}${mom1y}%`,
    detail: mom1y > 50
      ? `Exceptional 1-year return. The stock has been a strong performer. Watch for mean reversion, but the long-term trend is your friend.`
      : mom1y > 0
      ? `Positive 1-year return. Long-term trend is intact. This is the anchor for position sizing — trade with the annual trend, not against it.`
      : `Negative 1-year return. The stock has destroyed value over 12 months. Requires strong fundamental catalyst to justify a position.`,
    color: mom1y > 0 ? '#00C805' : '#FF5000'
  })

  return (
    <div style={{ marginBottom:16 }}>
      {signals.map((s, i) => (
        <div key={i} style={{ display:'flex', gap:12, padding:'12px 14px', background:'#111', border:'1px solid #252525', borderRadius:10, marginBottom:8 }}>
          <span style={{ fontSize:'1.1rem', flexShrink:0, lineHeight:1.4 }}>{s.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', fontWeight:700, color:s.color, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:'0.76rem', color:'#B2B2B2', lineHeight:1.7 }}>{s.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Analyst History ────────────────────────────────────────────── */
function AnalystHistory({ rec, price, avTarget }) {
  const current = rec?.current || rec || {}
  const history = rec?.history || (rec && Object.keys(rec).length ? [rec] : [])
  if (!history.length && !avTarget) return null

  const maxTotal = Math.max(...history.map(m => (m.strongBuy||0)+(m.buy||0)+(m.hold||0)+(m.sell||0)+(m.strongSell||0)), 1)

  return (
    <>
      <SectionHeader>Analyst Ratings History</SectionHeader>

      {/* Target price */}
      {(avTarget || current.period) && (
        <div style={{ display:'grid', gridTemplateColumns: avTarget ? '1fr 1fr' : '1fr', gap:8, marginBottom:12 }}>
          {avTarget && (
            <div style={{ background:'#111', border:'1px solid #252525', borderRadius:12, padding:'14px', textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:'#B2B2B2', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Analyst Price Target</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color:'#00E5FF' }}>${parseFloat(avTarget).toFixed(2)}</div>
              {price && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color: parseFloat(avTarget) > price ? '#00C805' : '#FF5000', marginTop:4 }}>
                {parseFloat(avTarget) > price ? '▲' : '▼'} {Math.abs((parseFloat(avTarget)/price-1)*100).toFixed(1)}% from current
              </div>}
            </div>
          )}
          {current.period && (() => {
            const sb=current.strongBuy||0, b=current.buy||0, h=current.hold||0, s=current.sell||0, ss=current.strongSell||0, tot=sb+b+h+s+ss
            const bullPct = tot > 0 ? Math.round((sb + b) / tot * 100) : 0
            return (
              <div style={{ background:'#111', border:'1px solid #252525', borderRadius:12, padding:'14px', textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:'#B2B2B2', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Analyst Sentiment</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, color: bullPct > 60 ? '#00C805' : bullPct < 40 ? '#FF5000' : '#FFD700' }}>{bullPct}%</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#B2B2B2', marginTop:4 }}>bullish ({tot} analysts)</div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Monthly history bars */}
      {history.length > 0 && (
        <div style={{ background:'#111', border:'1px solid #252525', borderRadius:12, padding:'14px', marginBottom:12 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#B2B2B2', letterSpacing:1, marginBottom:12 }}>MONTHLY BREAKDOWN — LAST {history.length} MONTHS</div>
          {history.map((month, i) => {
            const sb=month.strongBuy||0, b=month.buy||0, h=month.hold||0, s=month.sell||0, ss=month.strongSell||0
            const tot = sb+b+h+s+ss
            if (!tot) return null
            const pct = (v) => Math.round(v/tot*100)
            const d = new Date(month.period||Date.now())
            const label = d.toLocaleDateString('en-US',{month:'short',year:'2-digit'})
            return (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#B2B2B2' }}>{label}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#B2B2B2' }}>{tot} analysts</span>
                </div>
                {/* Stacked bar */}
                <div style={{ display:'flex', height:20, borderRadius:4, overflow:'hidden', gap:1 }}>
                  {sb > 0 && <div title={`Strong Buy: ${sb}`} style={{ flex:sb, background:'#00C805', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {pct(sb) >= 10 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#000', fontWeight:700 }}>{pct(sb)}%</span>}
                  </div>}
                  {b > 0 && <div title={`Buy: ${b}`} style={{ flex:b, background:'#00C80580', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {pct(b) >= 10 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#000', fontWeight:700 }}>{pct(b)}%</span>}
                  </div>}
                  {h > 0 && <div title={`Hold: ${h}`} style={{ flex:h, background:'#FFD700', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {pct(h) >= 10 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#000', fontWeight:700 }}>{pct(h)}%</span>}
                  </div>}
                  {s > 0 && <div title={`Sell: ${s}`} style={{ flex:s, background:'#FF500080' }}>
                    {pct(s) >= 10 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#fff', fontWeight:700, padding:'0 2px' }}>{pct(s)}%</span>}
                  </div>}
                  {ss > 0 && <div title={`Strong Sell: ${ss}`} style={{ flex:ss, background:'#FF5000' }}>
                    {pct(ss) >= 10 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#fff', fontWeight:700, padding:'0 2px' }}>{pct(ss)}%</span>}
                  </div>}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:'#00C805' }}>
                    {sb > 0 ? `${sb} SBuy ` : ''}{b > 0 ? `${b} Buy` : ''}
                  </span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:'#FFD700' }}>{h > 0 ? `${h} Hold` : ''}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:'#FF5000' }}>
                    {s > 0 ? `${s} Sell ` : ''}{ss > 0 ? `${ss} SSell` : ''}
                  </span>
                </div>
              </div>
            )
          })}
          <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
            {[['#00C805','Strong Buy'],['#00C80580','Buy'],['#FFD700','Hold'],['#FF500080','Sell'],['#FF5000','Strong Sell']].map(([col, label]) => (
              <span key={label} style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:'#B2B2B2', display:'flex', alignItems:'center', gap:3 }}>
                <span style={{ width:8, height:8, borderRadius:2, background:col, display:'inline-block' }}/>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && !avTarget && (
        <div style={{ color:'#B2B2B2', fontSize:'0.8rem', padding:'12px 0' }}>No analyst rating data available for this ticker.</div>
      )}
    </>
  )
}

/* ── Analysis Brief ───────────────────────────────────────────── */
function AnalysisBrief({ ticker, company, sector, price, result, ma50, metrics, news, rec, earn, insider }) {
  const S = result.scores; const mom = result.mom
  const nb = (insider||[]).filter(x => x.isBuy === true).length
  const ns = (insider||[]).filter(x => x.isBuy === false).length
  const revenueGrowth = metrics?.revenueGrowthYoY || null
  const fcf = metrics?.fcfPerShare || null

  // Business quality sentence
  let businessSentence = ''
  if (revenueGrowth != null && revenueGrowth > 30)
    businessSentence = `${company} is a high-growth business with revenue expanding ${revenueGrowth.toFixed(0)}% year-over-year`
  else if (revenueGrowth != null && revenueGrowth > 10)
    businessSentence = `${company} is a steady grower with revenue up ${revenueGrowth.toFixed(0)}% year-over-year`
  else if (revenueGrowth != null && revenueGrowth > 0)
    businessSentence = `${company} is growing modestly with revenue up ${revenueGrowth.toFixed(0)}% year-over-year`
  else if (revenueGrowth != null && revenueGrowth <= 0)
    businessSentence = `${company} is facing revenue headwinds, down ${Math.abs(revenueGrowth).toFixed(0)}% year-over-year`
  else
    businessSentence = `${company} operates in the ${sector || 'market'}`

  // Earnings sentence
  let earnSentence = ''
  if (earn?.length) {
    const withEst = earn.filter(q => q.estimate != null && q.actual != null)
    if (withEst.length >= 2) {
      const beats = withEst.filter(q => q.actual > q.estimate).length
      const beatRate = Math.round(beats / withEst.length * 100)
      if (beatRate >= 75) earnSentence = `, consistently beating analyst estimates ${beats}/${withEst.length} quarters`
      else if (beatRate >= 50) earnSentence = `, beating estimates ${beats}/${withEst.length} quarters`
      else earnSentence = `, missing estimates more often than not (${beats}/${withEst.length} beats)`
    }
  }

  // FCF sentence
  let fcfSentence = ''
  if (fcf != null && fcf > 5) fcfSentence = ' with strong free cash flow'
  else if (fcf != null && fcf > 0) fcfSentence = ' with positive free cash flow'
  else if (fcf != null && fcf < 0) fcfSentence = ' but currently cash flow negative'

  // Price action sentence
  const trendAbove = S.trend > 0
  const mom3m = mom?.['3m'] || 0
  let priceSentence = ''
  if (trendAbove && mom3m > 0)
    priceSentence = `The stock is above its 50-day moving average with positive momentum`
  else if (trendAbove && mom3m < 0)
    priceSentence = `The stock is above its 50-day MA but has pulled back ${Math.abs(mom3m).toFixed(1)}% over 3 months`
  else if (!trendAbove && mom3m < 0)
    priceSentence = `The stock is below its 50-day MA and has declined ${Math.abs(mom3m).toFixed(1)}% over 3 months`
  else
    priceSentence = `The stock is below its 50-day MA but showing early signs of stabilization`

  // Quality dip
  let dipSentence = ''
  if (result.isQualityDip) {
    const pctOff = result.qualityDipLabel?.match(/down (\d+)%/)?.[1]
    dipSentence = ` Down ${pctOff || 'significantly'}% from its 52-week high — potential entry opportunity for patient investors.`
  }

  // Analyst sentence
  let analystSentence = ''
  const recData = rec?.current || rec || {}
  const sb = recData.strongBuy || 0; const b = recData.buy || 0
  const h = recData.hold || 0; const s = recData.sell || 0; const ss2 = recData.strongSell || 0
  const tot = sb + b + h + s + ss2
  if (tot > 0) {
    const bullPct = tot > 0 ? Math.round((sb + b) / tot * 100) : 0
    if (bullPct >= 75) analystSentence = ` Wall Street is broadly bullish — ${bullPct}% of analysts rate it a buy.`
    else if (bullPct >= 50) analystSentence = ` Analyst sentiment is moderately positive at ${bullPct}% bullish.`
    else analystSentence = ` Analyst sentiment is mixed at ${bullPct}% bullish.`
  }

  // Insider sentence
  let insiderSentence = ''
  if (nb > ns && nb >= 2) insiderSentence = ` ${nb} insiders have been buying with their own money — a positive signal.`
  else if (ns > nb && ns >= 3) insiderSentence = ` Insiders are net sellers (${ns} sells vs ${nb} buys) — worth monitoring.`

  // Action sentence
  let actionSentence = ''
  if (result.verdict === 'BUY')
    actionSentence = ` Current conditions support entry. Set a stop-loss below the 50-day MA.`
  else if (result.verdict === 'HOLD' && result.isQualityDip)
    actionSentence = ` Watch for price to reclaim the 50-day MA${ma50 ? ` at $${ma50}` : ''} before adding exposure.`
  else if (result.verdict === 'HOLD')
    actionSentence = ` Hold existing positions. Wait for a clearer entry signal.`
  else
    actionSentence = ` Conditions do not support a new position. Wait for improvement.`

  const synthesis = `${businessSentence}${earnSentence}${fcfSentence}. ${priceSentence}.${dipSentence}${analystSentence}${insiderSentence}${actionSentence}`

  // Three things to watch
  const watchList = []
  if (ma50 && !trendAbove) watchList.push(`Price crossing back above the 50-day MA at $${ma50}`)
  else if (ma50 && trendAbove) watchList.push(`50-day MA at $${ma50} holding as support on pullbacks`)
  if (earn?.length) watchList.push(`Next earnings — can ${ticker} maintain its beat rate?`)
  if (result.isQualityDip) watchList.push(`Market recovery — quality dip stocks tend to lead when sentiment turns`)
  else if (mom3m < -5) watchList.push(`Momentum reversal — watch for 3-month return to turn positive`)
  watchList.push(`News sentiment — currently ${result.avgSent > .08 ? 'positive' : result.avgSent < -.08 ? 'negative' : 'neutral'}`)

  const verdictColor = result.color

  return (
    <div className="card" style={{padding:'20px 18px'}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',color:'#B2B2B2',marginBottom:14}}>📊 Analysis</div>
      <div style={{fontSize:'0.88rem',lineHeight:1.9,color:'#fff',marginBottom:18,padding:'14px 16px',background:`${verdictColor}08`,border:`1px solid ${verdictColor}25`,borderRadius:12}}>
        {synthesis}
      </div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#B2B2B2',marginBottom:10,paddingBottom:5,borderBottom:'1px solid #1A1A1A'}}>
        👁 Three Things To Watch
      </div>
      {watchList.slice(0,3).map((item,i) => (
        <div key={i} style={{fontSize:'0.82rem',color:'#B2B2B2',padding:'6px 0 6px 10px',lineHeight:1.7,borderLeft:'2px solid #252525',margin:'3px 0'}}>
          · {item}
        </div>
      ))}
      {result.upside != null && (
        <div style={{marginTop:14,padding:'10px 14px',background: result.upside > 0 ? '#00C80510' : '#FF500010',border:`1px solid ${result.upside > 0 ? '#00C80530' : '#FF500030'}`,borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#B2B2B2',letterSpacing:0.5}}>ANALYST FAIR VALUE</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',fontWeight:700,color: result.upside > 0 ? '#00C805' : '#FF5000'}}>
            {result.upside > 0 ? `▲ ${result.upside}% upside` : `▼ ${Math.abs(result.upside)}% downside`}
          </div>
        </div>
      )}
    </div>
  )
}
/* ── Position Sizing ──────────────────────────────────────────── */
function PositionSizing({ verdict, price, capital=10000, allocPct=45 }) {
  const [cap, setCap] = useState(capital)
  const [risk, setRisk] = useState('Moderate')
  const PROFILES = { Conservative:{pct:20,label:'Conservative (20%)'}, Moderate:{pct:45,label:'Moderate (45%)'}, Aggressive:{pct:65,label:'Aggressive (65%)'} }
  const prof   = PROFILES[risk]
  const alloc  = cap * prof.pct / 100
  const shares = price ? Math.floor(alloc/price) : 0
  const remain = cap - alloc
  const color  = verdict==='BUY'?GREEN:verdict==='HOLD'?YELLOW:RED
  const action = verdict==='BUY'?`Buy ~${shares} shares at $${price?.toFixed(2)}`
    :verdict==='HOLD'?`Up to ${shares} shares — wait for signal improvement`
    :'Avoid — hold cash or short-term T-bills'
  return (
    <div className="card">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div>
          <label className="input-label">Portfolio Size ($)</label>
          <input type="number" className="input" value={cap} min={500} step={500} onChange={e=>setCap(Math.max(500,+e.target.value))} />
        </div>
        <div>
          <label className="input-label">Risk Profile</label>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:6}}>
            {Object.keys(PROFILES).map(k=>(
              <button key={k} className={`filter-chip ${risk===k?'active':''}`} style={{justifyContent:'flex-start'}} onClick={()=>setRisk(k)}>{k}</button>
            ))}
          </div>
        </div>
      </div>
      {[
        ['Allocation', `$${alloc.toLocaleString('en-US',{maximumFractionDigits:0})} (${prof.pct}%)`, '#B2B2B2'],
        ['Action',     action,  color],
        ['Remaining',  `$${remain.toLocaleString('en-US',{maximumFractionDigits:0})} diversified`, '#B2B2B2'],
      ].map(([k,v,c])=>(
        <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid #1A1A1A',fontSize:'0.82rem',gap:10}}>
          <span style={{color:'#B2B2B2',flexShrink:0}}>{k}</span>
          <span style={{fontFamily:'var(--font-mono)',color:c,textAlign:'right'}}>{v}</span>
        </div>
      ))}
      <div style={{fontSize:'0.67rem',color:'#B2B2B2',marginTop:8}}>⚠ Educational only · Not financial advice · Never risk money you can't afford to lose</div>
    </div>
  )
}

/* ── Verdict Card ─────────────────────────────────────────────── */
function ScoreSparkline({ ticker, currentScore }) {
  const [history, setHistory] = React.useState([])
  React.useEffect(() => {
    loadSignals().then(signals => {
      const past = signals
        .filter(s => s.ticker === ticker && s.score != null)
        .slice(-6)
        .map(s => ({ score: s.score, date: new Date(s.tracked_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}), verdict: s.verdict }))
      setHistory(past)
    }).catch(() => {})
  }, [ticker])
  if (history.length < 2) return null
  const scores = [...history.map(h => h.score), currentScore]
  const min = Math.min(...scores) - 5; const max = Math.max(...scores) + 5
  const W = 120; const H = 28
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * W
    const y = H - ((s - min) / (max - min)) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastColor = currentScore > history[history.length-1].score ? '#00C805' : currentScore < history[history.length-1].score ? '#FF5000' : '#FFD700'
  return (
    <div style={{marginTop:8,marginBottom:4}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',color:'#555',letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Score History</div>
      <svg width={W} height={H+4} style={{overflow:'visible'}}>
        <polyline points={pts} fill="none" stroke="#333" strokeWidth={1.5}/>
        <polyline points={pts.split(' ').slice(-2).join(' ')} fill="none" stroke={lastColor} strokeWidth={2}/>
        {scores.map((s,i) => {
          const x = (i / (scores.length-1)) * W
          const y = H - ((s - min) / (max - min)) * H
          const isLast = i === scores.length - 1
          return <circle key={i} cx={x} cy={y} r={isLast ? 3 : 2} fill={isLast ? lastColor : '#333'} stroke={isLast ? lastColor : 'none'} />
        })}
      </svg>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',color:'#444',marginTop:2}}>{history[0].date} → now</div>
    </div>
  )
}

/* ── Data Quality & Staleness Badge ──────────────────────────────────────── */
function DataQualityBadge({ result }) {
  if (!result) return null
  const { stalenessFlags = [], dataCompletenessScore = 100, isETF = false } = result
  // Always show badge for ETFs (explains different scoring model)
  // For stocks, only show if data is incomplete or stale
  if (!isETF && stalenessFlags.length === 0 && dataCompletenessScore >= 85) return null

  const highSeverity = stalenessFlags.filter(f => f.severity === 'high')
  const medSeverity  = stalenessFlags.filter(f => f.severity === 'medium')
  const borderColor  = highSeverity.length > 0 ? '#FF5000' : '#FFD700'
  const labelColor   = highSeverity.length > 0 ? '#FF5000' : '#FFD700'

  return (
    <div style={{ background:`${borderColor}08`, border:`1px solid ${borderColor}30`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: stalenessFlags.length > 0 ? 8 : 0 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', fontWeight:700, color:labelColor, letterSpacing:'1px' }}>
          {isETF ? '📊 ETF MODE' : '⚠ DATA QUALITY'}
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color: dataCompletenessScore >= 80 ? '#00C805' : dataCompletenessScore >= 60 ? '#FFD700' : '#FF5000' }}>
          {dataCompletenessScore}% data complete
        </div>
      </div>
      {isETF && (
        <div style={{ fontSize:'0.72rem', color:'#B2B2B2', lineHeight:1.6 }}>
          Scored on momentum + trend only. Earnings, analyst, and valuation factors excluded — not applicable to ETFs.
        </div>
      )}
      {stalenessFlags.map((f, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background: f.severity === 'high' ? '#FF5000' : '#FFD700', flexShrink:0 }}/>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#B2B2B2' }}>{f.label}</div>
        </div>
      ))}
    </div>
  )
}

function VerdictCard({ result, ticker }) {
  const {pct,verdict,color,conviction,factorsAgree,reasons,scores,mom,uncertainty,marketRegimeWeak,regimeLabel,isQualityDip,qualityDipLabel}=result
  const e={BUY:'●',HOLD:'◆',AVOID:'✕'}[verdict]
  const allReasons=Object.values(reasons).flat()
  const nowSigs=[]
  if(scores.momentum>.2)  nowSigs.push('momentum building — capital flowing in')
  if(scores.trend>.1)     nowSigs.push('above 50-day MA — buyers in control')
  if(scores.sentiment>.1) nowSigs.push('news sentiment positive')
  if(scores.momentum<-.2) nowSigs.push('momentum weak — not ideal entry')
  if(scores.trend<-.1)    nowSigs.push('below 50-day MA — wait for recovery')
  const nowTxt=nowSigs.length?nowSigs[0].charAt(0).toUpperCase()+nowSigs[0].slice(1)+'.':'Mixed short-term signals.'
  const allTxt=scores.analyst>.3||scores.earnings>.2?'Analyst consensus and earnings history signal business quality.':'Business quality signals mixed — assess long-term thesis independently.'
  return (
    <div style={{background:`${color}08`,border:`1px solid ${color}22`,borderRadius:18,padding:'22px 16px 16px',margin:'12px 0',textAlign:'center'}}>
      <div style={{fontFamily:'var(--font-display)',fontSize:'clamp(3.5rem,15vw,5rem)',fontWeight:800,letterSpacing:-4,color,lineHeight:1}}>{pct.toFixed(0)}</div>
      <div style={{fontSize:'0.82rem',fontWeight:700,letterSpacing:'4px',textTransform:'uppercase',color,marginTop:5}}>{e} {verdict}</div>
      {marketRegimeWeak && (
        <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#FF500015',border:'1px solid #FF500044',borderRadius:8,padding:'4px 10px',margin:'8px auto 0',fontSize:'0.68rem',fontWeight:600,color:'#FF8060',letterSpacing:'0.5px'}}>
          ⚠ MARKET REGIME GATE · {regimeLabel || 'Market in downtrend — BUY suppressed'}
        </div>
      )}
      {isQualityDip && (
        <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#00C80515',border:'1px solid #00C80544',borderRadius:8,padding:'4px 10px',margin:'6px auto 0',fontSize:'0.68rem',fontWeight:600,color:'#00C805',letterSpacing:'0.5px'}}>
          💎 {qualityDipLabel || 'Quality Dip — strong business at a discount'}
        </div>
      )}
      <div style={{background:'#2E2E2E',borderRadius:3,height:3,width:160,margin:'12px auto 7px',overflow:'hidden'}}>
        <div style={{height:3,borderRadius:3,width:`${conviction}%`,background:`linear-gradient(90deg,${color},${color}88)`,transition:'width .8s'}}/>
      </div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'#B2B2B2',marginBottom:8}}>Conviction {conviction.toFixed(0)}% · {factorsAgree}/{Object.keys(scores).length} factors agree</div>
      {ticker && <ScoreSparkline ticker={ticker} currentScore={pct} />}
      <div style={{maxWidth:360,margin:'0 auto',textAlign:'left',marginBottom:12}}>
        {allReasons.slice(0,8).map((r,i)=><div key={i} style={{fontSize:'0.78rem',color:'#B2B2B2',padding:'4px 0',borderBottom:'1px solid #1A1A1A',lineHeight:1.6}}>· {r}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'#111',border:'1px solid #1A1A1A',borderRadius:10,padding:12,textAlign:'left'}}>
          <div style={{fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color,marginBottom:5}}>⚡ Why Now</div>
          <div style={{fontSize:'0.79rem',color:'#B2B2B2',lineHeight:1.7}}>{nowTxt}</div>
        </div>
        <div style={{background:'#111',border:'1px solid #1A1A1A',borderRadius:10,padding:12,textAlign:'left'}}>
          <div style={{fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#B2B2B2',marginBottom:5}}>🏛 Why At All</div>
          <div style={{fontSize:'0.79rem',color:'#B2B2B2',lineHeight:1.7}}>{allTxt}</div>
        </div>
      </div>
    </div>
  )
}

/* ── Signal History Section ── */
function SignalHistorySection({ ticker, currentPrice }) {
  const [history, setHistory] = React.useState([])
  React.useEffect(() => {
    if (!ticker) return
    loadSignals().then(signals => {
      const past = signals
        .filter(s => s.ticker === ticker)
        .slice(0, 8)
        .map(s => ({
          id: s.id, verdict: s.verdict, score: s.score,
          price: s.price_at_signal,
          ts: s.tracked_at, return30: s.return_30d
        }))
      setHistory(past)
    }).catch(() => {})
  }, [ticker])

  if (!ticker || !history.length) return null
  const GREEN = '#00C805'; const RED = '#FF5000'; const GOLD = '#FFD700'; const G4 = '#252525'
  return (
    <>
      <SectionHeader>Your Signal History — {ticker}</SectionHeader>
      <div className="card" style={{ padding: '0 16px' }}>
        {history.map((h, i) => {
          const change = currentPrice && h.price ? ((currentPrice - h.price) / h.price * 100) : null
          const color = h.verdict === 'BUY' ? GREEN : h.verdict === 'AVOID' ? RED : GOLD
          const label = new Date(h.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < history.length - 1 ? `1px solid ${G4}` : 'none' }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color, marginRight: 8, fontWeight: 700 }}>{h.verdict}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#B2B2B2' }}>{label}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Score {h.score}</div>
                {change != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: change >= 0 ? GREEN : RED, marginTop: 2 }}>
                    ${h.price?.toFixed(2)} → {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                  </div>
                )}
                {h.return30 != null && change == null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: h.return30 >= 0 ? GREEN : RED, marginTop: 2 }}>
                    30d: {h.return30 >= 0 ? '+' : ''}{h.return30.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function DeepDive({ initialTicker, diveVersion = 0, onNavigate }) {
  const [input,  setInput]  = useState(initialTicker || 'AAPL')
  const [ticker, setTicker] = useState('')
  const {data, loading, error, fetch} = useTickerData()
  const {add, remove, has} = useWatchlist()
  const [result,      setResult]      = useState(null)
  const [toast,       setToast]       = useState(null)
  const [smartMoney,  setSmartMoney]  = useState(null)
  const [tracked,     setTracked]     = useState(false)
  const [analystEst,  setAnalystEst]  = useState([])
  const [unusualFlow, setUnusualFlow] = useState(null)
  const [diveTab,     setDiveTab]     = useState('overview')

  useEffect(() => {
    if (initialTicker) { const t = initialTicker.toUpperCase(); setInput(t); setTicker(t); fetch(t) }
  }, [initialTicker, diveVersion])

  useEffect(() => { setTracked(false); setDiveTab('overview') }, [ticker])

  // Re-score whenever base data or smart money updates
  useEffect(() => {
    if (!data) return
    const r = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, Array.isArray(data.news)?data.news:[], data.rec, Array.isArray(data.earnings)?data.earnings:[], smartMoney || undefined, { ticker, companyName: data.profile?.name || '', priceTarget: data.priceTarget, upgrades: Array.isArray(data.upgrades)?data.upgrades:[], macd: data.macd || null, regimeData: data.regimeData || null })
    setResult(r)
  }, [data, smartMoney])

  // Fetch smart money — reuse data.insider (already fetched), only fetch congressional + analyst + unusual flow
  useEffect(() => {
    if (!data?.ticker || !hasKeys().fmp) return
    setSmartMoney(null); setUnusualFlow(null)
    Promise.all([
      fetchFMPCongressional(data.ticker),
      fetchAnalystEstimates(data.ticker),
      fetchUnusualFlow(data.ticker),
    ]).then(([cong, est, flow]) => {
        const safeIns  = Array.isArray(data.insider) ? data.insider : []
        const safeCong = Array.isArray(cong) ? cong : []
        const cutoff = new Date(Date.now() - 90*86400000)
        const recentInsiderBuys  = safeIns.filter(t => t.isBuy  && new Date(t.date) > cutoff).length
        const recentInsiderSells = safeIns.filter(t => !t.isBuy && new Date(t.date) > cutoff).length
        const recentCongBuys     = safeCong.filter(t => t.isBuy).length
        const cluster = computeClusterSignal(safeIns)
        setSmartMoney({ insiderBuys: recentInsiderBuys, insiderSells: recentInsiderSells, congressBuys: recentCongBuys, cluster, rawInsider: safeIns, rawCongress: safeCong })
        if (est?.length) setAnalystEst(est)
        if (flow?.length) setUnusualFlow(flow)
      })
      .catch(() => {})
  }, [data?.ticker])

  const handleAnalyze=()=>{ const t=input.trim().toUpperCase(); if(!t)return; setTicker(t); fetch(t) }
  const handleRefresh = useCallback(async () => { if(ticker) { await fetch(ticker) } }, [ticker, fetch])
  const handleWL=()=>{ if(has(ticker)){remove(ticker);setToast(`Removed ${ticker}`)}else{add(ticker);setToast(`Added ${ticker} to watchlist`)} }

  const handleTrack = useCallback(async () => {
    if (!result || !data?.quote?.c) return
    // Fetch SPY price at signal time for benchmark comparison
    const spyQuote = await fetchQuote('SPY').catch(() => null)
    await trackSignal({
      ticker:   data.ticker,
      verdict:  result.verdict,
      score:    result.pct,
      price:    data.quote.c,
      spyPrice: spyQuote?.c || null,
      factors:  result.scores,
      reasons:  result.reasons,
    })
    setTracked(true)
    setToast(`📊 ${data.ticker} tracked — check Track Record tab`)
  }, [result, data])

  const q=data?.quote; const price=q?.c; const chg=q?.dp||0
  const mt=data?.metrics||{}; const av=mt._av||{}; const ma50=data?.candles?.ma50
  const color=result?.color||GREEN; const inWL=has(ticker)
  const flags=data&&result?getFlags(data.news,result.scoredNews||[],data.insider||[],data.quote):[]

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={!!ticker}>
    <div className="page">
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input className="input" value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&handleAnalyze()}
          placeholder="AAPL · NVDA · SPY · GLD …"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}/>
        <button className="btn btn-primary" style={{width:'auto',padding:'12px 20px'}} onClick={handleAnalyze}>Analyze</button>
      </div>

      {!data&&!loading&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:14}}>
          {['AAPL','NVDA','TSLA','SPY','GLD','PLTR'].map(t=>(
            <button key={t} className="btn btn-ghost" style={{width:'auto',padding:'5px 12px',fontSize:'0.72rem'}}
              onClick={()=>{setInput(t);fetch(t);setTicker(t)}}>{t}</button>
          ))}
        </div>
      )}

      {loading && <LoadingBar text={`Analyzing ${input}…`}/>}

      {error && (
        <div style={{background:'rgba(255,80,0,0.08)',border:'1px solid rgba(255,80,0,0.3)',borderRadius:10,padding:'12px 16px',fontSize:'0.84rem',color:RED,marginBottom:12}}>
          {error}
          {error.includes('.env')&&(
            <div style={{marginTop:8,fontSize:'0.75rem',color:'#B2B2B2',lineHeight:1.8}}>
              Fix: open the <b style={{color:'#fff'}}>.env</b> file · paste your key:&nbsp;
              <span style={{fontFamily:'var(--font-mono)',color:CYAN}}>VITE_FINNHUB_KEY=d1abc…</span><br/>
              Save it · then restart: <span style={{fontFamily:'var(--font-mono)',color:CYAN}}>npm run dev</span>
            </div>
          )}
        </div>
      )}

      {data&&result&&(
        <>
          <EarningsWarning ec={data.ec}/>
          {q?.source==='alphavantage'&&<div className="datasource-badge ds-av" style={{display:'inline-flex',marginBottom:8}}>⚡ Quote via Alpha Vantage fallback</div>}

          {/* Sub-tab nav */}
          <div style={{display:'flex',gap:6,marginBottom:14,marginTop:2}}>
            {[['overview','Score'],['technical','Chart'],['fundamentals','Fundas'],['news','News']].map(([id,label])=>(
              <button key={id} onClick={()=>setDiveTab(id)} style={{
                flex:1,padding:'8px 4px',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:'0.65rem',
                background:diveTab===id?'rgba(0,229,255,0.12)':'rgba(255,255,255,0.04)',
                border:diveTab===id?'1px solid rgba(0,229,255,0.35)':'1px solid rgba(255,255,255,0.08)',
                color:diveTab===id?'#00E5FF':'#888',cursor:'pointer',letterSpacing:0.5,whiteSpace:'nowrap'
              }}>{label}</button>
            ))}
          </div>

          {/* Action buttons — always visible */}
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}>
            <div style={{display:'flex',gap:6}}>
              <button className={`btn ${tracked?'btn-ghost':'btn-secondary'}`} style={{width:'auto',padding:'7px 14px',fontSize:'0.74rem',opacity:tracked?0.5:1}} onClick={handleTrack} disabled={tracked}>
                {tracked?'✓ Tracked':'📊 Track Call'}
              </button>
              <button className={`btn ${inWL?'btn-danger':'btn-ghost'}`} style={{width:'auto',padding:'7px 14px',fontSize:'0.74rem'}} onClick={handleWL}>
                {inWL?'− Watchlist':'+ Watchlist'}
              </button>
            </div>
          </div>

          {/* ── SCORE (OVERVIEW) TAB ── */}
          {diveTab==='overview'&&(
            <>
              <div className="price-hero">
                <div className="price-company">
                  {data.profile?.name||TICKER_NAMES[ticker]||ticker}
                  {data.profile?.finnhubIndustry&&` · ${data.profile.finnhubIndustry}`}
                  {(data.profile?.marketCapitalization||(data.quote?.mc>0?data.quote.mc:null))&&` · ${fmtMcap(data.profile?.marketCapitalization||(data.quote?.mc>0?data.quote.mc:null))}`}
                </div>
                <div className="price-big" style={{color}}>${price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                <div className={`price-change ${chg>=0?'pos':'neg'}`}>{chg>=0?'▲':'▼'} {Math.abs(chg).toFixed(2)}% today</div>
                {av.description&&<div className="price-desc">{av.description.slice(0,200)}{av.description.length>200?'…':''}</div>}
                {result?.upside != null && (
                  <div style={{marginTop:6,fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:result.upside>0?'#00C805':'#FF5000'}}>
                    Analyst target: {result.upside>0?'▲':'▼'} {Math.abs(result.upside)}% {result.upside>0?'upside':'downside'}
                    {data?.priceTarget?.analysts?` · ${data.priceTarget.analysts} analysts`:''}
                  </div>
                )}
                {data?.dcf?.upside != null && (
                  <div style={{marginTop:4,fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:data.dcf.upside>15?'#00C805':data.dcf.upside>0?'#FFD700':'#FF5000'}}>
                    DCF fair value: ${data.dcf.dcf} · {data.dcf.upside>0?`▲ ${data.dcf.upside.toFixed(1)}% undervalued`:`▼ ${Math.abs(data.dcf.upside).toFixed(1)}% overvalued`}
                  </div>
                )}
              </div>

              <VerdictCard result={result} ticker={ticker}/>
              {result.inBearRegime && (
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#FF500010',border:'1px solid #FF500035',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                  <span style={{fontSize:'1rem'}}>🐻</span>
                  <div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',fontWeight:700,color:'#FF8060',letterSpacing:'1px'}}>BEAR REGIME ACTIVE</div>
                    <div style={{fontSize:'0.72rem',color:'#B2B2B2',marginTop:2}}>SPY &amp; sector both below 50-day MA — scoring weighted toward trend + momentum</div>
                  </div>
                </div>
              )}
              <DataQualityBadge result={result}/>

              <SectionHeader>Analysis Brief</SectionHeader>
              <AnalysisBrief ticker={ticker} company={data.profile?.name||ticker} sector={data.profile?.finnhubIndustry||''} price={price} result={result} ma50={ma50} metrics={mt} news={data.news} rec={data.rec} earn={data.earnings} insider={data.insider||[]}/>

              <SectionHeader>Position Sizing</SectionHeader>
              <PositionSizing verdict={result.verdict} price={price}/>

              <SignalHistorySection ticker={ticker} currentPrice={price}/>
            </>
          )}

          {/* ── CHART (TECHNICAL) TAB ── */}
          {diveTab==='technical'&&(
            <>
              {data.candles&&(
                <>
                  <SectionHeader>Price Chart · 60 Days</SectionHeader>
                  <Chart candles={data.candles} ma50={ma50} color={color} ticker={ticker}/>
                  <ChartExplainer result={result} ma50={ma50} price={price}/>
                </>
              )}

              <SectionHeader>Technical Metrics</SectionHeader>
              <div className="metrics-grid">
                <MetricCell label="Price"     value={`$${price?.toFixed(2)}`}  delta={`${chg>=0?'+':''}${chg?.toFixed(2)}%`}   deltaColor={chg>=0?'pos':'neg'}/>
                <MetricCell label="50-Day MA" value={ma50?`$${ma50}`:'N/A'}    delta={ma50?(price>ma50?'▲ Above':'▼ Below'):''} deltaColor={ma50?(price>ma50?'pos':'neg'):'neu'}/>
                <MetricCell label={data.candles?.ma200Partial?'~200d MA':'200-Day MA'} value={data.candles?.ma200?`$${data.candles.ma200}`:'N/A'} delta={data.candles?.ma200?(price>data.candles.ma200?'▲ Above':'▼ Below'):''} deltaColor={data.candles?.ma200?(price>data.candles.ma200?'pos':'neg'):'neu'}/>
                <MetricCell label="52W High"  value={data.quote?.yearHigh?`$${data.quote.yearHigh}`:'N/A'} delta={data.quote?.yearHigh?`${((price/data.quote.yearHigh-1)*100).toFixed(1)}%`:''} deltaColor={data.quote?.yearHigh&&price>=data.quote.yearHigh*0.95?'pos':'neu'}/>
                <MetricCell label="52W Low"   value={data.quote?.yearLow?`$${data.quote.yearLow}`:'N/A'}  delta={data.quote?.yearLow?`+${((price/data.quote.yearLow-1)*100).toFixed(1)}%`:''} deltaColor='neu'/>
                <MetricCell label="RSI-14"    value={result.mom?.rsi??'N/A'}/>
                <MetricCell label="MACD"      value={data.macd?`${data.macd.macd>0?'+':''}${data.macd.macd.toFixed(3)}`:'N/A'} delta={data.macd?.bullishCross?'↑ Cross':data.macd?.bearishCross?'↓ Cross':data.macd?.trend||''} deltaColor={data.macd?.bullishCross?'pos':data.macd?.bearishCross?'neg':data.macd?.trend==='bullish'?'pos':'neg'}/>
                <MetricCell label="1-Month"   value={data.priceChange?.['1M']!=null?`${data.priceChange['1M']>0?'+':''}${data.priceChange['1M'].toFixed(2)}%`:result.mom?.['1m']!=null?`${result.mom['1m']>0?'+':''}${result.mom['1m']}%`:'N/A'} deltaColor={(data.priceChange?.['1M']??result.mom?.['1m'])>=0?'pos':'neg'}/>
                <MetricCell label="3-Month"   value={data.priceChange?.['3M']!=null?`${data.priceChange['3M']>0?'+':''}${data.priceChange['3M'].toFixed(2)}%`:result.mom?.['3m']!=null?`${result.mom['3m']>0?'+':''}${result.mom['3m']}%`:'N/A'} deltaColor={(data.priceChange?.['3M']??result.mom?.['3m'])>=0?'pos':'neg'}/>
                <MetricCell label="6-Month"   value={data.priceChange?.['6M']!=null?`${data.priceChange['6M']>0?'+':''}${data.priceChange['6M'].toFixed(2)}%`:'N/A'} deltaColor={data.priceChange?.['6M']>=0?'pos':'neg'}/>
                <MetricCell label="1-Year"    value={data.priceChange?.['1Y']!=null?`${data.priceChange['1Y']>0?'+':''}${data.priceChange['1Y'].toFixed(2)}%`:'N/A'} deltaColor={data.priceChange?.['1Y']>=0?'pos':'neg'}/>
                <MetricCell label="Free Float" value={data.sharesFloat?.freeFloat!=null?`${data.sharesFloat.freeFloat.toFixed(1)}%`:'N/A'}/>
              </div>

              {data?.sharesFloat&&(data.sharesFloat.floatShares!=null||data.sharesFloat.freeFloat!=null)&&(()=>{
                const sf=data.sharesFloat; const lowFloat=sf.freeFloat!=null&&sf.freeFloat<10
                return(
                  <div style={{background:'#111',border:'1px solid #252525',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',color:'#B2B2B2',letterSpacing:1.5,textTransform:'uppercase',marginBottom:10}}>Float Profile</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                      {[['Float Shares',sf.floatShares!=null?`${(sf.floatShares/1e6).toFixed(1)}M`:'N/A'],
                        ['Free Float',sf.freeFloat!=null?`${sf.freeFloat.toFixed(1)}%`:'N/A'],
                        ['Outstanding',sf.outstandingShares!=null?`${(sf.outstandingShares/1e6).toFixed(1)}M`:'N/A']
                      ].map(([l,v])=>(
                        <div key={l} style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'7px 10px',textAlign:'center'}}>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.52rem',color:'#B2B2B2',marginBottom:2}}>{l}</div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.76rem',color:'#fff',fontWeight:600}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {lowFloat&&<div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'#FFD700',marginTop:8}}>⚠ Low free float ({sf.freeFloat.toFixed(1)}%) — heightened price volatility potential</div>}
                    {sf.lastUpdated&&<div style={{fontFamily:'var(--font-mono)',fontSize:'0.56rem',color:'#444',marginTop:6}}>Updated {sf.lastUpdated}</div>}
                  </div>
                )
              })()}

              <SectionHeader>6-Factor Breakdown</SectionHeader>
              <div className="card"><FactorBars scores={result.scores}/></div>
            </>
          )}

          {/* ── FUNDAS (FUNDAMENTALS) TAB ── */}
          {diveTab==='fundamentals'&&(
            <>
              <SectionHeader>Key Metrics</SectionHeader>
              <div className="metrics-grid">
                <MetricCell label="Mkt Cap"    value={fmtMcap(data.metrics?.marketCap||data.profile?.marketCapitalization||(data.quote?.mc>0?data.quote.mc:null))}/>
                <MetricCell label="P/E (TTM)"  value={result.pe?`${result.pe.toFixed(1)}×`:'N/A'}/>
                <MetricCell label="PEG Ratio"  value={data.metrics?.pegRatio?`${data.metrics.pegRatio.toFixed(2)}×`:'N/A'} delta={data.metrics?.pegRatio?(data.metrics.pegRatio<1?'✓ Good':''):''} deltaColor='pos'/>
                <MetricCell label="FCF/Share"  value={data.metrics?.fcfPerShare!=null?`$${data.metrics.fcfPerShare}`:'N/A'} deltaColor={data.metrics?.fcfPerShare>0?'pos':'neg'}/>
                <MetricCell label="Div Yield"  value={data.metrics?.divYield?`${data.metrics.divYield.toFixed(1)}%`:'N/A'} deltaColor={data.metrics?.divYield>3?'pos':'neu'}/>
                <MetricCell label="Debt/Eq"    value={data.metrics?.debtToEquity!=null?`${data.metrics.debtToEquity.toFixed(2)}×`:'N/A'} deltaColor={data.metrics?.debtToEquity!=null?(data.metrics.debtToEquity<1?'pos':data.metrics.debtToEquity>2?'neg':'neu'):'neu'}/>
                <MetricCell label="Curr Ratio" value={data.metrics?.currentRatio!=null?`${data.metrics.currentRatio.toFixed(2)}×`:'N/A'} deltaColor={data.metrics?.currentRatio!=null?(data.metrics.currentRatio>=1.5?'pos':data.metrics.currentRatio<1?'neg':'neu'):'neu'}/>
                <MetricCell label="Net Cash"   value={data.metrics?.netCash!=null?`${data.metrics.netCash>0?'+':''}$${Math.abs(data.metrics.netCash).toFixed(1)}B`:'N/A'} deltaColor={data.metrics?.netCash!=null?(data.metrics.netCash>0?'pos':'neg'):'neu'}/>
                <MetricCell label="Rev Growth" value={data.metrics?.revenueGrowthYoY!=null?`${data.metrics.revenueGrowthYoY>0?'+':''}${data.metrics.revenueGrowthYoY}%`:'N/A'} deltaColor={data.metrics?.revenueGrowthYoY>0?'pos':'neg'}/>
                <MetricCell label="EV/EBITDA"  value={data.metrics?.evEbitda?`${data.metrics.evEbitda.toFixed(1)}×`:'N/A'} deltaColor={data.metrics?.evEbitda<15?'pos':data.metrics?.evEbitda>30?'neg':'neu'}/>
                <MetricCell label="P/FCF"      value={data.metrics?.priceToFCF?`${data.metrics.priceToFCF.toFixed(1)}×`:'N/A'} deltaColor={data.metrics?.priceToFCF<20?'pos':data.metrics?.priceToFCF>40?'neg':'neu'}/>
                <MetricCell label="ROIC"       value={data.metrics?.roic!=null?`${data.metrics.roic.toFixed(1)}%`:'N/A'} deltaColor={data.metrics?.roic>15?'pos':data.metrics?.roic<5?'neg':'neu'}/>
                <MetricCell label="Gross Margin" value={data.metrics?.grossMargin!=null?`${data.metrics.grossMargin.toFixed(1)}%`:'N/A'} deltaColor={data.metrics?.grossMargin>40?'pos':data.metrics?.grossMargin<20?'neg':'neu'}/>
                <MetricCell label="Op Margin"  value={data.metrics?.operatingMargin!=null?`${data.metrics.operatingMargin.toFixed(1)}%`:'N/A'} deltaColor={data.metrics?.operatingMargin>20?'pos':data.metrics?.operatingMargin<5?'neg':'neu'}/>
                <MetricCell label="Net Margin" value={data.metrics?.netMargin!=null?`${data.metrics.netMargin.toFixed(1)}%`:'N/A'} deltaColor={data.metrics?.netMargin>15?'pos':data.metrics?.netMargin<5?'neg':'neu'}/>
                <MetricCell label="Quick Ratio" value={data.metrics?.quickRatio!=null?`${data.metrics.quickRatio.toFixed(2)}×`:'N/A'} deltaColor={data.metrics?.quickRatio>=1?'pos':data.metrics?.quickRatio<0.5?'neg':'neu'}/>
                <MetricCell label="Cash Ratio" value={data.metrics?.cashRatio!=null?`${data.metrics.cashRatio.toFixed(2)}×`:'N/A'} deltaColor={data.metrics?.cashRatio>=0.5?'pos':'neu'}/>
                <MetricCell label="Asset Turn" value={data.metrics?.assetTurnover!=null?`${data.metrics.assetTurnover.toFixed(2)}×`:'N/A'}/>
                <MetricCell label="Income Qual" value={data.metrics?.incomeQuality!=null?data.metrics.incomeQuality.toFixed(2):'N/A'} delta={data.metrics?.incomeQuality!=null?(data.metrics.incomeQuality>1?'✓ High':data.metrics.incomeQuality>0.5?'Mid':'⚠ Low'):''} deltaColor={data.metrics?.incomeQuality!=null?(data.metrics.incomeQuality>1?'pos':data.metrics.incomeQuality>0.5?'neu':'neg'):'neu'}/>
                <MetricCell label="Payout %" value={data.metrics?.payoutRatio!=null?`${data.metrics.payoutRatio.toFixed(0)}%`:'N/A'} deltaColor={data.metrics?.payoutRatio!=null?(data.metrics.payoutRatio<60?'pos':data.metrics.payoutRatio>85?'neg':'neu'):'neu'}/>
              </div>

              {(av.forwardPE||av.targetPrice)&&(
                <><SectionHeader>Alpha Vantage Enriched</SectionHeader>
                <div className="metrics-grid">
                  {av.forwardPE    &&<MetricCell label="Forward P/E"   value={av.forwardPE}/>}
                  {av.targetPrice  &&<MetricCell label="Analyst Target" value={`$${parseFloat(av.targetPrice).toFixed(2)}`}/>}
                  {av.profitMargin &&<MetricCell label="Profit Margin"  value={`${(parseFloat(av.profitMargin)*100).toFixed(1)}%`}/>}
                </div></>
              )}

              {data.rating&&(
                <><SectionHeader>FMP Institutional Rating</SectionHeader>
                <div className="card" style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:12}}>
                    <div style={{fontFamily:'var(--font-display)',fontSize:'2.4rem',fontWeight:900,color:data.rating.ratingScore>=25?GREEN:data.rating.ratingScore>=15?YELLOW:RED}}>
                      {data.rating.rating||'—'}
                    </div>
                    <div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'#fff'}}>{data.rating.ratingRecommendation||'—'}</div>
                      <div style={{fontSize:'0.65rem',color:'#888',marginTop:2}}>Score {data.rating.ratingScore}/30 · Based on DCF, ROE, ROA, D/E, P/E, P/B</div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                    {[['DCF',data.rating.dcfScore],['ROE',data.rating.roeScore],['ROA',data.rating.roaScore],
                      ['D/E',data.rating.deScore],['P/E',data.rating.peScore],['P/B',data.rating.pbScore]
                    ].map(([l,v])=>v!=null&&(
                      <div key={l} style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 10px',textAlign:'center'}}>
                        <div style={{fontSize:'0.6rem',color:'#888',marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.8rem',color:v>=4?GREEN:v>=3?YELLOW:RED}}>{v}/5</div>
                      </div>
                    ))}
                  </div>
                </div></>
              )}

              <AnalystHistory rec={data.rec} price={price} avTarget={av.targetPrice}/>

              {analystEst?.length>0&&(
                <><SectionHeader>Analyst Forward Estimates</SectionHeader>
                <div className="card" style={{padding:'12px 16px',marginBottom:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {analystEst.slice(0,2).map((e,i)=>(
                      <div key={i} style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'10px 12px'}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#B2B2B2',marginBottom:4}}>
                          {e.date?new Date(e.date).toLocaleDateString('en-US',{month:'short',year:'2-digit'}):`Q${i+1}`} Est
                        </div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'#00E5FF'}}>EPS ${e.epsAvg?.toFixed(2)??'—'}</div>
                        <div style={{fontSize:'0.62rem',color:'#888',marginTop:2}}>
                          {e.numAnalysts?`${e.numAnalysts} analysts`:''}
                          {e.epsHigh&&e.epsLow?` · $${e.epsLow?.toFixed(2)}–$${e.epsHigh?.toFixed(2)}`:''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div></>
              )}

              {data.earnings?.length>0&&(
                <><SectionHeader>Earnings History</SectionHeader>
                {data.earnings.slice(0,4).map((eq,i)=>{
                  const surp=eq.actual&&eq.estimate?((eq.actual-eq.estimate)/Math.abs(eq.estimate)*100):null
                  const beat=surp&&surp>0
                  return(<div className="card" key={i} style={{padding:'12px 16px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.8rem'}}>{eq.period||String(eq.date??'').slice(0,7)||`Q${i+1}`}</div>
                        <div style={{fontSize:'0.73rem',color:'#B2B2B2',marginTop:2}}>Est ${eq.estimate?.toFixed(2)??'—'} · Actual ${eq.actual!=null?eq.actual.toFixed(2):'Pending'}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.86rem',color:beat?GREEN:surp?RED:'#B2B2B2'}}>{surp?`${surp>0?'+':''}${surp.toFixed(1)}%`:'—'}</div>
                        <div style={{fontSize:'0.7rem',color:'#B2B2B2'}}>{beat?'✅ Beat':surp?'❌ Miss':'—'}</div>
                      </div>
                    </div>
                  </div>)
                })}</>
              )}

              {data.insider?.length>0&&(
                <><SectionHeader>Insider Transactions — 90 Days</SectionHeader>
                <div className="metrics-grid">
                  {[['Buys',String(data.insider.filter(x=>x.isBuy===true).length)],
                    ['Sells',String(data.insider.filter(x=>x.isBuy===false).length)],
                    ['Signal',(()=>{const b=data.insider.filter(x=>x.isBuy===true).length;const s=data.insider.filter(x=>x.isBuy===false).length;return b>s?'🟢 Bullish':s>b?'🔴 Bearish':'⚪ Neutral'})()]
                  ].map(([l,v])=><MetricCell key={l} label={l} value={v}/>)}
                </div></>
              )}

              {unusualFlow?.length>0&&(
                <><SectionHeader>Options Flow — Unusual Activity</SectionHeader>
                <div style={{background:'#111',border:'1px solid #252525',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',color:'#B2B2B2',letterSpacing:1.5,textTransform:'uppercase',marginBottom:10}}>
                    {unusualFlow.length} contracts with Vol/OI ≥ 2× &amp; volume ≥ 500 — sorted by ratio
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:'6px 10px',alignItems:'center',marginBottom:6}}>
                    {['Type','Strike / Exp','Vol','OI','IV'].map(h=>(
                      <div key={h} style={{fontFamily:'var(--font-mono)',fontSize:'0.54rem',color:'#555',textTransform:'uppercase',letterSpacing:1}}>{h}</div>
                    ))}
                    {unusualFlow.slice(0,10).map((c,i)=>{
                      const isCall = c.type==='call'
                      return(
                        <React.Fragment key={i}>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',fontWeight:700,color:isCall?GREEN:RED}}>
                            {isCall?'CALL':'PUT'}
                          </div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'#fff'}}>
                            ${c.strike} <span style={{color:'#555',fontSize:'0.58rem'}}>{String(c.expiry||'').slice(5)}</span>
                          </div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'#B2B2B2'}}>{c.volume?.toLocaleString()}</div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:'#B2B2B2'}}>{c.oi?.toLocaleString()}</div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.66rem',color:c.iv>50?RED:c.iv>30?YELLOW:'#B2B2B2'}}>
                            {c.iv!=null?`${c.iv}%`:'—'}
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                  {(()=>{
                    const calls = unusualFlow.filter(c=>c.type==='call')
                    const puts  = unusualFlow.filter(c=>c.type==='put')
                    const ratio = puts.length>0 ? (calls.length/puts.length).toFixed(2) : '∞'
                    const bullish = calls.length > puts.length
                    return(
                      <div style={{borderTop:'1px solid #1a1a1a',paddingTop:8,marginTop:4,display:'flex',gap:16,alignItems:'center'}}>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:bullish?GREEN:RED}}>
                          {bullish?'▲':'▼'} Call/Put ratio {ratio} — {bullish?'bullish':'bearish'} options flow
                        </div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#555'}}>
                          {calls.length}C / {puts.length}P unusual
                        </div>
                      </div>
                    )
                  })()}
                </div></>
              )}

              {flags.length>0&&(
                <><SectionHeader>⚠ Manipulation Flags</SectionHeader>
                {flags.map((f,i)=>(
                  <div key={i} className="card" style={{borderLeft:'3px solid #FF5000',padding:'12px 14px',marginBottom:8}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:RED,marginBottom:4}}>{f.title}</div>
                    <div style={{fontSize:'0.82rem',color:'#B2B2B2'}}>{f.body}</div>
                  </div>
                ))}</>
              )}

              {data.peers?.length>0&&(
                <><SectionHeader>Compare with Peers</SectionHeader>
                <div className="card" style={{padding:'12px 16px'}}>
                  <div style={{fontSize:'0.72rem',color:'#888',marginBottom:10,fontFamily:'var(--font-mono)'}}>FMP peer group · tap to compare in Dive</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {data.peers.map(peer=>(
                      <button key={peer} onClick={()=>onNavigate&&onNavigate(peer)}
                        style={{background:'rgba(0,229,255,0.06)',border:'1px solid rgba(0,229,255,0.2)',borderRadius:8,padding:'6px 14px',color:'#00E5FF',fontFamily:'var(--font-mono)',fontSize:'0.72rem',cursor:'pointer',letterSpacing:0.5}}>
                        {peer} →
                      </button>
                    ))}
                  </div>
                </div></>
              )}

              {data.score&&(
                <><SectionHeader>Fundamental Health</SectionHeader>
                <div className="card" style={{padding:'14px 16px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#888',marginBottom:6}}>PIOTROSKI SCORE</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:'2.2rem',fontWeight:900,color:data.score.piotroski>=7?GREEN:data.score.piotroski>=4?YELLOW:RED}}>
                        {data.score.piotroski??'—'}<span style={{fontSize:'1rem',color:'#888'}}>/9</span>
                      </div>
                      <div style={{fontSize:'0.7rem',color:'#888',marginTop:4}}>{data.score.piotroskiLabel}</div>
                      <div style={{fontSize:'0.62rem',color:'#555',marginTop:2}}>Profitability · Leverage · Efficiency</div>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#888',marginBottom:6}}>ALTMAN Z-SCORE</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:'2.2rem',fontWeight:900,color:data.score.altmanZ>=3?GREEN:data.score.altmanZ>=1.8?YELLOW:RED}}>
                        {data.score.altmanZ?.toFixed(2)??'—'}
                      </div>
                      <div style={{fontSize:'0.7rem',color:'#888',marginTop:4}}>{data.score.altmanLabel}</div>
                      <div style={{fontSize:'0.62rem',color:'#555',marginTop:2}}>{'<1.8 Distress · 1.8-3 Grey · >3 Safe'}</div>
                    </div>
                  </div>
                </div></>
              )}

              {data.dcf&&(
                <><SectionHeader>Intrinsic Value (DCF)</SectionHeader>
                <div className="card" style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#888',marginBottom:4}}>DCF VALUE</div>
                      <div style={{fontFamily:'var(--font-display)',fontSize:'1.8rem',fontWeight:900,color:CYAN}}>${data.dcf.dcf}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'#888',marginBottom:4}}>VS CURRENT PRICE</div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'1.1rem',fontWeight:700,color:data.dcf.upside>0?GREEN:RED}}>
                        {data.dcf.upside>0?'+':''}{data.dcf.upside?.toFixed(1)}%
                      </div>
                      <div style={{fontSize:'0.65rem',color:'#888'}}>{data.dcf.upside>0?'Undervalued':'Overvalued'}</div>
                    </div>
                  </div>
                  <div style={{fontSize:'0.72rem',color:'#B2B2B2'}}>
                    Current price ${data.quote?.c?.toFixed(2)||data.dcf.price||'N/A'} · DCF ${data.dcf.dcf} · {data.dcf.upside>10?'Significant margin of safety':'Priced near intrinsic value'}
                  </div>
                </div></>
              )}

              {data.revenueSegments?.segments?.length>0&&(
                <><SectionHeader>Revenue by Product · {String(data.revenueSegments.date??'').slice(0,4)}</SectionHeader>
                <div className="card" style={{padding:'14px 16px'}}>
                  {(Array.isArray(data.revenueSegments?.segments)?data.revenueSegments.segments:[]).map((seg,i)=>(
                    <div key={i} style={{marginBottom:i<data.revenueSegments.segments.length-1?10:0}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <div style={{fontSize:'0.76rem',color:'#fff'}}>{seg.name}</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:CYAN}}>{seg.pct}% · ${(seg.value/1e9).toFixed(1)}B</div>
                      </div>
                      <div style={{height:4,background:'#1a1a1a',borderRadius:2}}>
                        <div style={{height:'100%',width:`${seg.pct}%`,background:CYAN,borderRadius:2,opacity:0.7}}/>
                      </div>
                    </div>
                  ))}
                </div></>
              )}

              {Array.isArray(data.incomeGrowth)&&data.incomeGrowth.length>0&&(
                <><SectionHeader>Growth Trends (YoY)</SectionHeader>
                <div className="card" style={{padding:'14px 16px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'auto repeat(3,1fr)',gap:'6px 10px',alignItems:'center'}}>
                    <div style={{fontSize:'0.6rem',color:'#555'}}></div>
                    {data.incomeGrowth.map((r,i)=>(
                      <div key={i} style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',color:'#888',textAlign:'center'}}>
                        {String(r.date??'').slice(0,4)||`Y-${i+1}`}
                      </div>
                    ))}
                    {[['Revenue',data.incomeGrowth.map(r=>r.revenueGrowth)],
                      ['Net Income',data.incomeGrowth.map(r=>r.netIncomeGrowth)],
                      ['EPS',data.incomeGrowth.map(r=>r.epsGrowth)],
                      ['FCF',data.cfGrowth?.map(r=>r.fcfGrowth)||[]],
                      ['Op CF',data.cfGrowth?.map(r=>r.opCFGrowth)||[]],
                    ].map(([label,vals])=>(
                      <React.Fragment key={label}>
                        <div style={{fontSize:'0.65rem',color:'#888'}}>{label}</div>
                        {[0,1,2].map(i=>{
                          const v=vals[i]
                          return(<div key={i} style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',textAlign:'center',color:v==null?'#555':v>0?GREEN:RED}}>
                            {v!=null?`${v>0?'+':''}${v}%`:'—'}
                          </div>)
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div></>
              )}

              {Array.isArray(data.dividends)&&data.dividends.length>0&&(
                <><SectionHeader>Dividend History</SectionHeader>
                <div className="card" style={{padding:'0 16px'}}>
                  {data.dividends.map((d,i)=>(
                    <div key={i} style={{padding:'10px 0',borderBottom:i<data.dividends.length-1?'1px solid #1a1a1a':'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'#fff'}}>{d.date}</div>
                        {d.paymentDate&&<div style={{fontSize:'0.62rem',color:'#888',marginTop:2}}>Paid {d.paymentDate}</div>}
                      </div>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',color:GREEN}}>${d.dividend?.toFixed(4)}</div>
                    </div>
                  ))}
                </div></>
              )}
            </>
          )}

          {/* ── NEWS TAB ── */}
          {diveTab==='news'&&(
            <>
              <SectionHeader>News · {data.news?.length||0} Articles</SectionHeader>
              <div className="card" style={{padding:'0 16px'}}>
                {data.news?.length
                  ?data.news.map((art,i)=><NewsCard key={i} article={art} sc={result.scoredNews?.[i]||{tier:4}}/>)
                  :<div style={{color:'#B2B2B2',textAlign:'center',padding:24,fontSize:'0.84rem'}}>No news in past 10 days.</div>}
              </div>
              <div style={{height:16}}/>
            </>
          )}
        </>
      )}

      {!data&&!loading&&(
        <div style={{textAlign:'center',padding:'40px 0',color:'#B2B2B2'}}>
          <div style={{fontFamily:'var(--font-display)',fontSize:'4rem',color:'#1A1A1A',marginBottom:12}}>◈</div>
          <p style={{fontSize:'0.86rem',lineHeight:2,maxWidth:320,margin:'0 auto'}}>
            Enter any US stock or ETF ticker.<br/>Signal · Chart · Brief · Earnings · Insiders · News.
          </p>
        </div>
      )}
      {toast&&<Toast message={toast} onDone={()=>setToast(null)}/>}
    </div>
    </PullToRefresh>
  )
}
