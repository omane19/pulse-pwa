import React, { useState, useEffect, useCallback } from 'react'
import { fetchQuote, fetchTickerLite } from '../hooks/useApi.js'
import { fmtMcap, scoreAsset } from '../utils/scoring.js'
import { Toast, PullToRefresh } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'
const G1='#B2B2B2'; const G2='#111'; const G4='#252525'; const CYAN='#00E5FF'

/* ── Supabase-free local storage portfolio ── */
const KEY = 'pulse_portfolio_v1'
function loadHoldings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function saveHoldings(h) {
  try { localStorage.setItem(KEY, JSON.stringify(h)) } catch {}
}

function fmt(n, dec=2) { return n == null ? 'N/A' : n.toFixed(dec) }
function fmtDollar(n) {
  if (n == null) return 'N/A'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : '+'
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(1)}K`
  return `${n >= 0 ? '+' : '-'}$${abs.toFixed(2)}`
}

function AllocationBar({ holdings, prices }) {
  const total = holdings.reduce((s, h) => {
    const p = prices[h.ticker]?.c || h.avgCost
    return s + p * h.shares
  }, 0)
  if (!total) return null
  const items = holdings.map(h => {
    const p = prices[h.ticker]?.c || h.avgCost
    const val = p * h.shares
    return { ticker: h.ticker, pct: val / total * 100 }
  }).sort((a, b) => b.pct - a.pct).slice(0, 8)
  const COLORS = [CYAN, '#7B61FF', '#FF9500', GREEN, '#FF2D55', '#FFD700', '#5AC8FA', '#34C759']
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: G1, marginBottom: 8 }}>Allocation</div>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 1, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={it.ticker} style={{ width: `${it.pct}%`, background: COLORS[i % COLORS.length], minWidth: it.pct > 3 ? undefined : 0, transition: 'width 0.4s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {items.map((it, i) => (
          <div key={it.ticker} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: G1 }}>{it.ticker} {it.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddHoldingForm({ onAdd, onCancel }) {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [cost,   setCost]   = useState('')
  const [date,   setDate]   = useState('')
  const [err,    setErr]    = useState(null)

  const submit = () => {
    const t = ticker.trim().toUpperCase()
    const s = parseFloat(shares)
    const c = parseFloat(cost)
    if (!t)       { setErr('Enter a ticker'); return }
    if (!s || s <= 0) { setErr('Enter valid share count'); return }
    if (!c || c <= 0) { setErr('Enter valid cost basis'); return }
    onAdd({ ticker: t, shares: s, avgCost: c, dateAdded: date || new Date().toISOString().split('T')[0] })
  }

  return (
    <div style={{ background: G2, border: `1px solid ${CYAN}30`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: CYAN, marginBottom: 12, letterSpacing: 0.5 }}>Add Position</div>
      {err && <div style={{ color: RED, fontSize: '0.7rem', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.58rem', color: G1, marginBottom: 4, letterSpacing: 0.5 }}>TICKER</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '10px 12px' }}
            value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL" autoCapitalize="characters" autoCorrect="off" />
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', color: G1, marginBottom: 4, letterSpacing: 0.5 }}>SHARES</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '10px 12px' }}
            value={shares} onChange={e => setShares(e.target.value)}
            placeholder="e.g. 10" type="number" min="0" step="any" />
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', color: G1, marginBottom: 4, letterSpacing: 0.5 }}>AVG COST / SHARE ($)</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '10px 12px' }}
            value={cost} onChange={e => setCost(e.target.value)}
            placeholder="e.g. 150.00" type="number" min="0" step="any" />
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', color: G1, marginBottom: 4, letterSpacing: 0.5 }}>BUY DATE (opt)</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '10px 12px' }}
            value={date} onChange={e => setDate(e.target.value)} type="date" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} style={{ flex: 1 }}>Add Position</button>
        <button className="btn" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
      </div>
    </div>
  )
}

export default function Portfolio({ onNavigateToDive }) {
  const [holdings, setHoldings] = useState(loadHoldings)
  const [prices,   setPrices]   = useState({})
  const [scores,   setScores]   = useState({})  // PULSE scores per holding
  const [loading,  setLoading]  = useState(false)
  const [showAdd,  setShowAdd]  = useState(false)
  const [toast,    setToast]    = useState(null)
  const [editIdx,  setEditIdx]  = useState(null)
  const [sortBy,   setSortBy]   = useState('value') // value | pnl | pnlpct

  const refreshPrices = useCallback(async () => {
    if (!holdings.length) return
    setLoading(true)
    const tickers = [...new Set(holdings.map(h => h.ticker))]
    const results = await Promise.all(tickers.map(t => fetchQuote(t).then(q => [t, q])))
    const map = {}
    results.forEach(([t, q]) => { if (q) map[t] = q })
    setPrices(map)
    setLoading(false)
    // Fetch PULSE scores in background — non-blocking
    const ea = v => Array.isArray(v) ? v : []
    for (const t of tickers) {
      fetchTickerLite(t).then(data => {
        if (!data) return
        const r = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, ea(data.news), data.rec, ea(data.earnings), undefined, { ticker: t })
        setScores(prev => ({ ...prev, [t]: { pct: r.pct, verdict: r.verdict, color: r.color, isQualityDip: r.isQualityDip } }))
      }).catch(() => {})
    }
  }, [holdings])

  useEffect(() => { if (holdings.length) refreshPrices() }, []) // eslint-disable-line

  const addHolding = (h) => {
    // Merge with existing if same ticker
    const existing = holdings.findIndex(x => x.ticker === h.ticker)
    let updated
    if (existing >= 0) {
      const e = holdings[existing]
      const totalShares = e.shares + h.shares
      const newAvgCost = (e.shares * e.avgCost + h.shares * h.avgCost) / totalShares
      updated = holdings.map((x, i) => i === existing ? { ...x, shares: totalShares, avgCost: parseFloat(newAvgCost.toFixed(4)) } : x)
    } else {
      updated = [...holdings, h]
    }
    setHoldings(updated)
    saveHoldings(updated)
    setShowAdd(false)
    setToast(`Added ${h.ticker}`)
    // Fetch price for new ticker immediately
    fetchQuote(h.ticker).then(q => { if (q) setPrices(p => ({ ...p, [h.ticker]: q })) })
  }

  const removeHolding = (ticker) => {
    const updated = holdings.filter(h => h.ticker !== ticker)
    setHoldings(updated)
    saveHoldings(updated)
    setToast(`Removed ${ticker}`)
  }

  const updateHolding = (idx, shares, avgCost) => {
    const updated = holdings.map((h, i) => i === idx ? { ...h, shares: parseFloat(shares), avgCost: parseFloat(avgCost) } : h)
    setHoldings(updated)
    saveHoldings(updated)
    setEditIdx(null)
    setToast('Updated')
  }

  // Derived portfolio stats
  const enriched = holdings.map(h => {
    const q = prices[h.ticker]
    const currentPrice = q?.c || null
    const currentValue = currentPrice ? currentPrice * h.shares : null
    const costBasis    = h.avgCost * h.shares
    const pnl          = currentValue != null ? currentValue - costBasis : null
    const pnlPct       = pnl != null ? pnl / costBasis * 100 : null
    const dayChange    = q ? q.dp : null
    return { ...h, currentPrice, currentValue, costBasis, pnl, pnlPct, dayChange, quote: q }
  })

  const sorted = [...enriched].sort((a, b) => {
    if (sortBy === 'value')  return (b.currentValue || 0) - (a.currentValue || 0)
    if (sortBy === 'pnl')    return (b.pnl || 0) - (a.pnl || 0)
    if (sortBy === 'pnlpct') return (b.pnlPct || 0) - (a.pnlPct || 0)
    return 0
  })

  const totalValue    = enriched.reduce((s, h) => s + (h.currentValue || 0), 0)
  const totalCost     = enriched.reduce((s, h) => s + h.costBasis, 0)
  const totalPnL      = totalValue - totalCost
  const totalPnLPct   = totalCost > 0 ? totalPnL / totalCost * 100 : 0
  const dayPnL        = enriched.reduce((s, h) => {
    if (h.currentValue == null || h.dayChange == null) return s
    // Use previous close value as base: currentValue / (1 + dayChange%) × dayChange%
    const prevValue = h.currentValue / (1 + h.dayChange / 100)
    return s + prevValue * (h.dayChange / 100)
  }, 0)

  return (
    <PullToRefresh onRefresh={refreshPrices} enabled={holdings.length > 0}>
    <div className="page">

      {/* Summary header */}
      {holdings.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '0.58rem', color: G1, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 2 }}>Total Value</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
                {totalValue ? `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: totalPnL >= 0 ? GREEN : RED, fontWeight: 700 }}>
                {fmtDollar(totalPnL)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: totalPnLPct >= 0 ? GREEN : RED }}>
                {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}% total
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: dayPnL >= 0 ? GREEN : RED, marginTop: 2 }}>
                {fmtDollar(dayPnL)} today
              </div>
            </div>
          </div>

          {/* Summary stats row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              ['Positions', holdings.length, null],
              ['Cost Basis', `$${(totalCost/1e3).toFixed(1)}K`, null],
              ['Winners', enriched.filter(h => (h.pnlPct||0) > 0).length, GREEN],
              ['Losers',  enriched.filter(h => (h.pnlPct||0) < 0).length, RED],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-cell" style={{ flex: 1, minWidth: 0 }}>
                <div className="metric-label">{l}</div>
                <div className="metric-value" style={c ? { color: c } : {}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocation bar */}
      {holdings.length > 1 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <AllocationBar holdings={holdings} prices={prices} />
        </div>
      )}

      {/* Add form or button */}
      {showAdd ? (
        <AddHoldingForm onAdd={addHolding} onCancel={() => setShowAdd(false)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ flex: 1 }}>+ Add Position</button>
          {holdings.length > 0 && (
            <button className="btn" onClick={refreshPrices} disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          )}
        </div>
      )}

      {/* Sort controls */}
      {holdings.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['value','Value'],['pnl','P&L $'],['pnlpct','P&L %']].map(([k,l]) => (
            <button key={k} onClick={() => setSortBy(k)} style={{
              flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${sortBy===k ? CYAN : G4}`,
              background: sortBy===k ? `${CYAN}15` : 'transparent', color: sortBy===k ? CYAN : G1,
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', cursor: 'pointer', letterSpacing: 0.5
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {holdings.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: G1 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: '0.86rem', lineHeight: 1.8 }}>Track your actual holdings.<br />Add positions to see real P&L.</p>
        </div>
      )}

      {/* Holdings list */}
      {sorted.map((h, idx) => {
        const realIdx = holdings.findIndex(x => x.ticker === h.ticker)
        const isEditing = editIdx === realIdx
        return (
          <div key={h.ticker} style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            {isEditing ? (
              <EditRow h={h} onSave={(s, c) => updateHolding(realIdx, s, c)} onCancel={() => setEditIdx(null)} />
            ) : (
              <div onClick={() => onNavigateToDive && onNavigateToDive(h.ticker)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>{h.ticker}</div>
                        {scores[h.ticker] && (() => {
                          const sc = scores[h.ticker]
                          const bg = `${sc.color}18`
                          const border = `1px solid ${sc.color}40`
                          return (
                            <div style={{ display:'flex', alignItems:'center', gap:4, background:bg, border, borderRadius:6, padding:'2px 7px' }}>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', fontWeight:700, color:sc.color }}>{Math.round(sc.pct)}</span>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.55rem', color:sc.color }}>{sc.verdict}</span>
                              {sc.isQualityDip && <span style={{ fontSize:'0.6rem' }}>💎</span>}
                            </div>
                          )
                        })()}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: G1, marginTop: 1 }}>
                        {h.shares} shares · avg ${fmt(h.avgCost)}
                      </div>
                      {/* Exit signal alert */}
                      {scores[h.ticker]?.verdict === 'AVOID' && (
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#FF5000', marginTop:3, background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.25)', borderRadius:5, padding:'2px 7px', display:'inline-block' }}>
                          ⚠ Exit signal — review position
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {h.currentPrice ? (
                      <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#fff', fontWeight: 600 }}>${fmt(h.currentPrice)}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: (h.dayChange||0) >= 0 ? GREEN : RED }}>
                          {(h.dayChange||0) >= 0 ? '+' : ''}{fmt(h.dayChange)}% today
                        </div>
                      </>
                    ) : (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: G1 }}>{loading ? '…' : 'N/A'}</div>
                    )}
                  </div>
                </div>

                {/* P&L row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${G4}` }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: G1 }}>Value</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#fff' }}>
                      {h.currentValue ? `$${h.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: G1 }}>P&L</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: h.pnl == null ? G1 : h.pnl >= 0 ? GREEN : RED }}>
                      {h.pnl == null ? '—' : `${h.pnl >= 0 ? '+' : '-'}$${Math.abs(h.pnl).toFixed(2)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: G1 }}>Return</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: h.pnlPct == null ? G1 : h.pnlPct >= 0 ? GREEN : RED }}>
                      {h.pnlPct == null ? '—' : `${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(2)}%`}
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  <button className="btn" style={{ flex: 1, padding: '5px 0', fontSize: '0.62rem' }}
                    onClick={() => setEditIdx(realIdx)}>✎ Edit</button>
                  <button className="btn btn-danger" style={{ flex: 1, padding: '5px 0', fontSize: '0.62rem' }}
                    onClick={() => removeHolding(h.ticker)}>✕ Remove</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </PullToRefresh>
  )
}

function EditRow({ h, onSave, onCancel }) {
  const [shares, setShares] = useState(String(h.shares))
  const [cost,   setCost]   = useState(String(h.avgCost))
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: '#00E5FF', marginBottom: 10, fontWeight: 700 }}>Edit {h.ticker}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.58rem', color: '#B2B2B2', marginBottom: 4 }}>SHARES</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '8px 10px' }}
            value={shares} onChange={e => setShares(e.target.value)} type="number" min="0" step="any" />
        </div>
        <div>
          <div style={{ fontSize: '0.58rem', color: '#B2B2B2', marginBottom: 4 }}>AVG COST ($)</div>
          <input className="input" style={{ fontSize: '0.82rem', padding: '8px 10px' }}
            value={cost} onChange={e => setCost(e.target.value)} type="number" min="0" step="any" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => onSave(shares, cost)} style={{ flex: 1, padding: '7px 0', fontSize: '0.72rem' }}>Save</button>
        <button className="btn" onClick={onCancel} style={{ flex: 1, padding: '7px 0', fontSize: '0.72rem' }}>Cancel</button>
      </div>
    </div>
  )
}
