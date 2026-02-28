import React, { useState } from 'react'
import { fetchQuote, fetchCandles, fetchMetrics, fetchNews, fetchRec, fetchEarnings, fetchProfile } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { VerdictPill, FactorBars, LoadingBar , PullToRefresh } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const CYAN='#00E5FF'; const YELLOW='#FFD700'
const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

async function loadOne(ticker) {
  const [quote, candles, metrics, news, rec, earnings, profile] = await Promise.all([
    fetchQuote(ticker), fetchCandles(ticker,260), fetchMetrics(ticker),
    fetchNews(ticker,7), fetchRec(ticker), fetchEarnings(ticker), fetchProfile(ticker)
  ])
  if (!quote) return null
  const result = scoreAsset(quote, candles, candles?.ma50, metrics||{}, news||[], rec||{}, earnings||[], undefined, { priceTarget: null, upgrades: [] })
  return { ticker, quote, candles, metrics:metrics||{}, result, profile:profile||{},
    name: profile?.name || TICKER_NAMES[ticker] || ticker }
}

const CTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#111', border:'1px solid #252525', borderRadius:8, padding:'8px 12px', fontSize:'0.72rem', fontFamily:'var(--font-mono)' }}>
      <div style={{ color:G1, marginBottom:4 }}>{label}</div>
      {payload.map(p => <div key={p.name} style={{ color:p.color }}>{p.name}: {p.value > 0 ? '+' : ''}{p.value?.toFixed(2)}%</div>)}
    </div>
  )
}

export default function Compare() {
  const [ta, setTa] = useState('')
  const [tb, setTb] = useState('')
  const [data, setData] = useState([null, null])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    const tA = ta.trim().toUpperCase(); const tB = tb.trim().toUpperCase()
    if (!tA || !tB) { setError('Enter two valid tickers.'); return }
    if (tA === tB) { setError('Enter two different tickers.'); return }
    setLoading(true); setError(null); setData([null,null])
    const [dA, dB] = await Promise.all([loadOne(tA), loadOne(tB)])
    if (!dA || !dB) { setError('Could not load one or both tickers. Check they are valid US stocks or ETFs.'); setLoading(false); return }
    setData([dA, dB]); setLoading(false)
  }

  const quickSet = (x, y) => { setTa(x); setTb(y) }

  const [a, b] = data

  const chartData = (() => {
    if (!a?.candles || !b?.candles) return []
    const c0=a.candles.closes; const c1=b.candles.closes
    const t0=a.candles.timestamps
    const len=Math.min(c0.length, c1.length, 60)
    const s0=c0[c0.length-len]; const s1=c1[c1.length-len]
    if (!s0||!s1) return []
    return Array.from({length:len},(_,i)=>{
      const i0=c0.length-len+i; const i1=c1.length-len+i
      return {
        d: new Date(t0[i0]*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}),
        [a.ticker]: parseFloat(((c0[i0]/s0-1)*100).toFixed(2)),
        [b.ticker]: parseFloat(((c1[i1]/s1-1)*100).toFixed(2)),
      }
    }).filter((_,i)=>i%2===0)
  })()

  const gap = a&&b ? Math.abs(a.result.pct - b.result.pct) : 0
  const leader = a&&b ? (a.result.pct >= b.result.pct ? a : b) : null

  return (
    <PullToRefresh onRefresh={run} enabled={!!(a && b)}>
    <div className="page">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        <input className="input" value={ta} onChange={e=>setTa(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Ticker A" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <input className="input" value={tb} onChange={e=>setTb(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Ticker B" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </div>

      <button className="btn btn-primary" style={{ marginBottom:16 }} onClick={run} disabled={loading || !ta.trim() || !tb.trim()}>
        {loading ? 'Comparing…' : '⇄ Compare'}
      </button>

      {!a && !loading && !error && (
        <div style={{ textAlign:'center', padding:'48px 0', color:G1 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'4rem', color:'#1A1A1A', marginBottom:12 }}>⇄</div>
          <p style={{ fontSize:'0.86rem', lineHeight:2, maxWidth:280, margin:'0 auto' }}>Compare signals, performance, and fundamentals for any two US stocks or ETFs side by side.</p>
          <div style={{ marginTop:20, display:'flex', justifyContent:'center', flexWrap:'wrap', gap:6 }}>
            {[['AAPL','MSFT'],['NVDA','AMD'],['SPY','QQQ'],['GLD','TLT']].map(([x,y])=>(
              <button key={x+y} className="btn btn-ghost" style={{ padding:'6px 14px', width:'auto' }}
                onClick={()=>quickSet(x,y)}>{x} vs {y}</button>
            ))}
          </div>
        </div>
      )}

      {loading && <LoadingBar text="Comparing both tickers in parallel…" />}
      {error && <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:10, padding:'12px 16px', fontSize:'0.84rem', color:RED, marginBottom:12 }}>{error}</div>}

      {a && b && (
        <div className="fade-up">
          {/* Head-to-head */}
          <div style={{ background:`${leader.result.color}08`, border:`1px solid ${leader.result.color}25`, borderRadius:14, padding:'18px 20px', marginBottom:14, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Head-to-Head</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:700, color:leader.result.color }}>{leader.ticker} leads by {gap.toFixed(0)} points</div>
            <div style={{ fontSize:'0.78rem', color:G1, marginTop:6, lineHeight:1.7 }}>
              {gap<5?'Virtually tied — other factors should drive decision.':gap<15?'Meaningful gap. Favour the leader but both worth watching.':'Clear divergence. Strong preference for the leader.'}
            </div>
          </div>

          {/* Signal scores */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
            {[a,b].map(d=>(
              <div key={d.ticker} style={{ background:G2, border:`1px solid ${d.result.color}30`, borderRadius:14, padding:'16px', textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:800, color:d.result.color }}>{d.ticker}</div>
                <div style={{ fontSize:'0.68rem', color:G1, marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name?.slice?.(0,22)}</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'2.8rem', fontWeight:800, letterSpacing:-2, color:d.result.color, lineHeight:1 }}>{d.result.pct.toFixed(0)}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginBottom:8 }}>/100</div>
                <VerdictPill verdict={d.result.verdict} />
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <>
              <div className="sh">60-Day Normalised Return (Both Start at 0%)</div>
              <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:14, padding:'16px', marginBottom:12 }}>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={chartData} margin={{top:4,right:0,left:0,bottom:0}}>
                    <CartesianGrid stroke={G4} vertical={false} />
                    <XAxis dataKey="d" tick={{fontSize:9,fontFamily:'var(--font-mono)',fill:G1}} axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{fontSize:9,fontFamily:'var(--font-mono)',fill:G1}} tickFormatter={v=>`${v>0?'+':''}${v}%`} axisLine={false} tickLine={false} width={46} />
                    <Tooltip content={<CTip />} />
                    <Line type="monotone" dataKey={a.ticker} stroke={GREEN} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey={b.ticker} stroke={CYAN} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:8 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:GREEN }}>● {a.ticker}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:CYAN }}>● {b.ticker}</span>
                </div>
              </div>
            </>
          )}

          {/* Data quality note */}
          {(a?.result.mom?.['1m'] == null || b?.result.mom?.['1m'] == null) && (
            <div style={{ background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:'0.76rem', color:'#FFD700', lineHeight:1.7 }}>
              ⚠ 1-month and 3-month data showing "—" means candle data didn't load — likely a rate limit on simultaneous API calls. The signal scores ARE multi-factor (momentum, trend, valuation, sentiment, analyst, earnings). Try tapping Compare again in 30 seconds.
            </div>
          )}

          {/* Key metrics */}
          <div className="sh">Key Metrics Side-by-Side</div>
          <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:14, marginBottom:12, overflow:'hidden' }}>
            {/* Header */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'10px 14px', borderBottom:`1px solid ${G4}`, background:'#0A0A0A' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1 }}>Metric</div>
              {[a,b].map(d=><div key={d.ticker} style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:d.result.color, textAlign:'right', fontWeight:700 }}>{d.ticker}</div>)}
            </div>
            {[
              ['Price', d=>d.quote?.c?`$${d.quote.c.toFixed(2)}`:'—', null],
              ['Today', d=>d.quote?.dp!=null?`${d.quote.dp>=0?'+':''}${d.quote.dp.toFixed(2)}%`:'—', d=>d.quote?.dp>=0?GREEN:RED],
              ['1-Month', d=>d.result.mom?.['1m']!=null?`${d.result.mom['1m']>=0?'+':''}${d.result.mom['1m']}%`:'—', d=>d.result.mom?.['1m']>=0?GREEN:RED],
              ['3-Month', d=>d.result.mom?.['3m']!=null?`${d.result.mom['3m']>=0?'+':''}${d.result.mom['3m']}%`:'—', d=>d.result.mom?.['3m']>=0?GREEN:RED],
              ['RSI-14', d=>d.result.mom?.rsi??'—', d=>{const r=d.result.mom?.rsi;return r>70?RED:r<30?GREEN:G1}],
              ['P/E (TTM)', d=>d.result.pe?`${d.result.pe.toFixed(1)}×`:'—', d=>d.result.pe&&d.result.pe<20?GREEN:d.result.pe>35?RED:YELLOW],
              ['FMP Rating', d=>d.data?.rating?.rating||'—', d=>d.data?.rating?.ratingScore>=25?GREEN:d.data?.rating?.ratingScore>=15?YELLOW:RED],
              ['Piotroski', d=>d.data?.score?.piotroski!=null?`${d.data.score.piotroski}/9`:'—', d=>d.data?.score?.piotroski>=7?GREEN:d.data?.score?.piotroski>=4?YELLOW:RED],
              ['Altman Z', d=>d.data?.score?.altmanZ!=null?d.data.score.altmanZ.toFixed(2):'—', d=>d.data?.score?.altmanZ>=3?GREEN:d.data?.score?.altmanZ>=1.8?YELLOW:RED],
              ['DCF Value', d=>d.data?.dcf?.dcf?`$${d.data.dcf.dcf}`:'—', d=>d.data?.dcf?.upside>10?GREEN:d.data?.dcf?.upside<-10?RED:YELLOW],
              ['ESG Score', d=>d.data?.esg?.esgScore!=null?d.data.esg.esgScore.toFixed(0):'—', d=>d.data?.esg?.esgScore>60?GREEN:d.data?.esg?.esgScore<30?RED:YELLOW],
              ['Gross Margin', d=>d.metrics?.grossMargin!=null?`${d.metrics.grossMargin.toFixed(1)}%`:'—', d=>d.metrics?.grossMargin>40?GREEN:d.metrics?.grossMargin<20?RED:YELLOW],
              ['Net Margin', d=>d.metrics?.netMargin!=null?`${d.metrics.netMargin.toFixed(1)}%`:'—', d=>d.metrics?.netMargin>15?GREEN:d.metrics?.netMargin<5?RED:YELLOW],
              ['ROIC', d=>d.metrics?.roic!=null?`${d.metrics.roic.toFixed(1)}%`:'—', d=>d.metrics?.roic>15?GREEN:d.metrics?.roic<5?RED:YELLOW],
              ['EV/EBITDA', d=>d.metrics?.evEbitda?`${d.metrics.evEbitda.toFixed(1)}×`:'—', d=>d.metrics?.evEbitda<15?GREEN:d.metrics?.evEbitda>30?RED:YELLOW],
              ['PEG Ratio', d=>d.metrics?.pegRatio?`${d.metrics.pegRatio.toFixed(2)}×`:'—', d=>d.metrics?.pegRatio<1?GREEN:d.metrics?.pegRatio>2?RED:YELLOW],
              ['FCF/Share', d=>d.metrics?.fcfPerShare!=null?`$${d.metrics.fcfPerShare}`:'—', d=>d.metrics?.fcfPerShare>0?GREEN:d.metrics?.fcfPerShare<0?RED:null],
              ['Rev Growth', d=>d.metrics?.revenueGrowthYoY!=null?`${d.metrics.revenueGrowthYoY>0?'+':''}${d.metrics.revenueGrowthYoY}%`:'—', d=>d.metrics?.revenueGrowthYoY>10?GREEN:d.metrics?.revenueGrowthYoY<0?RED:YELLOW],
              ['50-Day MA', d=>d.candles?.ma50?`$${d.candles.ma50}`:'—', d=>d.quote?.c>d.candles?.ma50?GREEN:RED],
              ['200-Day MA', d=>d.candles?.ma200?`$${d.candles.ma200}`:'—', d=>d.quote?.c>d.candles?.ma200?GREEN:RED],
              ['Mkt Cap', d=>fmtMcap(d.profile?.marketCapitalization), null],
              ['Signal', d=>`${d.result.pct.toFixed(0)}/100`, d=>d.result.color],
            ].map(([l,fn,col],i)=>(
              <div key={l} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'9px 14px', borderBottom:i<8?`1px solid ${G4}`:'none', alignItems:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1 }}>{l}</div>
                {[a,b].map((d,j)=>{
                  const v=fn(d); const c=col?col(d):G1
                  return <div key={j} style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:c||G1, textAlign:'right' }}>{v}</div>
                })}
              </div>
            ))}
          </div>

          {/* Factor bars */}
          <div className="sh">6-Factor Breakdown</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {[a,b].map(d=>(
              <div key={d.ticker} style={{ background:G2, border:`1px solid ${G4}`, borderRadius:14, padding:'14px 16px' }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem', color:d.result.color, marginBottom:10 }}>{d.ticker}</div>
                <FactorBars scores={d.result.scores} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height:16 }} />
    </div>
    </PullToRefresh>
  )
}
