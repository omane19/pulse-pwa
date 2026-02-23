import React, { useState, useEffect } from 'react'

const GREEN = '#00C805'; const G1 = '#B2B2B2'; const G2 = '#111'; const G4 = '#252525'; const RED = '#FF5000'; const CYAN = '#00E5FF'

function getKey(name) {
  // Check localStorage first (entered via UI), then fall back to .env
  return localStorage.getItem(name) || import.meta.env[name] || ''
}

function validateKey(k) {
  return k && k.length > 8 && !k.includes('your_') && !k.includes('YOUR_') && !k.includes('here')
}

export default function Setup({ onDone }) {
  const [fhInput, setFhInput] = useState('')
  const [avInput, setAvInput] = useState('')
  const [saved, setSaved] = useState(false)

  // Load existing keys on mount
  useEffect(() => {
    const fh = getKey('VITE_FINNHUB_KEY')
    const av = getKey('VITE_AV_KEY')
    if (fh) setFhInput(fh)
    if (av) setAvInput(av)
  }, [])

  const fhOk = validateKey(fhInput)
  const avOk = validateKey(avInput)

  const save = () => {
    if (fhInput.trim()) localStorage.setItem('VITE_FINNHUB_KEY', fhInput.trim())
    if (avInput.trim()) localStorage.setItem('VITE_AV_KEY', avInput.trim())
    setSaved(true)
    // Reload so useApi.js re-reads localStorage on init
    setTimeout(() => window.location.reload(), 300)
  }

  return (
    <div className="page">
      <div style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 20 }}>
        <div style={{ fontSize: '2rem', marginBottom: 6 }}>◈</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 4 }}>
          Setup PULSE
        </div>
        <div style={{ color: G1, fontSize: '0.82rem', maxWidth: 300, margin: '0 auto', lineHeight: 1.7 }}>
          Paste your two free API keys below. Keys save to your browser — no server needed.
        </div>
      </div>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        <StatusCard label="Finnhub" desc="Prices · news · earnings" ok={fhOk} />
        <StatusCard label="Alpha Vantage" desc="P/E · targets · overview" ok={avOk} />
      </div>

      {/* Finnhub key input */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: GREEN, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          Step 1 — Finnhub Key (required)
        </div>
        <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ color: G1, fontSize: '0.78rem', lineHeight: 1.7, marginBottom: 8 }}>
            Go to <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>finnhub.io</a> → Sign Up → your API key is on the dashboard.
          </div>
          <input
            className="input"
            value={fhInput}
            onChange={e => setFhInput(e.target.value)}
            placeholder="Paste Finnhub key here…"
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            style={{ borderColor: fhOk ? 'rgba(0,200,5,0.4)' : undefined }}
          />
          {fhOk && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: GREEN, marginTop: 6 }}>✓ Key looks valid</div>}
        </div>
      </div>

      {/* Alpha Vantage key input */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: CYAN, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          Step 2 — Alpha Vantage Key (free, optional)
        </div>
        <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ color: G1, fontSize: '0.78rem', lineHeight: 1.7, marginBottom: 8 }}>
            Go to <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>alphavantage.co</a> → Get Free API Key. Adds P/E, analyst targets, company overview.
          </div>
          <input
            className="input"
            value={avInput}
            onChange={e => setAvInput(e.target.value)}
            placeholder="Paste Alpha Vantage key here…"
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            style={{ borderColor: avOk ? 'rgba(0,229,255,0.3)' : undefined }}
          />
          {avOk && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: CYAN, marginTop: 6 }}>✓ Key looks valid</div>}
        </div>
      </div>

      {/* Save button */}
      <button
        className="btn btn-primary"
        onClick={save}
        disabled={!fhOk}
        style={{ marginBottom: 12 }}
      >
        {saved ? '✓ Saved — loading…' : 'Save Keys & Launch PULSE →'}
      </button>

      {!fhOk && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: G1, marginBottom: 16 }}>
          Finnhub key is required to continue
        </div>
      )}

      {/* Troubleshooting */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: G1, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, marginTop: 8 }}>
        Troubleshooting
      </div>
      {[
        ['Still seeing "No data"?', 'After saving keys here, the page reloads automatically. If it still fails, hard-refresh the page (Cmd+Shift+R on Mac / Ctrl+Shift+R on Windows).'],
        ['Rate limit errors?', 'Finnhub free tier: 60 calls/minute. If you scan many tickers quickly you may hit the limit — wait 60 seconds and retry.'],
        ['Alpha Vantage 25 calls/day limit', 'Alpha Vantage free tier has a 25 calls/day limit. PULSE uses it only as a fallback when Finnhub data is missing, so you rarely hit this.'],
        ['Deploying to GitHub Pages?', 'Set VITE_FINNHUB_KEY and VITE_AV_KEY in GitHub repo → Settings → Secrets → Actions. Or have users enter keys on this Setup screen.'],
      ].map(([q, a], i) => (
        <div key={i} style={{ marginBottom: 8, background: G2, border: `1px solid ${G4}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>{q}</div>
          <div style={{ color: G1, fontSize: '0.76rem', lineHeight: 1.7 }}>{a}</div>
        </div>
      ))}

      {/* Free tier limits */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: G1, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, marginTop: 16 }}>
        Free Tier Limits
      </div>
      <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {[
          ['Finnhub', 'Free', '60 req/min', 'All PULSE features'],
          ['Alpha Vantage', 'Free', '25 req/day', 'Fundamentals only (optional)'],
        ].map(([api, plan, limit, features], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '10px 14px', borderBottom: i < 1 ? `1px solid ${G4}` : 'none' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{api}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: GREEN, marginTop: 2 }}>{plan}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: G1 }}>{limit}</div>
              <div style={{ fontSize: '0.68rem', color: G1, marginTop: 2 }}>{features}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusCard({ label, desc, ok }) {
  return (
    <div style={{
      background: ok ? 'rgba(0,200,5,0.06)' : 'rgba(255,80,0,0.06)',
      border: `1px solid ${ok ? 'rgba(0,200,5,0.25)' : 'rgba(255,80,0,0.25)'}`,
      borderRadius: 12, padding: '12px 14px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? GREEN : RED, flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{label}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: ok ? GREEN : RED }}>
        {ok ? '✓ Key detected' : '✗ Key missing'}
      </div>
      <div style={{ fontSize: '0.68rem', color: G1, marginTop: 3 }}>{desc}</div>
    </div>
  )
}
