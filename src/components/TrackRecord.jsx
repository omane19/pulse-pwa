import React, { useState, useEffect, useCallback } from 'react'
import { loadSignals, updateOutcome, deleteSignal, computeStats } from '../hooks/useSignalLog.js'
import { fetchQuote } from '../hooks/useApi.js'
import { PullToRefresh, SectionHeader, Toast } from './shared.jsx'

const GREEN  = '#00C805'
const RED    = '#FF5000'
const YELLOW = '#FFD700'
const CYAN   = '#00E5FF'
const G1     = '#E8E8E8'
const G2     = '#1A1A1A'
const G4     = '#2A2A2A'

function fmt(n) { return n != null ? `${n >= 0 ? '+' : ''}${n}%` : '—' }
function fmtPrice(p) { return p != null ? `$${Number(p).toFixed(2)}` : '—' }
function daysAgo(ts) { return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) }
function outcomeColor(r) { return r == null ? '#666' : r > 0 ? GREEN : r < 0 ? RED : YELLOW }

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 100 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#666', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: color || G1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#666', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function FactorRow({ label, score }) {
  if (score == null) return null
  const pct = Math.max(0, ((score + 1) / 2 * 100))
  const color = score > 0.2 ? GREEN : score < -0.2 ? RED : YELLOW
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#888', width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: '#2A2A2A', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color, width: 26, textAlign: 'right' }}>{Math.round(pct)}</span>
    </div>
  )
}

function SignalCard({ signal, onDelete, onExpand, expanded }) {
  const age   = daysAgo(signal.tracked_at)
  const r30   = signal.return_30d
  const r60   = signal.return_60d
  const r90   = signal.return_90d
  const vColor = signal.verdict === 'BUY' ? GREEN : signal.verdict === 'HOLD' ? YELLOW : RED
  const bestReturn = r90 ?? r60 ?? r30
  const accentColor = bestReturn != null ? outcomeColor(bestReturn) : vColor

  return (
    <div style={{ background: G2, border: `1px solid ${G4}`, borderLeft: `3px solid ${accentColor}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => onExpand(signal.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: G1 }}>{signal.ticker}</span>
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: vColor, background: `${vColor}18`, padding: '2px 7px', borderRadius: 5 }}>
              {signal.verdict}
            </span>
            <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#888' }}>
              {signal.score}/100
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: G1 }}>{fmtPrice(signal.price_at_signal)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#666', marginTop: 2 }}>{age}d ago</div>
          </div>
        </div>

        {/* Outcome row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          {[['30d', r30], ['60d', r60], ['90d', r90]].map(([label, ret]) => (
            <div key={label} style={{ flex: 1, background: '#111', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#555', marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: outcomeColor(ret) }}>
                {age < parseInt(label) && ret == null ? <span style={{ color: '#444' }}>pending</span> : fmt(ret)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded: full factor breakdown + reasons */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${G4}`, padding: '12px 14px' }}>
          {signal.factors && Object.keys(signal.factors).length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#555', marginBottom: 8, letterSpacing: '0.5px' }}>FACTOR SCORES AT SIGNAL TIME</div>
              {Object.entries(signal.factors).map(([k, v]) => (
                <FactorRow key={k} label={k} score={v} />
              ))}
            </>
          )}

          {signal.reasons && Object.keys(signal.reasons).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#555', marginBottom: 8, letterSpacing: '0.5px' }}>REASONING</div>
              {Object.entries(signal.reasons).map(([factor, lines]) => (
                Array.isArray(lines) && lines.length > 0 && (
                  <div key={factor} style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: CYAN }}>{factor}: </span>
                    <span style={{ fontSize: '0.72rem', color: '#AAA' }}>{lines.join(' · ')}</span>
                  </div>
                )
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#555' }}>
              Tracked: {new Date(signal.tracked_at).toLocaleDateString()}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => onDelete(signal.id)}
              style={{ background: 'transparent', border: `1px solid rgba(255,80,0,0.3)`, color: RED, borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer' }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TrackRecord() {
  const [signals,    setSignals]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [updating,   setUpdating]   = useState(false)
  const [expanded,   setExpanded]   = useState(null)
  const [toast,      setToast]      = useState(null)
  const [filter,     setFilter]     = useState('all') // all | buy | pending

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadSignals()
      setSignals(data)
    } catch { setSignals([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-update prices for signals that need 30/60/90d outcomes
  const updatePrices = useCallback(async () => {
    const pending = signals.filter(s => {
      const age = daysAgo(s.tracked_at)
      return (age >= 30 && s.return_30d == null) ||
             (age >= 60 && s.return_60d == null) ||
             (age >= 90 && s.return_90d == null)
    })
    if (!pending.length) { showToast('All outcomes up to date'); return }

    setUpdating(true)
    const tickers = [...new Set(pending.map(s => s.ticker))]
    const prices  = {}

    for (const t of tickers) {
      try {
        const q = await fetchQuote(t)
        if (q?.c) prices[t] = q.c
      } catch {}
    }

    for (const s of pending) {
      const currentPrice = prices[s.ticker]
      if (!currentPrice) continue
      const age = daysAgo(s.tracked_at)
      await updateOutcome(s.id, {
        price30:       age >= 30  ? (s.price_30d  ?? currentPrice) : undefined,
        price60:       age >= 60  ? (s.price_60d  ?? currentPrice) : undefined,
        price90:       age >= 90  ? (s.price_90d  ?? currentPrice) : undefined,
        priceAtSignal: s.price_at_signal,
      })
    }

    setUpdating(false)
    showToast(`Updated ${pending.length} outcomes`)
    await load()
  }, [signals, load])

  const handleDelete = async (id) => {
    await deleteSignal(id)
    setSignals(prev => prev.filter(s => s.id !== id))
    showToast('Signal deleted')
  }

  const handleExpand = (id) => setExpanded(prev => prev === id ? null : id)

  const filtered = signals.filter(s => {
    if (filter === 'buy')     return s.verdict === 'BUY'
    if (filter === 'pending') return s.return_30d == null && daysAgo(s.tracked_at) >= 30
    return true
  })

  const stats = computeStats(signals)

  return (
    <PullToRefresh onRefresh={load} enabled>
    <div className="page">
      <SectionHeader title="Track Record" sub="Your PULSE signal call history" />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="TOTAL CALLS"  value={stats.total} />
        <StatCard label="BUY WIN RATE" value={stats.winRate != null ? `${stats.winRate}%` : '—'} color={stats.winRate >= 60 ? GREEN : stats.winRate >= 45 ? YELLOW : RED} sub={`${stats.buyWins}/${stats.buyCalls} BUYs`} />
        <StatCard label="AVG RETURN"   value={stats.avgReturn != null ? fmt(parseFloat(stats.avgReturn)) : '—'} color={parseFloat(stats.avgReturn) > 0 ? GREEN : RED} sub="on BUY calls (30d)" />
      </div>

      {/* Best/Worst */}
      {stats.best && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'rgba(0,200,5,0.06)', border: '1px solid rgba(0,200,5,0.2)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GREEN, marginBottom: 4 }}>BEST CALL</div>
            <div style={{ fontWeight: 700, color: G1 }}>{stats.best.ticker}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: GREEN }}>{fmt(stats.best.return_30d)}</div>
          </div>
          {stats.worst && (
            <div style={{ flex: 1, background: 'rgba(255,80,0,0.06)', border: '1px solid rgba(255,80,0,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: RED, marginBottom: 4 }}>WORST CALL</div>
              <div style={{ fontWeight: 700, color: G1 }}>{stats.worst.ticker}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: RED }}>{fmt(stats.worst.return_30d)}</div>
            </div>
          )}
        </div>
      )}

      {/* Supabase setup reminder */}
      {!import.meta.env.VITE_SUPABASE_URL && (
        <div style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.78rem', color: YELLOW, lineHeight: 1.6 }}>
          ⚠ Running on local storage only — data won't sync across devices.<br/>
          <span style={{ color: '#888', fontSize: '0.72rem' }}>Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to Vercel env vars to enable cross-device sync.</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-secondary" style={{ flex: 1, padding: '9px 14px', fontSize: '0.78rem' }}
          onClick={updatePrices} disabled={updating}>
          {updating ? 'Updating…' : '🔄 Update Outcomes'}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['all', 'All'], ['buy', 'BUY Only'], ['pending', 'Pending']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ flex: 1, padding: '7px 10px', fontSize: '0.72rem', borderRadius: 8, border: `1px solid ${filter === v ? CYAN : G4}`, background: filter === v ? 'rgba(0,229,255,0.08)' : G2, color: filter === v ? CYAN : '#888', cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Signal list */}
      {loading && (
        <div style={{ textAlign: 'center', color: '#555', padding: 40, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          Loading track record…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
          <div style={{ color: G1, fontWeight: 600, marginBottom: 8 }}>No signals tracked yet</div>
          <div style={{ color: '#666', fontSize: '0.82rem', lineHeight: 1.6 }}>
            Go to Dive, analyze a stock, and tap<br/>
            <span style={{ color: CYAN }}>Track This Call</span> when you see a BUY signal.
          </div>
        </div>
      )}

      {!loading && filtered.map(s => (
        <SignalCard
          key={s.id}
          signal={s}
          expanded={expanded === s.id}
          onExpand={handleExpand}
          onDelete={handleDelete}
        />
      ))}

      {toast && <Toast message={toast} />}
    </div>
    </PullToRefresh>
  )
}
