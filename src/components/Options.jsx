import React, { useState, useEffect } from 'react'
import { useTickerData } from '../hooks/useApi.js'
import { scoreAsset } from '../utils/scoring.js'
import { OPTIONS_STRATEGIES, TICKER_NAMES } from '../utils/constants.js'
import { EarningsWarning, LoadingBar, SectionHeader, PullToRefresh } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const CYAN='#00E5FF'; const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

/* ── Strike Calculator ── */
function calcStrikes(price, verdict, rsi) {
  if (!price) return null
  const dteOptions = [21, 35, 45]
  const dte = rsi && rsi > 65 ? 35 : rsi && rsi < 35 ? 21 : 45

  // Round to nearest standard strike increment
  const inc = price < 20 ? 0.5 : price < 50 ? 1 : price < 100 ? 2.5 : price < 200 ? 5 : price < 500 ? 10 : 25
  const round = (n) => Math.round(n / inc) * inc

  const expiry = new Date()
  expiry.setDate(expiry.getDate() + dte)
  // Move to next Friday
  const day = expiry.getDay()
  if (day !== 5) expiry.setDate(expiry.getDate() + ((5 - day + 7) % 7))
  const expStr = expiry.toLocaleDateString('en-US', { month:'short', day:'numeric' })

  if (verdict === 'BUY') {
    const callStrike = round(price * 1.05)
    const spreadSell = round(price * 1.12)
    return {
      primary: { name:'Long Call', strike:`$${callStrike}`, expiry:`${expStr} (${dte} DTE)`, cost:`~$${Math.round(price * 0.04 * 100)} premium`, action:`Buy ${callStrike}C exp ${expStr}` },
      spread:  { name:'Bull Call Spread', buy:`$${callStrike}`, sell:`$${spreadSell}`, expiry:`${expStr}`, maxGain:`$${Math.round((spreadSell-callStrike)*100 - price*0.015*100)}`, action:`Buy ${callStrike}C / Sell ${spreadSell}C exp ${expStr}` }
    }
  }
  if (verdict === 'AVOID') {
    const putStrike = round(price * 0.95)
    const spreadBuy = round(price * 0.88)
    return {
      primary: { name:'Long Put', strike:`$${putStrike}`, expiry:`${expStr} (${dte} DTE)`, cost:`~$${Math.round(price * 0.04 * 100)} premium`, action:`Buy ${putStrike}P exp ${expStr}` },
      spread:  { name:'Bear Put Spread', buy:`$${putStrike}`, sell:`$${spreadBuy}`, expiry:`${expStr}`, maxGain:`$${Math.round((putStrike-spreadBuy)*100 - price*0.015*100)}`, action:`Buy ${putStrike}P / Sell ${spreadBuy}P exp ${expStr}` }
    }
  }
  // HOLD — condor levels
  const callSell = round(price * 1.05)
  const callBuy  = round(price * 1.10)
  const putSell  = round(price * 0.95)
  const putBuy   = round(price * 0.90)
  return {
    primary: { name:'Iron Condor', expiry:`${expStr} (${dte} DTE)`, action:`Sell ${putSell}P / Buy ${putBuy}P / Sell ${callSell}C / Buy ${callBuy}C exp ${expStr}`, cost:`Collect ~$${Math.round(price*0.025*100)} credit` },
    spread: null
  }
}

function StrikeBox({ strikes, verdict, price }) {
  if (!strikes || !price) return null
  const color = verdict === 'BUY' ? '#00C805' : verdict === 'AVOID' ? '#FF5000' : '#FFD700'
  return (
    <div style={{ background:'rgba(0,229,255,0.04)', border:'1px solid rgba(0,229,255,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#00E5FF', letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>📐 Specific Strikes — Current Price ${price.toFixed(2)}</div>

      {/* Primary trade */}
      <div style={{ background:'#0A0A0A', borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color, marginBottom:6, fontWeight:600 }}>{strikes.primary.name}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'#fff', marginBottom:4 }}>→ {strikes.primary.action}</div>
        {strikes.primary.strike && <div style={{ fontSize:'0.72rem', color:'#B2B2B2' }}>Strike: {strikes.primary.strike} · Expiry: {strikes.primary.expiry}</div>}
        {strikes.primary.expiry && !strikes.primary.strike && <div style={{ fontSize:'0.72rem', color:'#B2B2B2' }}>Expiry: {strikes.primary.expiry}</div>}
        <div style={{ fontSize:'0.72rem', color:'#B2B2B2', marginTop:2 }}>{strikes.primary.cost}</div>
      </div>

      {/* Spread alternative */}
      {strikes.spread && (
        <div style={{ background:'#0A0A0A', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#B2B2B2', marginBottom:6 }}>{strikes.spread.name} (lower cost)</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'#fff', marginBottom:4 }}>→ {strikes.spread.action}</div>
          <div style={{ fontSize:'0.72rem', color:'#B2B2B2' }}>Max gain: {strikes.spread.maxGain} · Expiry: {strikes.spread.expiry}</div>
        </div>
      )}

      <div style={{ marginTop:10, fontSize:'0.68rem', color:'#B2B2B2', lineHeight:1.6 }}>
        ⚠ Strikes are calculated from current price. Verify on your broker before placing. These are starting points — adjust to your risk tolerance.
      </div>
    </div>
  )
}



function RiskTag({ level }) {
  const cols = { High:'#FF5000', Limited:'#FFD700', 'Premium paid':'#FFD700', 'Capped upside':'#FFD700', 'Own shares at lower price':'#FFD700', 'Opportunity cost':'#B2B2B2', Unlimited:'#00C805', 'Premium income':'#00C805', 'High (stock falls)':'#00C805', Capped:'#B2B2B2', 'Capital preservation':'#00C805' }
  return <span style={{ background: (cols[level]||G4)+'20', color: cols[level]||G1, border:`1px solid ${cols[level]||G4}40`, padding:'1px 8px', borderRadius:4, fontFamily:'var(--font-mono)', fontSize:'0.6rem', marginLeft:4 }}>{level}</span>
}

function StratCard({ strat }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, marginBottom:8, overflow:'hidden' }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'transparent', border:'none', color:'#fff', cursor:'pointer', textAlign:'left', gap:8, WebkitTapHighlightColor:'transparent' }}>
        <div>
          <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{strat.name}</div>
          <div style={{ marginTop:3 }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1 }}>Risk:</span>
            <RiskTag level={strat.risk} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, marginLeft:8 }}>Reward:</span>
            <RiskTag level={strat.reward} />
          </div>
        </div>
        <span style={{ color:G1, fontSize:'0.8rem', flexShrink:0 }}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${G4}` }}>
          <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.8, marginTop:12 }}>{strat.desc}</div>
          <div style={{ marginTop:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:CYAN, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>When to enter</div>
            <div style={{ fontSize:'0.8rem', color:G1, lineHeight:1.7 }}>{strat.when}</div>
          </div>
          <div style={{ marginTop:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:GREEN, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>How to exit</div>
            <div style={{ fontSize:'0.8rem', color:G1, lineHeight:1.7 }}>{strat.exit}</div>
          </div>
        </div>
      )}
    </div>
  )
}


function EntryChecklist({ result, price, candles, ec }) {
  const rsi = result.mom?.rsi
  const mom1m = result.mom?.['1m']
  const ma50 = candles?.ma50
  const aboveMA = price && ma50 ? price > ma50 : null
  const verdict = result.verdict
  const conviction = result.conviction

  // Days to earnings
  let daysToEarnings = null
  if (ec?.date) { try { daysToEarnings = Math.round((new Date(ec.date) - new Date()) / 86400000) } catch {} }
  const earningsSoon = daysToEarnings !== null && daysToEarnings <= 14

  // Build checklist
  const checks = []

  // 1. Trend check
  if (aboveMA !== null) {
    checks.push({ label: 'Price vs 50-day MA', pass: aboveMA,
      detail: aboveMA ? `$${price?.toFixed(2)} above MA $${ma50} ✓ trend confirmed` : `$${price?.toFixed(2)} below MA $${ma50} — trend not confirmed, higher risk` })
  }

  // 2. RSI check (not overbought for calls, not oversold for puts)
  if (rsi != null) {
    const rsiOk = verdict === 'BUY' ? rsi < 70 : verdict === 'AVOID' ? rsi > 30 : rsi > 35 && rsi < 65
    checks.push({ label: 'RSI-14 entry zone', pass: rsiOk,
      detail: verdict === 'BUY'
        ? (rsi < 50 ? `RSI ${rsi} — good entry zone for calls, not chasing` : rsi < 70 ? `RSI ${rsi} — acceptable, use spreads not naked calls` : `RSI ${rsi} — overbought, wait for 55–65 before entering`)
        : verdict === 'AVOID'
        ? (rsi > 50 ? `RSI ${rsi} — good entry for puts, stock still elevated` : `RSI ${rsi} — already oversold, put premium may be expensive`)
        : `RSI ${rsi} — ${rsi > 65 ? 'skewed high, iron condor call side at risk' : rsi < 35 ? 'skewed low, put side at risk' : 'neutral zone, iron condor is valid'}` })
  }

  // 3. Momentum check
  if (mom1m != null) {
    const momOk = verdict === 'BUY' ? mom1m > -5 : verdict === 'AVOID' ? mom1m < 5 : Math.abs(mom1m) < 10
    checks.push({ label: '1-month momentum', pass: momOk,
      detail: `${mom1m > 0 ? '+' : ''}${mom1m}% — ${
        verdict === 'BUY' ? (mom1m > 10 ? 'strong tailwind, but check if chasing' : mom1m > 0 ? 'positive momentum supports calls' : 'negative momentum — wait for stabilisation')
        : verdict === 'AVOID' ? (mom1m < -10 ? 'strong downtrend confirms put thesis' : mom1m < 0 ? 'negative momentum supports puts' : 'stock still rising — put timing risky')
        : (Math.abs(mom1m) < 5 ? 'minimal movement, iron condor range-bound thesis valid' : 'too much directional move for range-bound strategies')
      }` })
  }

  // 4. Earnings risk
  checks.push({ label: 'Earnings timing', pass: !earningsSoon,
    detail: earningsSoon
      ? `Earnings in ~${daysToEarnings} days — IV is inflated, avoid buying options. Wait until after earnings or trade the event deliberately.`
      : daysToEarnings !== null
      ? `Next earnings ~${daysToEarnings} days away — IV not inflated yet. Good window for longer-dated options.`
      : 'No upcoming earnings flagged — IV less likely to be inflated.' })

  // 5. Conviction
  checks.push({ label: 'Signal conviction', pass: conviction >= 50,
    detail: `${conviction.toFixed(0)}% conviction · ${result.factorsAgree}/6 factors agree. ${
      conviction >= 70 ? 'High conviction — full position sizing appropriate.' :
      conviction >= 50 ? 'Moderate conviction — reduce position size by 30-50%.' :
      'Low conviction — use defined-risk strategies only (spreads, not naked longs).'}` })

  const passCount = checks.filter(c => c.pass).length
  const totalChecks = checks.length
  const score = Math.round(passCount / totalChecks * 100)
  const readiness = score >= 80 ? { label: 'Good Entry', color: GREEN } : score >= 60 ? { label: 'Proceed with Caution', color: YELLOW } : { label: 'Wait for Better Setup', color: RED }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:`${readiness.color}10`, border:`1px solid ${readiness.color}30`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
        <div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:readiness.color, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Entry Readiness</div>
          <div style={{ fontWeight:700, fontSize:'1.1rem', color:readiness.color }}>{readiness.label}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800, color:readiness.color, lineHeight:1 }}>{passCount}<span style={{ fontSize:'0.9rem', fontWeight:400 }}>/{totalChecks}</span></div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, marginTop:2 }}>checks pass</div>
        </div>
      </div>

      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, overflow:'hidden', marginBottom:12 }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom: i < checks.length-1 ? `1px solid ${G4}` : 'none', alignItems:'flex-start' }}>
            <div style={{ width:20, height:20, borderRadius:'50%', background: c.pass ? 'rgba(0,200,5,0.15)' : 'rgba(255,80,0,0.12)', border: `1px solid ${c.pass ? 'rgba(0,200,5,0.4)' : 'rgba(255,80,0,0.3)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1, fontSize:'0.65rem' }}>
              {c.pass ? '✓' : '✗'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:'0.8rem', marginBottom:3, color: c.pass ? '#fff' : G1 }}>{c.label}</div>
              <div style={{ fontSize:'0.74rem', color:G1, lineHeight:1.6 }}>{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {score < 60 && (
        <div style={{ background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:4, fontSize:'0.78rem', color:YELLOW, lineHeight:1.7 }}>
          💡 Only {passCount}/{totalChecks} conditions met. Consider waiting for more favourable setup or use smaller size with defined risk (spreads only).
        </div>
      )}
    </div>
  )
}

function TickerOptionsGuide({ ticker, result, price, ec, metrics, candles }) {
  const verdict = result.verdict
  const strats = OPTIONS_STRATEGIES[verdict]
  const color = strats.color
  const pe = result.pe
  const rsi = result.mom?.rsi
  const mom1m = result.mom?.['1m']

  // Timing signals
  const earningsSoon = ec ? (() => { try { const d = new Date(ec.date); return Math.round((d-new Date())/86400000) <= 7 } catch { return false } })() : false
  const highIV = pe && pe > 40
  const overbought = rsi && rsi > 70
  const oversold = rsi && rsi < 30

  return (
    <div className="fade-up">
      {/* Context banner */}
      <div style={{ background:`${color}10`, border:`1px solid ${color}25`, borderRadius:14, padding:'18px 20px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>{strats.title}</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, letterSpacing:-1, color, lineHeight:1 }}>
          {result.pct.toFixed(0)}<span style={{ fontSize:'1rem', fontWeight:400, marginLeft:4 }}>/100</span>
        </div>
        <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.7, marginTop:10 }}>
          {verdict==='BUY' && `Signal is bullish at ${result.pct.toFixed(0)}/100 · ${result.factorsAgree}/6 factors align. Bias is to the upside. Options strategies should reflect this directional edge.`}
          {verdict==='HOLD' && `Signal is neutral at ${result.pct.toFixed(0)}/100 · mixed factors. No clear directional edge. Income and range-bound strategies are most appropriate.`}
          {verdict==='AVOID' && `Signal is bearish at ${result.pct.toFixed(0)}/100 · ${6-result.factorsAgree} of 6 factors negative. Caution warranted. Defensive or bearish strategies if trading at all.`}
        </div>
      </div>

      <EarningsWarning ec={ec} />

      {/* Specific strikes */}
      <StrikeBox strikes={calcStrikes(price, verdict, rsi)} verdict={verdict} price={price} />

      {/* Live context */}
      <SectionHeader>Live Signals for {ticker}</SectionHeader>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {[
          ['Price', price ? `$${price.toFixed(2)}` : '—', null],
          ['RSI-14', rsi ?? '—', rsi>70?'Overbought':rsi<30?'Oversold':'Neutral'],
          ['1-Month', mom1m!=null ? `${mom1m>0?'+':''}${mom1m}%` : '—', null],
          ['P/E', pe ? `${pe.toFixed(1)}×` : '—', pe>40?'Expensive':pe<15?'Value':null],
          ['Signal', `${result.pct.toFixed(0)}/100`, null],
          ['Conviction', `${result.conviction.toFixed(0)}%`, null],
        ].map(([l,v,sub])=>(
          <div key={l} className="metric-cell">
            <div className="metric-label">{l}</div>
            <div className="metric-value">{v}</div>
            {sub && <div style={{ fontSize:'0.6rem', color:G1, marginTop:2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Timing alerts */}
      {(earningsSoon || highIV || overbought || oversold) && (
        <div style={{ marginBottom:16 }}>
          {earningsSoon && <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:8, fontSize:'0.8rem', color:RED }}>⚠ Earnings in under 7 days — options IV is inflated. Avoid buying options here unless you're trading the event intentionally. IV will collapse after earnings regardless of direction.</div>}
          {highIV && !earningsSoon && <div style={{ background:'rgba(255,215,0,0.08)', border:'1px solid rgba(255,215,0,0.25)', borderRadius:10, padding:'10px 14px', marginBottom:8, fontSize:'0.8rem', color:YELLOW }}>⚠ P/E {pe?.toFixed(1)}× — elevated valuation means elevated volatility. Options premiums likely inflated. Consider spreads over naked longs.</div>}
          {overbought && <div style={{ background:'rgba(255,215,0,0.08)', border:'1px solid rgba(255,215,0,0.25)', borderRadius:10, padding:'10px 14px', marginBottom:8, fontSize:'0.8rem', color:YELLOW }}>📊 RSI {rsi} — overbought zone. Calls are expensive here. Wait for pullback or use spreads to reduce cost. Put premium is also elevated if you want to hedge.</div>}
          {oversold && <div style={{ background:'rgba(0,200,5,0.06)', border:'1px solid rgba(0,200,5,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:8, fontSize:'0.8rem', color:GREEN }}>📊 RSI {rsi} — oversold zone. Call premiums are relatively cheap here — better time to buy directional exposure than chasing after a rally.</div>}
        </div>
      )}

      {/* Live Entry Checklist */}
      <SectionHeader>Should I Enter Now?</SectionHeader>
      <EntryChecklist result={result} price={price} candles={candles} ec={ec} />

      {/* Strategies */}
      <SectionHeader>Strategies for {verdict} Signal</SectionHeader>
      {strats.strategies.map((s,i) => <StratCard key={i} strat={s} />)}

      <div style={{ background:'rgba(255,80,0,0.06)', border:'1px solid rgba(255,80,0,0.2)', borderRadius:10, padding:'12px 16px', marginTop:12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:RED, letterSpacing:1, textTransform:'uppercase', marginBottom:5 }}>⚠ Position Sizing Rule</div>
        <div style={{ fontSize:'0.8rem', color:G1, lineHeight:1.7 }}>{strats.warning}</div>
      </div>

      {/* Position sizing calculator */}
      <SectionHeader>Quick Position Size Guide</SectionHeader>
      <PositionSizer price={price} />

      {/* Greeks reminder */}
      <SectionHeader>Greeks Quick Reference</SectionHeader>
      <div className="card" style={{ padding:'0 16px' }}>
        {[
          ['Delta', 'How much option price moves per $1 stock move. Delta 0.5 = option gains $0.50 for every $1 stock rise.'],
          ['Theta', 'Daily time decay. Options lose value every day you hold them. Accelerates in the last 2 weeks before expiry.'],
          ['IV (Implied Volatility)', 'Expected future volatility baked into the option price. High IV = expensive. Buy when IV is low, not after big moves.'],
          ['Premium', 'What you pay for the option. 1 contract = 100 shares. $3 premium = $300 total cost = your maximum possible loss.'],
          ['Strike Price', 'The fixed price you can buy/sell at. Near-the-money (3-7% from current) strikes offer the best balance of cost and delta.'],
          ['Expiry', '30-45 DTE (days to expiry) is the sweet spot. Too short = theta destroys you. Too long = capital tied up.'],
        ].map(([t,d],i) => (
          <div key={t} style={{ padding:'12px 0', borderBottom: i<5?`1px solid ${G4}`:'none' }}>
            <div style={{ fontWeight:600, fontSize:'0.84rem', marginBottom:4 }}>{t}</div>
            <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.7 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PositionSizer({ price }) {
  const [portfolio, setPortfolio] = useState(10000)
  const [premium, setPremium] = useState(3)
  const pct2 = Math.round(portfolio * 0.02)
  const pct3 = Math.round(portfolio * 0.03)
  const pct5 = Math.round(portfolio * 0.05)
  const contracts2 = price ? Math.floor(pct2 / (premium * 100)) : 0
  const contracts3 = price ? Math.floor(pct3 / (premium * 100)) : 0
  return (
    <div className="card">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        <div>
          <div className="input-label">Portfolio Size ($)</div>
          <input className="input" type="number" value={portfolio} onChange={e=>setPortfolio(+e.target.value||10000)} min={1000} step={1000} />
        </div>
        <div>
          <div className="input-label">Option Premium ($)</div>
          <input className="input" type="number" value={premium} onChange={e=>setPremium(+e.target.value||1)} min={0.5} step={0.5} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        {[['Conservative 2%', pct2, contracts2, GREEN], ['Moderate 3%', pct3, contracts3, YELLOW], ['Max 5%', pct5, Math.floor(pct5/(premium*100)), RED]].map(([l,dollar,c,col])=>(
          <div key={l} style={{ background:'#111', border:'1px solid #252525', borderRadius:10, padding:'10px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginBottom:4 }}>{l}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.88rem', color:col, fontWeight:600 }}>${dollar.toLocaleString()}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:G1, marginTop:2 }}>{c} contracts</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'0.72rem', color:G1, marginTop:10, lineHeight:1.6 }}>
        1 contract = 100 shares · Premium × 100 = cost per contract · Never exceed 5% on a single options trade
      </div>
    </div>
  )
}

export default function Options() {
  const [ticker, setTicker] = useState('')
  const [input, setInput] = useState('')
  const { data, loading, error, fetch } = useTickerData()
  const handleRefresh = React.useCallback(async () => { if (ticker) { setResult(null); fetch(ticker) } }, [ticker, fetch])
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (data) setResult(scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings))
  }, [data])

  const handle = () => { const t=input.trim().toUpperCase(); if(t){setTicker(t);fetch(t)} }

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={!!ticker}>
    <div className="page">
      <div style={{ background:'rgba(0,200,5,0.04)', border:'1px solid rgba(0,200,5,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:GREEN, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>⚙ Options Guide</div>
        <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.8 }}>Enter a ticker to get signal-specific options strategies, timing signals, and position sizing guidance. All strategies include exact entry/exit rules.</div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input className="input" value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&handle()}
          placeholder="e.g. AAPL · NVDA · SPY" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button className="btn btn-primary" style={{ width:'auto', padding:'12px 20px' }} onClick={handle}>Go</button>
      </div>

      {!data && !loading && (
        <div style={{ textAlign:'center', padding:'40px 0', color:G1 }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>⚙</div>
          <p style={{ fontSize:'0.86rem', lineHeight:1.9, maxWidth:300, margin:'0 auto' }}>Enter a ticker to get options strategies tailored to its current signal, RSI, P/E, and earnings calendar.</p>
          <div style={{ marginTop:20, display:'flex', justifyContent:'center', flexWrap:'wrap', gap:6 }}>
            {['AAPL','NVDA','SPY','TSLA','QQQ'].map(t=>(
              <button key={t} className="btn btn-ghost" style={{ padding:'6px 14px', width:'auto' }} onClick={()=>{setInput(t);fetch(t);setTicker(t)}}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {loading && <LoadingBar text={`Loading ${input}…`} />}
      {error && <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:10, padding:'12px 16px', fontSize:'0.84rem', color:RED, marginBottom:12 }}>{error}</div>}

      {data && result && (
        <TickerOptionsGuide
          ticker={ticker}
          result={result}
          price={data.quote?.c}
          ec={data.ec}
          metrics={data.metrics}
          candles={data.candles}
        />
      )}

      {/* General section always visible */}
      <SectionHeader>Key Rules — Always Apply</SectionHeader>
      <div className="card" style={{ padding:'0 16px' }}>
        {[
          ['Never buy calls the week before earnings', 'IV is at its peak. After the announcement, IV collapses regardless of direction (IV crush). You can be right and still lose money.'],
          ['Buy low IV, not high IV', 'Options are insurance. Buy insurance when it\'s cheap, not after the fire. Check IV vs its 52-week range on a platform like ThinkorSwim.'],
          ['50% stop-loss on premium', 'If you paid $300 for a contract, set a mental stop at $150. Cut losers fast. Options can go to zero — stocks rarely do.'],
          ['30-45 DTE sweet spot', 'Short enough that moves matter, long enough that theta hasn\'t destroyed you. Avoid weekly options unless you\'re advanced.'],
          ['1 contract = 100 shares', 'A $3 premium costs $300. This gets expensive fast. Size down. Starting out, trade 1-2 contracts maximum.'],
        ].map(([t,d],i)=>(
          <div key={t} style={{ padding:'12px 0', borderBottom: i<4?`1px solid ${G4}`:'none' }}>
            <div style={{ fontWeight:600, fontSize:'0.84rem', marginBottom:4 }}>📍 {t}</div>
            <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.7 }}>{d}</div>
          </div>
        ))}
      </div>

      <div style={{ height:16 }} />
    </div>
    </PullToRefresh>
  )
}
