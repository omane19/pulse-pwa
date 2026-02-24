import React, { useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from 'recharts'

const GREEN = '#00C805'; const RED = '#FF5000'; const CYAN = '#00E5FF'
const GRAY1 = '#B2B2B2'; const GRAY4 = '#252525'; const GRAY5 = '#1a1a1a'

/* ── RSI Calculator ──────────────────────────────────────────────── */
function calcRSI(closes) {
  if (!closes || closes.length < 15) return []
  const rsis = new Array(14).fill(null)
  for (let i = 14; i < closes.length; i++) {
    const diffs = closes.slice(i - 13, i + 1).map((c, j, arr) => j === 0 ? 0 : c - arr[j - 1]).slice(1)
    const g = diffs.map(d => d > 0 ? d : 0); const l = diffs.map(d => d < 0 ? -d : 0)
    const ag = g.reduce((a, b) => a + b, 0) / g.length
    const al = l.reduce((a, b) => a + b, 0) / l.length
    const rs = al > 0 ? ag / al : 100
    rsis.push(parseFloat((100 - 100 / (1 + rs)).toFixed(1)))
  }
  return rsis
}

/* ── Custom Candlestick Shape ───────────────────────────────────── */
function CandleShape(props) {
  const { x, y, width, height, open, close, high, low, yScale, payloadIndex, chartData } = props
  if (!yScale || x == null) return null

  const d = chartData?.[payloadIndex]
  if (!d) return null

  const bullish = d.close >= d.open
  const color   = bullish ? GREEN : RED
  const bodyTop  = yScale(Math.max(d.open, d.close))
  const bodyBot  = yScale(Math.min(d.open, d.close))
  const bodyH    = Math.max(bodyBot - bodyTop, 1)
  const wickTop  = yScale(d.high)
  const wickBot  = yScale(d.low)
  const cx       = x + width / 2
  const bw       = Math.max(width - 2, 2)

  return (
    <g>
      {/* Wick */}
      <line x1={cx} y1={wickTop} x2={cx} y2={wickBot} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect x={x + 1} y={bodyTop} width={bw} height={bodyH}
        fill={bullish ? color + 'CC' : color}
        stroke={color} strokeWidth={0.5} />
    </g>
  )
}

/* ── Tooltip ─────────────────────────────────────────────────────── */
function CandleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const bullish = d.close >= d.open
  const chg = d.open > 0 ? ((d.close - d.open) / d.open * 100).toFixed(2) : 0
  return (
    <div style={{ background: '#0d0d0d', border: `1px solid ${bullish ? GREEN : RED}44`, borderRadius: 8, padding: '10px 14px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', minWidth: 140 }}>
      <div style={{ color: GRAY1, marginBottom: 6, fontSize: '0.64rem' }}>{label}</div>
      <div style={{ color: bullish ? GREEN : RED, fontWeight: 700, marginBottom: 4 }}>
        {bullish ? '▲' : '▼'} {bullish ? '+' : ''}{chg}%
      </div>
      {[['O', d.open], ['H', d.high], ['L', d.low], ['C', d.close]].map(([k, v]) => (
        <div key={k} style={{ color: '#fff', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: GRAY1 }}>{k}</span>
          <span>${v?.toFixed(2)}</span>
        </div>
      ))}
      {d.volume > 0 && (
        <div style={{ color: GRAY1, marginTop: 4, fontSize: '0.62rem' }}>
          Vol {(d.volume / 1e6).toFixed(2)}M
        </div>
      )}
    </div>
  )
}

/* ── RSI Tooltip ─────────────────────────────────────────────────── */
function RSITooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rsi = payload[0]?.value
  const zone = rsi > 70 ? { label: 'Overbought — momentum stretched', color: RED }
    : rsi < 30 ? { label: 'Oversold — potential bounce zone', color: GREEN }
    : rsi > 50 ? { label: 'Bullish momentum', color: GREEN + 'AA' }
    : { label: 'Bearish momentum', color: RED + 'AA' }
  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: GRAY1, marginBottom: 4, fontSize: '0.62rem' }}>{label}</div>
      <div style={{ color: zone.color, fontWeight: 700 }}>RSI {rsi?.toFixed(1)}</div>
      <div style={{ color: GRAY1, fontSize: '0.64rem', marginTop: 2 }}>{zone.label}</div>
    </div>
  )
}

/* ── Chart Patterns Detector ─────────────────────────────────────── */
function detectPatterns(data) {
  if (!data || data.length < 5) return []
  const patterns = []
  const last = data[data.length - 1]
  const prev = data[data.length - 2]
  const prev2 = data[data.length - 3]

  // Doji — open ≈ close (indecision)
  if (Math.abs(last.close - last.open) / last.open < 0.002) {
    patterns.push({ name: 'Doji', icon: '⚖️', desc: 'Open and close nearly identical — market indecision. Often signals a trend reversal, especially after a strong run.' })
  }

  // Hammer — long lower wick, small body near top
  const lastRange = last.high - last.low
  const lastBody  = Math.abs(last.close - last.open)
  const lowerWick = Math.min(last.open, last.close) - last.low
  if (lastRange > 0 && lowerWick / lastRange > 0.6 && lastBody / lastRange < 0.3) {
    patterns.push({ name: 'Hammer', icon: '🔨', desc: 'Long lower wick with small body — sellers pushed price down hard but buyers recovered. Bullish reversal signal after a downtrend.' })
  }

  // Shooting Star — long upper wick, small body near bottom
  const upperWick = last.high - Math.max(last.open, last.close)
  if (lastRange > 0 && upperWick / lastRange > 0.6 && lastBody / lastRange < 0.3) {
    patterns.push({ name: 'Shooting Star', icon: '💫', desc: 'Long upper wick — buyers tried to push higher but sellers took control. Bearish reversal signal after an uptrend.' })
  }

  // Bullish Engulfing
  if (prev.close < prev.open && last.close > last.open &&
      last.close > prev.open && last.open < prev.close) {
    patterns.push({ name: 'Bullish Engulfing', icon: '🟢', desc: 'Green candle completely swallows the previous red candle — strong reversal signal. Buyers have taken over from sellers decisively.' })
  }

  // Bearish Engulfing
  if (prev.close > prev.open && last.close < last.open &&
      last.close < prev.open && last.open > prev.close) {
    patterns.push({ name: 'Bearish Engulfing', icon: '🔴', desc: 'Red candle completely swallows the previous green candle — sellers have taken over. Often marks the end of a rally.' })
  }

  // Three consecutive green days (momentum)
  if (data.length >= 3) {
    const last3 = data.slice(-3)
    if (last3.every(d => d.close > d.open)) {
      patterns.push({ name: '3-Day Rally', icon: '🚀', desc: '3 consecutive bullish closes. Short-term momentum is strong. Can signal continuation or short-term exhaustion — check RSI.' })
    }
  }

  // Three consecutive red days (selling pressure)
  if (data.length >= 3) {
    const last3 = data.slice(-3)
    if (last3.every(d => d.close < d.open)) {
      patterns.push({ name: '3-Day Decline', icon: '📉', desc: '3 consecutive bearish closes. Selling pressure is sustained. Watch for a support level or RSI oversold bounce.' })
    }
  }

  return patterns
}

/* ── Volume Analysis ─────────────────────────────────────────────── */
function analyzeVolume(data) {
  if (!data || data.length < 10) return null
  const recent = data.slice(-5)
  const baseline = data.slice(-20, -5)
  const avgBaseline = baseline.reduce((s, d) => s + d.volume, 0) / baseline.length
  const avgRecent   = recent.reduce((s, d) => s + d.volume, 0) / recent.length
  const ratio = avgBaseline > 0 ? avgRecent / avgBaseline : 1
  const lastDay = data[data.length - 1]
  const lastBullish = lastDay.close > lastDay.open

  if (ratio > 1.5 && lastBullish) return { icon: '📊', label: 'Volume surge on up move', detail: `Volume ${((ratio - 1) * 100).toFixed(0)}% above average on recent gains — institutional buying likely. High-volume moves tend to be more sustainable.`, color: GREEN }
  if (ratio > 1.5 && !lastBullish) return { icon: '🚨', label: 'Volume surge on down move', detail: `Volume ${((ratio - 1) * 100).toFixed(0)}% above average on recent declines — distribution signal. Heavy selling is worse than light selling.`, color: RED }
  if (ratio < 0.6) return { icon: '😴', label: 'Low volume — weak conviction', detail: 'Volume well below average. Moves on low volume are less reliable — the market isn\'t committing. Wait for volume to confirm direction.', color: GRAY1 }
  return { icon: '📈', label: 'Normal volume', detail: 'Volume in line with recent average. No unusual activity detected.', color: GRAY1 }
}

/* ── Support / Resistance ─────────────────────────────────────────── */
function findSupportResistance(data, currentPrice) {
  if (!data || data.length < 20) return null
  const lows  = data.map(d => d.low).sort((a, b) => a - b)
  const highs = data.map(d => d.high).sort((a, b) => b - a)
  // Find clusters
  const support    = lows.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  const resistance = highs.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  const distSupport    = currentPrice > 0 ? ((currentPrice - support) / currentPrice * 100).toFixed(1) : 0
  const distResistance = currentPrice > 0 ? ((resistance - currentPrice) / currentPrice * 100).toFixed(1) : 0
  return { support: support.toFixed(2), resistance: resistance.toFixed(2), distSupport, distResistance }
}

/* ── Main Chart Component ─────────────────────────────────────────── */
export default function Chart({ candles, ma50, color = GREEN, ticker }) {
  const [tab, setTab] = useState('candles') // candles | rsi | volume

  const { data, patterns, volumeAnalysis, srLevels, currentRSI } = useMemo(() => {
    if (!candles) return { data: [], patterns: [], volumeAnalysis: null, srLevels: null, currentRSI: null }
    const { closes, highs, lows, opens, volumes, timestamps } = candles
    const rsis = calcRSI(closes)
    const last60 = Math.max(0, closes.length - 60)

    const data = closes.slice(last60).map((c, i) => {
      const idx = i + last60
      const date = new Date(timestamps[idx] * 1000)
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        open:   parseFloat((opens?.[idx] || c).toFixed(2)),
        high:   parseFloat((highs?.[idx] || c).toFixed(2)),
        low:    parseFloat((lows?.[idx]  || c).toFixed(2)),
        close:  parseFloat(c.toFixed(2)),
        volume: volumes?.[idx] || 0,
        rsi:    rsis[idx] ?? null,
        // For recharts Bar — value = price range for candle body position trick
        candleVal: parseFloat(c.toFixed(2)),
      }
    })

    const lastRSI = [...rsis].reverse().find(r => r != null)
    return {
      data,
      patterns: detectPatterns(data),
      volumeAnalysis: analyzeVolume(data),
      srLevels: findSupportResistance(data, closes[closes.length - 1]),
      currentRSI: lastRSI
    }
  }, [candles])

  if (!data.length) return <div style={{ color: GRAY1, fontSize: '0.8rem', textAlign: 'center', padding: 24 }}>No chart data</div>

  const prices  = data.map(d => d.close).filter(Boolean)
  const allLows = data.map(d => d.low).filter(Boolean)
  const allHighs= data.map(d => d.high).filter(Boolean)
  const yMin = Math.floor(Math.min(...allLows) * 0.98)
  const yMax = Math.ceil(Math.max(...allHighs) * 1.02)
  const ticks = data.filter((_, i) => i % 10 === 0).map(d => d.date)
  const currentPrice = data[data.length - 1]?.close

  const rsiColor = currentRSI > 70 ? RED : currentRSI < 30 ? GREEN : CYAN
  const rsiLabel = currentRSI > 70 ? 'Overbought' : currentRSI < 30 ? 'Oversold' : currentRSI > 50 ? 'Bullish' : 'Bearish'

  // Build a custom yScale approximation for CandleShape
  // We need to pass a scale function that maps price → pixel y
  // Recharts gives us this through yAxisMap but it's easier to compute manually
  const CHART_H = 220
  const CHART_MARGIN_TOP = 6
  const yScale = (price) => {
    const ratio = (yMax - price) / (yMax - yMin)
    return CHART_MARGIN_TOP + ratio * (CHART_H - CHART_MARGIN_TOP - 6)
  }

  return (
    <div style={{ marginBottom: 16 }}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['candles', '🕯 Candlesticks'], ['rsi', `📊 RSI ${currentRSI?.toFixed(0) || '—'}`], ['volume', '📦 Volume']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === id ? '#1c1c1c' : 'transparent',
            color: tab === id ? '#fff' : GRAY1,
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: tab === id ? 700 : 400,
            outline: tab === id ? `1px solid #333` : 'none'
          }}>{label}</button>
        ))}
      </div>

      {/* ── Candlestick Chart ── */}
      {tab === 'candles' && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
            {ticker} · 60-Day Candlestick · {data.length} sessions
          </div>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <ComposedChart data={data} margin={{ top: CHART_MARGIN_TOP, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} strokeDasharray="0" vertical={false} />
              <XAxis dataKey="date" ticks={ticks} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
              <YAxis domain={[yMin, yMax]} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CandleTooltip />} />
              {/* Render candles as custom Bar shapes */}
              <Bar dataKey="close" shape={(props) => {
                // Find the index from x position
                const idx = data.findIndex(d => d.date === props.date)
                return <CandleShape {...props} payloadIndex={props.index} chartData={data} yScale={yScale} />
              }}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? GREEN : RED} />
                ))}
              </Bar>
              {ma50 && <ReferenceLine y={ma50} stroke={GRAY1} strokeDasharray="4 4"
                label={{ value: `MA50 $${ma50}`, position: 'insideTopRight', fill: GRAY1, fontSize: 8, fontFamily: 'var(--font-mono)' }} />}
              {srLevels && <ReferenceLine y={parseFloat(srLevels.support)} stroke={GREEN + '55'} strokeDasharray="3 6"
                label={{ value: `Support $${srLevels.support}`, position: 'insideBottomRight', fill: GREEN + '99', fontSize: 7, fontFamily: 'var(--font-mono)' }} />}
              {srLevels && <ReferenceLine y={parseFloat(srLevels.resistance)} stroke={RED + '55'} strokeDasharray="3 6"
                label={{ value: `Resist $${srLevels.resistance}`, position: 'insideTopRight', fill: RED + '99', fontSize: 7, fontFamily: 'var(--font-mono)' }} />}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Candle reading guide */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            {[
              { color: GREEN, title: 'Green candle', desc: 'Close > Open. Buyers won the session. Body size = conviction.' },
              { color: RED,   title: 'Red candle',   desc: 'Close < Open. Sellers won the session. Long body = strong selling.' },
              { color: GRAY1, title: 'Upper wick',   desc: 'Price went higher but rejected. Sellers pushed back from the top.' },
              { color: GRAY1, title: 'Lower wick',   desc: 'Price went lower but recovered. Buyers stepped in at the bottom.' },
            ].map((item, i) => (
              <div key={i} style={{ background: GRAY5, border: '1px solid #222', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: item.color, fontWeight: 700, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: '0.7rem', color: GRAY1, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* S/R levels */}
          {srLevels && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              <div style={{ background: GRAY5, border: `1px solid ${GREEN}33`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GREEN, fontWeight: 700, marginBottom: 2 }}>📍 Support ~${srLevels.support}</div>
                <div style={{ fontSize: '0.68rem', color: GRAY1, lineHeight: 1.5 }}>{srLevels.distSupport}% below current. Price has bounced near here — buyers tend to step in at this level.</div>
              </div>
              <div style={{ background: GRAY5, border: `1px solid ${RED}33`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: RED, fontWeight: 700, marginBottom: 2 }}>🚧 Resistance ~${srLevels.resistance}</div>
                <div style={{ fontSize: '0.68rem', color: GRAY1, lineHeight: 1.5 }}>{srLevels.distResistance}% above current. Price has stalled here — sellers tend to appear near this level.</div>
              </div>
            </div>
          )}

          {/* Pattern detection */}
          {patterns.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Pattern Detected</div>
              {patterns.map((p, i) => (
                <div key={i} style={{ background: GRAY5, border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', marginBottom: 5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#fff', fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: '0.71rem', color: GRAY1, lineHeight: 1.6 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── RSI Chart ── */}
      {tab === 'rsi' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase' }}>RSI-14 Momentum Oscillator</div>
            {currentRSI && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: rsiColor }}>{currentRSI?.toFixed(1)} — {rsiLabel}</div>}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} vertical={false} />
              <XAxis dataKey="date" ticks={ticks} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} width={28} ticks={[0, 30, 50, 70, 100]} />
              <ReferenceLine y={70} stroke={RED + '88'}     strokeDasharray="4 4" label={{ value: '70 Overbought', position: 'insideTopRight', fill: RED + 'AA', fontSize: 8, fontFamily: 'var(--font-mono)' }} />
              <ReferenceLine y={30} stroke={GREEN + '88'}   strokeDasharray="4 4" label={{ value: '30 Oversold',   position: 'insideBottomRight', fill: GREEN + 'AA', fontSize: 8, fontFamily: 'var(--font-mono)' }} />
              <ReferenceLine y={50} stroke={GRAY4}          strokeDasharray="2 4" />
              <Line type="monotone" dataKey="rsi" stroke={CYAN} strokeWidth={2} dot={false} name="RSI" connectNulls />
              <Tooltip content={<RSITooltip />} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* RSI zones explanation */}
          {[
            { range: 'Above 70', zone: 'Overbought', color: RED,   icon: '🔴', desc: 'The stock has moved up too fast and may be due for a pullback or consolidation. Not a sell signal on its own — strong stocks can stay overbought. But avoid buying new positions here.' },
            { range: '50 – 70',  zone: 'Bullish',    color: GREEN, icon: '🟢', desc: 'Momentum is on the side of buyers. Price is rising with controlled energy — not overextended. This is typically the sweet spot for entering long positions.' },
            { range: '30 – 50',  zone: 'Bearish',    color: RED + 'AA',   icon: '🟡', desc: 'Sellers are in control of momentum. Price may still move up on good news, but the underlying trend is not supportive.' },
            { range: 'Below 30', zone: 'Oversold',   color: GREEN, icon: '🔵', desc: 'Selling has been extreme. The stock may bounce as short sellers take profit. Best signal when RSI crosses back above 30 from below, not while still falling.' },
          ].map((z, i) => (
            <div key={i} style={{ background: GRAY5, border: `1px solid ${z.color}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 5, display: 'flex', gap: 10 }}>
              <span style={{ flexShrink: 0, lineHeight: 1.4 }}>{z.icon}</span>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: z.color, fontWeight: 700 }}>{z.range}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1 }}>{z.zone}</span>
                </div>
                <div style={{ fontSize: '0.71rem', color: GRAY1, lineHeight: 1.6 }}>{z.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Volume Chart ── */}
      {tab === 'volume' && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Volume · 60 Days</div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} vertical={false} />
              <XAxis dataKey="date" ticks={ticks} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<CandleTooltip />} />
              <Bar dataKey="volume" name="Volume" radius={[2, 2, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? GREEN + '88' : RED + '66'} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>

          {volumeAnalysis && (
            <div style={{ background: GRAY5, border: `1px solid ${volumeAnalysis.color}44`, borderRadius: 8, padding: '12px 14px', marginTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: volumeAnalysis.color, fontWeight: 700, marginBottom: 4 }}>
                {volumeAnalysis.icon} {volumeAnalysis.label}
              </div>
              <div style={{ fontSize: '0.73rem', color: GRAY1, lineHeight: 1.7 }}>{volumeAnalysis.detail}</div>
            </div>
          )}

          {/* Volume reading guide */}
          {[
            { icon: '📈', title: 'Green volume bar', desc: 'Up day with volume. The higher the bar, the more shares changed hands on an up move — stronger conviction.' },
            { icon: '📉', title: 'Red volume bar',   desc: 'Down day with volume. High red volume = strong selling pressure. Low red volume decline = weak conviction from sellers.' },
            { icon: '🔥', title: 'Volume spike',     desc: 'Volume 2× or more above average often marks a key turning point — either a capitulation bottom or a breakout. Note the direction.' },
            { icon: '😴', title: 'Low volume',       desc: 'Thin trading = low conviction. Moves on low volume can reverse easily. Big moves need volume to confirm they\'re real.' },
          ].map((item, i) => (
            <div key={i} style={{ background: GRAY5, border: '1px solid #222', borderRadius: 8, padding: '8px 12px', marginBottom: 5, display: 'flex', gap: 10, marginTop: i === 0 ? 8 : 0 }}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#fff', fontWeight: 700, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: '0.71rem', color: GRAY1, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
