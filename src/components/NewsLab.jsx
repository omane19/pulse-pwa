import React, { useState } from 'react'
import { fetchNews, fetchInsider, hasKeys } from '../hooks/useApi.js'
import { credibilitySentiment, getTier } from '../utils/scoring.js'
import { SOURCE_TIERS } from '../utils/constants.js'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const CYAN='#00E5FF'
const G1='#B2B2B2'; const G2='#111'; const G4='#252525'

function timeAgo(ts) {
  if (!ts) return ''
  const s = (Date.now()/1000) - ts
  if (s < 3600) return `${Math.round(s/60)}m ago`
  if (s < 86400) return `${Math.round(s/3600)}h ago`
  return `${Math.round(s/86400)}d ago`
}

function ManipFlag({ flag }) {
  return (
    <div style={{ background:'rgba(255,80,0,0.06)', border:'1px solid rgba(255,80,0,0.25)', borderRadius:12, padding:'12px 16px', marginBottom:10 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:RED, letterSpacing:1, marginBottom:6 }}>{flag.title}</div>
      <div style={{ fontSize:'0.78rem', color:G1, lineHeight:1.75 }}>{flag.body}</div>
    </div>
  )
}

function NewsItem({ article, scored }) {
  const tier = scored?.tier || getTier(article.source)
  const sent = scored?.score || 0
  const tierInfo = SOURCE_TIERS[tier]
  const sentColor = sent > 0.08 ? GREEN : sent < -0.08 ? RED : G1
  const isOld = article.ts && ((Date.now()/1000 - article.ts) > 259200)

  return (
    <a href={article.link || '#'} target="_blank" rel="noopener noreferrer"
      style={{ display:'block', textDecoration:'none', padding:'12px 0', borderBottom:`1px solid ${G4}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:5 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:tierInfo?.color||G1, letterSpacing:'0.5px', flexShrink:0 }}>
          T{tier} · {article.source}
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:sentColor }}>
            {sent > 0.08 ? '▲' : sent < -0.08 ? '▼' : '—'} {sent !== 0 ? `${sent > 0 ? '+' : ''}${(sent*100).toFixed(0)}` : 'neutral'}
          </span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1 }}>{timeAgo(article.ts)}</span>
        </div>
      </div>
      <div style={{ fontSize:'0.82rem', color: isOld ? G1 : '#fff', fontWeight:500, lineHeight:1.55 }}>{article.title}</div>
      {article.body && (
        <div style={{ fontSize:'0.74rem', color:G1, lineHeight:1.7, marginTop:5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {article.body}
        </div>
      )}
    </a>
  )
}

export default function NewsLab() {
  const [ticker, setTicker] = useState('')
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState(null)
  const [news, setNews]      = useState(null)
  const [scored, setScored]  = useState([])
  const [avgSent, setAvgSent] = useState(0)
  const [flags, setFlags]    = useState([])
  const [insider, setInsider] = useState([])

  async function run(tk) {
    if (!tk) return
    if (!hasKeys().fh) { setError('Add your Finnhub key in Setup tab.'); return }
    setLoading(true); setError(null); setNews(null)
    try {
      const [nl, ins] = await Promise.all([
        fetchNews(tk, 14),
        fetchInsider(tk)
      ])
      const [avg, sc] = credibilitySentiment(nl)
      setNews(nl)
      setScored(sc)
      setAvgSent(avg)
      setInsider(ins)

      // Manipulation flags
      const f = []
      const t4 = sc.filter(s => s.tier === 4).length
      if (t4 >= 4) f.push({ title:'⚠ Unverified Source Concentration', body:`${t4}/${sc.length} articles from unverified sources — pattern seen in pump campaigns. Verify with Reuters, WSJ, or SEC EDGAR.` })
      const insSells = ins.filter(x => (x.change||0) < 0).length
      const insBuys  = ins.filter(x => (x.change||0) > 0).length
      if (avg > 0.2 && insSells > insBuys + 2) f.push({ title:'⚠ Bullish News / Insider Selling Divergence', body:'Positive coverage while insiders are net selling. Classic distribution pattern — investigate further.' })
      const latestPrice = nl.length ? null : null // price not fetched here
      setFlags(f)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const t = input.trim().toUpperCase()
    if (t) { setTicker(t); run(t) }
  }

  // Tier breakdown
  const tierCounts = { 1:0, 2:0, 3:0, 4:0 }
  scored.forEach(s => { tierCounts[s.tier] = (tierCounts[s.tier]||0) + 1 })

  // Group by recency
  const now = Date.now() / 1000
  const breaking = news?.filter(a => (now - a.ts) < 3600) || []
  const today    = news?.filter(a => (now - a.ts) >= 3600   && (now - a.ts) < 86400) || []
  const recent   = news?.filter(a => (now - a.ts) >= 86400  && (now - a.ts) < 259200) || []
  const older    = news?.filter(a => (now - a.ts) >= 259200) || []

  const sentColor = avgSent > 0.08 ? GREEN : avgSent < -0.08 ? RED : YELLOW
  const sentLabel = avgSent > 0.08 ? 'Bullish' : avgSent < -0.08 ? 'Bearish' : 'Neutral'

  return (
    <div className="page">
      {/* Search */}
      <form onSubmit={handleSubmit} style={{ display:'flex', gap:8, marginBottom:16 }}>
        <input
          className="input ticker-input"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="AAPL · TSLA · NVDA …"
          autoCapitalize="characters"
          spellCheck={false}
          style={{ flex:1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}
          style={{ flexShrink:0, minWidth:80 }}>
          {loading ? '…' : 'Analyze'}
        </button>
      </form>

      {error && (
        <div style={{ background:'rgba(255,80,0,0.08)', border:'1px solid rgba(255,80,0,0.25)', borderRadius:10, padding:'12px 14px', marginBottom:14, fontSize:'0.8rem', color:RED }}>
          {error}
        </div>
      )}

      {!news && !loading && !error && (
        <div style={{ textAlign:'center', color:G1, padding:'40px 16px', fontSize:'0.82rem', background:G2, border:`1px solid ${G4}`, borderRadius:14 }}>
          Enter a ticker above to analyze news credibility and sentiment.
        </div>
      )}

      {news && (
        <>
          {/* Sentiment hero */}
          <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:14, padding:'16px 18px', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, color:sentColor, lineHeight:1 }}>
                {avgSent > 0 ? '+' : ''}{(avgSent * 100).toFixed(0)}
              </div>
              <div>
                <div style={{ fontWeight:700, color:sentColor, fontSize:'0.9rem' }}>{sentLabel}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:G1, marginTop:2 }}>
                  Credibility-weighted · {news.length} articles
                </div>
              </div>
            </div>
            <div style={{ fontSize:'0.74rem', color:G1, lineHeight:1.7 }}>
              T1 (SEC filings) = 100% weight · T2 (Reuters/Bloomberg) = 85% · T3 (financial media) = 60% · T4 (unverified/blogs) = 30%
            </div>
          </div>

          {/* Tier breakdown */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:12 }}>
            {[1,2,3,4].map(t => {
              const info = SOURCE_TIERS[t]
              const pct = news.length ? Math.round(tierCounts[t] / news.length * 100) : 0
              return (
                <div key={t} style={{ background:G2, border:`1px solid ${G4}`, borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:info.color, fontWeight:700 }}>T{t}</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:'1.1rem', fontWeight:800, marginTop:3 }}>{tierCounts[t]}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:G1, marginTop:2 }}>{pct}%</div>
                </div>
              )
            })}
          </div>

          {/* Manipulation flags */}
          {flags.length > 0 ? (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:RED, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>
                ⚠ Potential Red Flags
              </div>
              {flags.map((f, i) => <ManipFlag key={i} flag={f} />)}
            </div>
          ) : (
            <div style={{ background:'rgba(0,200,5,0.06)', border:'1px solid rgba(0,200,5,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:12, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:GREEN }}>
              ✓ No manipulation patterns detected
            </div>
          )}

          {/* Insider summary */}
          {insider.length > 0 && (
            <div style={{ background:G2, border:`1px solid ${G4}`, borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:CYAN, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
                Insider Activity (90 days)
              </div>
              {insider.slice(0,5).map((x,i) => {
                const isBuy = (x.change||0) > 0
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:i<Math.min(insider.length,5)-1?`1px solid ${G4}`:'none' }}>
                    <div>
                      <span style={{ fontSize:'0.8rem', fontWeight:600 }}>{x.name || 'N/A'}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:G1, marginLeft:8 }}>{x.transactionType || x.type || ''}</span>
                    </div>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:isBuy?GREEN:RED, fontWeight:700 }}>
                      {isBuy?'+':''}{(x.change||0).toLocaleString()} sh
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* News grouped by time */}
          {[
            [breaking, '🔴 Breaking — Last Hour'],
            [today,    '🟡 Today'],
            [recent,   '⚪ Last 3 Days'],
            [older,    '🗂 Older'],
          ].map(([items, label]) => {
            if (!items.length) return null
            const indices = items.map(a => news.indexOf(a))
            return (
              <div key={label} style={{ marginBottom:14 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:G1, letterSpacing:2, textTransform:'uppercase', marginBottom:4, paddingBottom:6, borderBottom:`1px solid ${G4}` }}>
                  {label} · {items.length}
                </div>
                <div>
                  {items.map((a, i) => <NewsItem key={i} article={a} scored={scored[indices[i]]} />)}
                </div>
              </div>
            )
          })}

          {news.length === 0 && (
            <div style={{ textAlign:'center', color:G1, padding:'24px', fontSize:'0.82rem', background:G2, border:`1px solid ${G4}`, borderRadius:12 }}>
              No news found in past 14 days for {ticker}.
            </div>
          )}
        </>
      )}
      <div style={{ height:16 }} />
    </div>
  )
}
