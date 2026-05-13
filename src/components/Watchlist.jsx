import React, { useState, useCallback, useEffect } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { useNotifications } from '../hooks/useNotifications.js'
import { fetchTickerLite, fetchScore, fetchRating, fetchEarningsCalendar, fetchMarketMovers, fetchRedditTopStocks, fetchSectorPerformance } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, LoadingBar, Toast, PullToRefresh } from './shared.jsx'
import MacroTicker from './MacroTicker.jsx'

const GREEN='#22c55e'; const RED='#ef4444'; const YELLOW='#f59e0b'; const G1='#888'; const G2='#0d0d0d'; const G4='#1e1e1e'; const DIM='#444'

/* ── Price alerts stored in localStorage ── */
const ALERTS_KEY = 'pulse_price_alerts_v1'
function loadAlerts() { try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '{}') } catch { return {} } }
function saveAlerts(a) { try { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)) } catch {} }

/* ── Watchlist metadata: add price + add date ── */
const META_KEY = 'pulse_wl_meta_v1'
function loadMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') } catch { return {} } }
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch {} }

/* ── Score history: previous PULSE score per ticker ── */
const SCORE_KEY = 'pulse_score_hist_v1'
function loadScoreHist() { try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '{}') } catch { return {} } }
function saveScoreHist(h) { try { localStorage.setItem(SCORE_KEY, JSON.stringify(h)) } catch {} }

/* ── Sector Performance strip ── */
function SectorRow({ sectors }) {
  if (!sectors.length) return null
  return (
    <div style={{
      margin: '0 -16px',
      display: 'flex',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
      borderBottom: '1px solid #111',
      borderTop: '1px solid #111',
      background: '#080808',
    }}>
      {sectors.map(({ s, l, changePct }) => {
        const clr = changePct == null ? '#333' : changePct > 0 ? GREEN : changePct < 0 ? RED : '#333'
        return (
          <div key={s} style={{ flexShrink: 0, padding: '8px 12px', borderRight: '1px solid #111', minWidth: 76, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: '#3a3a3a', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: clr, fontWeight: 600 }}>
              {changePct == null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Market Movers compact ── */
function MoversCard({ movers, onNavigate }) {
  if (!movers) return null
  const { gainers = [], losers = [] } = movers
  if (!gainers.length && !losers.length) return null
  const top5g = gainers.slice(0, 5)
  const top5l = losers.slice(0, 5)

  const MoverRow = ({ item, isGainer }) => (
    <div
      onClick={() => onNavigate && onNavigate(item.ticker)}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', borderBottom: '1px solid #0e0e0e' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ddd', fontWeight: 700 }}>{item.ticker}</span>
        {item.price != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#555', marginLeft: 5 }}>${item.price.toFixed(2)}</span>}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: isGainer ? GREEN : RED, fontWeight: 700, flexShrink: 0 }}>
        {item.changePct != null ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(1)}%` : '—'}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
      <div style={{ flex: 1, background: G2, border: '1px solid #161616', borderRadius: 10, padding: '12px 12px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: DIM, letterSpacing: '1.2px', marginBottom: 8, textTransform: 'uppercase' }}>Top Gainers</div>
        {top5g.map(item => <MoverRow key={item.ticker} item={item} isGainer />)}
      </div>
      <div style={{ flex: 1, background: G2, border: '1px solid #161616', borderRadius: 10, padding: '12px 12px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: DIM, letterSpacing: '1.2px', marginBottom: 8, textTransform: 'uppercase' }}>Top Losers</div>
        {top5l.map(item => <MoverRow key={item.ticker} item={item} isGainer={false} />)}
      </div>
    </div>
  )
}

/* ── Reddit Buzz compact leaderboard ── */
function RedditBuzzCard({ top, onNavigate }) {
  const [showAll, setShowAll] = React.useState(false)
  if (!top.length) return null
  const maxM = top[0]?.mentions || 1
  const list = showAll ? top : top.slice(0, 10)

  return (
    <div style={{ background: G2, border: '1px solid #161616', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 600, color: DIM, letterSpacing: '1.2px', marginBottom: 10, textTransform: 'uppercase' }}>
        Reddit Trending
      </div>
      {list.map((item, i) => {
        const barW = Math.max(4, Math.round((item.mentions / maxM) * 100))
        const delta = item.mentions_24h_ago != null ? item.mentions - item.mentions_24h_ago : null
        return (
          <div
            key={item.ticker}
            onClick={() => onNavigate && onNavigate(item.ticker)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 0', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              borderBottom: i < list.length - 1 ? '1px solid #0e0e0e' : 'none',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: i < 3 ? '#888' : '#2a2a2a', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: '#ccc', width: 44, flexShrink: 0 }}>{item.ticker}</span>
            <div style={{ flex: 1, height: 2, background: '#1a1a1a', borderRadius: 2 }}>
              <div style={{ width: `${barW}%`, height: '100%', background: '#333', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#555', width: 32, textAlign: 'right', flexShrink: 0 }}>{item.mentions}</span>
            {delta != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: delta > 0 ? GREEN : delta < 0 ? RED : '#555', width: 30, textAlign: 'right', flexShrink: 0 }}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
            )}
          </div>
        )
      })}
      {top.length > 10 && (
        <button
          onClick={e => { e.stopPropagation(); setShowAll(v => !v) }}
          style={{ marginTop: 6, background: 'transparent', border: 'none', color: '#555', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', cursor: 'pointer', padding: 0 }}
        >
          {showAll ? 'Show less ▲' : `Show all ${top.length} ▾`}
        </button>
      )}
    </div>
  )
}

function ScoreBadge({ pct, verdict, fmpRating, piotroski, delta }) {
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
      {delta != null && delta !== 0 && (
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color: delta > 0 ? GREEN : RED, lineHeight:1 }}>
          {delta > 0 ? '↑+' : '↓'}{delta}
        </div>
      )}
      {fmpRating && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,0.06)',color:'#888'}}>{fmpRating}</div>}
      {piotroski!=null && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,background:piotroski>=7?'rgba(0,200,5,0.15)':piotroski>=4?'rgba(255,215,0,0.1)':'rgba(255,80,0,0.1)',color:piotroski>=7?GREEN:piotroski>=4?YELLOW:RED}}>P:{piotroski}</div>}
    </div>
  )
}

function AlertModal({ ticker, currentPrice, currentRsi, currentMa50, alerts, onSave, onClose }) {
  const existing = alerts[ticker]
  const [above,    setAbove]    = useState(existing?.above    != null ? String(existing.above)    : '')
  const [below,    setBelow]    = useState(existing?.below    != null ? String(existing.below)    : '')
  const [rsiBelow, setRsiBelow] = useState(existing?.rsiBelow != null ? String(existing.rsiBelow) : '')
  const [rsiAbove, setRsiAbove] = useState(existing?.rsiAbove != null ? String(existing.rsiAbove) : '')
  const [maCross,  setMaCross]  = useState(existing?.maCross  ?? false)

  const save = () => {
    const a = {}
    const av = parseFloat(above);    if (above    && !isNaN(av) && av > 0)    a.above    = av
    const bv = parseFloat(below);    if (below    && !isNaN(bv) && bv > 0)    a.below    = bv
    const rv = parseFloat(rsiBelow); if (rsiBelow && !isNaN(rv) && rv > 0)    a.rsiBelow = rv
    const sv = parseFloat(rsiAbove); if (rsiAbove && !isNaN(sv) && sv > 0)    a.rsiAbove = sv
    if (maCross) a.maCross = true
    onSave(ticker, Object.keys(a).length ? a : null)
    onClose()
  }

  const lbl = t => <div style={{ fontSize:'0.56rem', color:'#444', marginBottom:3, letterSpacing:0.5, textTransform:'uppercase' }}>{t}</div>

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#111', border:'1px solid #222', borderRadius:16, padding:20, width:'100%', maxWidth:340 }}>
        <div style={{ fontSize:'0.72rem', color:'#aaa', fontWeight:700, marginBottom:2 }}>Alerts — {ticker}</div>
        {currentPrice && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#444', marginBottom:14 }}>
            ${currentPrice.toFixed(2)}{currentRsi != null ? ` · RSI ${currentRsi}` : ''}{currentMa50 != null ? ` · MA50 $${currentMa50}` : ''}
          </div>
        )}

        <div style={{ fontSize:'0.58rem', color:'#333', marginBottom:6, letterSpacing:1 }}>PRICE</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
          <div>{lbl('Above ($)')}<input className="input" value={above} onChange={e => setAbove(e.target.value)} type="number" min="0" step="any" placeholder={currentPrice ? (currentPrice*1.1).toFixed(0) : '250'} /></div>
          <div>{lbl('Below ($)')}<input className="input" value={below} onChange={e => setBelow(e.target.value)} type="number" min="0" step="any" placeholder={currentPrice ? (currentPrice*0.9).toFixed(0) : '200'} /></div>
        </div>

        <div style={{ fontSize:'0.58rem', color:'#333', marginBottom:6, letterSpacing:1 }}>TECHNICAL</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          <div>{lbl('RSI drops below')}<input className="input" value={rsiBelow} onChange={e => setRsiBelow(e.target.value)} type="number" min="1" max="99" step="1" placeholder="30" /></div>
          <div>{lbl('RSI rises above')}<input className="input" value={rsiAbove} onChange={e => setRsiAbove(e.target.value)} type="number" min="1" max="99" step="1" placeholder="70" /></div>
        </div>
        <button onClick={() => setMaCross(v => !v)} style={{
          width:'100%', marginBottom:14, padding:'8px 12px', borderRadius:8, textAlign:'left',
          border:`1px solid ${maCross ? YELLOW+'50' : '#222'}`,
          background: maCross ? `${YELLOW}0d` : 'transparent',
          color: maCross ? YELLOW : '#444',
          fontFamily:'var(--font-mono)', fontSize:'0.62rem', cursor:'pointer'
        }}>
          {maCross ? '✓' : '○'} Alert on MA50 crossover{currentMa50 ? ` · MA50 $${currentMa50}` : ''}
        </button>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={save} style={{ flex:1 }}>Save</button>
          {existing && <button className="btn btn-danger" onClick={() => { onSave(ticker, null); onClose() }} style={{ flex:1 }}>Remove</button>}
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
      Earnings {daysAway === 0 ? 'TODAY' : daysAway === 1 ? 'tomorrow' : daysAway > 0 ? `in ${daysAway}d` : `${Math.abs(daysAway)}d ago`}
      {ec.epsEstimate && ` · EPS est ${ec.epsEstimate > 0 ? '+' : ''}${ec.epsEstimate.toFixed(2)}`}
    </div>
  )
}

export default function Watchlist({ onNavigateToDive }) {
  const { list, add, remove } = useWatchlist()
  const { permission, requestPermission, scheduleWatchlistAlert, notify } = useNotifications()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sortBy, setSortBy] = useState('score')
  const [toast,  setToast]    = useState(null)
  const [alerts, setAlerts]   = useState(loadAlerts)
  const [alertFor, setAlertFor] = useState(null)
  const [earnings, setEarnings] = useState({})
  const [meta, setMeta] = useState(loadMeta)
  const [scoreHist, setScoreHist] = useState(loadScoreHist)
  const [movers, setMovers]       = useState(null)
  const [redditTop, setRedditTop] = useState([])
  const [sectors, setSectors]     = useState([])

  useEffect(() => {
    if (list.length > 0) handleRefresh()
  }, []) // eslint-disable-line

  // Load market data on mount — allSettled so one failing doesn't kill the others
  useEffect(() => {
    Promise.allSettled([
      fetchMarketMovers(),
      fetchRedditTopStocks(),
      fetchSectorPerformance(),
    ]).then(([m, r, s]) => {
      if (m.status === 'fulfilled' && m.value) setMovers(m.value)
      if (r.status === 'fulfilled') setRedditTop(Array.isArray(r.value) ? r.value : [])
      if (s.status === 'fulfilled') setSectors(Array.isArray(s.value) ? s.value : [])
    })
  }, [])

  // Fetch upcoming earnings for all watchlist tickers (background)
  useEffect(() => {
    if (!list.length) return
    const fetchAll = async () => {
      const BATCH = 3
      const out = {}
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH)
        const batchEC = await Promise.all(batch.map(t => fetchEarningsCalendar(t).then(ec => [t, ec])))
        batchEC.forEach(([t, ec]) => { if (ec && ec.date) out[t] = ec })
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

    const currentMeta = loadMeta()
    const newMeta = { ...currentMeta }
    const currentHist = loadScoreHist()
    const newHist = { ...currentHist }
    for (const item of out) {
      if (item.quote?.c && !newMeta[item.ticker]?.addedPrice) {
        newMeta[item.ticker] = { ...newMeta[item.ticker], addedAt: new Date().toISOString(), addedPrice: item.quote.c }
      }
      if (item.result) {
        const prev = currentHist[item.ticker]?.score
        const cur = Math.round(item.result.pct)
        newHist[item.ticker] = { score: cur, delta: prev != null ? cur - prev : null }
      }
    }
    saveMeta(newMeta); setMeta(newMeta)
    saveScoreHist(newHist); setScoreHist(newHist)

    const currentAlerts = loadAlerts()
    const currentHist2  = loadScoreHist()
    for (const item of sorted) {
      const al    = currentAlerts[item.ticker]
      const price = item.quote?.c
      const rsi   = item.result?.mom?.rsi
      const ma50  = item.candles?.ma50
      if (!al) continue
      if (price) {
        if (al.above != null && price >= al.above)
          notify(`📈 ${item.ticker} crossed $${al.above}`, `Current: $${price.toFixed(2)}`, item.ticker)
        if (al.below != null && price <= al.below)
          notify(`📉 ${item.ticker} dropped below $${al.below}`, `Current: $${price.toFixed(2)}`, item.ticker)
      }
      if (rsi != null) {
        if (al.rsiBelow != null && rsi <= al.rsiBelow)
          notify(`📊 ${item.ticker} RSI ${rsi} — oversold`, `RSI dropped below ${al.rsiBelow}`, item.ticker)
        if (al.rsiAbove != null && rsi >= al.rsiAbove)
          notify(`📊 ${item.ticker} RSI ${rsi} — overbought`, `RSI rose above ${al.rsiAbove}`, item.ticker)
      }
      if (al.maCross && price && ma50) {
        const prevAbove = currentHist2[item.ticker]?.aboveMA
        const curAbove  = price > ma50
        if (prevAbove !== undefined && prevAbove !== curAbove)
          notify(curAbove ? `📈 ${item.ticker} crossed above MA50` : `📉 ${item.ticker} fell below MA50`, `Price $${price.toFixed(2)} · MA50 $${ma50}`, item.ticker)
        newHist[item.ticker] = { ...newHist[item.ticker], aboveMA: curAbove }
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

  const earningsThisWeek = list.filter(t => {
    const ec = earnings[t]
    if (!ec?.date) return false
    const days = Math.round((new Date(ec.date) - new Date()) / 86400000)
    return days >= 0 && days <= 7
  })

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={list.length > 0}>
    <div className="page" style={{ paddingTop: 0 }}>

      {/* Market overview */}
      <div style={{ margin: '0 -16px' }}>
        <MacroTicker />
      </div>

      {/* Sector performance strip */}
      <SectorRow sectors={sectors} />

      {/* Market movers */}
      <MoversCard movers={movers} onNavigate={onNavigateToDive} />

      {/* Reddit trending */}
      <RedditBuzzCard top={redditTop} onNavigate={onNavigateToDive} />

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

      {/* My Watchlist section header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, marginTop:4 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#444', letterSpacing:'1.5px', textTransform:'uppercase' }}>
          👁 My Watchlist {list.length > 0 && <span style={{ color:'#333' }}>· {list.length}</span>}
        </div>
        {loading && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:'#444' }}>scoring {progress}%…</span>}
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign:'center', padding:'30px 0', color:'#333' }}>
          <p style={{ fontSize:'0.78rem', lineHeight:1.8, color:'#333' }}>No tickers added yet.</p>
        </div>
      ) : (
        <>
          {results.length > 1 && (
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              {[['score','Score ↓'],['verdict','Verdict'],['alpha','A–Z'],['pnl','P&L ↓']].map(([v,l]) => (
                <button key={v} onClick={e => { e.stopPropagation(); setSortBy(v) }}
                  style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:'0.68rem',
                    fontFamily:'var(--font-mono)', cursor:'pointer',
                    background: sortBy===v ? '#1a1a1a' : '#0d0d0d',
                    border: `1px solid ${sortBy===v ? '#333' : '#1a1a1a'}`,
                    color: sortBy===v ? '#ccc' : '#444' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {(results.length ? [...results].sort((a, b) => {
              if (!a.result) return 1; if (!b.result) return -1
              if (sortBy === 'score')   return b.result.pct - a.result.pct
              if (sortBy === 'verdict') { const o={BUY:0,HOLD:1,AVOID:2}; return (o[a.result.verdict]??2)-(o[b.result.verdict]??2) }
              if (sortBy === 'alpha')   return a.ticker.localeCompare(b.ticker)
              if (sortBy === 'pnl') {
                const getPnl = x => { const m=meta[x.ticker]; const p=x.quote?.c; return (m?.addedPrice && p) ? (p-m.addedPrice)/m.addedPrice : -Infinity }
                return getPnl(b) - getPnl(a)
              }
              return 0
            }) : list.map(t => ({ ticker:t }))).map((item) => {
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

                {hasResult && <ScoreBadge pct={r.pct} verdict={r.verdict} fmpRating={item.result?.fmpRating} piotroski={item.result?.piotroski} delta={scoreHist[item.ticker]?.delta ?? null} />}

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.82rem', color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
                    {item.ticker}
                    {hasAlert && <span style={{ fontSize:'0.6rem', color:YELLOW }}>🔔</span>}
                  </div>
                  <div style={{ fontSize:'0.68rem', color:G1, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                  {price && meta[item.ticker]?.addedPrice && (() => {
                    const m = meta[item.ticker]
                    const pnlPct = (price - m.addedPrice) / m.addedPrice * 100
                    return (
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#888', marginTop:2 }}>
                        Added @ ${m.addedPrice.toFixed(2)} · <span style={{ color: pnlPct >= 0 ? GREEN : RED }}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                      </div>
                    )
                  })()}
                  {hasResult && (() => {
                    const scores = item.result?.scores || {}
                    const mom = item.result?.mom || {}
                    let reason = ''
                    if (item.result?.isQualityDip) reason = '💎 Quality dip — strong business at a discount'
                    else if (r.verdict === 'BUY' && scores.trend > 0.3 && scores.momentum > 0.2) reason = '▲ Strong uptrend — above MA with positive momentum'
                    else if (r.verdict === 'BUY' && scores.analyst > 0.4 && scores.earnings > 0.2) reason = '★ Strong fundamentals — analyst + earnings aligned'
                    else if (r.verdict === 'BUY') reason = '● Entry signal — multiple factors align'
                    else if (r.verdict === 'HOLD' && scores.trend < -0.2) reason = '⚠ Below 50d MA — wait for trend recovery'
                    else if (r.verdict === 'HOLD' && (mom['1m'] || 0) < -5) reason = '◆ Pulling back — watch for stabilization'
                    else if (r.verdict === 'HOLD') reason = '◆ Mixed signals — hold, no clear entry yet'
                    else if (r.verdict === 'AVOID' && scores.momentum < -0.4) reason = '✕ Momentum breakdown — avoid new positions'
                    else if (r.verdict === 'AVOID') reason = '✕ Multiple factors negative — stay out'
                    return reason ? (
                      <div style={{ fontSize:'0.62rem', color: r.verdict === 'BUY' ? GREEN : r.verdict === 'HOLD' ? YELLOW : RED, marginTop:3, fontWeight:500 }}>{reason}</div>
                    ) : null
                  })()}
                  {hasResult && item.result?.stalenessFlags?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:4 }}>
                      {item.result.stalenessFlags.slice(0,2).map((f,i) => (
                        <span key={i} style={{ fontFamily:'var(--font-mono)', fontSize:'0.54rem',
                          color: f.severity==='high'?'#FF5000':'#888',
                          background:'rgba(255,255,255,0.04)', border:'1px solid #252525',
                          borderRadius:3, padding:'1px 4px' }}>
                          ⚠ {f.label}
                        </span>
                      ))}
                    </div>
                  )}
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

                {hasResult && price && (
                  <div style={{ textAlign:'right', flexShrink:0, marginRight:4 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'#fff', fontWeight:600 }}>${price.toFixed(2)}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color: chg >= 0 ? GREEN : RED, marginTop:2 }}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                    </div>
                  </div>
                )}

                <div style={{ color:G1, fontSize:'0.7rem', flexShrink:0 }}>›</div>

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
                  onClick={e => { e.stopPropagation(); remove(item.ticker); setResults(prev => prev.filter(r => r.ticker !== item.ticker)); const nm={...loadMeta()}; delete nm[item.ticker]; saveMeta(nm); setMeta(nm) }}>✕</button>
              </div>
            )
          })}
        </>
      )}

      {/* Alert modal */}
      {alertFor && (() => {
        const af = results.find(r => r.ticker === alertFor)
        return (
          <AlertModal
            ticker={alertFor}
            currentPrice={af?.quote?.c || null}
            currentRsi={af?.result?.mom?.rsi ?? null}
            currentMa50={af?.candles?.ma50 ?? null}
            alerts={alerts}
            onSave={saveAlert}
            onClose={() => setAlertFor(null)}
          />
        )
      })()}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </PullToRefresh>
  )
}
