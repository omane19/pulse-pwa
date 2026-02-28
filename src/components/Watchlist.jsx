import React, { useState, useCallback, useEffect } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { fetchTickerLite, fetchScore, fetchRating } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, LoadingBar, Toast, PullToRefresh } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function ScoreBadge({ pct, verdict, fmpRating, piotroski }) {
  const color = verdict === 'BUY' ? GREEN : verdict === 'HOLD' ? YELLOW : RED
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flexShrink:0}}>
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        width:48, height:48, borderRadius:12,
        background:`${color}12`, border:`1.5px solid ${color}40`
      }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.9rem', fontWeight:700, color, lineHeight:1 }}>{Math.round(pct)}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.48rem', color, letterSpacing:1, marginTop:2 }}>{verdict}</div>
      </div>
      {fmpRating && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:'rgba(0,229,255,0.1)',color:'#00E5FF'}}>{fmpRating}</div>}
      {piotroski!=null && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:piotroski>=7?'rgba(0,200,5,0.15)':piotroski>=4?'rgba(255,215,0,0.1)':'rgba(255,80,0,0.1)',color:piotroski>=7?GREEN:piotroski>=4?YELLOW:RED}}>P:{piotroski}</div>}
    </div>
  )
}

export default function Watchlist({ onNavigateToDive }) {
  const { list, add, remove } = useWatchlist()
  const [input, setInput]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [toast, setToast]     = useState(null)

  const handleAdd = () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    add(t); setInput(''); setToast(`Added ${t}`)
  }

  // Auto-refresh on mount if watchlist has items
  useEffect(() => {
    if (list.length > 0) handleRefresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    if (!list.length) return
    setLoading(true); setProgress(0); setResults([])
    const out = []
    // Batch 5 at a time for speed
    const BATCH = 5
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(fetchTickerLite))
      for (const data of batchResults) {
        if (!data) continue
        const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings, undefined, { priceTarget: data.priceTarget, upgrades: data.upgrades || [] })
        // Attach score/rating to result for badge display
        result.fmpRating = data.rating?.rating || null
        result.piotroski = data.score?.piotroski ?? null
        out.push({ ...data, result })
      }
      setProgress(Math.round(Math.min(i + BATCH, list.length) / list.length * 100))
    }
    setResults(out.sort((a, b) => b.result.pct - a.result.pct))
    setLoading(false)
  }, [list])


  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={list.length > 0}>
    <div className="page">
      {/* Add input */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input className="input" value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add ticker… e.g. NVDA" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button className="btn btn-primary" style={{ width:'auto', padding:'12px 18px' }} onClick={handleAdd}>+</button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:G1 }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>👁</div>
          <p style={{ fontSize:'0.86rem', lineHeight:1.8 }}>Your watchlist is empty.<br />Add tickers above or from the Dive tab.</p>
        </div>
      ) : (
        <>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={loading} style={{ marginBottom:8 }}>
            {loading ? `Scoring ${progress}%…` : `Score All (${list.length} tickers)`}
          </button>

          {loading && <LoadingBar progress={progress} text={`Scoring watchlist… ${progress}%`} />}

          {/* Summary stats */}
          {results.length > 0 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {[
                ['Watching', list.length, null],
                ['BUY', results.filter(r => r.result.verdict === 'BUY').length, GREEN],
                ['HOLD', results.filter(r => r.result.verdict === 'HOLD').length, YELLOW],
                ['Avg Score', `${Math.round(results.reduce((s,r) => s + r.result.pct, 0) / results.length)}`, null],
              ].map(([l, v, c]) => (
                <div key={l} className="metric-cell" style={{ flex:1, minWidth:60 }}>
                  <div className="metric-label">{l}</div>
                  <div className="metric-value" style={c ? { color:c } : {}}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Ticker rows */}
          {(results.length ? results : list.map(t => ({ ticker:t }))).map((item) => {
            const hasResult = !!item.result
            const r = item.result
            const price = item.quote?.c
            const chg = item.quote?.dp || 0
            const name = item.name || TICKER_NAMES[item.ticker] || item.ticker
            const canDive = !!onNavigateToDive

            return (
              <div key={item.ticker}
                onClick={() => canDive && onNavigateToDive(item.ticker)}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  background:G2, border:`1px solid ${G4}`, borderRadius:12,
                  padding:'12px 14px', marginBottom:8,
                  cursor: canDive ? 'pointer' : 'default',
                  WebkitTapHighlightColor:'transparent'
                }}>

                {/* Score badge — shown after scoring */}
                {hasResult && <ScoreBadge pct={r.pct} verdict={r.verdict} fmpRating={item.result?.fmpRating} piotroski={item.result?.piotroski} />}

                {/* Ticker + name */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.82rem', color:'#fff' }}>{item.ticker}</div>
                  <div style={{ fontSize:'0.68rem', color:G1, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                  {hasResult && (
                    <>
                      <div style={{ marginTop:4 }}>
                        <SignalBar pct={r.pct} color={r.color} height={3} />
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:3 }}>
                        {item.metrics?.pegRatio != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#888' }}>PEG {item.metrics.pegRatio.toFixed(2)}</span>}
                        {item.metrics?.fcfPerShare != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: item.metrics.fcfPerShare > 0 ? '#00C805' : '#FF5000' }}>FCF ${item.metrics.fcfPerShare}</span>}
                        {item.metrics?.revenueGrowthYoY != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: item.metrics.revenueGrowthYoY > 0 ? '#00C805' : '#FF5000' }}>{item.metrics.revenueGrowthYoY > 0 ? '+' : ''}{item.metrics.revenueGrowthYoY}% rev</span>}
                      </div>
                    </>
                  )}
                </div>

                {/* Price */}
                {hasResult && price && (
                  <div style={{ textAlign:'right', flexShrink:0, marginRight:4 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'#fff', fontWeight:600 }}>${price.toFixed(2)}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color: chg >= 0 ? GREEN : RED, marginTop:2 }}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                    </div>
                  </div>
                )}

                {/* Dive arrow */}
                {canDive && (
                  <div style={{ color:G1, fontSize:'0.7rem', flexShrink:0 }}>›</div>
                )}

                {/* Remove button */}
                <button
                  className="btn btn-danger"
                  style={{ padding:'6px 10px', width:'auto', fontSize:'0.7rem', flexShrink:0 }}
                  onClick={e => { e.stopPropagation(); remove(item.ticker) }}>✕</button>
              </div>
            )
          })}
        </>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </PullToRefresh>
  )
}
