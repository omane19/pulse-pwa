import React, { useState } from 'react'
import { timeAgo, getTier } from '../utils/scoring.js'
import { SOURCE_TIERS } from '../utils/constants.js'
import { smartSummary } from '../utils/scoring.js'

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
