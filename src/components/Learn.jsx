import React, { useState, useMemo } from 'react'
import { EDUCATION, GLOSSARY, MACRO } from '../utils/constants.js'

const GREEN='#00C805'; const YELLOW='#FFD700'; const CYAN='#00E5FF'; const RED='#FF5000'
const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function DCACalc() {
  const [monthly, setMonthly] = useState(500)
  const [years, setYears] = useState(10)
  const [rate, setRate] = useState(10)
  const [lump, setLump] = useState(0)

  const result = useMemo(() => {
    const r = rate / 100 / 12
    const n = years * 12
    const fvMonthly = r > 0 ? monthly * ((Math.pow(1 + r, n) - 1) / r) : monthly * n
    const fvLump = lump * Math.pow(1 + rate / 100, years)
    const total = fvMonthly + fvLump
    const invested = monthly * n + lump
    return { total, invested, gains: total - invested, multiplier: total / Math.max(invested, 1) }
  }, [monthly, years, rate, lump])

  const yearData = useMemo(() => Array.from({ length: years }, (_, i) => {
    const yr = i + 1; const r = rate / 100 / 12; const n = yr * 12
    const fvM = r > 0 ? monthly * ((Math.pow(1 + r, n) - 1) / r) : monthly * n
    const fvL = lump * Math.pow(1 + rate / 100, yr)
    return { yr, total: fvM + fvL, invested: monthly * n + lump }
  }), [monthly, years, rate, lump])

  const maxVal = Math.max(...yearData.map(d => d.total), 1)
  const fmt = v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`

  return (
    <div className="fade-up">
      <div style={{ background:'rgba(0,200,5,0.04)', border:'1px solid rgba(0,200,5,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:GREEN, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>Dollar-Cost Averaging Calculator</div>
        <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.7 }}>Model how regular investing compounds over time. Adjust amounts, timeframe, and expected return.</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        {[
          ['Monthly ($)', monthly, v => setMonthly(Math.max(0,v)), 50],
          ['Lump Sum ($)', lump, v => setLump(Math.max(0,v)), 1000],
          ['Years', years, v => setYears(Math.max(1,Math.min(40,v))), 1],
          ['Ann. Return (%)', rate, v => setRate(Math.max(1,Math.min(30,v))), 1],
        ].map(([label, val, setter, step]) => (
          <div key={label}>
            <div className="input-label">{label}</div>
            <input className="input" type="number" value={val} step={step}
              onChange={e => setter(+e.target.value || 0)} />
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        <div style={{ background:G2, border:'1px solid rgba(0,200,5,0.3)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:4 }}>FINAL VALUE</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800, color:GREEN, letterSpacing:-1 }}>{fmt(result.total)}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, marginTop:4 }}>{result.multiplier.toFixed(1)}× your investment</div>
        </div>
        <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px' }}>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:2 }}>INVESTED</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.92rem', color:'#fff', fontWeight:600 }}>{fmt(result.invested)}</div>
          </div>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:2 }}>MARKET GAINS</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.92rem', color:GREEN, fontWeight:600 }}>+{fmt(result.gains)}</div>
          </div>
        </div>
      </div>
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:10, letterSpacing:'0.5px' }}>GROWTH OVER TIME</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:88 }}>
          {yearData.map(d => {
            const h = Math.max(Math.round((d.total / maxVal) * 88), 2)
            const ih = Math.max(Math.round((d.invested / maxVal) * 88), 2)
            return (
              <div key={d.yr} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height:88 }}>
                <div style={{ height:h, background:`linear-gradient(to top, ${GREEN}90, ${GREEN}30)`, borderRadius:'2px 2px 0 0', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:Math.min(ih, h), background:'rgba(0,229,255,0.3)' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr 1</span>
          {years >= 4 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr {Math.ceil(years/2)}</span>}
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr {years}</span>
        </div>
        <div style={{ display:'flex', gap:14, marginTop:8 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:GREEN }}>▌ Total value</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:CYAN }}>▌ Amount invested</span>
        </div>
      </div>
      <div style={{ fontSize:'0.72rem', color:G1, lineHeight:1.7, background:G2, border:`1px solid ${G4}`, borderRadius:10, padding:'10px 14px' }}>
        📊 Assumes {rate}% annualised return. S&P 500 historical average ~10%/yr. Past performance ≠ future results. Educational only, not financial advice.
      </div>
    </div>
  )
}

function TopicCard({ topic }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, marginBottom:8, overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'14px 16px', background:'transparent', border:'none', color:'#fff', cursor:'pointer', textAlign:'left', gap:8, WebkitTapHighlightColor:'transparent' }}>
        <span style={{ fontWeight:600, fontSize:'0.86rem', lineHeight:1.4, flex:1 }}>{topic.title}</span>
        <span style={{ color:G1, fontSize:'0.8rem', flexShrink:0, marginTop:2 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${G4}` }}>
          <div style={{ fontSize:'0.8rem', color:G1, lineHeight:1.8, marginTop:12 }}>{topic.body}</div>
          {topic.links?.length > 0 && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:CYAN, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Go deeper</div>
              {topic.links.map(([label, url]) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 0', borderBottom:`1px solid ${G4}`, fontSize:'0.76rem', color:'#fff', textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
                  <span style={{ color:CYAN, fontSize:'0.7rem', flexShrink:0 }}>↗</span>
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MacroView() {
  return (
    <div className="fade-up">
      <div style={{ background:'rgba(0,229,255,0.04)', border:'1px solid rgba(0,229,255,0.2)', borderRadius:14, padding:'18px 20px', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:CYAN, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Current Regime</div>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', letterSpacing:-0.5, marginBottom:10 }}>{MACRO.regime}</div>
        <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.8 }}>{MACRO.summary}</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        <div style={{ background:'rgba(0,200,5,0.04)', border:'1px solid rgba(0,200,5,0.2)', borderRadius:12, padding:'14px' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:GREEN, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>Tailwinds ↑</div>
          {MACRO.tailwinds.map(([name, desc]) => (
            <div key={name} style={{ marginBottom:10 }}>
              <div style={{ fontWeight:600, fontSize:'0.76rem', marginBottom:2 }}>{name}</div>
              <div style={{ fontSize:'0.7rem', color:G1, lineHeight:1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{ background:'rgba(255,80,0,0.04)', border:'1px solid rgba(255,80,0,0.2)', borderRadius:12, padding:'14px' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:RED, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>Headwinds ↓</div>
          {MACRO.headwinds.map(([name, desc]) => (
            <div key={name} style={{ marginBottom:10 }}>
              <div style={{ fontWeight:600, fontSize:'0.76rem', marginBottom:2 }}>{name}</div>
              <div style={{ fontSize:'0.7rem', color:G1, lineHeight:1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>PULSE 6-Factor Model</div>
        {[
          ['Momentum (20%)', 'Price momentum: 1-day, 1-month, 3-month + RSI-14'],
          ['Trend (15%)', 'Price vs 50-day moving average'],
          ['Valuation (20%)', 'P/E ratio vs market norms (~20× average)'],
          ['Sentiment (15%)', 'Credibility-weighted news (Tier 1–4 source scoring)'],
          ['Analyst (20%)', 'Wall Street consensus: Strong Buy / Buy / Hold / Sell'],
          ['Earnings (10%)', 'Historical EPS beat rate over last 4 quarters'],
        ].map(([name, desc], i) => (
          <div key={name} style={{ padding:'8px 0', borderBottom: i<5?`1px solid ${G4}`:'none' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:CYAN, marginBottom:2 }}>{name}</div>
            <div style={{ fontSize:'0.74rem', color:G1, lineHeight:1.6 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GlossaryView() {
  const [q, setQ] = useState('')
  const filtered = GLOSSARY.filter(([t]) => t.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <input className="input" value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search terms…" style={{ marginBottom:12 }} />
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:14, overflow:'hidden' }}>
        {filtered.length === 0 && <div style={{ padding:'24px', textAlign:'center', color:G1, fontSize:'0.82rem' }}>No terms match "{q}"</div>}
        {filtered.map(([term, def], i) => (
          <div key={term} style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?`1px solid ${G4}`:'none' }}>
            <div style={{ fontWeight:600, fontSize:'0.84rem', marginBottom:4 }}>{term}</div>
            <div style={{ fontSize:'0.76rem', color:G1, lineHeight:1.7 }}>{def}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const VIEWS = ['Guide', 'DCA Calc', 'Macro', 'Glossary']

export default function Learn() {
  const [view, setView] = useState('Guide')
  const [openSec, setOpenSec] = useState('Getting Started')

  return (
    <div className="page">
      <div style={{ display:'flex', gap:6, marginBottom:14, overflowX:'auto', paddingBottom:2, scrollbarWidth:'none' }}>
        {VIEWS.map(v => (
          <button key={v} className={`filter-chip ${view===v?'active':''}`}
            onClick={() => setView(v)}
            style={{ whiteSpace:'nowrap', flexShrink:0 }}>{v}</button>
        ))}
      </div>

      {view === 'Guide' && (
        <div className="fade-up">
          {Object.entries(EDUCATION).map(([sec, topics]) => (
            <div key={sec} style={{ marginBottom:10 }}>
              <button onClick={() => setOpenSec(s => s===sec?'':sec)}
                style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 16px', background:openSec===sec?'rgba(0,200,5,0.06)':G2, border:`1px solid ${openSec===sec?'rgba(0,200,5,0.25)':G4}`, borderRadius:12, color:'#fff', cursor:'pointer', textAlign:'left', WebkitTapHighlightColor:'transparent' }}>
                <span style={{ fontWeight:700, fontSize:'0.88rem' }}>{sec}</span>
                <span style={{ color:G1, fontSize:'0.8rem' }}>{openSec===sec?'▲':'▼'}</span>
              </button>
              {openSec === sec && (
                <div style={{ marginTop:6 }}>
                  {topics.map(t => <TopicCard key={t.title} topic={t} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'DCA Calc' && <DCACalc />}
      {view === 'Macro' && <MacroView />}
      {view === 'Glossary' && <GlossaryView />}

      <div style={{ height:16 }} />
    </div>
  )
}
