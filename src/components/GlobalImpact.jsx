import React, { useEffect, useState, useCallback } from 'react'
import { fetchQuote } from '../hooks/useApi.js'
import { PullToRefresh } from './shared.jsx'
import { GLOBAL_CHAINS, TICKER_NAMES } from '../utils/constants.js'

export default function GlobalImpact({ onNavigate }) {
  const [prices, setPrices] = useState({})

  const loadPrices = useCallback(async () => {
    const proxies = [...new Set(GLOBAL_CHAINS.map(c => c.proxy))]
    const results = await Promise.all(proxies.map(async p => {
      const q = await fetchQuote(p)
      return [p, q]
    }))
    const map = {}
    results.forEach(([p, q]) => { if (q) map[p] = q })
    setPrices(map)
  }, [])

  useEffect(() => { loadPrices() }, [])

  return (
    <PullToRefresh onRefresh={loadPrices}>
    <div className="page">
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B2B2B2', marginBottom: 8 }}>🌍 Global Causal Chain Engine</div>
        <div style={{ fontSize: '0.84rem', color: '#B2B2B2', lineHeight: 1.8 }}>
          When something happens anywhere in the world, this shows exactly which US tickers it affects and why.
          <br /><br />
          <b style={{ color: '#fff' }}>What is a Proxy?</b> The proxy ETF is your live barometer for that event. If China PMI data disappoints, check FXI — if it is falling, markets are confirming the negative reaction in real time.
        </div>
      </div>

      {GLOBAL_CHAINS.map((chain, i) => {
        const pq = prices[chain.proxy]
        const priceStr = pq ? `$${pq.c.toFixed(2)}  ${pq.dp >= 0 ? '+' : ''}${pq.dp?.toFixed(2)}%` : '…'
        const priceColor = pq ? (pq.dp >= 0 ? '#00C805' : '#FF5000') : '#B2B2B2'
        return (
          <div className="chain-card fade-up" key={i} style={{ borderTop: `2px solid ${chain.color}30` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div className="chain-region">{chain.region}</div>
                <div className="chain-event">{chain.event}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="chain-proxy">Proxy: <span style={{ fontFamily: 'var(--font-mono)', color: '#00E5FF' }}>{chain.proxy}</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: priceColor, marginTop: 3 }}>{priceStr}</div>
              </div>
            </div>
            <div className="chain-why">{chain.why}</div>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#B2B2B2', marginBottom: 6 }}>Affected tickers</div>
            <div className="ticker-chips">
              {chain.affects.map(t => (
                <button key={t} className="ticker-chip" title={`${TICKER_NAMES[t] || t} — tap to analyze in Dive`} onClick={()=>onNavigate&&onNavigate(t)} style={{cursor:"pointer",background:"transparent",border:"none",padding:0,color:"inherit",font:"inherit",WebkitTapHighlightColor:"transparent"}}>{t} ↗</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
    </PullToRefresh>
  )
}
