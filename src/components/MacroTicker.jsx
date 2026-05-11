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
  if (p >= 100)   return '$' + p.toFixed(2)
  if (p >= 1)     return '$' + p.toFixed(2)
  return '$' + p.toFixed(4)
}

function fmtPct(p) {
  if (p == null) return ''
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(2)}%`
}

export default function MacroTicker() {
  const [active, setActive] = useState('markets')
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

  const section = MACRO_SECTIONS[active]

  return (
    <div style={{
      background: '#080808',
      borderBottom: '1px solid #1c1c1c',
      userSelect: 'none',
    }}>
      {/* Category tabs */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        borderBottom: '1px solid #141414',
      }}>
        {Object.entries(MACRO_SECTIONS).map(([key, sec]) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              letterSpacing: '0.5px',
              fontWeight: active === key ? 700 : 400,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              color: active === key ? CYAN : '#555',
              borderBottom: active === key ? `2px solid ${CYAN}` : '2px solid transparent',
              transition: 'color 0.12s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {sec.label}
          </button>
        ))}
        {/* Refresh timestamp hint */}
        <div style={{
          flexShrink: 0, marginLeft: 'auto', padding: '6px 12px',
          fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: '#333',
          display: 'flex', alignItems: 'center',
        }}>
          {loading ? '…' : '↻ 5m'}
        </div>
      </div>

      {/* Scrollable items row */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        gap: 0,
      }}>
        {section.items.map(({ s, l }) => {
          const q   = quotes[s]
          const pct = q?.changePct ?? null
          const clr = pct == null ? G1 : pct > 0 ? GREEN : pct < 0 ? RED : G1
          return (
            <div
              key={s}
              style={{
                flexShrink: 0,
                padding: '7px 12px 8px',
                borderRight: '1px solid #141414',
                minWidth: 90,
              }}
            >
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.56rem',
                color: '#666', marginBottom: 2, whiteSpace: 'nowrap',
              }}>
                {l}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.74rem',
                color: '#fff', fontWeight: 600, lineHeight: 1.2,
              }}>
                {loading ? <span style={{ color:'#333' }}>———</span> : fmtPrice(q?.price)}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                color: clr, marginTop: 1,
              }}>
                {loading ? '' : pct != null ? fmtPct(pct) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
