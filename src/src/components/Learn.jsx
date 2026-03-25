import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { fetchMacroLive, fetchQuote, fetchCandles } from '../hooks/useApi.js'
import { EDUCATION, GLOSSARY, MACRO } from '../utils/constants.js'

const GREEN='#00C805'; const YELLOW='#FFD700'; const CYAN='#00E5FF'; const RED='#FF5000'
const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'#fff', fontWeight:600 }}>{fmt ? fmt(value) : value}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width:'100%', accentColor:'#00C805', cursor:'pointer' }} />
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#555' }}>{fmt ? fmt(min) : min}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#555' }}>{fmt ? fmt(max) : max}</span>
      </div>
    </div>
  )
}

function DCACalc() {
  const [monthly, setMonthly] = useState(500)
  const [years,   setYears]   = useState(10)
  const [rate,    setRate]    = useState(10)
  const [lump,    setLump]    = useState(0)
  const [inflation, setInflation] = useState(3)
  const [scenario, setScenario] = useState('base') // conservative / base / aggressive

  const SCENARIOS = {
    conservative: { rate:6,  label:'Conservative', color:'#FFD700', note:'Bond-heavy / low risk — ~6%/yr' },
    base:         { rate:10, label:'Market Average', color:'#00C805', note:'S&P 500 historical avg — ~10%/yr' },
    aggressive:   { rate:14, label:'Aggressive',    color:'#00E5FF', note:'High growth / tech heavy — ~14%/yr' },
  }

  const activeRate = scenario === 'base' ? rate : SCENARIOS[scenario].rate

  const calc = (r, m, y, l) => {
    const rm = r / 100 / 12; const n = y * 12
    const fvM = rm > 0 ? m * ((Math.pow(1 + rm, n) - 1) / rm) : m * n
    const fvL = l * Math.pow(1 + r / 100, y)
    const total = fvM + fvL
    const invested = m * n + l
    const realRate = Math.max(0.001, (1 + r/100) / (1 + inflation/100) - 1)
    const fvMReal = realRate > 0 ? m * ((Math.pow(1+realRate/12, n)-1) / (realRate/12)) : m*n
    const fvLReal = l * Math.pow(1+realRate, y)
    const totalReal = fvMReal + fvLReal
    // Break-even year
    let breakEven = null
    for (let i = 1; i <= y; i++) {
      const ni = i * 12; const rmi2 = rm
      const ti = (rmi2 > 0 ? m*((Math.pow(1+rmi2,ni)-1)/rmi2) : m*ni) + l*Math.pow(1+r/100,i)
      const inv = m*ni + l
      if (ti > inv * 1.1 && !breakEven) breakEven = i
    }
    return { total, invested, gains:total-invested, multiplier:total/Math.max(invested,1), totalReal, breakEven }
  }

  const result = useMemo(() => calc(activeRate, monthly, years, lump), [activeRate, monthly, years, lump, inflation])

  // All 3 scenarios for comparison
  const scenarios = useMemo(() => ({
    conservative: calc(SCENARIOS.conservative.rate, monthly, years, lump),
    base:         calc(SCENARIOS.base.rate, monthly, years, lump),
    aggressive:   calc(SCENARIOS.aggressive.rate, monthly, years, lump),
  }), [monthly, years, lump, inflation])

  const yearData = useMemo(() => Array.from({ length: years }, (_, i) => {
    const yr = i + 1; const rm = activeRate/100/12; const n = yr*12
    const fvM = rm>0 ? monthly*((Math.pow(1+rm,n)-1)/rm) : monthly*n
    const fvL = lump * Math.pow(1+activeRate/100, yr)
    return { yr, total:fvM+fvL, invested:monthly*n+lump }
  }), [monthly, years, activeRate, lump])

  const maxVal = Math.max(...yearData.map(d => d.total), 1)
  const fmt  = v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`
  const fmtD = v => `$${v.toLocaleString()}`
  const fmtP = v => `${v}%`
  const fmtY = v => `${v} yr${v!==1?'s':''}`

  return (
    <div className="fade-up">
      <div style={{ background:'rgba(0,200,5,0.04)', border:'1px solid rgba(0,200,5,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:GREEN, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>DCA Calculator</div>
        <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.7 }}>Model how regular investing compounds. Includes inflation adjustment and 3 scenario comparison.</div>
      </div>

      {/* Scenario picker */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:16 }}>
        {Object.entries(SCENARIOS).map(([key, s]) => (
          <button key={key} onClick={() => setScenario(key)} style={{
            padding:'8px 6px', borderRadius:8, border:`1.5px solid ${scenario===key ? s.color : G4}`,
            background: scenario===key ? `${s.color}12` : G2,
            color: scenario===key ? s.color : G1,
            fontFamily:'var(--font-mono)', fontSize:'0.58rem', cursor:'pointer', textAlign:'center'
          }}>
            <div style={{ fontWeight:600 }}>{s.label}</div>
            <div style={{ fontSize:'0.52rem', marginTop:2, opacity:0.8 }}>{s.rate}%/yr</div>
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
        <Slider label="Monthly Investment" value={monthly} min={50} max={5000} step={50} onChange={setMonthly} fmt={fmtD} />
        <Slider label="Lump Sum (optional)" value={lump} min={0} max={50000} step={500} onChange={setLump} fmt={fmtD} />
        <Slider label="Time Horizon" value={years} min={1} max={40} step={1} onChange={setYears} fmt={fmtY} />
        {scenario === 'base' && <Slider label="Annual Return" value={rate} min={1} max={20} step={0.5} onChange={setRate} fmt={fmtP} />}
        <Slider label="Inflation Rate" value={inflation} min={0} max={8} step={0.5} onChange={setInflation} fmt={fmtP} />
      </div>

      {/* Results */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        <div style={{ background:G2, border:'1px solid rgba(0,200,5,0.3)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1, marginBottom:4 }}>NOMINAL VALUE</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800, color:GREEN, letterSpacing:-1 }}>{fmt(result.total)}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginTop:3 }}>{result.multiplier.toFixed(1)}× invested</div>
        </div>
        <div style={{ background:G2, border:'1px solid rgba(0,229,255,0.2)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1, marginBottom:4 }}>INFLATION-ADJ VALUE</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800, color:CYAN, letterSpacing:-1 }}>{fmt(result.totalReal)}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginTop:3 }}>in today's dollars</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
        <div className="metric-cell">
          <div className="metric-label">INVESTED</div>
          <div className="metric-value">{fmt(result.invested)}</div>
        </div>
        <div className="metric-cell">
          <div className="metric-label">GAINS</div>
          <div className="metric-value" style={{ color:GREEN }}>+{fmt(result.gains)}</div>
        </div>
        <div className="metric-cell">
          <div className="metric-label">BREAK-EVEN</div>
          <div className="metric-value">{result.breakEven ? `Yr ${result.breakEven}` : '—'}</div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px', marginBottom:14 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:10, letterSpacing:'0.5px' }}>GROWTH OVER TIME — {SCENARIOS[scenario]?.label || 'Custom'}</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:100 }}>
          {yearData.map(d => {
            const h  = Math.max(Math.round((d.total    / maxVal) * 100), 2)
            const ih = Math.max(Math.round((d.invested / maxVal) * 100), 2)
            return (
              <div key={d.yr} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height:100 }}>
                <div style={{ height:h, background:`linear-gradient(to top, ${GREEN}90, ${GREEN}30)`, borderRadius:'2px 2px 0 0', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, height:Math.min(ih,h), background:'rgba(0,229,255,0.3)' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr 1</span>
          {years >= 6 && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr {Math.ceil(years/2)}</span>}
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:G1 }}>Yr {years}</span>
        </div>
        <div style={{ display:'flex', gap:14, marginTop:6 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:GREEN }}>▌ Total</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:CYAN }}>▌ Invested</span>
        </div>
      </div>

      {/* Scenario comparison */}
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:G1, marginBottom:10, letterSpacing:'0.5px' }}>SCENARIO COMPARISON — FINAL VALUE AT YR {years}</div>
        {Object.entries(SCENARIOS).map(([key, s]) => {
          const sc = scenarios[key]
          const pct = sc.total / Math.max(scenarios.aggressive.total, 1)
          return (
            <div key={key} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:s.color }}>{s.label} ({s.rate}%)</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#fff' }}>{fmt(sc.total)}</div>
              </div>
              <div style={{ height:6, background:'#1A1A1A', borderRadius:3 }}>
                <div style={{ height:6, width:`${Math.round(pct*100)}%`, background:s.color, borderRadius:3, transition:'width 0.4s' }} />
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:G1, marginTop:2 }}>{s.note}</div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize:'0.72rem', color:G1, lineHeight:1.7, background:G2, border:`1px solid ${G4}`, borderRadius:10, padding:'10px 14px' }}>
        📊 Past performance ≠ future results. Inflation adjustment uses {inflation}%/yr. Educational only, not financial advice.
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
  const [macro, setMacro]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)
  const [liveRegime, setLiveRegime] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, spyQuote, spyCandles] = await Promise.all([
      fetchMacroLive(),
      fetchQuote('SPY'),
      fetchCandles('SPY', 260),
    ])
    setMacro(data)
    setLoaded(true)
    setLoading(false)

    // Compute live regime from SPY data
    if (spyQuote && spyCandles) {
      const price  = spyQuote.c
      const c      = spyCandles.closes
      const ma50   = spyCandles.ma50
      const ma200  = spyCandles.ma200
      const mom1d  = spyQuote.dp || 0
      const mom1m  = c.length >= 20 ? ((price / c[c.length - 20] - 1) * 100) : null
      const mom3m  = c.length >= 60 ? ((price / c[c.length - 60] - 1) * 100) : null
      const aboveMa50  = ma50  ? price > ma50  : null
      const aboveMa200 = ma200 ? price > ma200 : null

      let regime, riskColor
      if (aboveMa50 && aboveMa200 && mom3m > 5) {
        regime = 'Risk-On · Bull Market'; riskColor = '#00C805'
      } else if (aboveMa200 && mom3m > -5) {
        regime = 'Neutral · Consolidation'; riskColor = '#FFD700'
      } else if (!aboveMa200 || mom3m < -10) {
        regime = 'Risk-Off · Bear Market'; riskColor = '#FF5000'
      } else {
        regime = 'Transition · Watch Closely'; riskColor = '#FFD700'
      }
      const spyDisplay = `SPY $${price?.toFixed(0)} · 1d ${mom1d >= 0 ? '+' : ''}${mom1d.toFixed(1)}% · 3m ${mom3m != null ? (mom3m >= 0 ? '+' : '') + mom3m.toFixed(1) + '%' : '—'} · ${aboveMa50 ? '↑' : '↓'} MA50 · ${aboveMa200 ? '↑' : '↓'} MA200`
      setLiveRegime({ label: regime, color: riskColor, detail: spyDisplay })
    }
  }, [])

  useEffect(() => { load() }, [])

  const impactColor = (impact) => impact === 'High' ? RED : impact === 'Medium' ? YELLOW : G1

  return (
    <div className="fade-up">
      <div style={{ background:'rgba(0,229,255,0.04)', border:'1px solid rgba(0,229,255,0.2)', borderRadius:14, padding:'18px 20px', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:CYAN, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Current Regime · Live</div>
        {liveRegime ? (
          <>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', letterSpacing:-0.5, marginBottom:6, color: liveRegime.color }}>
              {liveRegime.label}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#888', marginBottom:10 }}>
              {liveRegime.detail}
            </div>
          </>
        ) : (
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', letterSpacing:-0.5, marginBottom:10 }}>
            {MACRO.regime}
          </div>
        )}
        <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.8 }}>{MACRO.summary}</div>
      </div>

      {/* Live economic calendar */}
      <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:CYAN, letterSpacing:1, textTransform:'uppercase' }}>📅 Economic Calendar — Live</div>
          <button onClick={load} style={{ background:'transparent', border:`1px solid ${G4}`, borderRadius:6, padding:'3px 8px', color:G1, fontFamily:'var(--font-mono)', fontSize:'0.55rem', cursor:'pointer' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
        {loading && !loaded ? (
          <div style={{ textAlign:'center', padding:'20px 0', color:G1, fontSize:'0.75rem' }}>Loading economic calendar…</div>
        ) : !macro?.events?.length ? (
          <div style={{ textAlign:'center', padding:'16px 0', color:G1, fontSize:'0.75rem' }}>
            {loaded ? 'No key events found' : 'Add FMP key to see live economic calendar'}
          </div>
        ) : macro.events.map((e, i) => (
          <div key={i} style={{ padding:'9px 0', borderBottom: i < macro.events.length-1 ? `1px solid ${G4}` : 'none', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.76rem', color: e.isPast ? G1 : '#fff', fontWeight: e.isPast ? 400 : 600, marginBottom:2 }}>{e.event}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1 }}>
                {new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'})}
                {e.actual != null && <span style={{ color:GREEN, marginLeft:8 }}>Actual: {e.actual}</span>}
                {e.estimate != null && <span style={{ color:G1, marginLeft:8 }}>Est: {e.estimate}</span>}
              </div>
            </div>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:impactColor(e.impact), flexShrink:0 }}>{e.impact}</span>
          </div>
        ))}
      </div>

      {/* Live sector performance */}
      {macro?.sectorData?.length > 0 && (
        <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:CYAN, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>📊 Sector Performance — This Week</div>
          {macro.sectorData.map((s, i) => {
            const pct   = s.change
            const color = pct > 0 ? GREEN : pct < 0 ? RED : G1
            const barW  = Math.min(Math.abs(pct) * 10, 100)
            return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <div style={{ fontSize:'0.72rem', color:'#fff' }}>{s.name}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
                </div>
                <div style={{ height:4, background:'#1A1A1A', borderRadius:2 }}>
                  <div style={{ height:4, width:`${barW}%`, background:color, borderRadius:2 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Yield Curve */}
      {macro?.yieldCurve && (
        <div style={{ background:G2, border:`1px solid ${macro.yieldCurve.inverted ? 'rgba(255,80,0,0.4)' : G4}`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:CYAN, letterSpacing:1, textTransform:'uppercase' }}>📈 US Treasury Yield Curve</div>
            {macro.yieldCurve.inverted && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:RED, background:'rgba(255,80,0,0.1)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:6, padding:'2px 8px' }}>⚠ INVERTED</div>
            )}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            {[['1Y', macro.yieldCurve.y1],['2Y', macro.yieldCurve.y2],['5Y', macro.yieldCurve.y5],['10Y', macro.yieldCurve.y10],['30Y', macro.yieldCurve.y30]].map(([label, val]) => (
              <div key={label} style={{ textAlign:'center', flex:1 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:YELLOW }}>{val ? val.toFixed(2) + '%' : '—'}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem', color:'#666', marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color: macro.yieldCurve.spread10_2 < 0 ? RED : G1, marginTop:4 }}>
            10Y−2Y spread: {macro.yieldCurve.spread10_2 > 0 ? '+' : ''}{macro.yieldCurve.spread10_2?.toFixed(2)}%
            {macro.yieldCurve.inverted ? ' — Yield curve inverted, historically precedes recession' : ' — Normal curve'}
          </div>
        </div>
      )}

      {/* Economic Indicators */}
      {macro?.econData && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
          {Object.values(macro.econData).map(ind => {
            if (ind.value == null) return null
            const delta = ind.prev != null ? ind.value - ind.prev : null
            const isGood = ind.label === 'GDP Growth' ? ind.value > 2 : ind.label === 'Unemployment' ? ind.value < 4.5 : ind.value < 3
            return (
              <div key={ind.label} style={{ background:G2, border:`1px solid ${G4}`, borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#888', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>{ind.label}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:700, color: isGood ? GREEN : RED }}>{ind.value.toFixed(1)}{ind.unit}</div>
                {delta != null && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: delta > 0 ? (ind.label === 'Unemployment' ? RED : GREEN) : (ind.label === 'Unemployment' ? GREEN : RED), marginTop:2 }}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}{ind.unit} vs prev</div>}
              </div>
            )
          })}
        </div>
      )}

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
