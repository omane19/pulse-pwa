import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { TICKER_NAMES } from '../utils/constants.js'

/* ══════════════════════════════════════════════════════════════════════════════
   POLYMARKET TAB — Market Prediction Intelligence
   
   Features:
   - 🔥 Hot Events: High volume + recent price swings
   - ⚠️ Don't Miss: Watchlist-related events resolving soon
   - 📊 Macro Outlook: Recession, Fed rates, sector trends
   - Quality scoring: Volume + time-to-resolution filters
   - 24h price tracking via localStorage
══════════════════════════════════════════════════════════════════════════════ */

const GAMMA_API = '/api/proxy?provider=polymarket&path='

// Quality thresholds
const VOLUME_HIGH = 5_000_000
const VOLUME_MEDIUM = 500_000
const VOLUME_MIN = 100_000
const DAYS_URGENT = 7
const DAYS_NEAR = 30
const HOT_MOVE_THRESHOLD = 0.15  // 15 point swing = hot

/* ── Parse outcomePrices — Gamma API returns a JSON string, not an array ── */
function parseOutcomePrices(outcomePrices) {
  if (!outcomePrices) return []
  if (Array.isArray(outcomePrices)) return outcomePrices.map(Number)
  try { return JSON.parse(outcomePrices).map(Number) } catch { return [] }
}

/* ── Market Quality Scoring ────────────────────────────────────────────────── */
function getMarketQuality(market) {
  const volume = market.volumeNum ?? 0
  const daysLeft = Math.floor((new Date(market.endDate) - Date.now()) / 86400000)
  
  if (volume >= VOLUME_HIGH && daysLeft <= DAYS_NEAR) return { tier: 'high', label: '🟢 High Confidence', color: '#00C805' }
  if (volume >= VOLUME_MEDIUM && daysLeft <= 90) return { tier: 'medium', label: '🟡 Medium', color: '#FFD700' }
  if (volume >= VOLUME_MIN) return { tier: 'low', label: '⚪ Low Signal', color: '#666' }
  return null  // filter out
}

/* ── Hot Event Detection ──────────────────────────────────────────────────── */
function calculateHotScore(market, priceHistory) {
  const volume = market.volumeNum ?? 0
  const prices = parseOutcomePrices(market.outcomePrices)
  const currentPrice = prices[0] ?? 0.5
  const price24h = priceHistory[market.id]?.price ?? currentPrice
  const priceChange = Math.abs(currentPrice - price24h)
  const daysLeft = Math.floor((new Date(market.endDate) - Date.now()) / 86400000)
  const urgencyBoost = daysLeft <= DAYS_URGENT ? 2 : 1
  
  return (volume / 1_000_000) * (priceChange * 10) * urgencyBoost
}

/* ── Watchlist Relevance ──────────────────────────────────────────────────── */
function isRelevantToWatchlist(market, watchlistTickers) {
  const question = (market.question || '').toUpperCase()
  return watchlistTickers.some(ticker => {
    if (question.includes(ticker)) return true
    // Strip hyphens/numbers from tickers like BRK-B
    const stripped = ticker.replace(/[0-9-]/g, '')
    if (stripped.length > 1 && question.includes(stripped)) return true
    // Match first significant word of company name (Apple, Microsoft, Tesla, etc.)
    const company = (TICKER_NAMES[ticker] || '').toUpperCase()
    if (company) {
      const words = company.split(/\s+/)
      return words.some(w => w.length > 3 && question.includes(w))
    }
    return false
  })
}

/* ── Don't Miss Criteria ───────────────────────────────────────────────────── */
function isDontMiss(market, watchlistTickers) {
  const daysLeft = Math.floor((new Date(market.endDate) - Date.now()) / 86400000)
  const volume = market.volumeNum ?? 0
  const relevant = isRelevantToWatchlist(market, watchlistTickers)
  const highImpact = (market.question || '').toLowerCase().match(/earnings|beat|guidance|launch|approval|announce/)
  
  return daysLeft <= DAYS_URGENT && 
         daysLeft > 0 && 
         volume >= VOLUME_MEDIUM && 
         relevant && 
         highImpact
}

/* ── Macro Market Detection ────────────────────────────────────────────────── */
function isMacroMarket(market) {
  const q = (market.question || '').toLowerCase()
  return q.match(/recession|fed|rate cut|gdp|inflation|unemployment|stimulus|regulation|election/)
}

/* ── Sector Market Detection ───────────────────────────────────────────────── */
function isSectorMarket(market) {
  const q = (market.question || '').toLowerCase()
  return q.match(/ai|ev|electric vehicle|chip|semiconductor|tech|energy|crypto|ipo|merger/)
}

/* ── Main Component ────────────────────────────────────────────────────────── */
export default function Polymarket() {
  const { list: watchlistTickers } = useWatchlist()
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [priceHistory, setPriceHistory] = useState({})
  const [filter, setFilter] = useState('all') // all | watchlist | macro | sector

  // Load price history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('polymarket_price_history')
      if (stored) setPriceHistory(JSON.parse(stored))
    } catch {}
  }, [])

  // Fetch markets from Polymarket
  const fetchMarkets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${GAMMA_API}/markets%3Factive%3Dtrue%26closed%3Dfalse%26limit%3D100`)
      if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`)

      const data = await response.json()
      const filtered = (data || []).filter(m => {
        const quality = getMarketQuality(m)
        return quality !== null  // only show markets that pass quality threshold
      })

      setMarkets(filtered)

      // Store current prices for 24h baseline tracking
      // Use functional update to always merge against latest history, not stale closure
      setPriceHistory(prev => {
        const merged = { ...prev }
        filtered.forEach(m => {
          const prices = parseOutcomePrices(m.outcomePrices)
          const currentPrice = prices[0] ?? 0.5
          // Only set baseline if new market or existing baseline is >24h old
          if (!merged[m.id] || Date.now() - merged[m.id].timestamp > 86400000) {
            merged[m.id] = { price: currentPrice, timestamp: Date.now() }
          }
        })
        try { localStorage.setItem('polymarket_price_history', JSON.stringify(merged)) } catch {}
        return merged
      })

    } catch (err) {
      setError(err.message)
      console.error('[Polymarket] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Use a ref so the interval always calls the latest fetchMarkets without restarting
  const fetchMarketsRef = useRef(fetchMarkets)
  fetchMarketsRef.current = fetchMarkets

  useEffect(() => {
    fetchMarketsRef.current()
    const interval = setInterval(() => fetchMarketsRef.current(), 300000) // refresh every 5 min
    return () => clearInterval(interval)
  }, [])

  // Categorize markets
  const hotEvents = markets
    .map(m => ({ ...m, hotScore: calculateHotScore(m, priceHistory) }))
    .filter(m => m.hotScore > 20)
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, 5)

  const dontMiss = markets
    .filter(m => isDontMiss(m, watchlistTickers))
    .sort((a, b) => {
      const daysA = Math.floor((new Date(a.endDate) - Date.now()) / 86400000)
      const daysB = Math.floor((new Date(b.endDate) - Date.now()) / 86400000)
      return daysA - daysB  // soonest first
    })

  const macroMarkets = markets
    .filter(isMacroMarket)
    .sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))
    .slice(0, 6)

  const sectorMarkets = markets
    .filter(isSectorMarket)
    .sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))
    .slice(0, 6)

  const watchlistMarkets = markets
    .filter(m => isRelevantToWatchlist(m, watchlistTickers))
    .sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0))

  // Active filter — use spread to avoid mutating markets state array
  const displayMarkets =
    filter === 'watchlist' ? watchlistMarkets :
    filter === 'macro' ? macroMarkets :
    filter === 'sector' ? sectorMarkets :
    [...markets].sort((a, b) => (b.volumeNum ?? 0) - (a.volumeNum ?? 0)).slice(0, 20)

  if (loading && markets.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ color: '#00E5FF', marginBottom: 8 }}>Loading market data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ color: '#FF5000', marginBottom: 8 }}>⚠️ Failed to load Polymarket data</div>
        <div style={{ color: '#666', fontSize: '0.72rem', marginBottom: 4 }}>{error}</div>
        <div style={{ color: '#444', fontSize: '0.66rem', marginBottom: 16 }}>Check your connection or try again</div>
        <button onClick={fetchMarkets} style={{
          padding: '10px 24px', background: 'rgba(0,229,255,0.1)',
          border: '1px solid rgba(0,229,255,0.3)', borderRadius: 8, color: '#00E5FF',
          cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.72rem'
        }}>
          ↻ Refresh Markets
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 12px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, color: '#E8E8E8', marginBottom: 4 }}>
            Market Predictions
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: '#888', letterSpacing: 0.5 }}>
            Real-time probabilities from Polymarket prediction markets
          </div>
        </div>
        <button onClick={fetchMarkets} disabled={loading} style={{
          padding: '6px 12px', background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.25)', borderRadius: 8, color: loading ? '#444' : '#00E5FF',
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)',
          fontSize: '0.66rem', flexShrink: 0, marginTop: 4
        }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Hot Events */}
      {hotEvents.length > 0 && (
        <Section title="🔥 HOT RIGHT NOW" subtitle="High volume + recent price movement">
          {hotEvents.map(m => (
            <MarketCard key={m.id} market={m} priceHistory={priceHistory} showHotBadge />
          ))}
        </Section>
      )}

      {/* Don't Miss */}
      {dontMiss.length > 0 && (
        <Section title="⚠️ DON'T MISS" subtitle="Watchlist events resolving soon">
          {dontMiss.map(m => (
            <MarketCard key={m.id} market={m} priceHistory={priceHistory} showUrgent />
          ))}
        </Section>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 24 }}>
        {[
          ['all', 'All Markets'],
          ['watchlist', 'Watchlist'],
          ['macro', 'Macro'],
          ['sector', 'Sectors']
        ].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
              background: filter === key ? 'rgba(0,229,255,0.1)' : '#111',
              border: `1px solid ${filter === key ? 'rgba(0,229,255,0.4)' : '#252525'}`,
              color: filter === key ? '#00E5FF' : '#666'
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtered Markets */}
      {displayMarkets.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayMarkets.map(m => (
            <MarketCard key={m.id} market={m} priceHistory={priceHistory} />
          ))}
        </div>
      ) : (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '0.76rem' }}>
          No markets found for this filter
        </div>
      )}

      {/* Refresh Button */}
      <button onClick={fetchMarkets} disabled={loading} style={{
        marginTop: 20, width: '100%', padding: '10px', background: 'rgba(0,229,255,0.1)',
        border: '1px solid rgba(0,229,255,0.3)', borderRadius: 8, color: '#00E5FF',
        cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem', opacity: loading ? 0.5 : 1
      }}>
        {loading ? 'Refreshing...' : '↻ Refresh Markets'}
      </button>
    </div>
  )
}

/* ── Section Header Component ──────────────────────────────────────────────── */
function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: 700, color: '#E8E8E8', letterSpacing: 1 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#666', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

/* ── Market Card Component ─────────────────────────────────────────────────── */
function MarketCard({ market, priceHistory, showHotBadge, showUrgent }) {
  const prices = parseOutcomePrices(market.outcomePrices)
  const yesPrice = prices[0] ?? 0.5
  const probability = Math.round(yesPrice * 100)
  const volume = market.volumeNum ?? 0
  const endDate = new Date(market.endDate)
  const daysLeft = Math.floor((endDate - Date.now()) / 86400000)
  const quality = getMarketQuality(market)
  
  // 24h price change
  const price24h = priceHistory[market.id]?.price || yesPrice
  const priceChange = yesPrice - price24h
  const priceChangePct = Math.round(priceChange * 100)

  return (
    <div style={{
      background: '#111', border: '1px solid #252525', borderRadius: 12, padding: '12px 14px',
      cursor: 'pointer', transition: 'border-color 0.2s'
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = '#00E5FF40'}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#252525'}
    onClick={() => window.open(`https://polymarket.com/event/${market.slug || market.id}`, '_blank')}>
      
      {/* Question */}
      <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#E8E8E8', marginBottom: 8 }}>
        {market.question}
      </div>

      {/* Probability Bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 900, 
            color: probability >= 70 ? '#00C805' : probability >= 50 ? '#FFD700' : '#FF5000' }}>
            {probability}%
          </div>
          {priceChangePct !== 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', 
              color: priceChangePct > 0 ? '#00C805' : '#FF5000' }}>
              {priceChangePct > 0 ? '+' : ''}{priceChangePct} pts 24h
            </div>
          )}
        </div>
        <div style={{ height: 4, background: '#252525', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', width: `${probability}%`, 
            background: probability >= 70 ? '#00C805' : probability >= 50 ? '#FFD700' : '#FF5000',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Quality Badge */}
        {quality && (
          <div style={{ 
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', padding: '2px 6px',
            background: `${quality.color}15`, border: `1px solid ${quality.color}40`,
            borderRadius: 4, color: quality.color
          }}>
            {quality.label}
          </div>
        )}

        {/* Hot Badge */}
        {showHotBadge && (
          <div style={{ 
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', padding: '2px 6px',
            background: 'rgba(255,80,0,0.15)', border: '1px solid rgba(255,80,0,0.4)',
            borderRadius: 4, color: '#FF5000'
          }}>
            🔥 HOT
          </div>
        )}

        {/* Urgent Badge */}
        {showUrgent && (
          <div style={{ 
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', padding: '2px 6px',
            background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)',
            borderRadius: 4, color: '#FFD700'
          }}>
            ⚠️ {daysLeft}d left
          </div>
        )}

        {/* Volume */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#666' }}>
          ${volume >= 1_000_000 ? `${(volume / 1_000_000).toFixed(1)}M` : `${(volume / 1_000).toFixed(0)}K`} vol
        </div>

        {/* Expiry */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#666' }}>
          {daysLeft > 0 ? `${daysLeft}d left` : 'Resolving soon'}
        </div>
      </div>
    </div>
  )
}
