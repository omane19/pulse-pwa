import React, { useState, useCallback, useEffect } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { useNotifications } from '../hooks/useNotifications.js'
import { fetchTickerLite, fetchScore, fetchRating, fetchEarningsCalendar } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, LoadingBar, Toast, PullToRefresh } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const G1='#B2B2B2'; const G2='#111'; const G4='#252525'; const CYAN='#00E5FF'

/* ── Price alerts stored in localStorage ── */
const ALERTS_KEY = 'pulse_price_alerts_v1'
function loadAlerts() { try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '{}') } catch { return {} } }
function saveAlerts(a) { try { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)) } catch {} }

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
      {fmpRating && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:'rgba(0,229,255,0.1)',color:CYAN}}>{fmpRating}</div>}
      {piotroski!=null && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:piotroski>=7?'rgba(0,200,5,0.15)':piotroski>=4?'rgba(255,215,0,0.1)':'rgba(255,80,0,0.1)',color:piotroski>=7?GREEN:piotroski>=4?YELLOW:RED}}>P:{piotroski}</div>}
    </div>
  )
}

function AlertModal({ ticker, currentPrice, alerts, onSave, onClose }) {
  const existing = alerts[ticker]
  const [above, setAbove] = useState(existing?.above != null ? String(existing.above) : '')
  const [below, setBelow] = useState(existing?.below != null ? String(existing.below) : '')

  const save = () => {
    const a = {}
    const aboveVal = parseFloat(above)
    const belowVal = parseFloat(below)
    if (above && !isNaN(aboveVal) && aboveVal > 0) a.above = aboveVal
    if (below && !isNaN(belowVal) && belowVal > 0) a.below = belowVal
    onSave(ticker, Object.keys(a).length ? a : null)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#161616', border:`1px solid ${CYAN}40`, borderRadius:16, padding:20, width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:'0.72rem', color:CYAN, fontWeight:700, marginBottom:4, letterSpacing:0.5 }}>Price Alert — {ticker}</div>
        {currentPrice && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:G1, marginBottom:12 }}>Current: ${currentPrice.toFixed(2)}</div>}
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:'0.6rem', color:G1, marginBottom:4, letterSpacing:0.5 }}>ALERT WHEN PRICE GOES ABOVE ($)</div>
          <input className="input" value={above} onChange={e => setAbove(e.target.value)} type="number" min="0" step="any" placeholder={`e.g. ${currentPrice ? (currentPrice*1.1).toFixed(0) : '250'}`} />
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:'0.6rem', color:G1, marginBottom:4, letterSpacing:0.5 }}>ALERT WHEN PRICE DROPS BELOW ($)</div>
          <input className="input" value={below} onChange={e => setBelow(e.target.value)} type="number" min="0" step="any" placeholder={`e.g. ${currentPrice ? (currentPrice*0.9).toFixed(0) : '200'}`} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={save} style={{ flex:1 }}>Save Alert</button>
          {existing && (
            <button className="btn btn-danger" onClick={() => { onSave(ticker, null); onClose() }} style={{ flex:1 }}>Remove</button>
          )}
          <button className="btn" onClick={onClose} style={{ flex:1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EarningsCalendarRow({ ticker, ec }) {
  if (!ec) return null
  const daysAway = Math.round((new Date(ec.date) - new Date()) / 86400000)
  const isClose  = daysAway <= 7
  const color    = isClose ? YELLOW : G1
  return (
    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color, marginTop:3, display:'flex', alignItems:'center', gap:4 }}>
      {isClose && '⚡'}
      Earnings {daysAway === 0 ? 'TODAY' : daysAway === 1 ? 'tomorrow' : `in ${daysAway}d`}
      {ec.epsEstimate && ` · EPS est ${ec.epsEstimate > 0 ? '+' : ''}${ec.epsEstimate.toFixed(2)}`}
    </div>
  )
}

export default function Watchlist({ onNavigateToDive }) {
  const { list, add, remove } = useWatchlist()
  const { permission, requestPermission, scheduleWatchlistAlert, notify } = useNotifications()
  const [input, setInput]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [toast,  setToast]    = useState(null)
  const [alerts, setAlerts]   = useState(loadAlerts)
  const [alertFor, setAlertFor] = useState(null) // ticker being edited
  const [earnings, setEarnings] = useState({})   // { TICKER: ec object }

  const handleAdd = () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    add(t); setInput(''); setToast(`Added ${t}`)
  }

  useEffect(() => {
    if (list.length > 0) handleRefresh()
  }, []) // eslint-disable-line

  // Fetch upcoming earnings for all watchlist tickers (background)
  useEffect(() => {
    if (!list.length) return
    const fetchAll = async () => {
      const BATCH = 3
      const out = {}
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH)
        const results = await Promise.all(batch.map(t => fetchEarningsCalendar(t).then(ec => [t, ec])))
        results.forEach(([t, ec]) => { if (ec && ec.date) out[t] = ec })
      }
      setEarnings(out)
    }
    fetchAll()
  }, [list.join(',')]) // eslint-disable-line

  const handleRefresh = useCallback(async () => {
    if (!list.length) return
    setLoading(true); setProgress(0); setResults([])
    const out = []
    const BATCH = 5
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(fetchTickerLite))
      for (const data of batchResults) {
        if (!data) continue
        const ea=v=>Array.isArray(v)?v:[]
        const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, ea(data.news), data.rec, ea(data.earnings), undefined, { ticker: data.ticker, priceTarget: data.priceTarget, upgrades: ea(data.upgrades) })
        result.fmpRating = data.rating?.rating || null
        result.piotroski = data.score?.piotroski ?? null
        out.push({ ...data, result })
      }
      setProgress(Math.round(Math.min(i + BATCH, list.length) / list.length * 100))
    }
    const sorted = out.sort((a, b) => b.result.pct - a.result.pct)
    setResults(sorted)
    setLoading(false)

    // Check price alerts
    const currentAlerts = loadAlerts()
    for (const item of sorted) {
      const al = currentAlerts[item.ticker]
      const price = item.quote?.c
      if (!al || !price) continue
      if (al.above != null && price >= al.above) {
        notify(`📈 ${item.ticker} crossed $${al.above}`, `Current price: $${price.toFixed(2)}`, item.ticker)
      }
      if (al.below != null && price <= al.below) {
        notify(`📉 ${item.ticker} dropped below $${al.below}`, `Current price: $${price.toFixed(2)}`, item.ticker)
      }
    }

    const buySignals = out.filter(r => r?.result?.verdict === 'BUY').map(r => ({ ticker: r.ticker, verdict: 'BUY' }))
    if (buySignals.length > 0) scheduleWatchlistAlert(buySignals)
  }, [list, scheduleWatchlistAlert, notify])

  const saveAlert = (ticker, alertObj) => {
    const updated = { ...alerts }
    if (alertObj) updated[ticker] = alertObj
    else delete updated[ticker]
    setAlerts(updated)
    saveAlerts(updated)
    setToast(alertObj ? `🔔 Alert set for ${ticker}` : `🔕 Alert removed for ${ticker}`)
  }

  // Upcoming earnings banner — tickers with earnings in next 7 days
  const earningsThisWeek = list.filter(t => {
    const ec = earnings[t]
    if (!ec?.date) return false
    const days = Math.round((new Date(ec.date) - new Date()) / 86400000)
    return days >= 0 && days <= 7
  })

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={list.length > 0}>
    <div className="page">

      {/* Earnings this week banner */}
      {earningsThisWeek.length > 0 && (
        <div style={{ background:`${YELLOW}12`, border:`1px solid ${YELLOW}40`, borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
          <div style={{ fontSize:'0.6rem', fontWeight:700, color:YELLOW, letterSpacing:'1px', marginBottom:4 }}>⚡ EARNINGS THIS WEEK</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {earningsThisWeek.map(t => {
              const ec = earnings[t]
              const days = Math.round((new Date(ec.date) - new Date()) / 86400000)
              return (
                <span key={t} style={{ fontFamily:'var(--font-mono)', fontSize:'0.66rem', color:'#fff', background:G4, borderRadius:6, padding:'3px 8px', cursor:'pointer' }}
                  onClick={() => onNavigateToDive && onNavigateToDive(t)}>
                  {t} · {days === 0 ? 'Today' : `${days}d`}
                </span>
              )
            })}
          </div>
        </div>
      )}

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
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <button className="btn btn-primary" onClick={handleRefresh} disabled={loading} style={{ flex:1 }}>
              {loading ? `Scoring ${progress}%…` : `Score All (${list.length} tickers)`}
            </button>
            <button onClick={async () => {
              if (permission === 'granted') { setToast('🔔 Alerts already enabled'); return }
              const p = await requestPermission()
              setToast(p === 'granted' ? '🔔 Alerts ON' : '🔕 Blocked in browser settings')
            }} title="Enable alerts" style={{
              background: permission === 'granted' ? 'rgba(0,200,5,0.12)' : '#1a1a1a',
              border: `1px solid ${permission === 'granted' ? '#00C80550' : '#333'}`,
              color: permission === 'granted' ? '#00C805' : '#555', borderRadius: 10,
              padding: '0 14px', fontSize:'1rem', cursor:'pointer'
            }}>
              {permission === 'granted' ? '🔔' : '🔕'}
            </button>
          </div>

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
            const hasAlert = !!alerts[item.ticker]
            const ec = earnings[item.ticker]

            return (
              <div key={item.ticker}
                onClick={() => canDive && onNavigateToDive(item.ticker)}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  background:G2, border:`1px solid ${hasAlert ? YELLOW+'40' : G4}`, borderRadius:12,
                  padding:'12px 14px', marginBottom:8,
                  cursor: canDive ? 'pointer' : 'default',
                  WebkitTapHighlightColor:'transparent'
                }}>

                {hasResult && <ScoreBadge pct={r.pct} verdict={r.verdict} fmpRating={item.result?.fmpRating} piotroski={item.result?.piotroski} />}

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.82rem', color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
                    {item.ticker}
                    {hasAlert && <span style={{ fontSize:'0.6rem', color:YELLOW }}>🔔</span>}
                  </div>
                  <div style={{ fontSize:'0.68rem', color:G1, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                  {/* Earnings countdown */}
                  <EarningsCalendarRow ticker={item.ticker} ec={ec} />
                  {hasResult && (
                    <>
                      <div style={{ marginTop:4 }}>
                        <SignalBar pct={r.pct} color={r.color} height={3} />
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:3 }}>
                        {item.metrics?.pegRatio != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#888' }}>PEG {item.metrics.pegRatio.toFixed(2)}</span>}
                        {item.metrics?.fcfPerShare != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: item.metrics.fcfPerShare > 0 ? GREEN : RED }}>FCF ${item.metrics.fcfPerShare}</span>}
                        {item.metrics?.revenueGrowthYoY != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: item.metrics.revenueGrowthYoY > 0 ? GREEN : RED }}>{item.metrics.revenueGrowthYoY > 0 ? '+' : ''}{item.metrics.revenueGrowthYoY}% rev</span>}
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

                <div style={{ color:G1, fontSize:'0.7rem', flexShrink:0 }}>›</div>

                {/* Alert button */}
                <button
                  onClick={e => { e.stopPropagation(); setAlertFor(item.ticker) }}
                  title="Set price alert"
                  style={{ background: hasAlert ? `${YELLOW}15` : 'transparent', border:`1px solid ${hasAlert ? YELLOW+'50' : G4}`,
                    color: hasAlert ? YELLOW : '#555', borderRadius:8, padding:'5px 8px', fontSize:'0.7rem', cursor:'pointer', flexShrink:0 }}>
                  🔔
                </button>

                <button
                  className="btn btn-danger"
                  style={{ padding:'6px 10px', width:'auto', fontSize:'0.7rem', flexShrink:0 }}
                  onClick={e => { e.stopPropagation(); remove(item.ticker) }}>✕</button>
              </div>
            )
          })}
        </>
      )}

      {/* Alert modal */}
      {alertFor && (
        <AlertModal
          ticker={alertFor}
          currentPrice={results.find(r => r.ticker === alertFor)?.quote?.c || null}
          alerts={alerts}
          onSave={saveAlert}
          onClose={() => setAlertFor(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </PullToRefresh>
  )
}
