import React, { useState, useCallback, useMemo } from 'react'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { fetchTickerLite, fetchFMPScreener, fetchDividendScreener, hasKeys } from '../hooks/useApi.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { UNIVERSE, TICKER_NAMES } from '../utils/constants.js'
import { VerdictPill, SignalBar, FactorBars, LoadingBar, PullToRefresh } from './shared.jsx'

const ALL_CATS = Object.keys(UNIVERSE)
const VERDICTS = ['BUY', 'HOLD', 'AVOID']
const G1='#B2B2B2'; const G4='#252525'; const GREEN='#00C805'; const RED='#FF5000'; const CYAN='#00E5FF'
const YELLOW='#FFD700'

// Curated high-dividend stocks across sectors
const DIVIDEND_UNIVERSE = [
  // Dividends Aristocrats & High Yield
  'JNJ','KO','PG','PEP','MCD','MMM','ABT','GIS','CL','CLX',
  // Energy
  'XOM','CVX','COP','PSX','VLO','MPC','OKE','WMB','EPD','ET',
  // Telecom
  'VZ','T','TMUS',
  // REITs
  'O','MAIN','STAG','NNN','WPC','VICI','AMT','PLD','SPG','EQR',
  // Utilities
  'NEE','DUK','SO','D','AEP','EXC','SRE','PCG','ED','WEC',
  // Financials
  'JPM','BAC','WFC','USB','PNC','TFC','SCHW','BLK','AXP',
  // Healthcare
  'ABBV','PFE','MRK','BMY','AMGN','GILD',
  // Consumer
  'PM','MO','BTI','UPS','FDX',
  // Materials
  'NUE','CF','DOW','LYB',
]

/* ── Rank card ── */
function RankCard({ item, rank, showCat = true, onNavigate }) {
  const piotroski = item.score?.piotroski
  const fmpRating = item.rating?.rating
  const [open, setOpen] = useState(false)
  const r = item.result; const c = r.color
  const price = item.quote?.c; const chg = item.quote?.dp || 0
  const name = item.name || TICKER_NAMES[item.ticker] || item.ticker
  const medals = ['🥇','🥈','🥉']
  const medal = medals[rank] || `#${rank + 1}`

  return (
    <div className="rank-card fade-up" onClick={() => setOpen(o => !o)} style={{ cursor:'pointer', userSelect:'none' }}>
      <div className="rank-header">
        <span className="rank-medal">{medal}</span>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div className="rank-ticker">{item.ticker}</div>
            {fmpRating && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',padding:'2px 6px',borderRadius:4,background:'rgba(0,229,255,0.1)',color:'#00E5FF'}}>{fmpRating}</div>}
            {piotroski!=null && <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',padding:'2px 6px',borderRadius:4,background:piotroski>=7?'rgba(0,200,5,0.15)':piotroski>=4?'rgba(255,215,0,0.1)':'rgba(255,80,0,0.1)',color:piotroski>=7?'#00C805':piotroski>=4?'#FFD700':'#FF5000'}}>P:{piotroski}</div>}
          </div>
          <div className="rank-name">{name.slice(0, 26)}{showCat ? ` · ${item.category}` : ''}</div>
        </div>
        {price && (
          <div className="rank-price-block">
            <div className="rank-price">${price.toFixed(2)}</div>
            <div className={`rank-chg ${chg >= 0 ? 'pos' : 'neg'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</div>
          </div>
        )}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
        <VerdictPill verdict={r.verdict} />
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:c }}>Signal {r.pct.toFixed(0)}/100</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.61rem', color:G1 }}>Conv {r.conviction.toFixed(0)}%</span>
        {r.pe && <span style={{ fontSize:'0.64rem', color:G1 }}>P/E {r.pe.toFixed(1)}×</span>}
        {item.mcap && <span style={{ fontSize:'0.64rem', color:G1 }}>{fmtMcap(item.mcap)}</span>}
      </div>

      <SignalBar pct={r.pct} color={c} />

      {open && (
        <div style={{ marginTop:10 }}>
          {/* Dive button */}
          {onNavigate && (
            <button
              onClick={e => { e.stopPropagation(); onNavigate(item.ticker) }}
              style={{
                width:'100%', marginBottom:10, padding:'10px', borderRadius:8,
                background:'rgba(0,200,5,0.1)', border:'1px solid rgba(0,200,5,0.3)',
                color:'#00C805', fontFamily:'var(--font-mono)', fontSize:'0.7rem',
                cursor:'pointer', letterSpacing:0.5
              }}>
              🔍 Full Dive Analysis — {item.ticker} →
            </button>
          )}
          <FactorBars scores={r.scores} />

          {/* Key metrics snapshot */}
          {(() => {
            const mt = item.metrics || {}
            const metrics = [
              mt.peRatio && ['P/E', mt.peRatio.toFixed(1) + '×'],
              mt.pegRatio && ['PEG', mt.pegRatio.toFixed(2)],
              mt.evEbitda  && ['EV/EBITDA', mt.evEbitda.toFixed(1) + '×'],
              mt.roe       && ['ROE', mt.roe.toFixed(1) + '%'],
              mt.roic      && ['ROIC', mt.roic.toFixed(1) + '%'],
              mt.grossMargin && ['Gross Margin', mt.grossMargin.toFixed(1) + '%'],
              mt.netMargin && ['Net Margin', mt.netMargin.toFixed(1) + '%'],
              mt.debtEquity && ['Debt/Eq', mt.debtEquity.toFixed(2)],
              mt.currentRatio && ['Current', mt.currentRatio.toFixed(2)],
            ].filter(Boolean)
            if (!metrics.length) return null
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, margin:'10px 0' }}>
                {metrics.slice(0,9).map(([label, val]) => (
                  <div key={label} style={{ background:'#0D0D0D', border:'1px solid #1e1e1e', borderRadius:6, padding:'6px 8px' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#666', textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'#fff' }}>{val}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Piotroski + Altman + FMP Rating + DCF row */}
          {(() => {
            const s = item.score; const rat = item.rating
            if (!s && !rat) return null
            return (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, margin:'8px 0' }}>
                {s?.piotroski != null && (
                  <div style={{ flex:1, minWidth:70, background:'#0D0D0D', border:'1px solid #1e1e1e', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.5rem', color:'#666', textTransform:'uppercase', marginBottom:2 }}>Piotroski</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color: s.piotroski >= 7 ? GREEN : s.piotroski >= 4 ? '#FFD700' : RED }}>{s.piotroski}/9</div>
                  </div>
                )}
                {s?.altmanZ != null && (
                  <div style={{ flex:1, minWidth:70, background:'#0D0D0D', border:'1px solid #1e1e1e', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.5rem', color:'#666', textTransform:'uppercase', marginBottom:2 }}>Altman Z</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color: s.altmanZ > 3 ? GREEN : s.altmanZ > 1.8 ? '#FFD700' : RED }}>{s.altmanZ.toFixed(1)}</div>
                  </div>
                )}
                {rat?.ratingScore != null && (
                  <div style={{ flex:1, minWidth:70, background:'#0D0D0D', border:'1px solid #1e1e1e', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.5rem', color:'#666', textTransform:'uppercase', marginBottom:2 }}>FMP Rating</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:CYAN }}>{rat.rating || '—'}</div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Factor breakdown reasons */}
          <div style={{ marginTop:8, background:'#0A0A0A', borderRadius:8, padding:'10px 12px' }}>
            {Object.entries(r.scores).map(([factor, score]) => {
              const col = score > 0.1 ? GREEN : score < -0.1 ? RED : G1
              const reasons = r.reasons?.[factor] || []
              return (
                <div key={factor} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:col, textTransform:'capitalize' }}>{factor}</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:col }}>{score > 0 ? '+' : ''}{score.toFixed(2)}</span>
                  </div>
                  {reasons.slice(0,2).map((reason, i) => (
                    <div key={i} style={{ fontSize:'0.68rem', color:G1, lineHeight:1.5, paddingLeft:4 }}>· {reason}</div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rank-tags">
        {r.mom?.['3m'] > 10 && <span className="tag">📈 Momentum</span>}
        {r.pe && r.pe < 15 && <span className="tag">💰 Value</span>}
        {r.scores.analyst > 0.4 && <span className="tag">⭐ Analysts</span>}
        {r.conviction > 70 && <span className="tag">🎯 High Conv</span>}
        {['AI & Cloud','Growth'].includes(item.category) && <span className="tag">🚀 Growth</span>}
        {r.scores.earnings > 0.3 && <span className="tag">✅ Beats</span>}
        {r.scores.sentiment > 0.3 && <span className="tag">📰 Positive News</span>}
      </div>
    </div>
  )
}

/* ── Segment group header ── */
function SegmentHeader({ cat, count, topVerdict, topScore }) {
  const verdictColor = topVerdict === 'BUY' ? GREEN : topVerdict === 'AVOID' ? RED : '#FFD700'
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:`1px solid ${G4}`, borderRadius:10, marginBottom:8, marginTop:16 }}>
      <div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:G1, letterSpacing:1, textTransform:'uppercase' }}>{cat}</div>
        <div style={{ fontSize:'0.72rem', color:G1, marginTop:2 }}>Top {count} picks</div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:verdictColor, fontWeight:700 }}>{topVerdict}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:G1 }}>Best: {topScore}/100</div>
      </div>
    </div>
  )
}

/* ── Dividend Card ── */
function DividendCard({ item, rank, onNavigate }) {
  const [open, setOpen] = React.useState(false)
  const medals = ['🥇','🥈','🥉']
  const medal = medals[rank] || `#${rank + 1}`
  const yieldColor = item.divYield >= 6 ? '#FF5000' : item.divYield >= 4 ? YELLOW : item.divYield >= 2 ? GREEN : G1
  const payoutColor = item.payoutRatio > 80 ? RED : item.payoutRatio > 60 ? YELLOW : GREEN
  return (
    <div className="rank-card fade-up" onClick={() => setOpen(o => !o)} style={{ cursor:'pointer', userSelect:'none' }}>
      <div className="rank-header">
        <span className="rank-medal">{medal}</span>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div className="rank-ticker">{item.ticker}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', fontWeight:800, color:yieldColor }}>{item.divYield?.toFixed(2)}%</div>
            {item.frequency && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', padding:'2px 6px', borderRadius:4, background:'rgba(255,215,0,0.1)', color:YELLOW }}>{item.frequency}</div>}
          </div>
          <div className="rank-name">{item.name?.slice(0,26) || item.ticker} · {item.sector || ''}</div>
        </div>
        {item.price && (
          <div className="rank-price-block">
            <div className="rank-price">${item.price?.toFixed(2)}</div>
            <div className={`rank-chg ${(item.chg||0) >= 0 ? 'pos' : 'neg'}`}>{(item.chg||0) >= 0 ? '+' : ''}{(item.chg||0).toFixed(2)}%</div>
          </div>
        )}
      </div>

      {/* Yield bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ flex:1, height:6, background:'#1a1a1a', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min((item.divYield || 0) / 10 * 100, 100)}%`, background:`linear-gradient(90deg,${yieldColor},${yieldColor}88)`, borderRadius:3 }} />
        </div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:yieldColor, minWidth:36 }}>{item.divYield?.toFixed(2)}% yield</span>
      </div>

      {/* Key stats row */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:6 }}>
        {item.annualPayout != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:G1 }}>💵 ${item.annualPayout?.toFixed(2)}/yr</span>}
        {item.payoutRatio != null && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:payoutColor }}>Payout {item.payoutRatio?.toFixed(0)}%</span>}
        {item.exDivDate && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:CYAN }}>Ex-Div {item.exDivDate}</span>}
        {item.signal && <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:item.signalColor }}>Signal {item.signal}/100</span>}
      </div>

      {open && (
        <div style={{ marginTop:10 }}>
          {onNavigate && (
            <button onClick={e => { e.stopPropagation(); onNavigate(item.ticker) }}
              style={{ width:'100%', marginBottom:10, padding:'10px', borderRadius:8, background:'rgba(0,200,5,0.1)', border:'1px solid rgba(0,200,5,0.3)', color:GREEN, fontFamily:'var(--font-mono)', fontSize:'0.7rem', cursor:'pointer' }}>
              🔍 Full Dive Analysis — {item.ticker} →
            </button>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
            {[
              ['Annual Payout', item.annualPayout != null ? `$${item.annualPayout.toFixed(2)}` : '—'],
              ['Dividend Yield', item.divYield != null ? `${item.divYield.toFixed(2)}%` : '—'],
              ['Payout Ratio', item.payoutRatio != null ? `${item.payoutRatio.toFixed(1)}%` : '—'],
              ['Ex-Div Date', item.exDivDate || '—'],
              ['P/E Ratio', item.pe != null ? `${item.pe.toFixed(1)}×` : '—'],
              ['Market Cap', item.mcap || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background:'#0D0D0D', border:'1px solid #1e1e1e', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'#666', textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:'#fff' }}>{val}</div>
              </div>
            ))}
          </div>
          {item.verdict && (
            <div style={{ marginTop:8 }}>
              <VerdictPill verdict={item.verdict} />
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:G1, marginLeft:8 }}>PULSE Signal Score</span>
            </div>
          )}
        </div>
      )}

      <div className="rank-tags" style={{ marginTop:6 }}>
        {item.divYield >= 6 && <span className="tag">🔥 High Yield</span>}
        {item.divYield >= 4 && item.divYield < 6 && <span className="tag">💰 Good Yield</span>}
        {item.payoutRatio != null && item.payoutRatio <= 50 && <span className="tag">✅ Sustainable</span>}
        {item.payoutRatio != null && item.payoutRatio > 80 && <span className="tag">⚠ High Payout</span>}
        {item.frequency === 'Monthly' && <span className="tag">📅 Monthly Pay</span>}
        {item.signal >= 60 && <span className="tag">📈 Strong Signal</span>}
      </div>
    </div>
  )
}

/* ── Main Screener ── */
export default function Screener({ onNavigateToDive }) {
  // Mode: 'topN' = top N per segment, 'full' = full scan with filters
  const [mode, setMode] = useState('topN')
  const [topN, setTopN] = useState(3)
  const [selCats, setSelCats] = useState(ALL_CATS)  // default ALL for topN mode
  const [customInput, setCustomInput] = useState('')
  const [customTickers, setCustomTickers] = useState([])
  const { list: watchlist } = useWatchlist()
  const [verdictFilter, setVerdictFilter] = useState(['BUY', 'HOLD', 'AVOID'])
  const [peMax, setPeMax] = useState(100)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressTicker, setProgressTicker] = useState('')
  const [ran, setRan] = useState(false)
  const [apiError, setApiError] = useState(null)

  // ── Dividend Explorer state (isolated, doesn't affect signal screener) ──
  const [divResults, setDivResults] = useState([])
  const [divLoading, setDivLoading] = useState(false)
  const [divProgress, setDivProgress] = useState(0)
  const [divProgressTicker, setDivProgressTicker] = useState('')
  const [divRan, setDivRan] = useState(false)
  const [divMinYield, setDivMinYield] = useState(2)
  const [divSector, setDivSector] = useState('All')
  const [divError, setDivError] = useState(null)

  const toggleCat = (cat) => setSelCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  const toggleAll = () => setSelCats(prev => prev.length === ALL_CATS.length ? [] : [...ALL_CATS])
  const addCustom = () => {
    const tks = customInput.toUpperCase().split(/[\s,]+/).map(t => t.trim()).filter(t => t.length > 1 && t.length < 6)
    if (tks.length) { setCustomTickers(prev => [...new Set([...prev, ...tks])]); setCustomInput('') }
  }
  const removeCustom = (t) => setCustomTickers(prev => prev.filter(x => x !== t))
  const toggleVerdict = (v) => setVerdictFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

  const allTickers = useMemo(() =>
    [...new Set([...selCats.flatMap(c => UNIVERSE[c] || []), ...customTickers])],
    [selCats, customTickers]
  )

  const runScreener = useCallback(async () => {
    const k = hasKeys()
    // Note: keys may be server-side only — attempt fetch and let proxy handle missing keys
    setApiError(null)
    setLoading(true); setProgress(0); setResults([]); setRan(false)

    const out = []

    // FMP bulk mode — ONLY when ALL segments selected (full market scan)
    // When specific segments selected, use curated UNIVERSE for reliable grouping
    const allSelected = selCats.length === ALL_CATS.length
    if (k.fmp && allSelected && customTickers.length === 0) {
      setProgressTicker('FMP bulk fetch…')
      const bulk = await fetchFMPScreener({ minMcap: 500, limit: 300 })
      if (bulk?.length) {
        const BATCH = 10
        for (let i = 0; i < bulk.length; i += BATCH) {
          const batch = bulk.slice(i, i + BATCH)
          setProgressTicker(batch[0]?.ticker || '')
          const batchResults = await Promise.all(batch.map(s => fetchTickerLite(s.ticker)))
          for (const data of batchResults) {
            if (!data) continue
            const ea = v => Array.isArray(v) ? v : []
            const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, ea(data.news), data.rec, ea(data.earnings), undefined, {})
            // Try UNIVERSE match first, then use FMP sector as fallback
            const universeCat = selCats.find(c => UNIVERSE[c]?.includes(data.ticker))
            const fmpSector = bulk.find(s => s.ticker === data.ticker)?.sector || 'Market'
            out.push({ ...data, result, category: universeCat || fmpSector })
          }
          setProgress(Math.round(Math.min(i + BATCH, bulk.length) / bulk.length * 100))
        }
        out.sort((a, b) => b.result.pct - a.result.pct)
        setResults(out); setLoading(false); setRan(true)
        return
      }
    }

    // Fallback — scan curated universe
    const tickers = [...new Set([...selCats.flatMap(c => UNIVERSE[c] || []), ...customTickers])]
    if (!tickers.length) { setLoading(false); return }

    const BATCH = 10
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      setProgressTicker(batch[0])
      const batchResults = await Promise.all(batch.map(fetchTickerLite))
      for (const data of batchResults) {
        if (!data) continue
        const ea2 = v => Array.isArray(v) ? v : []
        const result = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, ea2(data.news), data.rec, ea2(data.earnings), undefined, {})
        const cat = selCats.find(c => UNIVERSE[c]?.includes(data.ticker)) || 'Custom'
        out.push({ ...data, result, category: cat })
      }
      setProgress(Math.round(Math.min(i + BATCH, tickers.length) / tickers.length * 100))
    }

    out.sort((a, b) => b.result.pct - a.result.pct)
    setResults(out); setLoading(false); setRan(true)
  }, [allTickers, selCats, customTickers])

  // ── Dividend scan — uses /stable/dividends-calendar (one call, all payers this month) ──
  const runDividendScan = useCallback(async () => {
    const k = hasKeys()
    // Note: FMP key is server-side — proxy handles auth
    setDivLoading(true); setDivProgress(0); setDivResults([]); setDivRan(false); setDivError(null)

    setDivProgressTicker('Fetching dividend calendar…')
    const calendarData = await fetchDividendScreener({ minYield: 0, limit: 200 })

    if (!calendarData.length) {
      setDivError('No dividend data returned from FMP. The /stable/dividends-calendar endpoint may not be available on your plan.')
      setDivLoading(false)
      return
    }

    const top = calendarData.slice(0, 50)
    const out = []
    const BATCH = 8

    for (let i = 0; i < top.length; i += BATCH) {
      const batch = top.slice(i, i + BATCH)
      setDivProgressTicker(batch[0]?.ticker || '')
      const batchResults = await Promise.all(batch.map(async (s) => {
        try {
          const data = await fetchTickerLite(s.ticker)
          const price = data?.quote?.c || s.price || 0
          const chg = data?.quote?.dp || 0
          const metrics = data?.metrics || {}
          const divYield = s.divYield
          const annualPayout = s.dividend
            ? parseFloat((s.dividend * (s.frequency === 'Monthly' ? 12 : s.frequency === 'Semi-Annual' ? 2 : 4)).toFixed(2))
            : price && divYield ? parseFloat((price * divYield / 100).toFixed(2)) : null
          const payoutRatio = metrics.payoutRatio ?? null
          let signal = null, signalColor = '#B2B2B2', verdict = null
          if (data?.quote && data?.candles) {
            const ea = v => Array.isArray(v) ? v : []
            const scored = scoreAsset(data.quote, data.candles, data.candles?.ma50, metrics, ea(data.news), data.rec, ea(data.earnings), undefined, {})
            signal = scored.pct ? Math.round(scored.pct) : null
            signalColor = scored.color
            verdict = scored.verdict
          }
          return {
            ticker: s.ticker,
            name: data?.profile?.companyName || s.name || s.ticker,
            sector: data?.profile?.sector || s.sector || '—',
            price, chg, divYield, annualPayout, payoutRatio,
            exDivDate: s.exDivDate,
            paymentDate: s.paymentDate,
            pe: metrics.peRatio || s.pe || null,
            mcap: fmtMcap(data?.profile?.marketCapitalization || s.mcap),
            signal, signalColor, verdict,
            frequency: s.frequency || 'Quarterly',
          }
        } catch {
          return {
            ticker: s.ticker, name: s.name || s.ticker, sector: s.sector || '—',
            price: s.price || 0, chg: 0, divYield: s.divYield,
            annualPayout: null, payoutRatio: null,
            exDivDate: s.exDivDate, paymentDate: s.paymentDate,
            pe: null, mcap: null, signal: null, signalColor: '#B2B2B2', verdict: null,
            frequency: s.frequency || 'Quarterly',
          }
        }
      }))
      for (const r of batchResults) { if (r) out.push(r) }
      setDivProgress(Math.round(Math.min(i + BATCH, top.length) / top.length * 100))
    }

    out.sort((a, b) => (b.divYield || 0) - (a.divYield || 0))
    setDivResults(out); setDivLoading(false); setDivRan(true)
  }, [])


  // Top N mode: group by category, take top N each, sort categories by their best score
  const topNGrouped = useMemo(() => {
    if (mode !== 'topN' || !ran) return null
    const groups = {}
    // First try grouping by UNIVERSE membership (curated list path)
    for (const cat of selCats) {
      const catResults = results
        .filter(r => UNIVERSE[cat]?.includes(r.ticker) || r.category === cat)
        .sort((a, b) => b.result.pct - a.result.pct)
        .slice(0, topN)
      if (catResults.length > 0) groups[cat] = catResults
    }
    // If no groups formed (FMP bulk path — tickers not in UNIVERSE)
    // Fall back to grouping by r.category which was assigned during scan
    if (Object.keys(groups).length === 0) {
      for (const r of results) {
        const cat = r.category || 'Market'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(r)
      }
      // Take topN from each group
      for (const cat of Object.keys(groups)) {
        groups[cat] = groups[cat]
          .sort((a, b) => b.result.pct - a.result.pct)
          .slice(0, topN)
      }
    }
    if (customTickers.length > 0) {
      const customResults = results.filter(r => customTickers.includes(r.ticker)).slice(0, topN)
      if (customResults.length > 0) groups['Custom'] = customResults
    }
    // Sort groups by their best score descending
    return Object.entries(groups).sort((a, b) => b[1][0].result.pct - a[1][0].result.pct)
  }, [results, mode, topN, selCats, customTickers, ran])

  // Full mode filtered results
  const filtered = useMemo(() => {
    if (mode !== 'full') return []
    return results.filter(r => {
      if (!verdictFilter.includes(r.result.verdict)) return false
      if (peMax < 100 && r.result.pe && r.result.pe > peMax) return false
      return true
    })
  }, [results, mode, verdictFilter, peMax])

  // Summary stats for topN mode
  const topNFlat = topNGrouped ? topNGrouped.flatMap(([, items]) => items) : []
  const buyCount = topNFlat.filter(r => r.result.verdict === 'BUY').length
  const bestOverall = topNFlat[0]

  return (
    <PullToRefresh onRefresh={runScreener} enabled={ran}>
    <div className="page">

      {/* Mode toggle */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:16 }}>
        <button onClick={() => setMode('topN')}
          style={{ padding:'10px 6px', borderRadius:10, border:`1px solid ${mode==='topN'?GREEN:G4}`, background:mode==='topN'?'rgba(0,200,5,0.08)':'#111', color:mode==='topN'?GREEN:'#fff', fontWeight:700, fontSize:'0.72rem', cursor:'pointer' }}>
          🏆 Top Picks
        </button>
        <button onClick={() => setMode('full')}
          style={{ padding:'10px 6px', borderRadius:10, border:`1px solid ${mode==='full'?CYAN:G4}`, background:mode==='full'?'rgba(0,229,255,0.06)':'#111', color:mode==='full'?CYAN:'#fff', fontWeight:700, fontSize:'0.72rem', cursor:'pointer' }}>
          🔍 Full Scan
        </button>
        <button onClick={() => setMode('dividend')}
          style={{ padding:'10px 6px', borderRadius:10, border:`1px solid ${mode==='dividend'?YELLOW:G4}`, background:mode==='dividend'?'rgba(255,215,0,0.07)':'#111', color:mode==='dividend'?YELLOW:'#fff', fontWeight:700, fontSize:'0.72rem', cursor:'pointer' }}>
          💰 Dividends
        </button>
      </div>

      {/* TOP N MODE CONFIG */}
      {mode === 'topN' && (
        <div style={{ background:'rgba(0,200,5,0.04)', border:'1px solid rgba(0,200,5,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:GREEN, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Picks per segment</div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            {[1, 2, 3, 5, 10].map(n => (
              <button key={n} onClick={() => setTopN(n)}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1px solid ${topN===n?GREEN:G4}`, background:topN===n?'rgba(0,200,5,0.15)':'#111', color:topN===n?GREEN:G1, fontFamily:'var(--font-mono)', fontSize:'0.82rem', fontWeight:topN===n?700:400, cursor:'pointer' }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize:'0.76rem', color:G1, lineHeight:1.6 }}>
            PULSE will scan all tickers in each selected segment and return the top <b style={{ color:GREEN }}>{topN}</b> ranked by signal score. Segments are then sorted by their best pick.
          </div>
        </div>
      )}

      {/* FULL MODE CONFIG */}
      {mode === 'full' && (
        <div style={{ background:'rgba(0,229,255,0.03)', border:'1px solid rgba(0,229,255,0.12)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:CYAN, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Post-scan filters</div>
          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            {VERDICTS.map(v => (
              <button key={v} className={`filter-chip ${verdictFilter.includes(v) ? 'active' : ''}`}
                style={{ flex:1, justifyContent:'center' }}
                onClick={() => toggleVerdict(v)}>{v}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span className="input-label" style={{ margin:0, whiteSpace:'nowrap', fontSize:'0.6rem' }}>Max P/E</span>
            <input type="range" min={10} max={100} step={5} value={peMax}
              onChange={e => setPeMax(+e.target.value)}
              style={{ flex:1, accentColor:CYAN }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:G1, minWidth:36, textAlign:'right' }}>
              {peMax >= 100 ? 'Any' : `≤${peMax}×`}
            </span>
          </div>
        </div>
      )}

      {mode !== 'dividend' && (<>
      {/* Categories */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, letterSpacing:1.5, textTransform:'uppercase' }}>Segments to scan</div>
        <button onClick={toggleAll} style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:CYAN, background:'transparent', border:'none', cursor:'pointer', padding:'2px 0' }}>
          {selCats.length === ALL_CATS.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
        {ALL_CATS.map(cat => {
          const count = UNIVERSE[cat]?.length || 0
          return (
            <button key={cat} onClick={() => toggleCat(cat)}
              className={`filter-chip ${selCats.includes(cat) ? 'active' : ''}`}
              style={{ position:'relative' }}>
              {cat}
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', opacity:0.6, marginLeft:3 }}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* Custom tickers */}
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>Add custom tickers</div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input className="input" value={customInput} onChange={e => setCustomInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="e.g. HOOD, ARM, RGTI, BRK-B …"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{ flex:1 }} />
        <button className="btn btn-ghost" style={{ width:'auto', padding:'12px 16px', whiteSpace:'nowrap' }} onClick={addCustom}>+ Add</button>
      </div>
      {watchlist.length > 0 && (
        <button className="btn btn-ghost" style={{ width:'auto', padding:'8px 14px', fontSize:'0.72rem', marginBottom:8 }}
          onClick={() => setCustomTickers(prev => [...new Set([...prev, ...watchlist])])}>
          📋 Import Watchlist ({watchlist.length})
        </button>
      )}
      {customTickers.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
          {customTickers.map(t => (
            <button key={t} onClick={() => removeCustom(t)}
              style={{ background:'rgba(0,229,255,0.1)', border:'1px solid rgba(0,229,255,0.3)', color:CYAN, borderRadius:20, padding:'3px 10px', fontFamily:'var(--font-mono)', fontSize:'0.66rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              {t} <span style={{ opacity:0.6 }}>✕</span>
            </button>
          ))}
        </div>
      )}

      {/* Scan button */}
      <button className="btn btn-primary" onClick={runScreener} disabled={loading || !allTickers.length}
        style={{ marginTop:12, marginBottom: apiError ? 10 : 16 }}>
        {loading
          ? `Scanning ${progress}% · ${progressTicker}…`
          : mode === 'topN'
            ? `🏆 Find Top ${topN} per Segment → ${hasKeys().fmp && customTickers.length === 0 ? '500+ tickers (FMP)' : `${allTickers.length} tickers`}`
            : `🔍 Full Scan → ${hasKeys().fmp && customTickers.length === 0 ? '500+ tickers (FMP)' : `${allTickers.length} tickers`}`
        }
      </button>

      {apiError && (
        <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:RED, marginBottom:4, letterSpacing:1 }}>⚠ API KEY REQUIRED</div>
          <div style={{ fontSize:'0.8rem', color:G1 }}>{apiError}</div>
        </div>
      )}

      </>)}

      {loading && mode !== 'dividend' && <LoadingBar progress={progress} text={`Parallel scan · ${progress}% · ${progressTicker}`} />}

      {/* ── DIVIDEND EXPLORER ── */}
      {mode === 'dividend' && (
        <>
          {/* Config */}
          <div style={{ background:'rgba(255,215,0,0.04)', border:'1px solid rgba(255,215,0,0.18)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:YELLOW, letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>Dividend Filters</div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, marginBottom:6 }}>Minimum Yield</div>
              <div style={{ display:'flex', gap:6 }}>
                {[0, 2, 3, 4, 6].map(y => (
                  <button key={y} onClick={() => setDivMinYield(y)}
                    style={{ flex:1, padding:'8px 0', borderRadius:8, border:`1px solid ${divMinYield===y?YELLOW:G4}`, background:divMinYield===y?'rgba(255,215,0,0.15)':'#111', color:divMinYield===y?YELLOW:G1, fontFamily:'var(--font-mono)', fontSize:'0.72rem', fontWeight:divMinYield===y?700:400, cursor:'pointer' }}>
                    {y === 0 ? 'Any' : `${y}%+`}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize:'0.74rem', color:G1, lineHeight:1.6 }}>
              Fetches the <b style={{ color:YELLOW }}>top 50 highest-yielding stocks</b> from the entire US market in real-time — BDCs, REITs, Energy, Utilities, Aristocrats & more. Sorted by yield with PULSE signal score.
            </div>
          </div>

          <button className="btn btn-primary" onClick={runDividendScan} disabled={divLoading}
            style={{ marginBottom:14, background:'rgba(255,215,0,0.12)', border:'1px solid rgba(255,215,0,0.4)', color:YELLOW }}>
            {divLoading ? `💰 Scanning ${divProgress}% · ${divProgressTicker}…` : '💰 Scan Highest Dividend Stocks → Entire US Market'}
          </button>

          {divError && (
            <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.3)', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:RED, marginBottom:4, letterSpacing:1 }}>⚠ ERROR</div>
              <div style={{ fontSize:'0.8rem', color:G1 }}>{divError}</div>
            </div>
          )}
          {divLoading && <LoadingBar progress={divProgress} text={`Scanning dividends · ${divProgress}% · ${divProgressTicker}`} />}

          {divRan && !divLoading && (() => {
            const filtered = divResults.filter(r => (r.divYield || 0) >= divMinYield)
            const avgYield = filtered.length ? (filtered.reduce((s, r) => s + (r.divYield||0), 0) / filtered.length).toFixed(2) : '—'
            const topYield = filtered[0]?.divYield?.toFixed(2) || '—'
            const monthlyPayers = filtered.filter(r => r.frequency === 'Monthly').length
            return (
              <>
                {/* Summary stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
                  {[
                    ['Stocks', filtered.length],
                    ['Top Yield', `${topYield}%`],
                    ['Avg Yield', `${avgYield}%`],
                    ['Monthly Pay', monthlyPayers],
                  ].map(([l, v]) => (
                    <div key={l} className="metric-cell">
                      <div className="metric-label">{l}</div>
                      <div className="metric-value" style={{ color: l === 'Top Yield' ? YELLOW : undefined }}>{v}</div>
                    </div>
                  ))}
                </div>

                {filtered.length === 0 && (
                  <div style={{ textAlign:'center', color:G1, padding:'32px 16px', fontSize:'0.86rem', background:'#111', border:`1px solid ${G4}`, borderRadius:14 }}>
                    No stocks found with {divMinYield}%+ yield. Try lowering the minimum.
                  </div>
                )}

                {filtered.map((item, idx) => (
                  <DividendCard key={item.ticker} item={item} rank={idx} onNavigate={onNavigateToDive} />
                ))}

                <div style={{ fontSize:'0.7rem', color:'#444', textAlign:'center', padding:'16px 0', lineHeight:1.8 }}>
                  ⚠ Dividend yields are TTM and may change. High yields can signal distress — always check payout ratio and sustainability. Past dividends ≠ future payments.
                </div>
              </>
            )
          })()}

          {!divRan && !divLoading && (
            <div style={{ textAlign:'center', color:G1, padding:'40px 0' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'4rem', color:'#1A1A1A', marginBottom:12 }}>💰</div>
              <b style={{ color:YELLOW }}>Dividend Explorer</b> — find the highest-yielding stocks across every major sector.<br />
              <span style={{ fontSize:'0.76rem', display:'block', marginTop:8 }}>Pulls the top 50 highest-yielding stocks from the entire US market in real-time.</span>
            </div>
          )}
        </>
      )}

      {/* ── TOP N RESULTS ── */}
      {ran && !loading && mode === 'topN' && (
        <>
          {/* Summary */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:4 }}>
            {[
              ['Segments', topNGrouped?.length || 0],
              ['Total picks', topNFlat.length],
              ['BUY signals', buyCount],
              ['Best', bestOverall?.ticker || '—'],
            ].map(([l, v]) => (
              <div key={l} className="metric-cell">
                <div className="metric-label">{l}</div>
                <div className="metric-value">{v}</div>
              </div>
            ))}
          </div>

          {/* Best overall call-out */}
          {bestOverall && (
            <div style={{ background:`${bestOverall.result.color}08`, border:`1px solid ${bestOverall.result.color}25`, borderRadius:12, padding:'14px 16px', marginBottom:4, marginTop:14 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:bestOverall.result.color, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>🏆 Best Pick Overall</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, letterSpacing:-1 }}>{bestOverall.ticker}</div>
                  <div style={{ fontSize:'0.74rem', color:G1, marginTop:2 }}>{bestOverall.category} · {bestOverall.name || TICKER_NAMES[bestOverall.ticker] || ''}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.1rem', fontWeight:700, color:bestOverall.result.color }}>{bestOverall.result.pct.toFixed(0)}/100</div>
                  <VerdictPill verdict={bestOverall.result.verdict} />
                </div>
              </div>
            </div>
          )}

          {/* Grouped by segment */}
          {topNGrouped?.map(([cat, items]) => (
            <div key={cat}>
              <SegmentHeader
                cat={cat}
                count={items.length}
                topVerdict={items[0].result.verdict}
                topScore={items[0].result.pct.toFixed(0)}
              />
              {items.map((item, idx) => (
                <RankCard key={item.ticker} item={item} rank={idx} showCat={false} onNavigate={onNavigateToDive} />
              ))}
            </div>
          ))}

          {topNFlat.length === 0 && (
            <div style={{ textAlign:'center', color:G1, padding:'32px 16px', fontSize:'0.86rem', background:'#111', border:`1px solid ${G4}`, borderRadius:14, marginTop:12 }}>
              No data returned. Check your API key and try again.
            </div>
          )}
        </>
      )}

      {/* ── FULL SCAN RESULTS ── */}
      {ran && !loading && mode === 'full' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
            {[['Scanned', results.length], ['Shown', filtered.length],
              ['BUY', results.filter(r => r.result.verdict === 'BUY').length],
              ['Top', filtered[0]?.ticker || '—']].map(([l, v]) => (
              <div key={l} className="metric-cell">
                <div className="metric-label">{l}</div>
                <div className="metric-value">{v}</div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign:'center', color:G1, padding:'32px 16px', fontSize:'0.86rem', background:'#111', border:`1px solid ${G4}`, borderRadius:14 }}>
              {results.length === 0
                ? <>No data returned.<br /><span style={{ fontSize:'0.76rem' }}>Check API key, then retry.</span></>
                : <>No results match filters.<br /><span style={{ fontSize:'0.76rem' }}>Try selecting all verdicts or Any P/E.</span></>
              }
            </div>
          )}

          {filtered.slice(0, 30).map((item, idx) => (
            <RankCard key={item.ticker} item={item} rank={idx} showCat={true} onNavigate={onNavigateToDive} />
          ))}
        </>
      )}

      {!ran && !loading && (
        <div style={{ textAlign:'center', color:G1, padding:'40px 0', fontSize:'0.86rem' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'4rem', color:'#1A1A1A', marginBottom:12 }}>
            {mode === 'topN' ? '🏆' : '≡'}
          </div>
          {mode === 'topN'
            ? <><b style={{ color:GREEN }}>Top Picks Mode</b> — PULSE scans every ticker in your selected segments and surfaces the top {topN} from each, ranked by signal score.<br /><span style={{ fontSize:'0.76rem', display:'block', marginTop:8 }}>Segments are sorted by their strongest pick. Tap a card for factor breakdown.</span></>
            : <>Select segments above and tap <b style={{ color:CYAN }}>Full Scan</b>.<br /><span style={{ fontSize:'0.76rem', display:'block', marginTop:8 }}>Returns all results with post-scan filters.</span></>
          }
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
    </PullToRefresh>
  )
}
