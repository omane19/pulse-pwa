import { usePullToRefresh } from '../hooks/usePullToRefresh.js'
import React, { useState, useRef } from 'react'
import { timeAgo, getTier } from '../utils/scoring.js'
import { SOURCE_TIERS } from '../utils/constants.js'
import { smartSummary } from '../utils/scoring.js'
import { fetchTickerSearch } from '../hooks/useApi.js'

export function VerdictPill({ verdict }) {
  const cls = verdict === 'BUY' ? 'vp-buy' : verdict === 'HOLD' ? 'vp-hold' : 'vp-avoid'
  const dot = verdict === 'BUY' ? '●' : verdict === 'HOLD' ? '◆' : '✕'
  return <span className={`verdict-pill ${cls}`}>{dot} {verdict}</span>
}

export function FactorBars({ scores }) {
  return (
    <div style={{ marginTop: 8 }}>
      {Object.entries(scores).map(([fn, fv]) => {
        const pct = Math.max(0, ((fv + 1) / 2 * 100))
        const color = fv > 0.2 ? '#00C805' : fv < -0.2 ? '#FF5000' : '#FFD700'
        return (
          <div className="factor-bar-row" key={fn}>
            <span className="factor-bar-label">{fn}</span>
            <div className="factor-bar-track">
              <div className="factor-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="factor-bar-num" style={{ color }}>{Math.round(pct)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function MetricCell({ label, value, delta, deltaColor }) {
  return (
    <div className="metric-cell">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {delta && <div className={`metric-delta ${deltaColor || 'neu'}`}>{delta}</div>}
    </div>
  )
}

export function NewsCard({ article, sc }) {
  const { label, badge } = timeAgo(article.ts)
  const tier = sc?.tier || 4
  const tierInfo = SOURCE_TIERS[tier]
  const summary = smartSummary(article.title, article.body)
  const tierCls = `tier-badge t${tier}`
  const timeCls = `time-${badge}`
  return (
    <div className="news-card">
      <div className="news-title">{article.title}</div>
      {summary && <div className="news-summary">{summary}</div>}
      <div className="news-meta">
        <span>{article.source}</span>
        <span className={timeCls}>{badge === 'live' ? '🔴 LIVE' : badge === 'breaking' ? 'BREAKING' : label}</span>
        <span className={tierCls}>T{tier} · {tierInfo?.label}</span>
      </div>
      <a className="news-link" href={article.link} target="_blank" rel="noreferrer">↗ Full article</a>
    </div>
  )
}

export function EarningsWarning({ ec }) {
  if (!ec) return null
  try {
    const ed = new Date(ec.date)
    const days = Math.round((ed - new Date()) / 86400000)
    if (days < 0 || days > 21) return null
    if (days <= 7) return (
      <div className="earn-warn">
        <span style={{ color: '#FF5000', fontWeight: 700 }}>⚠ Earnings in {days} day{days !== 1 ? 's' : ''}!</span>
        <span style={{ color: '#B2B2B2', fontSize: '0.78rem', marginLeft: 8 }}>{ec.date} · Est EPS ${ec.epsEstimate || '?'} · High binary risk for options</span>
      </div>
    )
    return (
      <div className="earn-soon">
        <span style={{ color: '#FFD700', fontWeight: 600 }}>📅 Earnings in {days} days</span>
        <span style={{ color: '#B2B2B2', fontSize: '0.78rem', marginLeft: 8 }}>{ec.date} · Est EPS ${ec.epsEstimate || '?'}</span>
      </div>
    )
  } catch { return null }
}

export function LoadingBar({ progress, text }) {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#B2B2B2', marginBottom: 12 }}>{text || 'Loading…'}</div>
      <div className="loading-bar" style={{ maxWidth: 260, margin: '0 auto' }}>
        <div className="loading-bar-fill" style={{ width: `${progress || 100}%` }} />
      </div>
    </div>
  )
}

export function SectionHeader({ children }) {
  return <div className="sh">{children}</div>
}

export function GlossaryItem({ term, def }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glossary-item">
      <button className="glossary-trigger" onClick={() => setOpen(o => !o)}>
        <span>{term}</span>
        <span style={{ color: '#B2B2B2', fontSize: '0.8rem', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="glossary-body">{def}</div>}
    </div>
  )
}

export function TickerChip({ ticker, names }) {
  const name = names?.[ticker] || ticker
  return (
    <span className="ticker-chip" title={name}>{ticker}</span>
  )
}

export function Toast({ message, onDone }) {
  React.useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t) }, [onDone])
  return <div className="toast">{message}</div>
}

export function SignalBar({ pct, color }) {
  return (
    <div className="signal-bar-outer">
      <div className="signal-bar-inner" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
    </div>
  )
}

/* ── Pull-to-Refresh wrapper ─────────────────────────────────────── */
export function PullToRefresh({ onRefresh, enabled = true, children }) {
  const { pullY, state, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(onRefresh, enabled)
  const spinning = state === 'refreshing'
  const ready    = state === 'ready'
  const visible  = pullY > 4 || spinning

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: 'relative', minHeight: '100%' }}
    >
      {/* Indicator — sits above content, collapses to 0 when idle */}
      <div style={{
        height: visible ? `${pullY}px` : 0,
        overflow: 'hidden',
        transition: spinning ? 'none' : 'height 0.18s ease',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: visible ? 6 : 0,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 28, height: 28,
          border: `2.5px solid ${ready || spinning ? '#00C805' : '#2a2a2a'}`,
          borderTopColor: '#00C805',
          borderRadius: '50%',
          animation: spinning ? 'ptr-spin 0.65s linear infinite' : 'none',
          transform: !spinning ? `rotate(${Math.min(pullY / 39, 1) * 270}deg)` : undefined,
          transition: spinning ? 'none' : 'border-color 0.12s',
        }}/>
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg) } }`}</style>
      {children}
    </div>
  )
}

/* ── PC Refresh Button — shows on non-touch devices ── */
export function RefreshButton({ onRefresh, loading }) {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      title="Refresh data"
      style={{
        position: 'fixed',
        top: 'calc(var(--header-h) + 10px)',
        right: 16,
        zIndex: 200,
        width: 36, height: 36,
        borderRadius: '50%',
        background: 'rgba(0,200,5,0.08)',
        border: '1px solid rgba(0,200,5,0.25)',
        color: '#00C805',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: loading ? 'default' : 'pointer',
        opacity: loading ? 0.5 : 1,
        fontSize: '0.9rem',
        WebkitTapHighlightColor: 'transparent',
        // Only show on non-touch (desktop)
        '@media (hover: none)': { display: 'none' },
      }}
    >
      <span style={{ display: 'inline-block', animation: loading ? 'ptr-spin 0.8s linear infinite' : 'none' }}>↻</span>
    </button>
  )
}

/* ── Reusable ticker + company-name autocomplete input ── */
export function TickerAutocomplete({ value, onChange, onSelect, placeholder = 'Company name or ticker…', className = 'input', style }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow] = useState(false)
  const timer = useRef(null)

  const handleChange = (e) => {
    const v = e.target.value
    onChange(v)
    clearTimeout(timer.current)
    if (v.length >= 2) {
      timer.current = setTimeout(async () => {
        const res = await fetchTickerSearch(v)
        setSuggestions(res)
        setShow(res.length > 0)
      }, 280)
    } else {
      setSuggestions([]); setShow(false)
    }
  }

  const pick = (s) => {
    onChange(s.ticker)
    setSuggestions([]); setShow(false)
    onSelect && onSelect(s)
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        className={className}
        style={style}
        value={value}
        onChange={handleChange}
        onKeyDown={e => { if (e.key === 'Escape') setShow(false) }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder={placeholder}
        autoCorrect="off"
        spellCheck={false}
      />
      {show && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4,
          background: '#161616', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
        }}>
          {suggestions.map(s => (
            <div key={s.ticker}
              onMouseDown={() => pick(s)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: '#fff' }}>{s.ticker}</span>
                <span style={{ fontSize: '0.68rem', color: '#888', marginLeft: 8, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{s.name}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#555', flexShrink: 0 }}>{s.exchange}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
