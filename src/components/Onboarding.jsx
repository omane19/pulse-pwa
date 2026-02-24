import React, { useState } from 'react'

const SCREENS = [
  {
    icon: '◈',
    title: 'Welcome to PULSE',
    subtitle: 'Market Intelligence for serious retail investors',
    body: 'PULSE combines 6 data signals into one score — so you always know whether a stock is worth your attention right now, not just its past performance.',
    cta: 'Show me how',
    accent: '#00ff88',
  },
  {
    icon: '⚡',
    title: 'The Signal Score',
    subtitle: '0–100. Higher = stronger setup.',
    body: 'Every stock gets scored on: trend vs 50-day MA, RSI momentum, earnings surprise history, analyst consensus, valuation, and news sentiment. Score ≥ 70 = BUY. 45–70 = HOLD. Below = AVOID.',
    cta: 'Got it',
    accent: '#f7c948',
    scoreDemo: true,
  },
  {
    icon: '🏛️',
    title: 'Smart Money Built In',
    subtitle: 'See what Congress and CEOs are doing',
    body: 'The Smart Money tab tracks congressional trades and executive Form 4 filings. When 3+ insiders buy the same stock within 30 days — that\'s a cluster signal worth watching.',
    cta: 'Let\'s go',
    accent: '#4e9af1',
    final: true,
  },
]

function ScoreDemo() {
  return (
    <div style={{ margin:'20px auto', width:180, textAlign:'center' }}>
      <div style={{ position:'relative', width:120, height:120, margin:'0 auto 12px' }}>
        <svg viewBox="0 0 120 120" style={{ width:'100%', height:'100%', transform:'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="#00ff88" strokeWidth="10"
            strokeDasharray={`${0.78 * 314} 314`} strokeLinecap="round"
            style={{ transition:'stroke-dasharray 1.2s ease' }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.8rem', fontWeight:700, color:'#00ff88' }}>78</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'#00ff88', letterSpacing:2 }}>BUY</div>
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'center', gap:16 }}>
        {[['≥70','#00ff88','BUY'],['45–70','#f7c948','HOLD'],['<45','#ff4e4e','AVOID']].map(([range,color,label]) => (
          <div key={label} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color, letterSpacing:0.5 }}>{range}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#666' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Onboarding({ onDone }) {
  const [idx, setIdx] = useState(0)
  const screen = SCREENS[idx]

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999,
      background:'var(--bg)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'24px 28px',
    }}>
      {/* Progress dots */}
      <div style={{ position:'absolute', top:32, display:'flex', gap:6 }}>
        {SCREENS.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 20 : 6, height:6, borderRadius:3,
            background: i === idx ? screen.accent : 'rgba(255,255,255,0.15)',
            transition:'all 0.3s ease'
          }}/>
        ))}
      </div>

      {/* Icon */}
      <div style={{ fontSize: idx === 0 ? '2.8rem' : '2rem', marginBottom:16, fontFamily:'var(--font-mono)', color:screen.accent }}>
        {screen.icon}
      </div>

      {/* Title */}
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.1rem', fontWeight:700, color:'var(--fg)', marginBottom:6, textAlign:'center', letterSpacing:0.5 }}>
        {screen.title}
      </div>

      {/* Subtitle */}
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:screen.accent, marginBottom:20, textAlign:'center', letterSpacing:0.5 }}>
        {screen.subtitle}
      </div>

      {/* Score demo on screen 2 */}
      {screen.scoreDemo && <ScoreDemo />}

      {/* Body */}
      <div style={{ fontSize:'0.78rem', color:'#aaa', lineHeight:1.7, textAlign:'center', maxWidth:300, marginBottom:32 }}>
        {screen.body}
      </div>

      {/* CTA */}
      <button
        onClick={() => screen.final ? onDone() : setIdx(idx + 1)}
        style={{
          padding:'14px 40px', borderRadius:12,
          background:`${screen.accent}18`, border:`1.5px solid ${screen.accent}55`,
          color:screen.accent, fontFamily:'var(--font-mono)', fontSize:'0.8rem',
          fontWeight:600, cursor:'pointer', letterSpacing:1,
          transition:'all 0.2s ease', width:'100%', maxWidth:280,
        }}
      >
        {screen.cta} →
      </button>

      {/* Skip */}
      <button
        onClick={onDone}
        style={{ marginTop:16, background:'none', border:'none', color:'#555', fontFamily:'var(--font-mono)', fontSize:'0.65rem', cursor:'pointer' }}
      >
        skip
      </button>
    </div>
  )
}
