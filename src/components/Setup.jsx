import React, { useState, useEffect } from 'react'

const GREEN = '#00C805'; const G1 = '#B2B2B2'; const G2 = '#111'; const G4 = '#252525'; const RED = '#FF5000'; const CYAN = '#00E5FF'; const GOLD = '#FFD700'

function getKey(name) {
  return localStorage.getItem(name) || import.meta.env[name] || ''
}

function validateKey(k) {
  return k && k.length > 8 && !k.includes('your_') && !k.includes('YOUR_') && !k.includes('here')
}

export default function Setup({ onDone }) {
  const [fhInput,  setFhInput]  = useState('')
  const [avInput,  setAvInput]  = useState('')
  const [fmpInput, setFmpInput] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const fh  = getKey('VITE_FINNHUB_KEY')
    const av  = getKey('VITE_AV_KEY')
    const fmp = getKey('VITE_FMP_KEY')
    // Auto-skip Setup if key already configured
    if (validateKey(fh)) { onDone(); return }
    if (fh)  setFhInput(fh)
    if (av)  setAvInput(av)
    if (fmp) setFmpInput(fmp)
  }, [])

  const fhOk  = validateKey(fhInput)
  const avOk  = validateKey(avInput)
  const fmpOk = validateKey(fmpInput)

  const save = () => {
    if (fhInput.trim())  localStorage.setItem('VITE_FINNHUB_KEY', fhInput.trim())
    if (avInput.trim())  localStorage.setItem('VITE_AV_KEY', avInput.trim())
    if (fmpInput.trim()) localStorage.setItem('VITE_FMP_KEY', fmpInput.trim())
    setSaved(true)
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
          Paste your API keys below. Keys save to your browser — no server needed.
        </div>
      </div>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <StatusCard label="Finnhub" desc="Prices · news · earnings" ok={fhOk} />
        <StatusCard label="Alpha Vantage" desc="P/E · targets (optional)" ok={avOk} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <StatusCard label="FMP — Smart Money" desc="Congressional + CEO insider trades" ok={fmpOk} wide />
      </div>

      {/* Finnhub */}
      <KeyInput
        step="Step 1" label="Finnhub Key" required accent={GREEN}
        url="https://finnhub.io" urlLabel="finnhub.io"
        desc="Sign Up → your API key is on the dashboard."
        value={fhInput} onChange={setFhInput} ok={fhOk}
        placeholder="Paste Finnhub key here…"
      />

      {/* Alpha Vantage */}
      <KeyInput
        step="Step 2" label="Alpha Vantage Key (optional)" accent={CYAN}
        url="https://www.alphavantage.co/support/#api-key" urlLabel="alphavantage.co"
        desc="Get Free API Key. Adds P/E, analyst targets, company overview."
        value={avInput} onChange={setAvInput} ok={avOk}
        placeholder="Paste Alpha Vantage key here…"
      />

      {/* FMP */}
      <KeyInput
        step="Step 3" label="FMP Key — Smart Money" accent={GOLD}
        url="https://financialmodelingprep.com/developer/docs" urlLabel="financialmodelingprep.com"
        desc="Starter plan (~$25–30/month). Unlocks congressional trades, CEO insider buys, and the Smart Money tab."
        value={fmpInput} onChange={setFmpInput} ok={fmpOk}
        placeholder="Paste FMP key here…"
      />

      {/* Save */}
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: G1, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, marginTop: 12 }}>
        Troubleshooting
      </div>
      {[
        ['Still seeing "No data"?', 'After saving, the page reloads. If it still fails, hard-refresh (Cmd+Shift+R / Ctrl+Shift+R).'],
        ['Screener rate limit?', 'Finnhub free tier: 60 req/min. If you hit the limit, wait 60 seconds and retry.'],
        ['FMP — which plan?', 'Starter (~$25/mo) covers congressional + insider trades. No need for Premium or Ultimate.'],
        ['Deploying to GitHub Pages?', 'Set VITE_FINNHUB_KEY, VITE_AV_KEY, VITE_FMP_KEY in GitHub → Settings → Secrets → Actions.'],
      ].map(([q, a], i) => (
        <div key={i} style={{ marginBottom: 8, background: G2, border: `1px solid ${G4}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>{q}</div>
          <div style={{ color: G1, fontSize: '0.76rem', lineHeight: 1.7 }}>{a}</div>
        </div>
      ))}

      {/* Tier table */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: G1, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, marginTop: 16 }}>
        API Tier Summary
      </div>
      <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        {[
          ['Finnhub', 'Free', '60 req/min', 'Quotes · candles · news'],
          ['Alpha Vantage', 'Free', '25 req/day', 'Fundamentals (optional)'],
          ['FMP', 'Starter ~$25/mo', '300 req/min', 'Smart Money tab'],
        ].map(([api, plan, limit, features], i, arr) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${G4}` : 'none' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{api}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: api === 'FMP' ? GOLD : GREEN, marginTop: 2 }}>{plan}</div>
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

function KeyInput({ step, label, required, accent, url, urlLabel, desc, value, onChange, ok, placeholder }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
        {step} — {label}{required ? ' (required)' : ''}
      </div>
      <div style={{ background: G2, border: `1px solid ${G4}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
        <div style={{ color: G1, fontSize: '0.78rem', lineHeight: 1.7, marginBottom: 8 }}>
          Go to{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: accent }}>{urlLabel}</a>
          {' '}→ {desc}
        </div>
        <input
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoCorrect="off" autoCapitalize="off" spellCheck={false}
          style={{ borderColor: ok ? `${accent}66` : undefined }}
        />
        {ok && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: accent, marginTop: 6 }}>✓ Key looks valid</div>}
      </div>
    </div>
  )
}

function StatusCard({ label, desc, ok, wide }) {
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
        {ok ? '✓ Key detected' : '✗ Not configured'}
      </div>
      <div style={{ fontSize: '0.68rem', color: G1, marginTop: 3 }}>{desc}</div>
    </div>
  )
}
