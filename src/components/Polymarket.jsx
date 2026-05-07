import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { TICKER_NAMES } from '../utils/constants.js'

const VOLUME_HIGH   = 5_000_000
const VOLUME_MEDIUM = 500_000
const VOLUME_MIN    = 100_000

function parseOutcomePrices(op) {
  if (!op) return []
  if (Array.isArray(op)) return op.map(Number)
  try { return JSON.parse(op).map(Number) } catch { return [] }
}

function daysUntil(dateStr) {
  return Math.floor((new Date(dateStr) - Date.now()) / 86400000)
}

function fmtVol(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function timeAgo(ts) {
  if (!ts) return ''
  const s = (Date.now() - ts) / 1000
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/* ── Hot score — 24h event volume as primary signal, price movement as bonus ── */
function hotScore(market, priceHistory) {
  const vol24h = market.events?.[0]?.volume24hr ?? 0
  const vol    = market.volumeNum ?? 0
  const days   = daysUntil(market.endDate)
  const prices = parseOutcomePrices(market.outcomePrices)
  const cur    = prices[0] ?? 0.5
  const hist   = priceHistory[market.id]?.price
  const move   = hist != null ? Math.abs(cur - hist) : 0
  const urgency = days <= 7 ? 2 : days <= 30 ? 1.3 : 1
  // Prefer 24h volume (recent activity) over total volume (stale)
  const base = vol24h > 0 ? Math.log10(Math.max(vol24h, 100)) * 1.5 : Math.log10(Math.max(vol, 100))
  return (base + move * 30) * urgency
}

/* ── Watchlist relevance ── */
function isWatchlistMatch(market, tickers) {
  if (!tickers.length) return false
  const q = (market.question || '').toUpperCase()
  return tickers.some(t => {
    if (q.includes(t)) return true
    const stripped = t.replace(/[0-9-]/g, '')
    if (stripped.length > 1 && q.includes(stripped)) return true
    const name = (TICKER_NAMES[t] || '').toUpperCase()
    return name ? name.split(/\s+/).some(w => w.length > 3 && q.includes(w)) : false
  })
}

function isMacro(market) {
  return /(recession|fed|rate cut|rate hike|gdp|inflation|unemployment|tariff|trade war|election|congress|senate|treasury|fomc)/i.test(market.question)
}

function isSector(market) {
  return /(ai |artificial intel|ev |electric vehicle|chip|semiconductor|tech|energy|crypto|bitcoin|ethereum|ipo|merger|acquisition|drug|fda|clinical)/i.test(market.question)
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function Polymarket() {
  const { list: watchlistTickers } = useWatchlist()
  const [markets,      setMarkets]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [priceHistory, setPriceHistory] = useState({})
  const [filter,       setFilter]       = useState('all')
  const [lastRefreshed,setLastRefreshed]= useState(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem('polymarket_price_history')
      if (s) setPriceHistory(JSON.parse(s))
    } catch {}
  }, [])

  const fetchMarkets = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const path = encodeURIComponent('/markets?active=true&closed=false&limit=200')
      const res = await fetch(`/api/proxy?provider=polymarket&path=${path}`, {
        cache: 'no-store'  // always bypass browser cache — prices change constantly
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      const data = (Array.isArray(raw) ? raw : []).filter(m => (m.volumeNum ?? 0) >= VOLUME_MIN)
      setMarkets(data)
      setLastRefreshed(Date.now())
      setPriceHistory(prev => {
        const next = { ...prev }
        data.forEach(m => {
          const cur = parseOutcomePrices(m.outcomePrices)[0] ?? 0.5
          if (!next[m.id] || Date.now() - next[m.id].timestamp > 86400000)
            next[m.id] = { price: cur, timestamp: Date.now() }
        })
        try { localStorage.setItem('polymarket_price_history', JSON.stringify(next)) } catch {}
        return next
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRef = useRef(fetchMarkets)
  fetchRef.current = fetchMarkets
  useEffect(() => {
    fetchRef.current()
    const id = setInterval(() => fetchRef.current(), 300000)
    return () => clearInterval(id)
  }, [])

  /* ── Derived lists ── */
  const byVol = [...markets].sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))

  const resolvingSoon = markets
    .filter(m => { const d = daysUntil(m.endDate); return d >= 0 && d <= 30 && (m.volumeNum ?? 0) >= VOLUME_MEDIUM })
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
    .slice(0, 6)

  const topMarkets = [...markets]
    .map(m => ({ ...m, _hot: hotScore(m, priceHistory) }))
    .sort((a, b) => b._hot - a._hot)
    .slice(0, 6)

  const macroList     = markets.filter(isMacro).sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))
  const sectorList    = markets.filter(isSector).sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))
  const watchlistList = markets.filter(m => isWatchlistMatch(m, watchlistTickers)).sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))

  const displayMarkets =
    filter === 'macro'     ? macroList     :
    filter === 'sector'    ? sectorList    :
    filter === 'watchlist' ? watchlistList :
    byVol

  const counts = { all: byVol.length, macro: macroList.length, sector: sectorList.length, watchlist: watchlistList.length }

  /* ── Loading / Error ── */
  if (loading && markets.length === 0) return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ color: '#00E5FF', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>Loading prediction markets…</div>
    </div>
  )

  if (error && markets.length === 0) return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ color: '#FF5000', fontSize: '0.82rem', marginBottom: 8 }}>⚠️ Failed to load</div>
      <div style={{ color: '#555', fontSize: '0.66rem', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>{error}</div>
      <button onClick={fetchMarkets} style={{ padding: '10px 24px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 8, color: '#00E5FF', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
        ↻ Retry
      </button>
    </div>
  )

  return (
    <div style={{ padding: '16px 12px 80px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, color: '#E8E8E8', marginBottom: 4 }}>
            Prediction Markets
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#666' }}>
            {lastRefreshed
              ? `Updated ${timeAgo(lastRefreshed)} · ${markets.length} active markets`
              : 'Real-time probabilities · Polymarket'}
          </div>
        </div>
        <button onClick={fetchMarkets} disabled={loading} style={{
          padding: '6px 14px', background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.25)', borderRadius: 8,
          color: loading ? '#444' : '#00E5FF', cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem', flexShrink: 0, marginTop: 4
        }}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* ── Resolving Soon ── */}
      {resolvingSoon.length > 0 && (
        <Section title="⏰ RESOLVING SOON" subtitle="Closing within 30 days · $500K+ volume">
          {resolvingSoon.map(m => <MarketCard key={m.id} market={m} priceHistory={priceHistory} />)}
        </Section>
      )}

      {/* ── Top Markets (shown in All view only) ── */}
      {filter === 'all' && (
        <Section title="🔥 TOP MARKETS" subtitle="Highest liquidity · most market confidence">
          {topMarkets.map(m => <MarketCard key={m.id} market={m} priceHistory={priceHistory} showTopBadge />)}
        </Section>
      )}

      {/* ── Watchlist section ── */}
      {watchlistList.length > 0 && filter === 'all' && (
        <Section title="👁 YOUR WATCHLIST" subtitle="Prediction markets tied to your stocks">
          {watchlistList.slice(0, 4).map(m => <MarketCard key={m.id} market={m} priceHistory={priceHistory} />)}
        </Section>
      )}

      {/* ── Filter Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 24 }}>
        {[['all','All'],['macro','Macro'],['sector','Sectors'],['watchlist','Watchlist']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: '0.62rem',
            fontFamily: 'var(--font-mono)', cursor: 'pointer',
            background: filter === k ? 'rgba(0,229,255,0.1)' : '#111',
            border: `1px solid ${filter === k ? 'rgba(0,229,255,0.4)' : '#252525'}`,
            color: filter === k ? '#00E5FF' : '#666', lineHeight: 1.3
          }}>
            {l}
            {counts[k] > 0 && <div style={{ fontSize: '0.54rem', opacity: 0.7, marginTop: 1 }}>{counts[k]}</div>}
          </button>
        ))}
      </div>

      {/* ── Filtered Market List ── */}
      {displayMarkets.length > 0 ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayMarkets.map(m => <MarketCard key={m.id} market={m} priceHistory={priceHistory} />)}
          </div>
        </>
      ) : (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: '0.76rem', marginBottom: 6 }}>
            {filter === 'watchlist' ? 'No markets match your watchlist tickers' : 'No markets for this filter'}
          </div>
          {filter === 'watchlist' && (
            <div style={{ color: '#444', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
              Add stocks to your watchlist to see relevant markets here
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Section ── */
function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#E8E8E8', letterSpacing: 0.8 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#555', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

/* ── Market Card ── */
function MarketCard({ market, priceHistory, showTopBadge }) {
  const prices  = parseOutcomePrices(market.outcomePrices)
  const yes     = prices[0] ?? 0.5
  const prob    = Math.round(yes * 100)
  const vol     = market.volumeNum ?? 0
  const days    = daysUntil(market.endDate)
  const hist    = priceHistory[market.id]?.price
  const change  = hist != null ? Math.round((yes - hist) * 100) : null
  const isUrgent = days >= 0 && days <= 7
  const probColor = prob >= 70 ? '#00C805' : prob >= 40 ? '#FFD700' : '#FF5000'

  return (
    <div
      style={{
        background: '#111',
        border: `1px solid ${isUrgent ? 'rgba(255,215,0,0.25)' : '#1e1e1e'}`,
        borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
      }}
      onClick={() => window.open(`https://polymarket.com/event/${market.events?.[0]?.slug || market.slug}`, '_blank')}
    >
      {/* Question */}
      <div style={{ fontSize: '0.8rem', lineHeight: 1.55, color: '#DDD', marginBottom: 10 }}>
        {market.question}
      </div>

      {/* Probability row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 900, color: probColor, lineHeight: 1, flexShrink: 0 }}>
          {prob}%
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${prob}%`, background: probColor, borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#444' }}>YES</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#444' }}>NO {100 - prob}%</span>
          </div>
        </div>
        {change != null && change !== 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: change > 0 ? '#00C805' : '#FF5000', textAlign: 'right', flexShrink: 0 }}>
            {change > 0 ? '+' : ''}{change}pts<br />
            <span style={{ color: '#444', fontSize: '0.52rem' }}>24h</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {isUrgent && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', padding: '2px 6px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 4, color: '#FFD700' }}>
            ⏰ {days === 0 ? 'TODAY' : `${days}d left`}
          </span>
        )}
        {showTopBadge && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', padding: '2px 6px', background: 'rgba(255,80,0,0.1)', border: '1px solid rgba(255,80,0,0.2)', borderRadius: 4, color: '#FF8040' }}>
            🔥 Top
          </span>
        )}
        {vol >= VOLUME_HIGH && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', padding: '2px 6px', background: 'rgba(0,200,5,0.08)', border: '1px solid rgba(0,200,5,0.2)', borderRadius: 4, color: '#00C805' }}>
            🟢 High confidence
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#555', marginLeft: 'auto' }}>
          {fmtVol(vol)} · {days > 0 ? `${days}d` : days === 0 ? 'today' : 'ended'}
        </span>
      </div>
    </div>
  )
}
