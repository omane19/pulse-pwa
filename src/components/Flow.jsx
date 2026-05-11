import React, { useState } from 'react'
import Options from './Options.jsx'
import SmartMoney from './SmartMoney.jsx'
import NewsImpact from './NewsImpact.jsx'

export default function Flow({ onNavigateToDive }) {
  const [tab, setTab] = useState('options')
  return (
    <div>
      <div style={{ display:'flex', gap:6, padding:'12px 16px 0', background:'#000', position:'sticky', top:0, zIndex:50 }}>
        {[['options','📈 Options'],['money','🏛 Smart Money'],['news','📰 News']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, padding:'8px 2px', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.62rem',
            background: tab===id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: tab===id ? '1px solid rgba(0,229,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
            color: tab===id ? '#00E5FF' : '#888', cursor:'pointer', letterSpacing:0.3, whiteSpace:'nowrap'
          }}>{label}</button>
        ))}
      </div>
      {tab === 'options' && <Options onNavigateToDive={onNavigateToDive} />}
      {tab === 'money'   && <SmartMoney onNavigateToDive={onNavigateToDive} />}
      {tab === 'news'    && <NewsImpact onNavigateToDive={onNavigateToDive} />}
    </div>
  )
}
