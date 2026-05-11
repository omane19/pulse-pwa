import React, { useState, useEffect, useCallback } from 'react'
import { fetchMarketNews } from '../hooks/useApi.js'
import { PullToRefresh } from './shared.jsx'

const CYAN = '#00E5FF'; const GREEN = '#00C805'; const RED = '#FF5000'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 3600)  return `${Math.max(1, Math.round(diff / 60))}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

/* ── Sentiment tint for headline ── */
const BULL_WORDS = ['surge', 'soar', 'beat', 'record', 'growth', 'rally', 'gain', 'strong', 'upgrade', 'profit', 'buy', 'rise', 'bullish', 'outperform']
const BEAR_WORDS = ['drop', 'fall', 'miss', 'cut', 'loss', 'concern', 'warn', 'downgrade', 'layoff', 'decline', 'bear', 'risk', 'crash', 'sell']
function sentimentOf(title) {
  const t = title.toLowerCase()
  const b = BULL_WORDS.filter(w => t.includes(w)).length
  const r = BEAR_WORDS.filter(w => t.includes(w)).length
  return b > r ? 'bull' : r > b ? 'bear' : 'neu'
}

/* ── Single article card ── */
function ArticleCard({ article, onTickerClick }) {
  const [expanded, setExpanded] = useState(false)
  const sent = sentimentOf(article.title)
  const accentColor = sent === 'bull' ? GREEN : sent === 'bear' ? RED : '#333'

  return (
    <div style={{
      borderLeft: `3px solid ${accentColor}`,
      padding: '12px 14px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      cursor: 'pointer',
    }} onClick={() => setExpanded(v => !v)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        {article.ticker && (
          <button
            onClick={e => { e.stopPropagation(); onTickerClick(article.ticker) }}
            style={{
              flexShrink: 0,
              background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.3)',
              borderRadius: 5,
              color: CYAN,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              fontWeight: 700,
              padding: '2px 7px',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}>
            {article.ticker}
          </button>
        )}
        <div style={{ fontSize: '0.82rem', color: '#e0e0e0', lineHeight: 1.5, flex: 1 }}>
          {article.title}
        </div>
      </div>

      {expanded && article.body && (
        <div style={{ fontSize: '0.74rem', color: '#888', lineHeight: 1.7, marginBottom: 8, marginTop: 4 }}>
          {article.body}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#555' }}>
          {article.source}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {expanded && article.link !== '#' && (
            <a href={article.link} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: CYAN, textDecoration: 'none' }}>
              Read →
            </a>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#444' }}>
            {timeAgo(article.ts)}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function NewsImpact({ onNavigateToDive }) {
  const [news,    setNews]    = useState([])
  const [loading, setLoading] = useState(false)
  const [filter,  setFilter]  = useState('all') // 'all' | ticker symbol
  const [tickers, setTickers] = useState([])

  // Read watchlist from localStorage directly (avoids prop drilling)
  const watchlistTickers = (() => {
    try { return JSON.parse(localStorage.getItem('pulse_watchlist_v1') || '[]') } catch { return [] }
  })()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const articles = await fetchMarketNews(watchlistTickers)
      setNews(articles)
      // Collect unique tickers for filter chips
      const uniq = [...new Set(articles.map(a => a.ticker).filter(Boolean))].sort()
      setTickers(uniq)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const displayed = filter === 'all' ? news : news.filter(a => a.ticker === filter)

  return (
    <PullToRefresh onRefresh={load} enabled={true}>
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#888', letterSpacing: 1 }}>
          {news.length} ARTICLES · TAP TICKER TO DIVE
        </div>
        <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 12px', fontSize: '0.68rem' }}
          onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {/* Ticker filter chips */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '4px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              background: filter === 'all' ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
              border: filter === 'all' ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
              color: filter === 'all' ? CYAN : '#888', cursor: 'pointer'
            }}>All</button>
          {tickers.map(t => (
            <button key={t}
              onClick={() => setFilter(filter === t ? 'all' : t)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                background: filter === t ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
                border: filter === t ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: filter === t ? CYAN : '#888', cursor: 'pointer'
              }}>{t}</button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#555' }}>
          Loading market news…
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#555', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
          No articles found.
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 10, paddingLeft: 4 }}>
            {[[GREEN, 'Bullish signal'], [RED, 'Bearish signal'], ['#333', 'Neutral']].map(([c, l]) => (
              <span key={l} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.54rem', color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 14, background: c, display: 'inline-block', borderRadius: 2 }} />
                {l}
              </span>
            ))}
          </div>

          <div style={{ background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            {displayed.map((article, i) => (
              <ArticleCard
                key={`${article.ts}-${i}`}
                article={article}
                onTickerClick={t => onNavigateToDive && onNavigateToDive(t)}
              />
            ))}
          </div>
        </>
      )}
    </div>
    </PullToRefresh>
  )
}
