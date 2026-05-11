import React, { useState, useMemo, useCallback, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { fetchBacktestData, fetchTickerSearch } from '../hooks/useApi.js'
import { LoadingBar } from './shared.jsx'

const GREEN = '#00C805'; const RED = '#FF5000'; const CYAN = '#00E5FF'; const YELLOW = '#FFD700'

/* ── Stats computation ── */
function computeStats(prices, spyPrices, years) {
  if (!prices.length || !spyPrices.length) return null

  // Align SPY to same start date
  const startDate = prices[0].date
  const spyAligned = spyPrices.filter(p => p.date >= startDate)
  if (!spyAligned.length) return null

  const start = prices[0].close
  const end   = prices[prices.length - 1].close
  const spyStart = spyAligned[0].close
  const spyEnd   = spyAligned[spyAligned.length - 1].close

  const totalReturn    = (end / start - 1) * 100
  const spyTotalReturn = (spyEnd / spyStart - 1) * 100
  const actualYears    = (new Date(prices[prices.length-1].date) - new Date(prices[0].date)) / (365.25 * 86400000)
  const cagr           = actualYears > 0.1 ? ((end / start) ** (1 / actualYears) - 1) * 100 : totalReturn
  const spyCagr        = actualYears > 0.1 ? ((spyEnd / spyStart) ** (1 / actualYears) - 1) * 100 : spyTotalReturn
  const alpha          = cagr - spyCagr

  // Max drawdown
  let peak = prices[0].close, maxDD = 0
  for (const p of prices) {
    if (p.close > peak) peak = p.close
    const dd = (peak - p.close) / peak * 100
    if (dd > maxDD) maxDD = dd
  }

  // Daily returns for Sharpe
  const dailyReturns = []
  for (let i = 1; i < prices.length; i++) {
    dailyReturns.push((prices[i].close / prices[i-1].close) - 1)
  }
  const meanRet  = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / dailyReturns.length
  const stdDev   = Math.sqrt(variance)
  const sharpe   = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0

  // Best/worst annual periods (use available data)
  const byYear = {}
  for (const p of prices) {
    const yr = p.date.slice(0, 4)
    if (!byYear[yr]) byYear[yr] = []
    byYear[yr].push(p.close)
  }
  const annualReturns = Object.entries(byYear)
    .filter(([, ps]) => ps.length >= 50) // full-ish year
    .map(([yr, ps]) => ({ year: yr, ret: (ps[ps.length-1] / ps[0] - 1) * 100 }))
  const bestYear  = annualReturns.length ? annualReturns.reduce((a, b) => a.ret > b.ret ? a : b) : null
  const worstYear = annualReturns.length ? annualReturns.reduce((a, b) => a.ret < b.ret ? a : b) : null

  return { totalReturn, spyTotalReturn, cagr, spyCagr, alpha, maxDD, sharpe, bestYear, worstYear, actualYears }
}

/* ── Build normalized chart series ── */
function buildChartData(prices, spyPrices) {
  if (!prices.length || !spyPrices.length) return []
  const startDate = prices[0].date
  const spyAligned = spyPrices.filter(p => p.date >= startDate)
  if (!spyAligned.length) return []

  const base    = prices[0].close
  const spyBase = spyAligned[0].close

  const spyMap = new Map(spyAligned.map(p => [p.date, p.close]))
  const result = []
  for (const p of prices) {
    const spyClose = spyMap.get(p.date)
    result.push({
      date: p.date,
      label: p.date.slice(0, 7), // YYYY-MM
      ticker: parseFloat(((p.close / base - 1) * 100).toFixed(2)),
      spy: spyClose != null ? parseFloat(((spyClose / spyBase - 1) * 100).toFixed(2)) : null,
    })
  }
  return result
}

function CustomTooltip({ active, payload, label, tickerSymbol }) {
  if (!active || !payload?.length) return null
  const t = payload.find(p => p.dataKey === 'ticker')
  const s = payload.find(p => p.dataKey === 'spy')
  return (
    <div style={{ background: '#161616', border: '1px solid #252525', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
      <div style={{ color: '#888', marginBottom: 4 }}>{label}</div>
      {t && <div style={{ color: t.value >= 0 ? GREEN : RED }}>{tickerSymbol}: {t.value >= 0 ? '+' : ''}{t.value}%</div>}
      {s && s.value != null && <div style={{ color: '#888' }}>SPY: {s.value >= 0 ? '+' : ''}{s.value}%</div>}
    </div>
  )
}

const PERIODS = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
]

export default function Backtest() {
  const [input,      setInput]      = useState('')
  const [ticker,     setTicker]     = useState('')
  const [years,      setYears]      = useState(3)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [rawData,    setRawData]    = useState(null)  // { ticker: [...], spy: [...] }
  const [suggestions, setSuggestions] = useState([])
  const [showSugg,  setShowSugg]    = useState(false)
  const searchTimer = useRef(null)

  const runBacktest = useCallback(async (sym, yrs) => {
    if (!sym) return
    setLoading(true); setError(null); setRawData(null)
    try {
      const from = new Date(Date.now() - yrs * 365.25 * 86400000).toISOString().split('T')[0]
      const [tickerHist, spyHist] = await Promise.all([
        fetchBacktestData(sym, from),
        fetchBacktestData('SPY', from),
      ])
      if (!tickerHist.length) { setError(`No historical data found for ${sym}. Try a different ticker.`); return }
      setRawData({ ticker: tickerHist, spy: spyHist })
    } catch {
      setError('Failed to load historical data. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  const stats     = useMemo(() => rawData ? computeStats(rawData.ticker, rawData.spy, years) : null, [rawData, years])
  const chartData = useMemo(() => rawData ? buildChartData(rawData.ticker, rawData.spy) : [], [rawData])

  // Downsample for mobile (max 200 points)
  const displayData = useMemo(() => {
    if (chartData.length <= 200) return chartData
    const step = Math.ceil(chartData.length / 200)
    return chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1)
  }, [chartData])

  const handleSearch = () => {
    const t = input.trim().toUpperCase()
    if (!t) return
    setTicker(t); setShowSugg(false)
    runBacktest(t, years)
  }

  const pickPeriod = (yrs) => {
    setYears(yrs)
    if (ticker) runBacktest(ticker, yrs)
  }

  const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

  return (
    <div className="page">
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="input"
            value={input}
            onChange={e => {
              const v = e.target.value
              setInput(v)
              clearTimeout(searchTimer.current)
              if (v.length >= 2) {
                searchTimer.current = setTimeout(async () => {
                  const res = await fetchTickerSearch(v)
                  setSuggestions(res); setShowSugg(res.length > 0)
                }, 280)
              } else { setSuggestions([]); setShowSugg(false) }
            }}
            onKeyDown={e => { if (e.key === 'Enter') { setShowSugg(false); handleSearch() } if (e.key === 'Escape') setShowSugg(false) }}
            onBlur={() => setTimeout(() => setShowSugg(false), 150)}
            placeholder="Ticker or company name…"
            autoCorrect="off" spellCheck={false}
          />
          {showSugg && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4, background: '#161616', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
              {suggestions.map(s => (
                <div key={s.ticker}
                  onMouseDown={() => { setInput(s.ticker); setShowSugg(false); const t = s.ticker.toUpperCase(); setTicker(t); runBacktest(t, years) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color: '#fff' }}>{s.ticker}</span>
                    <span style={{ fontSize: '0.68rem', color: '#888', marginLeft: 8 }}>{s.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 18px' }} onClick={() => { setShowSugg(false); handleSearch() }}>Run</button>
      </div>

      {/* Quick tickers */}
      {!rawData && !loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {['AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'MSFT'].map(t => (
            <button key={t} className="btn btn-ghost" style={{ width: 'auto', padding: '5px 12px', fontSize: '0.72rem' }}
              onClick={() => { setInput(t); setTicker(t); runBacktest(t, years) }}>{t}</button>
          ))}
        </div>
      )}

      {/* Period picker */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {PERIODS.map(p => (
          <button key={p.label} onClick={() => pickPeriod(p.years)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8,
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              background: years === p.years ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
              border: years === p.years ? '1px solid rgba(0,229,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
              color: years === p.years ? CYAN : '#888', cursor: 'pointer'
            }}>{p.label}</button>
        ))}
      </div>

      {loading && <LoadingBar text={`Loading ${ticker || 'historical'} data…`} />}

      {error && (
        <div style={{ background: 'rgba(255,80,0,0.08)', border: '1px solid rgba(255,80,0,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: '0.84rem', color: RED, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              ['Total Return', fmt(stats.totalReturn), stats.totalReturn >= 0 ? GREEN : RED],
              ['vs SPY', fmt(stats.spyTotalReturn), stats.spyTotalReturn >= 0 ? GREEN : RED],
              [`CAGR (${stats.actualYears.toFixed(1)}y)`, fmt(stats.cagr), stats.cagr >= 0 ? GREEN : RED],
              ['Alpha vs SPY', fmt(stats.alpha), stats.alpha >= 0 ? GREEN : RED],
              ['Max Drawdown', `-${stats.maxDD.toFixed(1)}%`, stats.maxDD > 30 ? RED : stats.maxDD > 15 ? YELLOW : GREEN],
              ['Sharpe Ratio', stats.sharpe.toFixed(2), stats.sharpe >= 1 ? GREEN : stats.sharpe >= 0.5 ? YELLOW : RED],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#888', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{l}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Alpha callout */}
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: stats.alpha > 0 ? 'rgba(0,200,5,0.07)' : 'rgba(255,80,0,0.07)',
            border: `1px solid ${stats.alpha > 0 ? '#00C80530' : '#FF500030'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#888' }}>
              {ticker} {stats.alpha > 0 ? 'outperformed' : 'underperformed'} SPY by
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', fontWeight: 700, color: stats.alpha > 0 ? GREEN : RED }}>
              {fmt(stats.alpha)}
            </div>
          </div>

          {/* Chart */}
          <div style={{ background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 14, padding: '14px 8px 8px', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#888', marginBottom: 8, paddingLeft: 8, letterSpacing: 1 }}>
              CUMULATIVE RETURN — {ticker} vs SPY (normalized to 0%)
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={displayData}>
                <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} interval={Math.floor(displayData.length / 6)} />
                <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} width={44} />
                <Tooltip content={<CustomTooltip tickerSymbol={ticker} />} />
                <ReferenceLine y={0} stroke="#333" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="ticker" stroke={CYAN} dot={false} strokeWidth={2} name={ticker} />
                <Line type="monotone" dataKey="spy" stroke="#555" dot={false} strokeWidth={1.5} name="SPY" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
              {[[CYAN, ticker], ['#555', 'SPY (dashed)']].map(([col, lbl]) => (
                <span key={lbl} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 18, height: 2, background: col, display: 'inline-block', borderRadius: 1 }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          {/* Best / worst year */}
          {(stats.bestYear || stats.worstYear) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {stats.bestYear && (
                <div style={{ background: 'rgba(0,200,5,0.06)', border: '1px solid rgba(0,200,5,0.2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#888', marginBottom: 4 }}>BEST YEAR</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: GREEN }}>{stats.bestYear.year}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: GREEN }}>{fmt(stats.bestYear.ret)}</div>
                </div>
              )}
              {stats.worstYear && (
                <div style={{ background: 'rgba(255,80,0,0.06)', border: '1px solid rgba(255,80,0,0.2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#888', marginBottom: 4 }}>WORST YEAR</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: RED }}>{stats.worstYear.year}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: RED }}>{fmt(stats.worstYear.ret)}</div>
                </div>
              )}
            </div>
          )}

          {/* What this means */}
          <div style={{ background: '#0D0D0D', border: '1px solid #1a1a1a', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#888', letterSpacing: 1, marginBottom: 8 }}>WHAT THIS MEANS</div>
            <div style={{ fontSize: '0.82rem', color: '#B2B2B2', lineHeight: 1.8 }}>
              {stats.alpha > 10
                ? `${ticker} has significantly outperformed the S&P 500 with a ${fmt(stats.cagr)} annualised return vs ${fmt(stats.spyCagr)} for SPY — ${fmt(stats.alpha)} of alpha.`
                : stats.alpha > 0
                ? `${ticker} modestly outperformed SPY (${fmt(stats.cagr)} vs ${fmt(stats.spyCagr)} annualised). Individual stock risk is compensated.`
                : `${ticker} underperformed SPY by ${fmt(Math.abs(stats.alpha))} per year. A passive SPY position would have performed better over this period.`}
              {stats.maxDD > 40
                ? ` Maximum drawdown of ${stats.maxDD.toFixed(1)}% was severe — required strong conviction to hold through.`
                : stats.maxDD > 20
                ? ` Peak drawdown of ${stats.maxDD.toFixed(1)}% is significant — position sizing and stop-losses matter.`
                : ` Moderate drawdown of ${stats.maxDD.toFixed(1)}% — relatively smooth ride for equity exposure.`}
              {stats.sharpe >= 1
                ? ` Sharpe of ${stats.sharpe.toFixed(2)} indicates strong risk-adjusted returns.`
                : stats.sharpe >= 0.5
                ? ` Sharpe of ${stats.sharpe.toFixed(2)} is acceptable but not exceptional risk-adjusted performance.`
                : ` Sharpe of ${stats.sharpe.toFixed(2)} suggests poor risk-adjusted returns relative to the volatility taken.`}
            </div>
          </div>

          <div style={{ fontSize: '0.62rem', color: '#555', textAlign: 'center', marginBottom: 16 }}>
            ⚠ Past performance does not predict future results · Not financial advice
          </div>
        </>
      )}

      {!rawData && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#B2B2B2' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: '#1A1A1A', marginBottom: 12 }}>⏱</div>
          <p style={{ fontSize: '0.86rem', lineHeight: 2, maxWidth: 320, margin: '0 auto' }}>
            Enter a ticker to see its historical performance vs the S&P 500.
            <br />Choose 1Y, 3Y, or 5Y lookback.
          </p>
        </div>
      )}
    </div>
  )
}
