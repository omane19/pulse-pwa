import React, { useState, useEffect, useCallback } from 'react'
import { fetchFMPRecentCongress, fetchFMPRecentInsider, fetchFMPCongressional, fetchFMPInsider, hasKeys } from '../hooks/useApi.js'

const fmt = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}`
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric'}) } catch { return s } }

function PartyBadge({ party }) {
  const color = party === 'D' || party === 'Democrat' ? '#4e9af1' : party === 'R' || party === 'Republican' ? '#f14e4e' : '#aaa'
  const label = party === 'D' || party === 'Democrat' ? 'D' : party === 'R' || party === 'Republican' ? 'R' : '?'
  return <span style={{ padding:'1px 6px', borderRadius:4, background:`${color}22`, border:`1px solid ${color}66`, color, fontSize:'0.6rem', fontFamily:'var(--font-mono)' }}>{label}</span>
}

function TradeRow({ t, type }) {
  const isBuy = t.isBuy
  const accent = isBuy ? '#00ff88' : '#ff4e4e'
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ minWidth:42, textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.72rem', color:'var(--fg)', letterSpacing:0.5 }}>{t.ticker}</div>
        <div style={{ fontSize:'0.6rem', color: accent, marginTop:2 }}>{isBuy ? '▲ BUY' : '▼ SELL'}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.72rem', color:'var(--fg)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {t.name}
          {t.party && <> <PartyBadge party={t.party} /></>}
          {t.title && <span style={{ fontSize:'0.6rem', color:'#888', marginLeft:6 }}>{t.title}</span>}
        </div>
        <div style={{ fontSize:'0.62rem', color:'#888', marginTop:2 }}>
          {fmtDate(t.date)}
          {t.amount && <span style={{ marginLeft:8, color:'#aaa' }}>{t.amount}</span>}
          {t.value > 0 && <span style={{ marginLeft:8, color:'#aaa' }}>{fmt(t.value)}</span>}
          {t.shares > 0 && <span style={{ marginLeft:8 }}>{t.shares.toLocaleString()} shs @ {t.price ? `$${t.price}` : '—'}</span>}
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, items, type, loading, empty }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:'1rem' }}>{icon}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--fg)', letterSpacing:1, fontWeight:700 }}>{title}</span>
        {!loading && items.length > 0 && (
          <span style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#888' }}>{items.length} trades</span>
        )}
      </div>
      {loading ? (
        <div style={{ padding:'20px 0', textAlign:'center', color:'#888', fontFamily:'var(--font-mono)', fontSize:'0.65rem' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding:'16px 0', textAlign:'center', color:'#666', fontFamily:'var(--font-mono)', fontSize:'0.65rem' }}>{empty}</div>
      ) : (
        items.map((t, i) => <TradeRow key={i} t={t} type={type} />)
      )}
    </div>
  )
}

function TickerSearch({ onSearch }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8, marginBottom:20 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && val.trim() && onSearch(val.trim())}
        placeholder="Search by ticker (e.g. NVDA)"
        style={{ flex:1, padding:'9px 12px', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'var(--fg)', fontFamily:'var(--font-mono)', fontSize:'0.72rem' }}
      />
      <button
        onClick={() => val.trim() && onSearch(val.trim())}
        style={{ padding:'9px 16px', borderRadius:8, background:'rgba(0,255,136,0.1)', border:'1px solid rgba(0,255,136,0.3)', color:'#00ff88', fontFamily:'var(--font-mono)', fontSize:'0.72rem', cursor:'pointer', whiteSpace:'nowrap' }}
      >Search</button>
    </div>
  )
}

export default function SmartMoney() {
  const [tab, setTab] = useState('feed')  // 'feed' | 'search'
  const [congressFeed, setCongressFeed] = useState([])
  const [insiderFeed,  setInsiderFeed]  = useState([])
  const [loadingFeed,  setLoadingFeed]  = useState(false)

  const [searchTicker,     setSearchTicker]     = useState('')
  const [congressSearch,   setCongressSearch]   = useState([])
  const [insiderSearch,    setInsiderSearch]    = useState([])
  const [loadingSearch,    setLoadingSearch]    = useState(false)
  const [searchError,      setSearchError]      = useState(null)

  const hasFmp = hasKeys().fmp

  const loadFeed = useCallback(async () => {
    if (!hasFmp) return
    setLoadingFeed(true)
    const [cong, ins] = await Promise.all([fetchFMPRecentCongress(), fetchFMPRecentInsider()])
    setCongressFeed(cong)
    setInsiderFeed(ins)
    setLoadingFeed(false)
  }, [hasFmp])

  useEffect(() => { if (tab === 'feed') loadFeed() }, [tab, loadFeed])

  const searchTicker_fn = useCallback(async (ticker) => {
    if (!hasFmp) return
    setSearchTicker(ticker)
    setLoadingSearch(true)
    setSearchError(null)
    const [cong, ins] = await Promise.all([fetchFMPCongressional(ticker), fetchFMPInsider(ticker)])
    if (!cong.length && !ins.length) setSearchError(`No smart money activity found for ${ticker}`)
    setCongressSearch(cong)
    setInsiderSearch(ins)
    setLoadingSearch(false)
  }, [hasFmp])


  if (!hasFmp) {
    return (
      <div style={{ padding:'32px 20px', textAlign:'center' }}>
        <div style={{ fontSize:'2rem', marginBottom:16 }}>🔑</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--fg)', marginBottom:8 }}>FMP API Key Required</div>
        <div style={{ fontSize:'0.72rem', color:'#888', lineHeight:1.6, maxWidth:280, margin:'0 auto 16px' }}>
          Smart Money tracking requires a Financial Modeling Prep key.<br/>
          Add <code style={{ color:'#00ff88' }}>VITE_FMP_KEY</code> in the Setup tab.
        </div>
        <div style={{ fontSize:'0.65rem', color:'#666', fontFamily:'var(--font-mono)' }}>
          FMP Starter ~$25/month → congressional + CEO trades
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding:'0 16px 24px' }}>

        {/* Tab switcher */}
        <div style={{ display:'flex', gap:8, marginBottom:20, marginTop:4 }}>
          {[['feed','📡 Live Feed'],['search','🔍 By Ticker']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex:1, padding:'8px 0', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.68rem',
              background: tab===id ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)',
              border: tab===id ? '1px solid rgba(0,255,136,0.35)' : '1px solid rgba(255,255,255,0.08)',
              color: tab===id ? '#00ff88' : '#888', cursor:'pointer', letterSpacing:0.5
            }}>{label}</button>
          ))}
        </div>

        {tab === 'feed' && (
          <>
            <Section title="CONGRESSIONAL BUYS" icon="🏛️" items={congressFeed} type="congress" loading={loadingFeed} empty="No recent congressional purchases found" />
            <Section title="CEO / EXECUTIVE BUYS" icon="💼" items={insiderFeed} type="insider" loading={loadingFeed} empty="No recent executive purchases found" />
          </>
        )}

        {tab === 'search' && (
          <>
            <TickerSearch onSearch={searchTicker_fn} />
            {searchError && (
              <div style={{ padding:'16px', borderRadius:8, background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.2)', color:'#ff8c4e', fontFamily:'var(--font-mono)', fontSize:'0.68rem', marginBottom:16 }}>
                {searchError}
              </div>
            )}
            {searchTicker && !searchError && (
              <>
                <Section title={`CONGRESS — ${searchTicker}`} icon="🏛️" items={congressSearch} type="congress" loading={loadingSearch} empty="No congressional trades found" />
                <Section title={`INSIDERS — ${searchTicker}`} icon="💼" items={insiderSearch} type="insider" loading={loadingSearch} empty="No insider trades found" />
              </>
            )}
            {!searchTicker && (
              <div style={{ padding:'40px 0', textAlign:'center', color:'#555', fontFamily:'var(--font-mono)', fontSize:'0.68rem' }}>
                Enter a ticker to see congressional + executive trading activity
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
