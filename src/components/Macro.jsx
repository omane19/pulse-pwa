import React, { useState } from 'react'
import GlobalImpact from './GlobalImpact.jsx'
import Polymarket from './Polymarket.jsx'

export default function Macro({ onNavigate }) {
  const [tab, setTab] = useState('global')
  return (
    <div>
      <div style={{ display:'flex', gap:8, padding:'12px 16px 0', background:'#000', position:'sticky', top:0, zIndex:50 }}>
        {[['global','🌍 Global Markets'],['predict','🎯 Prediction Markets']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, padding:'8px 0', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.68rem',
            background: tab===id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: tab===id ? '1px solid rgba(0,229,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
            color: tab===id ? '#00E5FF' : '#888', cursor:'pointer', letterSpacing:0.5
          }}>{label}</button>
        ))}
      </div>
      {tab === 'global'  && <GlobalImpact onNavigate={onNavigate} />}
      {tab === 'predict' && <Polymarket />}
    </div>
  )
}
