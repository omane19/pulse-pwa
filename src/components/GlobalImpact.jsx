import React, { useEffect, useState, useCallback } from 'react'
import { fetchQuote, fetchRegionNews, fetchTickerLite, fetchMarketMovers, fetchMacroLive } from '../hooks/useApi.js'
import { scoreAsset } from '../utils/scoring.js'
import { PullToRefresh } from './shared.jsx'
import { GLOBAL_CHAINS, TICKER_NAMES } from '../utils/constants.js'

const G1='#B2B2B2'; const G2='#111'; const G4='#252525'; const CYAN='#00E5FF'
const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'

const SECTOR_COLORS = {
  'Technology': CYAN, 'Healthcare': '#5AC8FA', 'Financials': '#7B61FF',
  'Consumer Cyclical': '#FF9500', 'Energy': '#FF2D55', 'Industrials': '#34C759',
  'Communication Services': '#FFD700', 'Consumer Defensive': '#A8E063',
  'Basic Materials': '#FF6B35', 'Real Estate': '#C77DFF', 'Utilities': '#80ED99',
}

const SECTOR_STOCKS = {
  'Technology': ['AAPL','MSFT','NVDA','GOOGL','META'],
  'Healthcare': ['JNJ','UNH','PFE','ABBV','MRK'],
  'Financials': ['JPM','BAC','WFC','GS','MS'],
  'Consumer Cyclical': ['AMZN','TSLA','HD','MCD','NKE'],
  'Energy': ['XOM','CVX','SLB','COP','EOG'],
  'Industrials': ['CAT','HON','RTX','UPS','GE'],
  'Communication Services': ['GOOGL','META','NFLX','DIS','T'],
  'Consumer Defensive': ['WMT','PG','KO','PEP','COST'],
  'Basic Materials': ['LIN','APD','SHW','FCX','NEM'],
  'Real Estate': ['PLD','AMT','EQIX','PSA','O'],
  'Utilities': ['NEE','DUK','SO','AEP','EXC'],
}

function MiniScore({ pct, verdict }) {
  if (pct == null) return <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#555' }}>…</span>
  const color = verdict === 'BUY' ? GREEN : verdict === 'HOLD' ? YELLOW : RED
  return <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color, background:`${color}15`, padding:'1px 5px', borderRadius:4, marginLeft:4 }}>{Math.round(pct)}</span>
}

/* ── Sector Heatmap ── */
function SectorHeatmap({ sectorData, onNavigate }) {
  const [expanded, setExpanded] = useState(null)
  if (!sectorData || !sectorData.length) return null

  const maxAbs = Math.max(...sectorData.map(s => Math.abs(s.change)), 1)

  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:10 }}>📊 Sector Performance</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:6 }}>
        {sectorData.map(s => {
          const color = s.change >= 0 ? GREEN : RED
          const intensity = Math.min(Math.abs(s.change) / maxAbs, 1)
          const bg = s.change >= 0
            ? `rgba(0,200,5,${0.06 + intensity * 0.18})`
            : `rgba(255,80,0,${0.06 + intensity * 0.18})`
          const sectorColor = SECTOR_COLORS[s.name] || G1
          const isOpen = expanded === s.name
          const stocks = SECTOR_STOCKS[s.name] || []

          return (
            <div key={s.name}>
              <div
                onClick={() => setExpanded(isOpen ? null : s.name)}
                style={{ background:bg, border:`1px solid ${color}30`, borderRadius:8,
                  padding:'10px 10px', cursor:'pointer', userSelect:'none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:'0.64rem', color:sectorColor, fontWeight:600, lineHeight:1.3, flex:1, marginRight:4 }}>{s.name}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color, fontWeight:700, flexShrink:0 }}>
                    {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                  </div>
                </div>
                <div style={{ fontSize:'0.54rem', color:G1, marginTop:3 }}>Tap to see stocks ›</div>
              </div>
              {isOpen && stocks.length > 0 && (
                <div style={{ background:G2, border:`1px solid ${sectorColor}25`, borderRadius:'0 0 8px 8px',
                  padding:'8px 10px', marginTop:-2, display:'flex', flexWrap:'wrap', gap:4 }}>
                  {stocks.map(t => (
                    <button key={t} onClick={() => onNavigate && onNavigate(t)}
                      style={{ fontFamily:'var(--font-mono)', fontSize:'0.66rem', color:CYAN,
                        background:`${CYAN}12`, border:`1px solid ${CYAN}30`, borderRadius:6,
                        padding:'3px 8px', cursor:'pointer' }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Economic Calendar with alerts ── */
function EconomicCalendar({ events, notify, permission }) {
  if (!events || !events.length) return null
  const upcoming = events.filter(e => !e.isPast)
  const past     = events.filter(e =>  e.isPast).slice(0, 3)

  const impactColor = { High: RED, Medium: YELLOW, Low: G1 }

  const setReminder = async (event) => {
    if (permission !== 'granted') {
      alert('Enable notifications first (bell icon in Watchlist tab)')
      return
    }
    const daysAway = Math.ceil((new Date(event.date) - new Date()) / 86400000)
    await notify(`📅 Tomorrow: ${event.event}`, `Impact: ${event.impact} · Est: ${event.estimate ?? 'N/A'}`, 'macro')
    alert(`Reminder set for ${event.event}`)
  }

  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:10 }}>📅 Economic Calendar</div>

      {upcoming.map((e, i) => {
        const daysAway = Math.ceil((new Date(e.date) - new Date()) / 86400000)
        const isSoon = daysAway <= 2
        const color = impactColor[e.impact] || G1
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < upcoming.length-1 ? `1px solid ${G4}` : 'none' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.72rem', color: isSoon ? '#fff' : G1, fontWeight: isSoon ? 600 : 400 }}>{e.event}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginTop:2 }}>
                {daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `in ${daysAway}d`}
                {e.estimate != null && ` · Est: ${e.estimate}`}
                {e.previous != null && ` · Prev: ${e.previous}`}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.55rem', color, background:`${color}15`, padding:'1px 6px', borderRadius:4 }}>{e.impact}</div>
              {isSoon && (
                <button onClick={() => setReminder(e)}
                  style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:YELLOW, background:`${YELLOW}12`,
                    border:`1px solid ${YELLOW}30`, borderRadius:4, padding:'2px 5px', cursor:'pointer' }}>
                  🔔 Remind
                </button>
              )}
            </div>
          </div>
        )
      })}

      {past.length > 0 && (
        <>
          <div style={{ fontSize:'0.55rem', color:G1, marginTop:10, marginBottom:6, letterSpacing:'1px' }}>RECENT RELEASES</div>
          {past.map((e, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom: i < past.length-1 ? `1px solid ${G4}` : 'none' }}>
              <div style={{ fontSize:'0.66rem', color:G1 }}>{e.event}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', display:'flex', gap:8 }}>
                {e.actual != null && <span style={{ color: e.estimate != null ? (e.actual >= e.estimate ? GREEN : RED) : G1 }}>A: {e.actual}</span>}
                {e.estimate != null && <span style={{ color:G1 }}>E: {e.estimate}</span>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/* ── Yield Curve Card ── */
function YieldCurveCard({ yieldCurve }) {
  if (!yieldCurve) return null
  const pts = [
    { label:'1Y', val:yieldCurve.y1 },
    { label:'2Y', val:yieldCurve.y2 },
    { label:'5Y', val:yieldCurve.y5 },
    { label:'10Y', val:yieldCurve.y10 },
    { label:'30Y', val:yieldCurve.y30 },
  ].filter(p => p.val > 0)
  const maxVal = Math.max(...pts.map(p => p.val))
  const minVal = Math.min(...pts.map(p => p.val))
  const range = maxVal - minVal || 1

  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1 }}>📈 Treasury Yield Curve</div>
        {yieldCurve.inverted && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:RED, background:`${RED}15`, padding:'2px 6px', borderRadius:4 }}>⚠ Inverted</div>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:60, marginBottom:8 }}>
        {pts.map(p => {
          const height = ((p.val - minVal) / range * 40 + 10)
          const color = yieldCurve.inverted ? RED : CYAN
          return (
            <div key={p.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color }}>{p.val.toFixed(2)}%</div>
              <div style={{ width:'100%', height, background:color, borderRadius:'3px 3px 0 0', opacity:0.7 }} />
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.55rem', color:G1 }}>{p.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color: yieldCurve.spread10_2 >= 0 ? GREEN : RED }}>
        10Y–2Y spread: {yieldCurve.spread10_2 >= 0 ? '+' : ''}{yieldCurve.spread10_2}%
        {yieldCurve.inverted ? ' · Recession signal active' : ' · Normal curve'}
      </div>
    </div>
  )
}

/* ── Macro indicators ── */
function MacroIndicators({ econData }) {
  if (!econData) return null
  const indicators = [
    { label:'GDP Growth', data:econData.gdp, good: v => v >= 2 },
    { label:'CPI Inflation', data:econData.cpi, good: v => v <= 3 },
    { label:'Unemployment', data:econData.unemploy, good: v => v <= 5 },
  ]
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:10 }}>🏦 Key Macro Indicators</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {indicators.map(({ label, data, good }) => {
          if (data?.value == null) return null
          const isGood = good(data.value)
          const color = isGood ? GREEN : RED
          const delta = data.prev ? data.value - data.prev : null
          return (
            <div key={label} style={{ background:G4, borderRadius:8, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontSize:'0.56rem', color:G1, marginBottom:4 }}>{label}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.9rem', color, fontWeight:700 }}>{data.value.toFixed(1)}%</div>
              {delta != null && (
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color: delta <= 0 && label !== 'GDP Growth' ? GREEN : RED, marginTop:2 }}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RegionCard({ chain, price, loadingPrices, onNavigate, tickerScores }) {
  const [news, setNews]         = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsLoaded, setNewsLoaded]   = useState(false)
  const [showWhy, setShowWhy]   = useState(false)

  const pq = price
  const priceStr   = pq ? `$${pq.c.toFixed(2)}  ${pq.dp >= 0 ? '+' : ''}${pq.dp?.toFixed(2)}%` : loadingPrices ? '…' : '—'
  const priceColor = pq ? (pq.dp >= 0 ? GREEN : RED) : G1

  const loadNews = useCallback(async () => {
    if (newsLoaded) return
    setNewsLoading(true)
    const items = await fetchRegionNews(chain.proxy)
    setNews(items)
    setNewsLoaded(true)
    setNewsLoading(false)
  }, [newsLoaded, chain.proxy])

  useEffect(() => { loadNews() }, [])

  return (
    <div className="chain-card fade-up" style={{ borderTop:`2px solid ${chain.color}30` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div className="chain-region">{chain.region}</div>
          <div className="chain-event">{chain.event}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div className="chain-proxy">Proxy: <span style={{ fontFamily:'var(--font-mono)', color:CYAN }}>{chain.proxy}</span></div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:priceColor, marginTop:3 }}>{priceStr}</div>
        </div>
      </div>

      <div style={{ marginBottom:10 }}>
        {newsLoading ? (
          <div style={{ fontSize:'0.7rem', color:G1, padding:'8px 0' }}>Loading latest news…</div>
        ) : news.length === 0 && newsLoaded ? (
          <div style={{ fontSize:'0.7rem', color:G1, padding:'4px 0' }}>No recent news found</div>
        ) : news.map((n, i) => (
          <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{
            display:'block', padding:'7px 0',
            borderBottom: i < news.length - 1 ? `1px solid ${G4}` : 'none',
            textDecoration:'none'
          }}>
            <div style={{ fontSize:'0.76rem', color:'#fff', lineHeight:1.4, marginBottom:3 }}>{n.title}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1 }}>
              {n.source}
              {n.ts ? ` · ${new Date(n.ts * 1000).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : ''}
              <span style={{ color:chain.color, marginLeft:6 }}>↗</span>
            </div>
          </a>
        ))}
      </div>

      <div style={{ fontSize:'0.6rem', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:G1, marginBottom:6 }}>Affected tickers</div>
      <div className="ticker-chips">
        {chain.affects.map(t => (
          <button key={t} className="ticker-chip"
            title={TICKER_NAMES[t] || t}
            onClick={() => onNavigate && onNavigate(t)}
            style={{ cursor:'pointer', background:'transparent', border:'none', padding:0, color:'inherit', font:'inherit', WebkitTapHighlightColor:'transparent', display:'inline-flex', alignItems:'center', gap:2 }}>
            {t}
            <MiniScore pct={tickerScores?.[t]?.pct} verdict={tickerScores?.[t]?.verdict} />
          </button>
        ))}
      </div>

      <button onClick={() => setShowWhy(o => !o)} style={{
        marginTop:10, background:'transparent', border:`1px solid ${G4}`,
        borderRadius:6, padding:'4px 10px', color:G1, fontFamily:'var(--font-mono)',
        fontSize:'0.56rem', cursor:'pointer', letterSpacing:0.5
      }}>
        {showWhy ? '▲ Hide' : '▼ Why this matters'}
      </button>
      {showWhy && (
        <div style={{ marginTop:8, fontSize:'0.74rem', color:G1, lineHeight:1.7 }}>{chain.why}</div>
      )}
    </div>
  )
}

export default function GlobalImpact({ onNavigate }) {
  const [prices, setPrices]           = useState({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [tickerScores, setTickerScores]   = useState({})
  const [movers,    setMovers]            = useState(null)
  const [macroData, setMacroData]         = useState(null)
  const [macroTab,  setMacroTab]          = useState('sectors') // sectors | calendar | yield | macro
  const [notifPerm, setNotifPerm] = React.useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  const notify = async (title, body) => {
    if (typeof Notification === 'undefined') return
    let perm = notifPerm
    if (perm === 'default') {
      perm = await Notification.requestPermission()
      setNotifPerm(perm)
    }
    if (perm === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' })
    }
  }

  const loadAll = useCallback(async () => {
    setLoadingPrices(true)
    const proxies = [...new Set(GLOBAL_CHAINS.map(c => c.proxy))]
    const results = await Promise.all(proxies.map(async p => [p, await fetchQuote(p)]))
    const map = {}
    results.forEach(([p, q]) => { if (q) map[p] = q })
    setPrices(map)
    setLoadingPrices(false)

    // Fetch macro data and movers in parallel
    const [macro, mv] = await Promise.all([fetchMacroLive(), fetchMarketMovers()])
    if (macro) setMacroData(macro)
    if (mv)    setMovers(mv)

    // Background: mini scores for affected tickers
    const allTickers = [...new Set(GLOBAL_CHAINS.flatMap(c => c.affects))]
    const BATCH = 4
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const batch = allTickers.slice(i, i + BATCH)
      const batchData = await Promise.all(batch.map(fetchTickerLite))
      const scores = {}
      batchData.forEach((data, idx) => {
        if (!data) return
        const ea=v=>Array.isArray(v)?v:[]
        const r = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, ea(data.news), data.rec, ea(data.earnings))
        scores[batch[idx]] = { pct: r.pct, verdict: r.verdict }
      })
      setTickerScores(prev => ({ ...prev, ...scores }))
    }
  }, [])

  useEffect(() => { loadAll() }, [])

  const TABS = [
    { id:'sectors',  label:'Sectors' },
    { id:'calendar', label:'Calendar' },
    { id:'yield',    label:'Yield Curve' },
    { id:'macro',    label:'Macro' },
  ]

  return (
    <PullToRefresh onRefresh={loadAll}>
    <div className="page">

      {/* Market Movers */}
      {movers && (movers.gainers?.length > 0 || movers.losers?.length > 0) && (
        <div className="card" style={{marginBottom:16,padding:'14px 16px'}}>
          <div style={{fontSize:'0.6rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:G1,marginBottom:12}}>📈 Market Movers Today</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <div style={{fontSize:'0.6rem',color:GREEN,letterSpacing:1,marginBottom:8}}>TOP GAINERS</div>
              {movers.gainers.slice(0,5).map((s,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<4?`1px solid ${G4}`:'none'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#fff',cursor:'pointer'}}
                    onClick={() => onNavigate && onNavigate(s.ticker)}>{s.ticker}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:GREEN}}>+{s.changePct?.toFixed(2)}%</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{fontSize:'0.6rem',color:RED,letterSpacing:1,marginBottom:8}}>TOP LOSERS</div>
              {movers.losers.slice(0,5).map((s,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<4?`1px solid ${G4}`:'none'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#fff',cursor:'pointer'}}
                    onClick={() => onNavigate && onNavigate(s.ticker)}>{s.ticker}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:RED}}>{s.changePct?.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Macro sub-tabs */}
      {macroData && (() => {
        // Build macro synthesis sentence
        const yc = macroData.yieldCurve
        const ed = macroData.econData
        const gdp = ed?.gdp?.value
        const cpi = ed?.cpi?.value
        const unemp = ed?.unemploy?.value
        const inverted = yc?.inverted

        let environment = ''
        let implication = ''

        if (inverted && cpi != null && cpi > 4) {
          environment = 'Yield curve inverted with elevated inflation'
          implication = 'Historically the most challenging environment — recession risk elevated. Favor cash, short-term bonds, and defensive sectors (healthcare, utilities, consumer staples). Avoid high-multiple growth stocks.'
        } else if (inverted && gdp != null && gdp < 1) {
          environment = 'Yield curve inverted with slowing growth'
          implication = 'Recession signal active. Quality matters more than growth. Rotate toward companies with strong FCF and low debt. Consider defensive positioning.'
        } else if (inverted) {
          environment = 'Yield curve inverted'
          implication = 'Inverted curve has preceded recessions historically. Not guaranteed, but worth reducing risk exposure on speculative positions.'
        } else if (cpi != null && cpi > 4 && gdp != null && gdp > 2) {
          environment = 'High inflation with strong growth (stagflation risk)'
          implication = 'Fed likely to hold rates high. Bad for bonds and rate-sensitive stocks (REITs, utilities). Energy and commodities tend to outperform. Value over growth.'
        } else if (cpi != null && cpi <= 3 && gdp != null && gdp >= 2) {
          environment = 'Healthy macro — low inflation, solid growth'
          implication = 'Goldilocks environment historically favorable for equities broadly. Growth stocks and cyclicals tend to lead. Good backdrop for BUY signals across sectors.'
        } else if (gdp != null && gdp < 1) {
          environment = 'Slowing growth'
          implication = 'Economic momentum is fading. Quality and defensiveness matter. Focus on companies with durable earnings and pricing power.'
        } else {
          environment = 'Mixed macro signals'
          implication = 'No clear macro tailwind or headwind. Stock selection matters more than broad sector calls. Focus on individual company fundamentals.'
        }

        return (
          <div style={{ marginBottom:12 }}>
            {(environment || implication) && (
              <div style={{ background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:CYAN, marginBottom:8 }}>🌐 Macro Environment</div>
                <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#fff', marginBottom:6 }}>{environment}</div>
                <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.75 }}>{implication}</div>
              </div>
            )}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2, scrollbarWidth:'none', marginBottom:12 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setMacroTab(t.id)} style={{
                  padding:'6px 14px', borderRadius:20, border:`1px solid ${macroTab===t.id ? CYAN : G4}`,
                  background: macroTab===t.id ? `${CYAN}15` : 'transparent',
                  color: macroTab===t.id ? CYAN : G1, fontFamily:'var(--font-mono)',
                  fontSize:'0.62rem', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                }}>{t.label}</button>
              ))}
            </div>
            {macroTab === 'sectors'  && <SectorHeatmap sectorData={macroData.sectorData} onNavigate={onNavigate} />}
            {macroTab === 'calendar' && <EconomicCalendar events={macroData.events} notify={notify} permission={notifPerm} />}
            {macroTab === 'yield'    && <YieldCurveCard yieldCurve={macroData.yieldCurve} />}
            {macroTab === 'macro'    && <MacroIndicators econData={macroData.econData} />}
          </div>
        )
      })()}

      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:6 }}>🌍 Global Causal Chain Engine</div>
        <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.8 }}>
          Live news per region. Tap any ticker to analyze in Dive.
        </div>
      </div>

      {GLOBAL_CHAINS.map((chain, i) => (
        <RegionCard
          key={i}
          chain={chain}
          price={prices[chain.proxy]}
          loadingPrices={loadingPrices}
          onNavigate={onNavigate}
          tickerScores={tickerScores}
        />
      ))}
    </div>
    </PullToRefresh>
  )
}
