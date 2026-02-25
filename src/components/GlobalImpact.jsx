import React, { useEffect, useState, useCallback } from 'react'
import { fetchQuote, fetchRegionNews } from '../hooks/useApi.js'
import { PullToRefresh } from './shared.jsx'
import { GLOBAL_CHAINS, TICKER_NAMES } from '../utils/constants.js'

const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function RegionNews({ proxy, color }) {
  const [news, setNews]       = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [open, setOpen]       = useState(false)

  const load = async () => {
    if (loaded) { setOpen(o => !o); return }
    setOpen(true); setLoading(true)
    const items = await fetchRegionNews(proxy)
    setNews(items); setLoaded(true); setLoading(false)
  }

  return (
    <div style={{ marginTop:10 }}>
      <button onClick={load} style={{
        background:'transparent', border:`1px solid ${color}30`,
        borderRadius:6, padding:'5px 10px', color:G1, fontFamily:'var(--font-mono)',
        fontSize:'0.58rem', cursor:'pointer', letterSpacing:0.5, display:'flex', alignItems:'center', gap:6
      }}>
        <span style={{ color }}>{open ? '▲' : '▼'}</span>
        {open ? 'Hide' : 'Live News'} · {proxy}
      </button>
      {open && (
        <div style={{ marginTop:8 }}>
          {loading ? (
            <div style={{ fontSize:'0.68rem', color:G1, padding:'8px 0' }}>Loading news…</div>
          ) : news.length === 0 ? (
            <div style={{ fontSize:'0.68rem', color:G1, padding:'8px 0' }}>No recent news found</div>
          ) : news.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{
              display:'block', padding:'8px 0',
              borderBottom: i < news.length - 1 ? `1px solid ${G4}` : 'none',
              textDecoration:'none'
            }}>
              <div style={{ fontSize:'0.74rem', color:'#fff', lineHeight:1.4, marginBottom:3 }}>{n.title}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1 }}>
                {n.source} · {n.ts ? new Date(n.ts * 1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}
                <span style={{ color, marginLeft:6 }}>↗</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GlobalImpact({ onNavigate }) {
  const [prices, setPrices] = useState({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  const loadPrices = useCallback(async () => {
    setLoadingPrices(true)
    const proxies = [...new Set(GLOBAL_CHAINS.map(c => c.proxy))]
    const results = await Promise.all(proxies.map(async p => [p, await fetchQuote(p)]))
    const map = {}
    results.forEach(([p, q]) => { if (q) map[p] = q })
    setPrices(map)
    setLoadingPrices(false)
  }, [])

  useEffect(() => { loadPrices() }, [])

  return (
    <PullToRefresh onRefresh={loadPrices}>
    <div className="page">
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:G1, marginBottom:8 }}>🌍 Global Causal Chain Engine</div>
        <div style={{ fontSize:'0.82rem', color:G1, lineHeight:1.8 }}>
          When something happens anywhere in the world, this shows exactly which US tickers it affects and why.
          Each region shows live proxy prices and the latest news — tap <b style={{color:'#fff'}}>Live News</b> under any region.
        </div>
      </div>

      {GLOBAL_CHAINS.map((chain, i) => {
        const pq = prices[chain.proxy]
        const priceStr   = pq ? `$${pq.c.toFixed(2)}  ${pq.dp >= 0 ? '+' : ''}${pq.dp?.toFixed(2)}%` : loadingPrices ? '…' : 'N/A'
        const priceColor = pq ? (pq.dp >= 0 ? '#00C805' : '#FF5000') : G1
        return (
          <div className="chain-card fade-up" key={i} style={{ borderTop:`2px solid ${chain.color}30` }}>
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

            <div className="chain-why">{chain.why}</div>

            <div style={{ fontSize:'0.6rem', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:G1, marginBottom:6 }}>Affected tickers</div>
            <div className="ticker-chips">
              {chain.affects.map(t => (
                <button key={t} className="ticker-chip"
                  title={`${TICKER_NAMES[t] || t} — tap to analyze`}
                  onClick={() => onNavigate && onNavigate(t)}
                  style={{ cursor:'pointer', background:'transparent', border:'none', padding:0, color:'inherit', font:'inherit', WebkitTapHighlightColor:'transparent' }}>
                  {t} ↗
                </button>
              ))}
            </div>

            {/* Live news per region */}
            <RegionNews proxy={chain.proxy} color={chain.color} />
          </div>
        )
      })}
    </div>
    </PullToRefresh>
  )
}
