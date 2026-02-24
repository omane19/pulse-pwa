import React, { useState, useCallback } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { fetchTickerFull } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, LoadingBar, Toast, PullToRefresh } from './shared.jsx'
import { useNotifications } from '../hooks/useNotifications.js'

export default function Watchlist({ onNavigateToTicker }) {
  const { list, add, remove } = useWatchlist()
  const [input, setInput] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [toast, setToast] = useState(null)
  const { permission, requestPermission, scheduleWatchlistAlert } = useNotifications()

  const handleAdd = () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    add(t); setInput(''); setToast(`Added ${t}`)
  }

  const handleRefresh = useCallback(async () => {
    if (!list.length) return
    setLoading(true); setProgress(0); setResults([])
    const out = []
    for (let i = 0; i < list.length; i++) {
      const data = await fetchTickerFull(list[i])
      if (data) {
        const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings)
        out.push({ ...data, result })
      }
      setProgress(Math.round((i + 1) / list.length * 100))
    }
    const sorted = out.sort((a, b) => b.result.pct - a.result.pct)
    setResults(sorted)
    setLoading(false)
    // Trigger notification if permission granted and BUY signals exist
    if (permission === 'granted') {
      scheduleWatchlistAlert(sorted.map(r => ({ ticker: r.ticker, verdict: r.result.verdict })))
    }
  }, [list, permission, scheduleWatchlistAlert])

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={list.length > 0}>
    <div className="page">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input" value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add ticker… e.g. NVDA" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 18px' }} onClick={handleAdd}>+</button>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#B2B2B2' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👁</div>
          <p style={{ fontSize: '0.86rem', lineHeight: 1.8 }}>Your watchlist is empty.<br />Add tickers above or from the Deep Dive tab.</p>
        </div>
      ) : (
        <>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={loading} style={{ marginBottom: 8 }}>
            {loading ? `Scoring ${progress}%…` : `Refresh Signals (${list.length} tickers)`}
          </button>

          {permission === 'default' && (
            <button
              onClick={requestPermission}
              style={{
                width: '100%', marginBottom: 12, padding: '10px',
                background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.25)',
                borderRadius: 10, color: '#00E5FF', fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '0.5px'
              }}
            >
              🔔 Enable BUY alerts — notify when watchlist has signals
            </button>
          )}
          {permission === 'granted' && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#00C805', marginBottom: 12, textAlign: 'center' }}>
              ✓ Notifications on — you'll be alerted when BUY signals are found
            </div>
          )}

          {loading && <LoadingBar progress={progress} text={`Scoring watchlist… ${progress}%`} />}

          {results.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['Watching', list.length], ['BUY', results.filter(r => r.result.verdict === 'BUY').length],
                ['Avg Signal', `${Math.round(results.reduce((s, r) => s + r.result.pct, 0) / results.length)}/100`],
                ['Top Pick', results[0]?.ticker || '—']].map(([l, v]) => (
                <div key={l} className="metric-cell" style={{ flex: 1, minWidth: 60 }}>
                  <div className="metric-label">{l}</div>
                  <div className="metric-value">{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* List — scored or bare */}
          {(results.length ? results : list.map(t => ({ ticker: t }))).map((item) => {
            const hasResult = !!item.result
            const r = item.result
            const price = item.quote?.c
            const chg = item.quote?.dp || 0
            const name = item.name || TICKER_NAMES[item.ticker] || item.ticker
            return (
              <div key={item.ticker} className="wl-item">
                <div className="wl-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="wl-ticker">{item.ticker}</div>
                  <div className="wl-name">{name}</div>
                  {hasResult && (
                    <div className="wl-signal">
                      <VerdictPill verdict={r.verdict} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#B2B2B2' }}>{r.pct.toFixed(0)}/100</span>
                    </div>
                  )}
                </div>
                {hasResult && price && (
                  <div className="wl-right" style={{ marginRight: 12 }}>
                    <div className="wl-price">${price.toFixed(2)}</div>
                    <div className={`wl-chg ${chg >= 0 ? 'pos' : 'neg'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</div>
                  </div>
                )}
                <button className="btn btn-danger" style={{ padding: '6px 10px', width: 'auto', fontSize: '0.7rem' }}
                  onClick={() => remove(item.ticker)}>✕</button>
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
