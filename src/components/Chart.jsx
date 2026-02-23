import React, { useMemo } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Area } from 'recharts'

const GREEN = '#00C805'; const RED = '#FF5000'; const CYAN = '#00E5FF'; const GRAY1 = '#B2B2B2'; const GRAY4 = '#252525'

function calcRSI(closes) {
  if (!closes || closes.length < 15) return []
  const rsis = new Array(14).fill(null)
  for (let i = 14; i < closes.length; i++) {
    const diffs = closes.slice(i - 13, i + 1).map((c, j, arr) => j === 0 ? 0 : c - arr[j - 1]).slice(1)
    const g = diffs.map(d => d > 0 ? d : 0); const l = diffs.map(d => d < 0 ? -d : 0)
    const ag = g.reduce((a, b) => a + b, 0) / g.length; const al = l.reduce((a, b) => a + b, 0) / l.length
    const rs = al > 0 ? ag / al : 100
    rsis.push(parseFloat((100 - 100 / (1 + rs)).toFixed(1)))
  }
  return rsis
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111', border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: '#B2B2B2', marginBottom: 4 }}>{label}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ color: p.color || '#fff', marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? (p.name === 'Volume' ? (p.value / 1e6).toFixed(1) + 'M' : (p.name === 'RSI' ? p.value.toFixed(1) : '$' + p.value.toFixed(2))) : p.value}
        </div>
      ))}
    </div>
  )
}

export default function Chart({ candles, ma50, color = GREEN, ticker }) {
  const data = useMemo(() => {
    if (!candles) return []
    const { closes, highs, lows, volumes, timestamps } = candles
    const rsis = calcRSI(closes)
    const last60 = Math.max(0, closes.length - 60)
    return closes.slice(last60).map((c, i) => {
      const idx = i + last60
      const date = new Date(timestamps[idx] * 1000)
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const prev = closes[idx - 1] || c
      return {
        date: label, Close: parseFloat(c.toFixed(2)),
        High: parseFloat((highs?.[idx] || c).toFixed(2)),
        Low: parseFloat((lows?.[idx] || c).toFixed(2)),
        Volume: volumes?.[idx] || 0,
        RSI: rsis[idx] ?? null,
        barColor: c >= prev ? GREEN + '88' : RED + '66',
      }
    })
  }, [candles])

  if (!data.length) return <div style={{ color: '#B2B2B2', fontSize: '0.8rem', textAlign: 'center', padding: 24 }}>No chart data</div>

  const prices = data.map(d => d.Close).filter(Boolean)
  const yMin = Math.floor(Math.min(...prices) * 0.98)
  const yMax = Math.ceil(Math.max(...prices) * 1.02)
  const ticks = data.filter((_, i) => i % 12 === 0).map(d => d.date)

  return (
    <div>
      {/* Price chart */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: GRAY1, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
        {ticker} · Price · 60-day history
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRAY4} strokeDasharray="0" vertical={false} />
          <XAxis dataKey="date" ticks={ticks} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: GRAY1 }} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="Close" stroke={color} strokeWidth={2} fill={color + '12'} dot={false} name="Price" />
          {ma50 && <ReferenceLine y={ma50} stroke={GRAY1} strokeDasharray="4 4" label={{ value: `MA50 $${ma50}`, position: 'insideTopRight', fill: GRAY1, fontSize: 9, fontFamily: 'var(--font-mono)' }} />}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: GRAY1, margin: '12px 0 4px', letterSpacing: 1, textTransform: 'uppercase' }}>Volume</div>
      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="Volume" name="Volume" fill={GREEN + '44'} radius={[1, 1, 0, 0]} />
          <XAxis hide /><YAxis hide />
          <Tooltip content={<CustomTooltip />} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* RSI */}
      {data.some(d => d.RSI != null) && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: GRAY1, margin: '12px 0 4px', letterSpacing: 1, textTransform: 'uppercase' }}>RSI-14 Momentum</div>
          <ResponsiveContainer width="100%" height={80}>
            <ComposedChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} vertical={false} />
              <XAxis hide /><YAxis domain={[0, 100]} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} width={28} />
              <ReferenceLine y={70} stroke={RED} strokeDasharray="4 4" />
              <ReferenceLine y={30} stroke={GREEN} strokeDasharray="4 4" />
              <ReferenceLine y={50} stroke={GRAY4} strokeDasharray="2 4" />
              <Line type="monotone" dataKey="RSI" stroke={CYAN} strokeWidth={1.5} dot={false} name="RSI" connectNulls />
              <Tooltip content={<CustomTooltip />} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      {/* Legend */}
      <div style={{ background: '#111', border: '1px solid #252525', borderRadius: 8, padding: '10px 14px', marginTop: 10 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>How to read</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.74rem', color: GRAY1, lineHeight: 1.6 }}>
          <div><span style={{ color: GREEN }}>▌</span> Line rises = price up</div>
          <div>- - - Dotted = 50-day avg</div>
          <div>Volume bars = shares traded</div>
          <div><span style={{ color: CYAN }}>RSI</span> &gt;70 = overbought</div>
          <div>RSI &lt;30 = oversold/bounce</div>
          <div>RSI 40-60 = neutral</div>
        </div>
      </div>
    </div>
  )
}
