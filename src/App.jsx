import React, { useState, useMemo } from 'react'
import { marketStatus } from './utils/scoring.js'
import DeepDive from './components/DeepDive.jsx'
import Watchlist from './components/Watchlist.jsx'
import Screener from './components/Screener.jsx'
import GlobalImpact from './components/GlobalImpact.jsx'
import Options from './components/Options.jsx'
import Compare from './components/Compare.jsx'
import DCA from './components/DCA.jsx'
import Learn from './components/Learn.jsx'
import Setup from './components/Setup.jsx'

/* ── Icons ── */
function IconDive({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  )
}
function IconWatch({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IconScreen({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}
function IconOptions({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  )
}
function IconDCA({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}
function IconCompare({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}
function IconGlobal({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}
function IconLearn({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}
function IconSetup({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

/* ── Check if keys are configured ── */
function checkKeys() {
  try {
    const fh = localStorage.getItem('VITE_FINNHUB_KEY') || import.meta.env.VITE_FINNHUB_KEY || ''
    return fh.length > 8 && !fh.includes('your_') && !fh.includes('here')
  } catch {
    const fh = import.meta.env.VITE_FINNHUB_KEY || ''
    return fh.length > 8 && !fh.includes('your_')
  }
}

const TABS = [
  { id: 'dive',    label: 'Dive',    icon: IconDive },
  { id: 'watch',   label: 'Watch',   icon: IconWatch },
  { id: 'screen',  label: 'Screen',  icon: IconScreen },
  { id: 'options', label: 'Options', icon: IconOptions },
  { id: 'dca',     label: 'DCA',     icon: IconDCA },
  { id: 'compare', label: 'VS',      icon: IconCompare },
  { id: 'global',  label: 'Global',  icon: IconGlobal },
  { id: 'learn',   label: 'Learn',   icon: IconLearn },
  { id: 'setup',   label: 'Setup',   icon: IconSetup },
]

export default function App() {
  const hasKeys = useMemo(() => checkKeys(), [])
  const [activeTab, setActiveTab] = useState(hasKeys ? 'dive' : 'setup')
  const mkt = useMemo(() => marketStatus(), [])

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div className="header-logo">◈ PULSE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: '#B2B2B2', marginTop: 1, letterSpacing: '0.5px' }}>
              Market Intelligence
            </div>
          </div>
        </div>
        <div className="header-right">
          {!hasKeys && activeTab !== 'setup' && (
            <button
              onClick={() => setActiveTab('setup')}
              style={{
                marginRight: 8, padding: '4px 10px', borderRadius: 6,
                background: 'rgba(255,80,0,0.12)', border: '1px solid rgba(255,80,0,0.35)',
                color: '#FF5000', fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                cursor: 'pointer', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                animation: 'pulse-glow 2s ease-in-out infinite'
              }}
            >
              ⚠ Add API Keys
            </button>
          )}
          <div className={`mkt-badge ${mkt.open ? 'open' : 'closed'}`}>
            <span className={`mkt-dot ${mkt.open ? 'open' : 'closed'}`} />
            {mkt.label}
          </div>
        </div>
      </header>

      {/* No-key banner — shows across all tabs when keys missing */}
      {!hasKeys && activeTab !== 'setup' && (
        <div style={{
          position: 'fixed', top: 'var(--header-h)', left: 0, right: 0,
          background: 'rgba(255,80,0,0.1)', borderBottom: '1px solid rgba(255,80,0,0.3)',
          padding: '8px 16px', zIndex: 150, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 10
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#FF5000', letterSpacing: '0.5px' }}>
            ⚠ API keys not configured — data unavailable
          </div>
          <button onClick={() => setActiveTab('setup')} style={{
            padding: '3px 10px', borderRadius: 5, background: 'rgba(255,80,0,0.2)',
            border: '1px solid rgba(255,80,0,0.4)', color: '#FF5000',
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', cursor: 'pointer', whiteSpace: 'nowrap'
          }}>
            Setup →
          </button>
        </div>
      )}

      {/* Page content */}
      <main className="page-area" style={{ paddingTop: !hasKeys && activeTab !== 'setup' ? 'calc(var(--header-h) + 36px)' : undefined }}>
        {activeTab === 'dive'    && <DeepDive />}
        {activeTab === 'watch'   && <Watchlist />}
        {activeTab === 'screen'  && <Screener />}
        {activeTab === 'options' && <Options />}
        {activeTab === 'dca'     && <DCA />}
        {activeTab === 'compare' && <Compare />}
        {activeTab === 'global'  && <GlobalImpact />}
        {activeTab === 'learn'   && <Learn />}
        {activeTab === 'setup'   && <Setup onDone={() => setActiveTab('dive')} />}
      </main>

      {/* Bottom navigation — horizontally scrollable for 9 tabs */}
      <nav className="bottom-nav">
        <div className="nav-scroll-inner">
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            const Icon = tab.icon
            const hasAlert = tab.id === 'setup' && !hasKeys
            return (
              <button key={tab.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{ position: 'relative' }}
              >
                <Icon active={active} />
                <span className="nav-label">{tab.label}</span>
                {hasAlert && (
                  <span style={{
                    position: 'absolute', top: 6, right: '50%', transform: 'translateX(8px)',
                    width: 6, height: 6, borderRadius: '50%', background: '#FF5000'
                  }} />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
