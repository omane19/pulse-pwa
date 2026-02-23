import React, { useState, useEffect } from 'react'
import { useTickerData } from '../hooks/useApi.js'
import { scoreAsset } from '../utils/scoring.js'
import { OPTIONS_EDUCATION } from '../utils/constants.js'
import { LoadingBar, EarningsWarning } from './shared.jsx'

function StrategyCard({ s, price }) {
  const strike_call = price ? (price * 1.08).toFixed(1) : '—'
  const strike_put  = price ? (price * 0.93).toFixed(1) : '—'
  const exp60 = new Date(Date.now()+60*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  return (
    <div style={{ background:'#111', border:`1px solid ${s.color}22`, borderTop:`3px solid ${s.color}`, borderRadius:14, padding:18, marginBottom:12 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:s.color, marginBottom:14 }}>{s.name}</div>
      {[
        ['When to use', s.when, s.color],
        ['Avoid when',  s.avoid, '#FF5000'],
        ['Entry',       s.entry.replace('AAPL at $180', price ? `at $${price.toFixed(2)}` : 'at current price'), '#B2B2B2'],
        ['Exit — Profit', s.exit_profit, '#00C805'],
        ['Exit — Loss',   s.exit_loss,   '#FF5000'],
        ['Max loss',      s.max_loss,    '#B2B2B2'],
        ['Example',       s.example,     '#B2B2B2'],
      ].map(([k,v,c]) => (
        <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, padding:'8px 0', borderBottom:'1px solid #1A1A1A', fontSize:'0.81rem' }}>
          <span style={{ color:'#B2B2B2', flexShrink:0, minWidth:100 }}>{k}</span>
          <span style={{ color:c, textAlign:'right', fontFamily:k==='Example'?'var(--font-mono)':undefined, fontSize:k==='Example'?'0.75rem':undefined }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export default function OptionsGuide() {
  const [input, setInput] = useState('AAPL')
  const [ticker, setTicker] = useState('')
  const { data, loading, fetch } = useTickerData()
  const [result, setResult] = useState(null)
  const [view, setView] = useState('strategies')

  useEffect(() => {
    if (data) {
      const r = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings)
      setResult(r)
    }
  }, [data])

  const handleLoad = () => { const t = input.trim().toUpperCase(); setTicker(t); fetch(t) }

  const price  = data?.quote?.c
  const rsi    = result?.mom?.rsi
  const verdict = result?.verdict
  const conv   = result?.conviction
  const color  = result?.color || '#B2B2B2'

  const callOk  = verdict === 'BUY' && rsi && rsi < 65
  const putOk   = verdict === 'AVOID' || (rsi && rsi > 70)
  const ccOk    = verdict === 'HOLD' || verdict === 'AVOID'

  return (
    <div className="page">
      <div className="card card-accent-red" style={{ marginBottom:16 }}>
        <div style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'#FF5000', marginBottom:5 }}>⚠ Risk Disclaimer</div>
        <div style={{ fontSize:'0.81rem', color:'#B2B2B2', lineHeight:1.75 }}>
          ~75-80% of retail options expire worthless. This section is <b style={{ color:'#fff' }}>purely educational</b>. Options are not suitable for all investors. Read the study guide before trading.
        </div>
      </div>

      {/* Ticker loader */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <input className="input" value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&handleLoad()}
          placeholder="Load ticker for live signal… AAPL" autoCapitalize="characters" autoCorrect="off" />
        <button className="btn btn-primary" style={{ width:'auto', padding:'12px 18px' }} onClick={handleLoad}>Load</button>
      </div>

      {loading && <LoadingBar text={`Loading ${input}…`} />}

      {data && result && (
        <>
          <EarningsWarning ec={data.ec} />
          {/* Signal dashboard */}
          <div style={{ background:'#111', border:'1px solid #252525', borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'#B2B2B2' }}>{ticker} · ${price?.toFixed(2)}</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:700, color }}>
                  {verdict} · {result.pct.toFixed(0)}/100
                </div>
              </div>
              <div style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'#B2B2B2' }}>
                <div>RSI {rsi ?? '—'}</div>
                <div>Conviction {conv?.toFixed(0)}%</div>
              </div>
            </div>
            {/* Go / No-go grid */}
            {[
              ['Buy Call now?',    callOk ? '✅ Conditions met' : '❌ Not ideal',    callOk ? '#00C805' : '#FF5000',
               callOk ? 'BUY signal + RSI has room' : (rsi>70 ? 'RSI overbought — wait for pullback' : 'Signal is not BUY')],
              ['Buy Put now?',     putOk  ? '✅ Conditions met' : '❌ Not ideal',    putOk  ? '#00C805' : '#FF5000',
               putOk  ? 'AVOID/overbought signal supports bearish bet' : 'Signal is not bearish'],
              ['Covered Call now?',ccOk   ? '✅ Good environment' : '⚠ Strong BUY — may cap gains', ccOk ? '#00C805' : '#FFD700',
               ccOk   ? 'Flat/HOLD signal — collect income' : 'Strong signal may rocket above your strike'],
            ].map(([k,v,c,note])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid #1A1A1A', fontSize:'0.81rem', gap:8 }}>
                <span style={{ color:'#B2B2B2' }}>{k}</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ color:c, fontWeight:600 }}>{v}</div>
                  <div style={{ color:'#B2B2B2', fontSize:'0.7rem', marginTop:2 }}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* View switcher */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {[['strategies','Strategies'],['basics','How Options Work'],['rules','6 Golden Rules']].map(([k,l])=>(
          <button key={k} className={`filter-chip ${view===k?'active':''}`} onClick={()=>setView(k)}>{l}</button>
        ))}
      </div>

      {/* Strategies */}
      {view === 'strategies' && OPTIONS_EDUCATION.strategies.map(s=>(
        <StrategyCard key={s.name} s={s} price={price} />
      ))}

      {/* Basics Q&A */}
      {view === 'basics' && (
        <div className="card" style={{ padding:'0 18px' }}>
          {OPTIONS_EDUCATION.basics.map((item,i) => (
            <div key={i} style={{ padding:'14px 0', borderBottom: i<OPTIONS_EDUCATION.basics.length-1 ? '1px solid #1A1A1A' : 'none' }}>
              <div style={{ fontWeight:600, fontSize:'0.88rem', color:'#fff', marginBottom:7 }}>{item.q}</div>
              <div style={{ fontSize:'0.82rem', color:'#B2B2B2', lineHeight:1.8 }}>{item.a}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rules */}
      {view === 'rules' && OPTIONS_EDUCATION.rules.map((r,i)=>(
        <div key={i} className="card" style={{ borderLeft:'3px solid #FFD700' }}>
          <div style={{ fontWeight:600, fontSize:'0.88rem', color:'#FFD700', marginBottom:6 }}>Rule {i+1}: {r.title}</div>
          <div style={{ fontSize:'0.82rem', color:'#B2B2B2', lineHeight:1.8 }}>{r.body}</div>
        </div>
      ))}

      <div style={{ height:16 }} />
    </div>
  )
}
