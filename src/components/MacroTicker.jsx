import React, { useState, useEffect } from 'react'
import { fetchMacroTicker, MACRO_SECTIONS } from '../hooks/useApi.js'

const GREEN = '#00C805'
const RED   = '#FF5000'
const G1    = '#B2B2B2'
const CYAN  = '#00E5FF'

function fmtPrice(p) {
  if (p == null) return '—'
  if (p >= 10000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1000)  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1)     return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

function fmtPct(p) {
  if (p == null) return ''
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(2)}%`
}

export default function MacroTicker() {
  // US Markets open by default, others closed
  const [open, setOpen] = useState({ markets: true, crypto: false, commodities: false })
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const data = await fetchMacroTicker()
      if (!cancelled) { setQuotes(data); setLoading(false) }
    }
    load()
    const id = setInterval(load, 300000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const toggle = key => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div style={{ background: '#080808', borderBottom: '1px solid #1e1e1e' }}>
      {Object.entries(MACRO_SECTIONS).map(([key, sec], idx) => {
        const isOpen = open[key]
        const isLast = idx === Object.keys(MACRO_SECTIONS).length - 1

        return (
          <div key={key}>
            {/* Row header — always visible, tap to expand/collapse */}
            <div
              onClick={() => toggle(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 14px',
                cursor: 'pointer',
                borderBottom: `1px solid ${isOpen ? '#1a1a1a' : (isLast && !isOpen ? 'none' : '#141414')}`,
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.5px',
                color: isOpen ? CYAN : '#555',
                flex: 1,
                transition: 'color 0.15s',
              }}>
                {sec.label}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.52rem',
                color: isOpen ? CYAN : '#444',
                transition: 'color 0.15s',
              }}>
                {isOpen ? '▾' : '▸'}
              </span>
            </div>

            {/* Row content — shown when expanded */}
            {isOpen && (
              <div style={{
                display: 'flex',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                borderBottom: isLast ? 'none' : '1px solid #141414',
              }}>
                {sec.items.map(({ s, l }) => {
                  const q   = quotes[s]
                  const pct = q?.changePct ?? null
                  const clr = pct == null ? G1 : pct > 0 ? GREEN : pct < 0 ? RED : G1

                  return (
                    <div
                      key={s}
                      style={{
                        flexShrink: 0,
                        padding: '6px 12px 8px',
                        borderRight: '1px solid #141414',
                        minWidth: 82,
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.54rem',
                        color: '#555',
                        marginBottom: 2,
                        whiteSpace: 'nowrap',
                      }}>
                        {l}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: '#ddd',
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}>
                        {loading
                          ? <span style={{ color: '#222' }}>———</span>
                          : fmtPrice(q?.price)
                        }
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.58rem',
                        color: clr,
                        marginTop: 1,
                      }}>
                        {loading ? '' : pct != null ? fmtPct(pct) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
