import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'

const GREEN = '#00C805'; const CYAN = '#00E5FF'; const RED = '#FF5000'

function fmt(n) { return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}` }

export default function DCA() {
  const [monthly,   setMonthly]   = useState(500)
  const [months,    setMonths]    = useState(24)
  const [annReturn, setAnnReturn] = useState(10)
  const [startPrice,setStartPrice]= useState(180)
  const [lumpSum,   setLumpSum]   = useState(false)

  const result = useMemo(() => {
    const monthlyRate = annReturn / 100 / 12
    const rows = []
    let totalInvested = 0; let portfolioValue = 0; let lsValue = 0
    const lsTotal = monthly * months
    lsValue = lsTotal * Math.pow(1 + annReturn/100/12, months)

    for (let m = 1; m <= months; m++) {
      totalInvested += monthly
      // Each contribution grows for remaining months
      portfolioValue = 0
      let running = 0
      for (let k = 1; k <= m; k++) {
        running += monthly * Math.pow(1 + monthlyRate, m - k + 1)
      }
      portfolioValue = running
      const shares = totalInvested / startPrice  // approx shares bought
      rows.push({
        month: m,
        label: m % 3 === 0 ? `M${m}` : '',
        invested: Math.round(totalInvested),
        value: Math.round(portfolioValue),
        gain: Math.round(portfolioValue - totalInvested),
        gainPct: parseFloat(((portfolioValue / totalInvested - 1)*100).toFixed(1)),
      })
    }

    const final = rows[rows.length - 1]
    const totalInv = monthly * months
    return { rows, totalInvested: totalInv, finalValue: final.value, totalGain: final.gain, gainPct: final.gainPct, lsValue: Math.round(lsValue), lsGain: Math.round(lsValue - lsTotal) }
  }, [monthly, months, annReturn, startPrice])

  const milestones = [
    { label: 'Break Even', value: result.totalInvested },
    { label: `${Math.round(result.totalInvested * 1.25).toLocaleString()} (+25%)`, value: result.totalInvested * 1.25 },
    { label: `2×`, value: result.totalInvested * 2 },
  ]

  return (
    <div className="page">
      <div className="sh">DCA Calculator</div>
      <div style={{ fontSize:'0.82rem', color:'#B2B2B2', lineHeight:1.75, marginBottom:20 }}>
        Dollar-Cost Averaging means investing a fixed amount regularly regardless of price. You buy more shares when prices are low and fewer when high — smoothing out your average entry cost over time.
      </div>

      {/* Inputs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        <div>
          <label className="input-label">Monthly Investment ($)</label>
          <input type="number" className="input" value={monthly} min={10} step={50}
            onChange={e=>setMonthly(Math.max(10,+e.target.value))} />
        </div>
        <div>
          <label className="input-label">Duration (months)</label>
          <input type="number" className="input" value={months} min={3} max={120} step={3}
            onChange={e=>setMonths(Math.max(3,Math.min(120,+e.target.value)))} />
        </div>
        <div>
          <label className="input-label">Expected Annual Return (%)</label>
          <input type="range" min={2} max={30} step={0.5} value={annReturn}
            onChange={e=>setAnnReturn(+e.target.value)}
            style={{ width:'100%', accentColor:GREEN, marginTop:8 }} />
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:GREEN, marginTop:4 }}>{annReturn}% / year</div>
        </div>
        <div>
          <label className="input-label">Starting Price (for share calc)</label>
          <input type="number" className="input" value={startPrice} min={1} step={1}
            onChange={e=>setStartPrice(Math.max(1,+e.target.value))} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
        {[
          ['Total Invested',  `$${result.totalInvested.toLocaleString()}`, '#B2B2B2'],
          ['Final Value',     `$${result.finalValue.toLocaleString()}`,    GREEN],
          ['Total Gain',      `+$${result.totalGain.toLocaleString()}`,    GREEN],
          ['Gain %',          `+${result.gainPct}%`,                       GREEN],
          ['Duration',        `${months >= 12 ? `${Math.floor(months/12)}y ${months%12}m` : `${months}m`}`, '#B2B2B2'],
          ['Monthly → Shares',`~${(monthly/startPrice).toFixed(2)}/mo`,   CYAN],
        ].map(([l,v,c]) => (
          <div key={l} className="metric-cell">
            <div className="metric-label">{l}</div>
            <div className="metric-value" style={{ color:c, fontSize:'0.82rem' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* DCA vs Lump Sum comparison */}
      <div className="card card-accent-cyan" style={{ marginBottom:16 }}>
        <div style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:CYAN, marginBottom:10 }}>DCA vs Lump Sum Comparison</div>
        <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:'0.72rem', color:'#B2B2B2' }}>DCA over {months} months</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', color:GREEN }}>${result.finalValue.toLocaleString()}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'#B2B2B2' }}>+${result.totalGain.toLocaleString()} ({result.gainPct}%)</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'0.72rem', color:'#B2B2B2' }}>Lump sum at start</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', color:CYAN }}>${result.lsValue.toLocaleString()}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'#B2B2B2' }}>+${result.lsGain.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ marginTop:12, fontSize:'0.78rem', color:'#B2B2B2', lineHeight:1.7, borderTop:'1px solid #252525', paddingTop:10 }}>
          {result.lsValue > result.finalValue
            ? `Lump sum wins by $${(result.lsValue - result.finalValue).toLocaleString()} — but that requires investing everything on day one. DCA is safer: you never risk timing the market wrong at the top.`
            : `DCA wins here — though in most bull markets, lump sum marginally outperforms over long periods. DCA's real value is reducing the emotional and timing risk of investing a large amount all at once.`}
        </div>
      </div>

      {/* Chart */}
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#B2B2B2', marginBottom:8, letterSpacing:1, textTransform:'uppercase' }}>
        Portfolio Growth Over Time
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={result.rows} margin={{ top:4, right:0, left:0, bottom:0 }}>
          <XAxis dataKey="label" tick={{ fontSize:9, fontFamily:'var(--font-mono)', fill:'#B2B2B2' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize:9, fontFamily:'var(--font-mono)', fill:'#B2B2B2' }} tickFormatter={fmt} axisLine={false} tickLine={false} width={44} />
          <Tooltip formatter={(v,n)=>[`$${v.toLocaleString()}`,n]} contentStyle={{ background:'#111', border:'1px solid #252525', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.72rem' }} />
          <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', paddingTop:6 }} />
          <Line type="monotone" dataKey="value"    name="Portfolio Value" stroke={GREEN} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="invested" name="Amount Invested"  stroke={CYAN}  strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
        </LineChart>
      </ResponsiveContainer>

      {/* DCA education */}
      <div className="sh">Why DCA Works</div>
      {[
        ['Removes timing risk', 'Trying to buy the exact bottom is nearly impossible — even professional fund managers fail consistently. DCA means you buy at many different prices and your average is always reasonable.'],
        ['Removes emotional risk', 'Market drops feel less scary when they mean your next purchase buys more shares. DCA converts market volatility from an enemy into a feature — you WANT prices to sometimes be low.'],
        ['Builds the habit', 'Investing automatically every month — whether the market is up or down — builds a discipline that consistently beats people who wait for "the right time."'],
        ['When lump sum beats DCA', 'Statistically, if you have a large amount of cash to invest and a long time horizon, lump sum wins about 2/3 of the time in bull markets. DCA is superior when: (1) you don\'t have the full amount yet, (2) you are emotionally sensitive to drawdowns, or (3) you are near your investment horizon.'],
      ].map(([title,body])=>(
        <div key={title} className="card" style={{ marginBottom:8 }}>
          <div style={{ fontWeight:600, fontSize:'0.88rem', color:'#fff', marginBottom:6 }}>{title}</div>
          <div style={{ fontSize:'0.82rem', color:'#B2B2B2', lineHeight:1.8 }}>{body}</div>
        </div>
      ))}

      <div style={{ height:16 }} />
    </div>
  )
}
