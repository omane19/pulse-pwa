import React, { useState, useCallback } from 'react'
import { fetchTickerFull, hasKeys } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { UNIVERSE, TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, FactorBars, LoadingBar } from './shared.jsx'

const ALL_CATS = Object.keys(UNIVERSE)
const VERDICTS = ['BUY', 'HOLD', 'AVOID']
const G1='#B2B2B2'; const G4='#252525'; const GREEN='#00C805'; const RED='#FF5000'; const CYAN='#00E5FF'

export default function Screener() {
  const [selCats, setSelCats] = useState(['Mega-Cap', 'AI & Cloud'])
  const [verdictFilter, setVerdictFilter] = useState(['BUY', 'HOLD', 'AVOID'])  // default ALL
  const [peMax, setPeMax] = useState(100)  // default 100 = show all
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressTicker, setProgressTicker] = useState('')
  const [ran, setRan] = useState(false)
  const [apiError, setApiError] = useState(null)

  const toggleCat = (cat) => setSelCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  const toggleVerdict = (v) => setVerdictFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  const runScreener = useCallback(async () => {
    const k = hasKeys()
    if (!k.fh) {
      setApiError('Finnhub API key missing. Go to the Setup tab to configure your API keys.')
      return
    }
    setApiError(null)
    const tickers = [...new Set(selCats.flatMap(c => UNIVERSE[c] || []))]
    if (!tickers.length) return
    setLoading(true); setProgress(0); setResults([]); setRan(false)

    const out = []
    const BATCH = 5
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      setProgressTicker(batch[0])
      const batchResults = await Promise.all(batch.map(fetchTickerFull))
      for (const data of batchResults) {
        if (!data) continue
        const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings)
        const cat = selCats.find(c => UNIVERSE[c]?.includes(data.ticker)) || 'Other'
        out.push({ ...data, result, category: cat })
      }
      setProgress(Math.round(Math.min(i + BATCH, tickers.length) / tickers.length * 100))
    }

    out.sort((a, b) => b.result.pct - a.result.pct)
    setResults(out); setLoading(false); setRan(true)
  }, [selCats])

  const filtered = results.filter(r => {
    if (!verdictFilter.includes(r.result.verdict)) return false
    if (peMax < 100 && r.result.pe && r.result.pe > peMax) return false
    return true
  })

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="page">
      {/* Category chips */}
      <div className="sh">Categories to scan</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        {ALL_CATS.map(cat => (
          <button key={cat} className={`filter-chip ${selCats.includes(cat) ? 'active' : ''}`} onClick={() => toggleCat(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="sh">Filters (applied after scan)</div>
      <div style={{ marginBottom:10 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          {VERDICTS.map(v => (
            <button key={v} className={`filter-chip ${verdictFilter.includes(v) ? 'active' : ''}`}
              style={{ flex:1, justifyContent:'center' }}
              onClick={() => toggleVerdict(v)}>{v}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span className="input-label" style={{ margin:0, whiteSpace:'nowrap' }}>Max P/E</span>
          <input type="range" min={10} max={100} step={5} value={peMax}
            onChange={e => setPeMax(+e.target.value)}
            style={{ flex:1, accentColor:'#00C805' }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:G1, minWidth:36, textAlign:'right' }}>
            {peMax >= 100 ? 'Any' : `≤${peMax}×`}
          </span>
        </div>
      </div>

      <button className="btn btn-primary" onClick={runScreener} disabled={loading || !selCats.length} style={{ marginBottom: apiError ? 10 : 16 }}>
        {loading ? `Scanning ${progress}% · ${progressTicker}…` : `Scan ${[...new Set(selCats.flatMap(c => UNIVERSE[c] || []))].length} tickers →`}
      </button>

      {apiError && (
        <div style={{ background: 'rgba(255,80,0,0.08)', border: '1px solid rgba(255,80,0,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: RED, marginBottom: 4, letterSpacing: 1 }}>⚠ API KEY REQUIRED</div>
          <div style={{ fontSize: '0.8rem', color: '#B2B2B2' }}>{apiError}</div>
        </div>
      )}

      {loading && <LoadingBar progress={progress} text={`Parallel scan · ${progress}%`} />}

      {ran && !loading && (
        <>
          {/* Summary row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
            {[['Scanned', results.length], ['Shown', filtered.length],
              ['BUY', results.filter(r => r.result.verdict === 'BUY').length],
              ['Top', filtered[0]?.ticker || '—']].map(([l, v]) => (
              <div key={l} className="metric-cell">
                <div className="metric-label">{l}</div>
                <div className="metric-value">{v}</div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign:'center', color:G1, padding:'32px 16px', fontSize:'0.86rem', background:'#111', border:`1px solid ${G4}`, borderRadius:14 }}>
              {results.length === 0
                ? <>No data returned from scan.<br /><span style={{ fontSize:'0.76rem', marginTop:6, display:'block' }}>Check your API key is valid, then try again. If market is closed, some tickers may have limited data.</span></>
                : <>No results match current filters.<br /><span style={{ fontSize:'0.76rem', marginTop:6, display:'block' }}>Try: select all verdict types, set Max P/E to Any, or add more categories.</span></>
              }
            </div>
          )}

          {filtered.slice(0, 25).map((item, idx) => {
            const r = item.result; const c = r.color
            const price = item.quote?.c; const chg = item.quote?.dp || 0
            const name = item.name || TICKER_NAMES[item.ticker] || item.ticker
            return (
              <div className="rank-card fade-up" key={item.ticker}>
                <div className="rank-header">
                  <span className="rank-medal">{medals[idx] || `#${idx + 1}`}</span>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div className="rank-ticker">{item.ticker}</div>
                    <div className="rank-name">{name.slice(0, 28)} · {item.category}</div>
                  </div>
                  {price && (
                    <div className="rank-price-block">
                      <div className="rank-price">${price.toFixed(2)}</div>
                      <div className={`rank-chg ${chg >= 0 ? 'pos' : 'neg'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</div>
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                  <VerdictPill verdict={r.verdict} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:c }}>Signal {r.pct.toFixed(0)}/100</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.61rem', color:G1 }}>Conv {r.conviction.toFixed(0)}%</span>
                  {r.pe && <span style={{ fontSize:'0.64rem', color:G1 }}>P/E {r.pe.toFixed(1)}×</span>}
                  {item.mcap && <span style={{ fontSize:'0.64rem', color:G1 }}>{fmtMcap(item.mcap)}</span>}
                </div>

                <SignalBar pct={r.pct} color={c} />
                <FactorBars scores={r.scores} />

                <div className="rank-tags">
                  {r.mom?.['3m'] > 10 && <span className="tag">📈 Momentum</span>}
                  {r.pe && r.pe < 15 && <span className="tag">💰 Value</span>}
                  {r.scores.analyst > 0.4 && <span className="tag">⭐ Analysts</span>}
                  {r.conviction > 70 && <span className="tag">🎯 High Conv</span>}
                  {['AI & Cloud','Growth'].includes(item.category) && <span className="tag">🚀 Growth</span>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {!ran && !loading && (
        <div style={{ textAlign:'center', color:G1, padding:'48px 0', fontSize:'0.86rem' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'4rem', color:'#1A1A1A', marginBottom:12 }}>≡</div>
          Select categories above and tap <b style={{ color:GREEN }}>Scan</b>.<br />
          <span style={{ fontSize:'0.76rem', display:'block', marginTop:8 }}>
            Runs 5 tickers at a time in parallel — ~5× faster than sequential
          </span>
        </div>
      )}

      <div style={{ height:16 }} />
    </div>
  )
}
