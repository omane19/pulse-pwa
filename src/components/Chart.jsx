import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts'
import { ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'

const GREEN = '#00C805'; const RED = '#FF5000'; const CYAN = '#00E5FF'
const GRAY1 = '#B2B2B2'; const GRAY4 = '#252525'; const GRAY5 = '#1a1a1a'
const GOLD  = '#FFD700'

const TF = [
  { label: '1M', days: 21 },
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
  { label: 'All', days: Infinity },
]

/* ── Moving Average ── */
function calcMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  })
}

/* ── RSI ── */
function calcRSI(closes) {
  if (!closes || closes.length < 15) return new Array(closes.length).fill(null)
  const out = new Array(14).fill(null)
  for (let i = 14; i < closes.length; i++) {
    const diffs = closes.slice(i - 13, i + 1).map((c, j, a) => j === 0 ? 0 : c - a[j - 1]).slice(1)
    const g = diffs.map(d => d > 0 ? d : 0)
    const l = diffs.map(d => d < 0 ? -d : 0)
    const ag = g.reduce((a, b) => a + b, 0) / g.length
    const al = l.reduce((a, b) => a + b, 0) / l.length
    out.push(parseFloat((100 - 100 / (1 + (al > 0 ? ag / al : 100))).toFixed(1)))
  }
  return out
}

/* ── Pattern Detection ── */
function detectPatterns(data) {
  if (!data || data.length < 3) return []
  const patterns = []
  const last  = data[data.length - 1]
  const prev  = data[data.length - 2]
  const prev2 = data[data.length - 3]
  const range = last.high - last.low
  const body  = Math.abs(last.close - last.open)
  const lowerWick = Math.min(last.open, last.close) - last.low
  const upperWick = last.high - Math.max(last.open, last.close)

  if (range > 0 && body / range < 0.1)
    patterns.push({ name: 'Doji', icon: '⚖️', desc: 'Open and close nearly identical — market indecision, often signals reversal.' })
  if (range > 0 && lowerWick / range > 0.6 && body / range < 0.3)
    patterns.push({ name: 'Hammer', icon: '🔨', desc: 'Long lower wick — sellers pushed down hard but buyers recovered. Bullish reversal signal after downtrend.' })
  if (range > 0 && upperWick / range > 0.6 && body / range < 0.3)
    patterns.push({ name: 'Shooting Star', icon: '💫', desc: 'Long upper wick — buyers failed to hold highs. Bearish reversal signal after uptrend.' })
  if (prev.close < prev.open && last.close > last.open && last.close > prev.open && last.open < prev.close)
    patterns.push({ name: 'Bullish Engulfing', icon: '🟢', desc: 'Green candle swallows the prior red — buyers decisively took over from sellers.' })
  if (prev.close > prev.open && last.close < last.open && last.close < prev.open && last.open > prev.close)
    patterns.push({ name: 'Bearish Engulfing', icon: '🔴', desc: 'Red candle swallows the prior green — sellers decisively took over from buyers.' })
  if (data.length >= 3 && data.slice(-3).every(d => d.close > d.open))
    patterns.push({ name: '3-Day Rally', icon: '🚀', desc: '3 consecutive bullish closes — short-term momentum is strong. Check RSI for overextension.' })
  if (data.length >= 3 && data.slice(-3).every(d => d.close < d.open))
    patterns.push({ name: '3-Day Decline', icon: '📉', desc: '3 consecutive bearish closes — selling pressure sustained. Watch for support or RSI oversold bounce.' })
  return patterns
}

/* ── Volume Analysis ── */
function analyzeVolume(data) {
  if (!data || data.length < 10) return null
  const avgBase = data.slice(-20, -5).reduce((s, d) => s + d.volume, 0) / 15
  const avgRecent = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5
  const ratio = avgBase > 0 ? avgRecent / avgBase : 1
  const bullish = data[data.length - 1].close > data[data.length - 1].open
  if (ratio > 1.5 && bullish)  return { icon: '📊', label: 'Volume surge on up move', detail: `Volume ${((ratio-1)*100).toFixed(0)}% above average on gains — institutional buying likely.`, color: GREEN }
  if (ratio > 1.5 && !bullish) return { icon: '🚨', label: 'Volume surge on down move', detail: `Volume ${((ratio-1)*100).toFixed(0)}% above average on declines — distribution signal.`, color: RED }
  if (ratio < 0.6)             return { icon: '😴', label: 'Low volume — weak conviction', detail: 'Volume well below average. Moves on low volume are less reliable.', color: GRAY1 }
  return { icon: '📈', label: 'Normal volume', detail: 'Volume in line with recent average. No unusual activity.', color: GRAY1 }
}

/* ── Support / Resistance ── */
function findSR(data, price) {
  if (!data || data.length < 20 || !price) return null
  const lows  = [...data.map(d => d.low)].sort((a, b) => a - b)
  const highs = [...data.map(d => d.high)].sort((a, b) => b - a)
  const support    = lows.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  const resistance = highs.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  return {
    support:    support.toFixed(2),
    resistance: resistance.toFixed(2),
    distS: ((price - support) / price * 100).toFixed(1),
    distR: ((resistance - price) / price * 100).toFixed(1),
  }
}

/* ── RSI Tooltip ── */
function RSITooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rsi = payload[0]?.value
  const zone = rsi > 70 ? { label: 'Overbought', color: RED }
    : rsi < 30 ? { label: 'Oversold', color: GREEN }
    : rsi > 50 ? { label: 'Bullish', color: CYAN }
    : { label: 'Bearish', color: RED + 'AA' }
  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: GRAY1, marginBottom: 4, fontSize: '0.62rem' }}>{label}</div>
      <div style={{ color: zone.color, fontWeight: 700 }}>RSI {rsi?.toFixed(1)} — {zone.label}</div>
    </div>
  )
}

/* ── TradingView Canvas Chart ── */
function TVChart({ candleData, volumeData, ma50Data, ma200Data }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !candleData.length) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 300,
      layout: {
        background: { color: '#080808' },
        textColor: '#555',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#0e0e0e' },
        horzLines: { color: '#111' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#333', labelBackgroundColor: '#1a1a1a' },
        horzLine: { color: '#333', labelBackgroundColor: '#1a1a1a' },
      },
      timeScale: {
        borderColor: '#1a1a1a',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
        scaleMargins: { top: 0.06, bottom: 0.22 },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale:  { mouseWheel: true, pinch: true },
    })

    // Candlesticks
    const candles = chart.addSeries(CandlestickSeries, {
      upColor:        GREEN,
      downColor:      RED,
      borderUpColor:  GREEN,
      borderDownColor: RED,
      wickUpColor:    GREEN + 'AA',
      wickDownColor:  RED + 'AA',
    })
    candles.setData(candleData)

    // Volume histogram — overlaid bottom 20%
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    })
    vol.setData(volumeData)

    // MA50
    if (ma50Data.length) {
      const ma50 = chart.addSeries(LineSeries, {
        color: '#666',
        lineWidth: 1,
        lineStyle: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: 'MA50',
      })
      ma50.setData(ma50Data)
    }

    // MA200
    if (ma200Data.length) {
      const ma200 = chart.addSeries(LineSeries, {
        color: GOLD + 'BB',
        lineWidth: 1,
        lineStyle: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: 'MA200',
      })
      ma200.setData(ma200Data)
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    return () => { chart.remove(); chartRef.current = null }
  }, [candleData, volumeData, ma50Data, ma200Data])

  return <div ref={containerRef} style={{ width: '100%', height: 300, borderRadius: 4, overflow: 'hidden' }} />
}

/* ── Main Chart Component ── */
export default function Chart({ candles, ma50: ma50Prop, color = GREEN, ticker }) {
  const [tf,  setTf]  = useState('3M')
  const [tab, setTab] = useState('candles')

  // Build full dataset with MAs and RSI computed on all data
  const allRows = useMemo(() => {
    if (!candles) return []
    const closes    = Array.isArray(candles.closes)     ? candles.closes     : []
    const opens     = Array.isArray(candles.opens)      ? candles.opens      : []
    const highs     = Array.isArray(candles.highs)      ? candles.highs      : []
    const lows      = Array.isArray(candles.lows)       ? candles.lows       : []
    const volumes   = Array.isArray(candles.volumes)    ? candles.volumes    : []
    const timestamps = Array.isArray(candles.timestamps) ? candles.timestamps : []
    if (!closes.length) return []

    const ma50s  = calcMA(closes, 50)
    const ma200s = calcMA(closes, 200)
    const rsis   = calcRSI(closes)

    return timestamps.map((ts, i) => {
      const d = new Date(ts * 1000)
      const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
      return {
        time,
        open:   parseFloat((opens[i]   || closes[i]).toFixed(2)),
        high:   parseFloat((highs[i]   || closes[i]).toFixed(2)),
        low:    parseFloat((lows[i]    || closes[i]).toFixed(2)),
        close:  parseFloat(closes[i].toFixed(2)),
        volume: volumes[i] || 0,
        ma50:   ma50s[i]  != null ? parseFloat(ma50s[i].toFixed(2))  : null,
        ma200:  ma200s[i] != null ? parseFloat(ma200s[i].toFixed(2)) : null,
        rsi:    rsis[i],
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    }).filter(d => d.close > 0)
  }, [candles])

  // Slice by timeframe
  const rows = useMemo(() => {
    const days = TF.find(t => t.label === tf)?.days ?? 63
    return days === Infinity ? allRows : allRows.slice(-days)
  }, [allRows, tf])

  // Series data for TradingView chart
  const candleData  = useMemo(() => rows.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })), [rows])
  const volumeData  = useMemo(() => rows.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? GREEN + '66' : RED + '44' })), [rows])
  const ma50Data    = useMemo(() => rows.filter(d => d.ma50  != null).map(d => ({ time: d.time, value: d.ma50  })), [rows])
  const ma200Data   = useMemo(() => rows.filter(d => d.ma200 != null).map(d => ({ time: d.time, value: d.ma200 })), [rows])

  // RSI chart data (for Recharts tab)
  const rsiRows = useMemo(() => rows.map(d => ({ date: d.dateLabel, rsi: d.rsi })), [rows])

  // Analysis
  const { patterns, volumeAnalysis, srLevels, currentRSI, currentPrice } = useMemo(() => {
    if (!rows.length) return {}
    const last = rows[rows.length - 1]
    return {
      patterns:       detectPatterns(rows),
      volumeAnalysis: analyzeVolume(rows),
      srLevels:       findSR(rows, last.close),
      currentRSI:     [...rows].reverse().find(r => r.rsi != null)?.rsi ?? null,
      currentPrice:   last.close,
    }
  }, [rows])

  const rsiColor = currentRSI > 70 ? RED : currentRSI < 30 ? GREEN : CYAN
  const rsiLabel = currentRSI > 70 ? 'Overbought' : currentRSI < 30 ? 'Oversold' : currentRSI > 50 ? 'Bullish' : 'Bearish'
  const ticks = rsiRows.filter((_, i) => i % Math.max(1, Math.floor(rsiRows.length / 6)) === 0).map(d => d.date)

  if (!allRows.length) return <div style={{ color: GRAY1, textAlign: 'center', padding: 24, fontSize: '0.8rem' }}>No chart data</div>

  return (
    <div style={{ marginBottom: 16 }}>

      {/* Timeframe + Tab row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        {/* Timeframe */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TF.map(t => (
            <button key={t.label} onClick={() => setTf(t.label)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.62rem',
              fontFamily: 'var(--font-mono)',
              background: tf === t.label ? '#1e1e1e' : 'transparent',
              color: tf === t.label ? CYAN : '#555',
              outline: tf === t.label ? `1px solid #333` : 'none',
            }}>{t.label}</button>
          ))}
        </div>
        {/* MA legend */}
        <div style={{ display: 'flex', gap: 10, fontSize: '0.58rem', fontFamily: 'var(--font-mono)' }}>
          {ma50Data.length  > 0 && <span style={{ color: '#666' }}>— MA50</span>}
          {ma200Data.length > 0 && <span style={{ color: GOLD + 'BB' }}>— MA200</span>}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[['candles','🕯 Candles'], ['rsi', `📊 RSI ${currentRSI?.toFixed(0) ?? '—'}`], ['volume','📦 Volume']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === id ? '#1c1c1c' : 'transparent',
            color: tab === id ? '#fff' : GRAY1,
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: tab === id ? 700 : 400,
            outline: tab === id ? '1px solid #333' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Candles Tab ── */}
      {tab === 'candles' && (
        <>
          <TVChart
            candleData={candleData}
            volumeData={volumeData}
            ma50Data={ma50Data}
            ma200Data={ma200Data}
          />

          {/* S/R Levels */}
          {srLevels && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              <div style={{ background: GRAY5, border: `1px solid ${GREEN}33`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GREEN, fontWeight: 700, marginBottom: 2 }}>📍 Support ~${srLevels.support}</div>
                <div style={{ fontSize: '0.68rem', color: GRAY1, lineHeight: 1.5 }}>{srLevels.distS}% below current. Buyers tend to step in here.</div>
              </div>
              <div style={{ background: GRAY5, border: `1px solid ${RED}33`, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: RED, fontWeight: 700, marginBottom: 2 }}>🚧 Resistance ~${srLevels.resistance}</div>
                <div style={{ fontSize: '0.68rem', color: GRAY1, lineHeight: 1.5 }}>{srLevels.distR}% above current. Sellers tend to appear here.</div>
              </div>
            </div>
          )}

          {/* Patterns */}
          {patterns?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Pattern Detected</div>
              {patterns.map((p, i) => (
                <div key={i} style={{ background: GRAY5, border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', marginBottom: 5, display: 'flex', gap: 10 }}>
                  <span style={{ flexShrink: 0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#fff', fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: '0.71rem', color: GRAY1, lineHeight: 1.6 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Candle guide */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            {[
              { color: GREEN, title: 'Green candle', desc: 'Close > Open. Buyers won the session.' },
              { color: RED,   title: 'Red candle',   desc: 'Close < Open. Sellers won the session.' },
              { color: GRAY1, title: 'Upper wick',   desc: 'Price went higher but was rejected.' },
              { color: GRAY1, title: 'Lower wick',   desc: 'Price dipped but buyers stepped in.' },
            ].map((item, i) => (
              <div key={i} style={{ background: GRAY5, border: '1px solid #222', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: item.color, fontWeight: 700, marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: '0.7rem', color: GRAY1, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── RSI Tab ── */}
      {tab === 'rsi' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase' }}>RSI-14 Momentum Oscillator</div>
            {currentRSI != null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: rsiColor }}>{currentRSI.toFixed(1)} — {rsiLabel}</div>}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={rsiRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} vertical={false} />
              <XAxis dataKey="date" ticks={ticks} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} width={28} />
              <ReferenceLine y={70} stroke={RED + '88'}   strokeDasharray="4 4" label={{ value: '70', position: 'insideTopRight', fill: RED + 'AA', fontSize: 8 }} />
              <ReferenceLine y={30} stroke={GREEN + '88'} strokeDasharray="4 4" label={{ value: '30', position: 'insideBottomRight', fill: GREEN + 'AA', fontSize: 8 }} />
              <ReferenceLine y={50} stroke={GRAY4} strokeDasharray="2 4" />
              <Line type="monotone" dataKey="rsi" stroke={CYAN} strokeWidth={2} dot={false} connectNulls />
              <Tooltip content={<RSITooltip />} />
            </ComposedChart>
          </ResponsiveContainer>

          {[
            { range: 'Above 70', zone: 'Overbought', color: RED,   icon: '🔴', desc: 'Stock moved up too fast, pullback risk. Avoid new buys here — strong stocks can stay overbought but risk/reward is poor.' },
            { range: '50 – 70',  zone: 'Bullish',    color: GREEN, icon: '🟢', desc: 'Momentum favors buyers. Not overextended — typically the best zone for entering long positions.' },
            { range: '30 – 50',  zone: 'Bearish',    color: GRAY1, icon: '🟡', desc: 'Sellers in control of momentum. Price may bounce on news but underlying trend is not supportive.' },
            { range: 'Below 30', zone: 'Oversold',   color: GREEN, icon: '🔵', desc: 'Selling has been extreme. Watch for RSI to cross back above 30 — that crossover, not the low itself, is the signal.' },
          ].map((z, i) => (
            <div key={i} style={{ background: GRAY5, border: `1px solid ${z.color}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 5, marginTop: i===0?8:0, display: 'flex', gap: 10 }}>
              <span style={{ flexShrink: 0 }}>{z.icon}</span>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: z.color, fontWeight: 700 }}>{z.range}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1 }}>{z.zone}</span>
                </div>
                <div style={{ fontSize: '0.71rem', color: GRAY1, lineHeight: 1.6 }}>{z.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Volume Tab ── */}
      {tab === 'volume' && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GRAY1, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Volume · {rows.length} Sessions</div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRAY4} vertical={false} />
              <XAxis dataKey="dateLabel" ticks={ticks} tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: GRAY1 }} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v) => [`${(v/1e6).toFixed(2)}M`, 'Volume']} labelStyle={{ color: GRAY1, fontSize: '0.62rem' }} contentStyle={{ background: '#0d0d0d', border: '1px solid #252525', borderRadius: 8, fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }} />
              <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
                {rows.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? GREEN + '88' : RED + '55'} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>

          {volumeAnalysis && (
            <div style={{ background: GRAY5, border: `1px solid ${volumeAnalysis.color}44`, borderRadius: 8, padding: '12px 14px', marginTop: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: volumeAnalysis.color, fontWeight: 700, marginBottom: 4 }}>{volumeAnalysis.icon} {volumeAnalysis.label}</div>
              <div style={{ fontSize: '0.73rem', color: GRAY1, lineHeight: 1.7 }}>{volumeAnalysis.detail}</div>
            </div>
          )}

          {[
            { icon: '📈', title: 'Green volume bar', desc: 'Up day with volume. Higher bar = more conviction behind the move.' },
            { icon: '📉', title: 'Red volume bar',   desc: 'Down day with volume. High red volume = strong selling pressure.' },
            { icon: '🔥', title: 'Volume spike',     desc: 'Volume 2× or more above average marks key turning points — breakouts or capitulation bottoms.' },
            { icon: '😴', title: 'Low volume',       desc: 'Thin trading = low conviction. Big moves need volume to be real.' },
          ].map((item, i) => (
            <div key={i} style={{ background: GRAY5, border: '1px solid #222', borderRadius: 8, padding: '8px 12px', marginBottom: 5, marginTop: i===0?8:0, display: 'flex', gap: 10 }}>
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
