import React, { useState, useEffect } from 'react'
import { marketStatus } from './utils/scoring.js'
import DeepDive from './components/DeepDive.jsx'
import Watchlist from './components/Watchlist.jsx'
import Screener from './components/Screener.jsx'
import Flow from './components/Flow.jsx'
import Macro from './components/Macro.jsx'
import Learn from './components/Learn.jsx'
import TrackRecord from './components/TrackRecord.jsx'
import Portfolio from './components/Portfolio.jsx'
import Backtest from './components/Backtest.jsx'
import Onboarding from './components/Onboarding.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

/* ── Icons ── */
function IconDive({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>)
}
function IconWatch({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>)
}
function IconScreen({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>)
}
function IconFlow({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>)
}
function IconMacro({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>)
}
function IconTrack({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>)
}
function IconPortfolio({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>)
}
function IconBacktest({ active }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7} strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>)
}

function checkOnboarded() {
  try { return localStorage.getItem('pulse_onboarded') === '1' } catch { return false }
}
function markOnboarded() {
  try { localStorage.setItem('pulse_onboarded', '1') } catch {}
}

const TABS = [
  { id:'dive',      label:'Dive',      icon:IconDive },
  { id:'watch',     label:'Watch',     icon:IconWatch },
  { id:'screen',    label:'Screen',    icon:IconScreen },
  { id:'flow',      label:'Flow',      icon:IconFlow },
  { id:'macro',     label:'Macro',     icon:IconMacro },
  { id:'track',     label:'Track',     icon:IconTrack },
  { id:'portfolio', label:'Portfolio', icon:IconPortfolio },
  { id:'backtest',  label:'Backtest',  icon:IconBacktest },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dive')
  const [diveQuery, setDiveQuery] = useState({ ticker: '', version: 0 })
  const [showOnboarding, setShowOnboarding] = useState(() => !checkOnboarded())
  const [showLearn, setShowLearn] = useState(false)
  const [mkt, setMkt] = useState(() => marketStatus())

  useEffect(() => {
    const id = setInterval(() => setMkt(marketStatus()), 60000)
    return () => clearInterval(id)
  }, [])

  // Auto-skip setup — proxy handles keys on Vercel
  useEffect(() => {
    // Silently confirm proxy is live; no setup tab needed
    fetch('/api/proxy?provider=fmp&path=%2Fprofile%3Fsymbol%3DAAPL').catch(() => {})
  }, [])

  const navigateToDive = (ticker) => {
    setDiveQuery(prev => ({ ticker: ticker.toUpperCase(), version: prev.version + 1 }))
    setActiveTab('dive')
  }
  const doneOnboarding = () => { markOnboarded(); setShowOnboarding(false) }

  return (
    <div className="app-shell">
      {showOnboarding && <Onboarding onDone={doneOnboarding} />}

      <header className="app-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div>
            <div className="header-logo">◈ PULSE</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.56rem', color:'#B2B2B2', marginTop:1, letterSpacing:'0.5px' }}>Market Intelligence</div>
          </div>
        </div>
        <div className="header-right">
          <button onClick={() => setShowLearn(v => !v)} style={{ background:'transparent', border:'1px solid #333', borderRadius:8, color:'#888', fontFamily:'var(--font-mono)', fontSize:'0.72rem', padding:'4px 9px', cursor:'pointer', letterSpacing:0.5 }}>?</button>
          <div className={`mkt-badge ${mkt.open ? 'open' : 'closed'}`}>
            <span className={`mkt-dot ${mkt.open ? 'open' : 'closed'}`} />
            {mkt.label}
          </div>
        </div>
      </header>

      <main className="page-area">
        <div style={{display: activeTab==='dive'      ? 'contents' : 'none'}}><ErrorBoundary><DeepDive initialTicker={diveQuery.ticker} diveVersion={diveQuery.version} onNavigate={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='watch'     ? 'contents' : 'none'}}><ErrorBoundary><Watchlist onNavigateToDive={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='screen'    ? 'contents' : 'none'}}><ErrorBoundary><Screener onNavigateToDive={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='flow'      ? 'contents' : 'none'}}><ErrorBoundary><Flow onNavigateToDive={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='macro'     ? 'contents' : 'none'}}><ErrorBoundary><Macro onNavigate={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='track'     ? 'contents' : 'none'}}><ErrorBoundary><TrackRecord /></ErrorBoundary></div>
        <div style={{display: activeTab==='portfolio' ? 'contents' : 'none'}}><ErrorBoundary><Portfolio onNavigateToDive={navigateToDive} /></ErrorBoundary></div>
        <div style={{display: activeTab==='backtest'  ? 'contents' : 'none'}}><ErrorBoundary><Backtest /></ErrorBoundary></div>
      </main>

      {/* Learn overlay */}
      {showLearn && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.94)', zIndex:500, overflowY:'auto' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 16px', position:'sticky', top:0, background:'rgba(0,0,0,0.94)', borderBottom:'1px solid #1a1a1a' }}>
            <button onClick={() => setShowLearn(false)} style={{ background:'transparent', border:'1px solid #333', borderRadius:8, color:'#888', fontFamily:'var(--font-mono)', fontSize:'0.72rem', padding:'6px 14px', cursor:'pointer' }}>✕ Close</button>
          </div>
          <ErrorBoundary><Learn /></ErrorBoundary>
        </div>
      )}

      <nav className="bottom-nav">
        <div className="nav-scroll-inner">
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            const Icon = tab.icon
            return (
              <button key={tab.id} className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}>
                <Icon active={active} />
                <span className="nav-label">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
