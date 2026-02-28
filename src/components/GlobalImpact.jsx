import React, { useEffect, useState, useCallback } from 'react'
import { fetchQuote, fetchRegionNews, fetchTickerLite, fetchMarketMovers } from '../hooks/useApi.js'
import { scoreAsset } from '../utils/scoring.js'
import { PullToRefresh } from './shared.jsx'
import { GLOBAL_CHAINS, TICKER_NAMES } from '../utils/constants.js'

const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function MiniScore({ pct, verdict }) {
  if (pct == null) return <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#555' }}>…</span>
  const color = verdict === 'BUY' ? '#00C805' : verdict === 'HOLD' ? '#FFD700' : '#FF5000'
  return <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color, background:`${color}15`, padding:'1px 5px', borderRadius:4, marginLeft:4 }}>{Math.round(pct)}</span>
}

function RegionCard({ chain, price, loadingPrices, onNavigate, tickerScores }) {
  const [news, setNews]         = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsLoaded, setNewsLoaded]   = useState(false)
  const [showWhy, setShowWhy]   = useState(false)

  const pq = price
  const priceStr   = pq ? `$${pq.c.toFixed(2)}  ${pq.dp >= 0 ? '+' : ''}${pq.dp?.toFixed(2)}%` : loadingPrices ? '…' : '—'
  const priceColor = pq ? (pq.dp >= 0 ? '#00C805' : '#FF5000') : G1

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
      {/* Header — region + proxy price */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div className="chain-region">{chain.region}</div>
          <div className="chain-event">{chain.event}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div className="chain-proxy">Proxy: <span style={{ fontFamily:'var(--font-mono)', color:'#00E5FF' }}>{chain.proxy}</span></div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:priceColor, marginTop:3 }}>{priceStr}</div>
        </div>
      </div>

      {/* Live news — shown by default */}
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

      {/* Affected tickers */}
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

      {/* Why — collapsible, hidden by default */}
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
  const [movers, setMovers]               = useState(null)

  const loadPrices = useCallback(async () => {
    setLoadingPrices(true)
    const proxies = [...new Set(GLOBAL_CHAINS.map(c => c.proxy))]
    const results = await Promise.all(proxies.map(async p => [p, await fetchQuote(p)]))
    const map = {}
    results.forEach(([p, q]) => { if (q) map[p] = q })
    setPrices(map)
    setLoadingPrices(false)

    // Fetch mini scores for all affected tickers in background
    const allTickers = [...new Set(GLOBAL_CHAINS.flatMap(c => c.affects))]
    const BATCH = 4
    for (let i = 0; i < allTickers.length; i += BATCH) {
      const batch = allTickers.slice(i, i + BATCH)
      const batchData = await Promise.all(batch.map(fetchTickerLite))
      const scores = {}
      batchData.forEach((data, idx) => {
        if (!data) return
        const r = scoreAsset(data.quote, data.candles, data.candles?.ma50, data.metrics, data.news, data.rec, data.earnings)
        scores[batch[idx]] = { pct: r.pct, verdict: r.verdict }
      })
      setTickerScores(prev => ({ ...prev, ...scores }))
    }
  }, [])

  useEffect(() => {
    loadPrices()
    fetchMarketMovers().then(m => { if (m) setMovers(m) })
  }, [])

  return (
    <PullToRefresh onRefresh={loadPrices}>
    <div className="page">
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:6 }}>🌍 Global Causal Chain Engine</div>
        <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.8 }}>
          Live news per region. Tap any ticker to analyze in Dive. Tap <b style={{color:'#fff'}}>"Why this matters"</b> for context.
        </div>
      </div>

      {/* Market Movers */}
      {movers && (movers.gainers?.length > 0 || movers.losers?.length > 0) && (
        <div className="card" style={{marginBottom:16,padding:'14px 16px'}}>
          <div style={{fontSize:'0.6rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:G1,marginBottom:12}}>📈 Market Movers Today</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <div style={{fontSize:'0.6rem',color:'#00C805',letterSpacing:1,marginBottom:8}}>TOP GAINERS</div>
              {movers.gainers.slice(0,5).map((s,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<4?'1px solid #1a1a1a':'none'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#fff',cursor:'pointer'}}
                    onClick={() => onNavigate && onNavigate(s.ticker)}>{s.ticker}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#00C805'}}>
                    +{s.changePct?.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{fontSize:'0.6rem',color:'#FF5000',letterSpacing:1,marginBottom:8}}>TOP LOSERS</div>
              {movers.losers.slice(0,5).map((s,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<4?'1px solid #1a1a1a':'none'}}>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#fff',cursor:'pointer'}}
                    onClick={() => onNavigate && onNavigate(s.ticker)}>{s.ticker}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:'0.7rem',color:'#FF5000'}}>
                    {s.changePct?.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
