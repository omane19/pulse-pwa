import React, { useState, useEffect } from 'react'
import { useTickerData } from '../hooks/useApi.js'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { scoreAsset, fmtMcap } from '../utils/scoring.js'
import { TICKER_NAMES } from '../utils/constants.js'
import Chart from './Chart.jsx'
import { VerdictPill, FactorBars, MetricCell, NewsCard, EarningsWarning, LoadingBar, SectionHeader, Toast } from './shared.jsx'

const GREEN='#00C805'; const RED='#FF5000'; const YELLOW='#FFD700'; const CYAN='#00E5FF'

/* ── Manipulation flags ───────────────────────────────────────── */
function getFlags(news, scoredNews, insider, quote) {
  const flags = []
  if (!news?.length) return flags
  const t4 = (scoredNews||[]).filter(s=>s.tier===4).length
  if (t4 >= 4) flags.push({ title:'⚠ Unverified Source Concentration',
    body:`${t4}/${scoredNews.length} articles from unverified sources — pattern seen in pump campaigns. Verify with Reuters or WSJ.` })
  const avgRaw = (scoredNews||[]).reduce((s,n)=>s+n.score,0)/Math.max(scoredNews?.length||1,1)
  const insSells = (insider||[]).filter(x=>(x.change||0)<0).length
  const insBuys  = (insider||[]).filter(x=>(x.change||0)>0).length
  if (avgRaw > 0.2 && insSells > insBuys+2)
    flags.push({ title:'⚠ Bullish News / Insider Selling Divergence',
      body:'Positive news coverage while insiders net selling — classic distribution pattern. Investigate.' })
  if (quote?.c && quote.c < 20 && avgRaw > 0.3)
    flags.push({ title:'⚠ High Sentiment on Low-Price Stock',
      body:`Strong positive coverage on sub-$20 stock — matches pump-and-dump profile. Extra caution.` })
  return flags
}

/* ── Analysis Brief ───────────────────────────────────────────── */
function AnalysisBrief({ ticker, company, sector, price, result, ma50, metrics, news, rec, earn, insider }) {
  const S=result.scores; const mom=result.mom; const pe=result.pe
  const nb=(insider||[]).filter(x=>(x.change||0)>0).length
  const ns=(insider||[]).filter(x=>(x.change||0)<0).length
  const insSig = nb>ns?'bullish — executives buying with own money':ns>nb?'bearish — insiders net sellers':'neutral'
  let earnTxt=''; let recTxt=''
  if (earn?.length) {
    const surp=earn.filter(q=>q.estimate).map(q=>((q.actual||0)-(q.estimate||0))/Math.abs(q.estimate||1)*100)
    if (surp.length) { const avg=surp.reduce((a,b)=>a+b,0)/surp.length; earnTxt=`Beat estimates ${surp.filter(x=>x>0).length}/${surp.length} quarters · avg surprise ${avg>0?'+':''}${avg.toFixed(1)}%` }
  }
  if (rec && Object.keys(rec).length) {
    const sb=rec.strongBuy||0,b=rec.buy||0,h=rec.hold||0,s=rec.sell||0,ss=rec.strongSell||0,tot=sb+b+h+s+ss
    if (tot>0) recTxt=`${Math.round((sb+b*.5)/tot*100)}% analysts bullish (${sb} Strong Buy · ${b} Buy · ${h} Hold)`
  }
  const rsi=mom?.rsi; const trendAbove=S.trend>0
  const maNote=ma50&&price?`${trendAbove?'above':'below'} 50-day MA ($${ma50}) by ${Math.abs((price-ma50)/ma50*100).toFixed(1)}%`:'50-day MA unavailable'
  const rsiNote=rsi>70?`RSI ${rsi} — overbought, pullback risk`:rsi<30?`RSI ${rsi} — oversold, bounce potential`:`RSI ${rsi} — neutral`
  const sections = [
    ['WHAT THIS COMPANY DOES', `${company} operates in the ${sector||'N/A'} sector. Ticker: ${ticker}.`],
    ['WHAT IS DRIVING THE PRICE', `Price is ${maNote}. ${rsiNote}. 1-month: ${mom?.['1m']??'N/A'}% · 3-month: ${mom?.['3m']??'N/A'}%.`],
    ['STRENGTHS', [
      `Momentum: ${mom?.['1m']??'N/A'}% (1M) · ${mom?.['3m']??'N/A'}% (3M)`,
      recTxt||null, earnTxt||null,
      `News sentiment: ${result.avgSent>0?'+':''}${result.avgSent} (${result.avgSent>.08?'positive':result.avgSent<-.08?'negative':'neutral'}) from ${news?.length||0} articles`,
    ].filter(Boolean)],
    ['RISKS', [
      pe&&pe>30?`P/E ${pe.toFixed(1)}× — elevated, vulnerable to earnings misses`:pe?`P/E ${pe.toFixed(1)}× — reasonable`:null,
      !trendAbove?`Price below 50-day MA — trend not confirmed`:null,
      rsi>65?`RSI ${rsi} — momentum extended, pullback possible`:null,
      (result.uncertainty||[]).length?result.uncertainty.join('; '):null,
    ].filter(Boolean)],
    ['ANALYSTS & INSIDERS', `${recTxt||'No analyst rating data available'}. Insider activity (90d): ${insSig}.`],
    [`VERDICT — ${result.verdict} · ${result.pct.toFixed(0)}/100 · CONVICTION ${result.conviction.toFixed(0)}%`,
      `${result.factorsAgree}/6 signal factors agree. ` +
      (result.verdict==='BUY'?`Entry opportunity — ${result.conviction>70?'high':'moderate'} confidence. Respect position sizing.`:
       result.verdict==='HOLD'?`Hold existing positions. Not ideal entry point. Wait for clearer signal.`:
       `Avoid or reduce exposure. Signal does not support buying here.`)],
    ['THREE THINGS TO WATCH', [
      `Next earnings — does ${ticker} maintain its beat rate?`,
      `Price action vs 50-day MA${ma50?` at $${ma50}`:''}`,
      `News sentiment direction — currently ${result.avgSent>.08?'positive':result.avgSent<-.08?'negative':'neutral'}`,
    ]],
  ]
  return (
    <div className="card" style={{padding:'20px 18px'}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',color:'#B2B2B2',marginBottom:16}}>📊 Analysis Brief</div>
      {sections.map(([head,body])=>(
        <div key={head}>
          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#B2B2B2',margin:'16px 0 6px',paddingBottom:5,borderBottom:'1px solid #1A1A1A'}}>{head}</div>
          {Array.isArray(body)
            ? body.map((item,i)=><div key={i} style={{fontSize:'0.83rem',color:'#B2B2B2',padding:'2px 0 2px 10px',lineHeight:1.8,borderLeft:'2px solid #252525',margin:'2px 0'}}>· {item}</div>)
            : <div style={{fontSize:'0.84rem',lineHeight:1.85,color:head.includes('VERDICT')?'#fff':'#B2B2B2',background:head.includes('VERDICT')?`${result.color}10`:'transparent',borderLeft:head.includes('VERDICT')?`3px solid ${result.color}`:'none',padding:head.includes('VERDICT')?'10px 12px':'0',borderRadius:head.includes('VERDICT')?'0 8px 8px 0':0}}>{body}</div>}
        </div>
      ))}
    </div>
  )
}

/* ── Position Sizing ──────────────────────────────────────────── */
function PositionSizing({ verdict, price, capital=10000, allocPct=45 }) {
  const [cap, setCap] = useState(capital)
  const [risk, setRisk] = useState('Moderate')
  const PROFILES = { Conservative:{pct:20,label:'Conservative (20%)'}, Moderate:{pct:45,label:'Moderate (45%)'}, Aggressive:{pct:65,label:'Aggressive (65%)'} }
  const prof   = PROFILES[risk]
  const alloc  = cap * prof.pct / 100
  const shares = price ? Math.floor(alloc/price) : 0
  const remain = cap - alloc
  const color  = verdict==='BUY'?GREEN:verdict==='HOLD'?YELLOW:RED
  const action = verdict==='BUY'?`Buy ~${shares} shares at $${price?.toFixed(2)}`
    :verdict==='HOLD'?`Up to ${shares} shares — wait for signal improvement`
    :'Avoid — hold cash or short-term T-bills'
  return (
    <div className="card">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div>
          <label className="input-label">Portfolio Size ($)</label>
          <input type="number" className="input" value={cap} min={500} step={500} onChange={e=>setCap(Math.max(500,+e.target.value))} />
        </div>
        <div>
          <label className="input-label">Risk Profile</label>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:6}}>
            {Object.keys(PROFILES).map(k=>(
              <button key={k} className={`filter-chip ${risk===k?'active':''}`} style={{justifyContent:'flex-start'}} onClick={()=>setRisk(k)}>{k}</button>
            ))}
          </div>
        </div>
      </div>
      {[
        ['Allocation', `$${alloc.toLocaleString('en-US',{maximumFractionDigits:0})} (${prof.pct}%)`, '#B2B2B2'],
        ['Action',     action,  color],
        ['Remaining',  `$${remain.toLocaleString('en-US',{maximumFractionDigits:0})} diversified`, '#B2B2B2'],
      ].map(([k,v,c])=>(
        <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid #1A1A1A',fontSize:'0.82rem',gap:10}}>
          <span style={{color:'#B2B2B2',flexShrink:0}}>{k}</span>
          <span style={{fontFamily:'var(--font-mono)',color:c,textAlign:'right'}}>{v}</span>
        </div>
      ))}
      <div style={{fontSize:'0.67rem',color:'#B2B2B2',marginTop:8}}>⚠ Educational only · Not financial advice · Never risk money you can't afford to lose</div>
    </div>
  )
}

/* ── Verdict Card ─────────────────────────────────────────────── */
function VerdictCard({ result }) {
  const {pct,verdict,color,conviction,factorsAgree,reasons,scores,mom,uncertainty}=result
  const e={BUY:'●',HOLD:'◆',AVOID:'✕'}[verdict]
  const allReasons=Object.values(reasons).flat()
  const nowSigs=[]
  if(scores.momentum>.2)  nowSigs.push('momentum building — capital flowing in')
  if(scores.trend>.1)     nowSigs.push('above 50-day MA — buyers in control')
  if(scores.sentiment>.1) nowSigs.push('news sentiment positive')
  if(scores.momentum<-.2) nowSigs.push('momentum weak — not ideal entry')
  if(scores.trend<-.1)    nowSigs.push('below 50-day MA — wait for recovery')
  const nowTxt=nowSigs.length?nowSigs[0].charAt(0).toUpperCase()+nowSigs[0].slice(1)+'.':'Mixed short-term signals.'
  const allTxt=scores.analyst>.3||scores.earnings>.2?'Analyst consensus and earnings history signal business quality.':'Business quality signals mixed — assess long-term thesis independently.'
  return (
    <div style={{background:`${color}08`,border:`1px solid ${color}22`,borderRadius:18,padding:'22px 16px 16px',margin:'12px 0',textAlign:'center'}}>
      <div style={{fontFamily:'var(--font-display)',fontSize:'clamp(3.5rem,15vw,5rem)',fontWeight:800,letterSpacing:-4,color,lineHeight:1}}>{pct.toFixed(0)}</div>
      <div style={{fontSize:'0.82rem',fontWeight:700,letterSpacing:'4px',textTransform:'uppercase',color,marginTop:5}}>{e} {verdict}</div>
      <div style={{background:'#2E2E2E',borderRadius:3,height:3,width:160,margin:'12px auto 7px',overflow:'hidden'}}>
        <div style={{height:3,borderRadius:3,width:`${conviction}%`,background:`linear-gradient(90deg,${color},${color}88)`,transition:'width .8s'}}/>
      </div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'#B2B2B2',marginBottom:12}}>Conviction {conviction.toFixed(0)}% · {factorsAgree}/6 factors agree</div>
      <div style={{maxWidth:360,margin:'0 auto',textAlign:'left',marginBottom:12}}>
        {allReasons.slice(0,8).map((r,i)=><div key={i} style={{fontSize:'0.78rem',color:'#B2B2B2',padding:'4px 0',borderBottom:'1px solid #1A1A1A',lineHeight:1.6}}>· {r}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'#111',border:'1px solid #1A1A1A',borderRadius:10,padding:12,textAlign:'left'}}>
          <div style={{fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color,marginBottom:5}}>⚡ Why Now</div>
          <div style={{fontSize:'0.79rem',color:'#B2B2B2',lineHeight:1.7}}>{nowTxt}</div>
        </div>
        <div style={{background:'#111',border:'1px solid #1A1A1A',borderRadius:10,padding:12,textAlign:'left'}}>
          <div style={{fontSize:'0.58rem',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#B2B2B2',marginBottom:5}}>🏛 Why At All</div>
          <div style={{fontSize:'0.79rem',color:'#B2B2B2',lineHeight:1.7}}>{allTxt}</div>
        </div>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function DeepDive() {
  const [input,  setInput]  = useState('AAPL')
  const [ticker, setTicker] = useState('')
  const {data, loading, error, fetch} = useTickerData()
  const {add, remove, has} = useWatchlist()
  const [result, setResult] = useState(null)
  const [toast,  setToast]  = useState(null)

  useEffect(()=>{ if(data){ const r=scoreAsset(data.quote,data.candles,data.candles?.ma50,data.metrics,data.news,data.rec,data.earnings); setResult(r) }}, [data])

  const handleAnalyze=()=>{ const t=input.trim().toUpperCase(); if(!t)return; setTicker(t); fetch(t) }
  const handleWL=()=>{ if(has(ticker)){remove(ticker);setToast(`Removed ${ticker}`)}else{add(ticker);setToast(`Added ${ticker} to watchlist`)} }

  const q=data?.quote; const price=q?.c; const chg=q?.dp||0
  const mt=data?.metrics||{}; const av=mt._av||{}; const ma50=data?.candles?.ma50
  const color=result?.color||GREEN; const inWL=has(ticker)
  const flags=data&&result?getFlags(data.news,result.scoredNews||[],data.insider||[],data.quote):[]

  return (
    <div className="page">
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input className="input" value={input} onChange={e=>setInput(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==='Enter'&&handleAnalyze()}
          placeholder="AAPL · NVDA · SPY · GLD …"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}/>
        <button className="btn btn-primary" style={{width:'auto',padding:'12px 20px'}} onClick={handleAnalyze}>Analyze</button>
      </div>

      {!data&&!loading&&(
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:14}}>
          {['AAPL','NVDA','TSLA','SPY','GLD','PLTR'].map(t=>(
            <button key={t} className="btn btn-ghost" style={{width:'auto',padding:'5px 12px',fontSize:'0.72rem'}}
              onClick={()=>{setInput(t);fetch(t);setTicker(t)}}>{t}</button>
          ))}
        </div>
      )}

      {loading && <LoadingBar text={`Analyzing ${input}…`}/>}

      {error && (
        <div style={{background:'rgba(255,80,0,0.08)',border:'1px solid rgba(255,80,0,0.3)',borderRadius:10,padding:'12px 16px',fontSize:'0.84rem',color:RED,marginBottom:12}}>
          {error}
          {error.includes('.env')&&(
            <div style={{marginTop:8,fontSize:'0.75rem',color:'#B2B2B2',lineHeight:1.8}}>
              Fix: open the <b style={{color:'#fff'}}>.env</b> file · paste your key:&nbsp;
              <span style={{fontFamily:'var(--font-mono)',color:CYAN}}>VITE_FINNHUB_KEY=d1abc…</span><br/>
              Save it · then restart: <span style={{fontFamily:'var(--font-mono)',color:CYAN}}>npm run dev</span>
            </div>
          )}
        </div>
      )}

      {data&&result&&(
        <>
          <EarningsWarning ec={data.ec}/>
          {q?.source==='alphavantage'&&<div className="datasource-badge ds-av" style={{display:'inline-flex',marginBottom:8}}>⚡ Quote via Alpha Vantage fallback</div>}
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}>
            <button className={`btn ${inWL?'btn-danger':'btn-ghost'}`} style={{width:'auto',padding:'7px 14px',fontSize:'0.74rem'}} onClick={handleWL}>
              {inWL?'− Watchlist':'+ Watchlist'}
            </button>
          </div>

          <div className="price-hero">
            <div className="price-company">
              {data.profile?.name||TICKER_NAMES[ticker]||ticker}
              {data.profile?.finnhubIndustry&&` · ${data.profile.finnhubIndustry}`}
              {data.profile?.marketCapitalization&&` · ${fmtMcap(data.profile.marketCapitalization)}`}
            </div>
            <div className="price-big" style={{color}}>${price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            <div className={`price-change ${chg>=0?'pos':'neg'}`}>{chg>=0?'▲':'▼'} {Math.abs(chg).toFixed(2)}% today</div>
            {av.description&&<div className="price-desc">{av.description.slice(0,200)}{av.description.length>200?'…':''}</div>}
          </div>

          <VerdictCard result={result}/>

          <SectionHeader>Analysis Brief</SectionHeader>
          <AnalysisBrief ticker={ticker} company={data.profile?.name||ticker} sector={data.profile?.finnhubIndustry||''} price={price} result={result} ma50={ma50} metrics={mt} news={data.news} rec={data.rec} earn={data.earnings} insider={data.insider||[]}/>

          <SectionHeader>Position Sizing</SectionHeader>
          <PositionSizing verdict={result.verdict} price={price}/>

          <SectionHeader>Live Metrics</SectionHeader>
          <div className="metrics-grid">
            <MetricCell label="Price"     value={`$${price?.toFixed(2)}`}  delta={`${chg>=0?'+':''}${chg?.toFixed(2)}%`}   deltaColor={chg>=0?'pos':'neg'}/>
            <MetricCell label="50-Day MA" value={ma50?`$${ma50}`:'N/A'}    delta={ma50?(price>ma50?'▲ Above':'▼ Below'):''} deltaColor={ma50?(price>ma50?'pos':'neg'):'neu'}/>
            <MetricCell label="RSI-14"    value={result.mom?.rsi??'N/A'}/>
            <MetricCell label="P/E (TTM)" value={result.pe?`${result.pe.toFixed(1)}×`:'N/A'}/>
            <MetricCell label="Mkt Cap"   value={fmtMcap(data.profile?.marketCapitalization)}/>
            <MetricCell label="1-Month"   value={result.mom?.['1m']!=null?`${result.mom['1m']>0?'+':''}${result.mom['1m']}%`:'N/A'} deltaColor={result.mom?.['1m']>=0?'pos':'neg'}/>
          </div>

          {(av.forwardPE||av.targetPrice)&&(
            <><SectionHeader>Alpha Vantage Enriched</SectionHeader>
            <div className="metrics-grid">
              {av.forwardPE    &&<MetricCell label="Forward P/E"   value={av.forwardPE}/>}
              {av.targetPrice  &&<MetricCell label="Analyst Target" value={`$${parseFloat(av.targetPrice).toFixed(2)}`}/>}
              {av.profitMargin &&<MetricCell label="Profit Margin"  value={`${(parseFloat(av.profitMargin)*100).toFixed(1)}%`}/>}
            </div></>
          )}

          {data.candles&&(<><SectionHeader>Chart · 60 Days</SectionHeader><Chart candles={data.candles} ma50={ma50} color={color} ticker={ticker}/></>)}

          <SectionHeader>6-Factor Breakdown</SectionHeader>
          <div className="card"><FactorBars scores={result.scores}/></div>

          {data.rec&&Object.keys(data.rec).length>0&&(
            <><SectionHeader>Wall Street Consensus</SectionHeader>
            <div className="metrics-grid">
              {['strongBuy','buy','hold','sell','strongSell'].map(k=><MetricCell key={k} label={k.replace(/([A-Z])/g,' $1').trim()} value={String(data.rec[k]||0)}/>)}
            </div></>
          )}

          {data.earnings?.length>0&&(
            <><SectionHeader>Earnings History</SectionHeader>
            {data.earnings.slice(0,4).map((eq,i)=>{
              const surp=eq.actual&&eq.estimate?((eq.actual-eq.estimate)/Math.abs(eq.estimate)*100):null
              const beat=surp&&surp>0
              return(<div className="card" key={i} style={{padding:'12px 16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.8rem'}}>{eq.period}</div>
                    <div style={{fontSize:'0.73rem',color:'#B2B2B2',marginTop:2}}>Est ${eq.estimate?.toFixed(2)} · Actual ${eq.actual?.toFixed(2)}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.86rem',color:beat?GREEN:surp?RED:'#B2B2B2'}}>{surp?`${surp>0?'+':''}${surp.toFixed(1)}%`:'—'}</div>
                    <div style={{fontSize:'0.7rem',color:'#B2B2B2'}}>{beat?'✅ Beat':surp?'❌ Miss':'—'}</div>
                  </div>
                </div>
              </div>)
            })}</>
          )}

          {data.insider?.length>0&&(
            <><SectionHeader>Insider Transactions — 90 Days</SectionHeader>
            <div className="metrics-grid">
              {[['Buys',String(data.insider.filter(x=>(x.change||0)>0).length)],
                ['Sells',String(data.insider.filter(x=>(x.change||0)<0).length)],
                ['Signal',data.insider.filter(x=>(x.change||0)>0).length>data.insider.filter(x=>(x.change||0)<0).length?'🟢 Bullish':data.insider.filter(x=>(x.change||0)<0).length>data.insider.filter(x=>(x.change||0)>0).length?'🔴 Bearish':'⚪ Neutral']
              ].map(([l,v])=><MetricCell key={l} label={l} value={v}/>)}
            </div></>
          )}

          {flags.length>0&&(
            <><SectionHeader>⚠ Manipulation Flags</SectionHeader>
            {flags.map((f,i)=>(
              <div key={i} className="card" style={{borderLeft:'3px solid #FF5000',padding:'12px 14px',marginBottom:8}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:RED,marginBottom:4}}>{f.title}</div>
                <div style={{fontSize:'0.82rem',color:'#B2B2B2'}}>{f.body}</div>
              </div>
            ))}</>
          )}

          <SectionHeader>News · {data.news?.length||0} Articles</SectionHeader>
          <div className="card" style={{padding:'0 16px'}}>
            {data.news?.length
              ?data.news.map((art,i)=><NewsCard key={i} article={art} sc={result.scoredNews?.[i]||{tier:4}}/>)
              :<div style={{color:'#B2B2B2',textAlign:'center',padding:24,fontSize:'0.84rem'}}>No news in past 10 days.</div>}
          </div>
          <div style={{height:16}}/>
        </>
      )}

      {!data&&!loading&&(
        <div style={{textAlign:'center',padding:'40px 0',color:'#B2B2B2'}}>
          <div style={{fontFamily:'var(--font-display)',fontSize:'4rem',color:'#1A1A1A',marginBottom:12}}>◈</div>
          <p style={{fontSize:'0.86rem',lineHeight:2,maxWidth:320,margin:'0 auto'}}>
            Enter any US stock or ETF ticker.<br/>Signal · Chart · Brief · Earnings · Insiders · News.
          </p>
        </div>
      )}
      {toast&&<Toast message={toast} onDone={()=>setToast(null)}/>}
    </div>
  )
}
