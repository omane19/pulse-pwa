/* ── Signal Log — cross-device tracking via Supabase + localStorage fallback ──
 *
 * Setup (one-time):
 *  1. Go to https://supabase.com → New project (free)
 *  2. SQL Editor → run BOTH tables:
 *
 *       create table signal_log (
 *         id uuid primary key default gen_random_uuid(),
 *         ticker text not null,
 *         verdict text not null,
 *         score numeric not null,
 *         price_at_signal numeric not null,
 *         factors jsonb,
 *         reasons jsonb,
 *         tracked_at timestamptz default now(),
 *         price_30d numeric,
 *         price_60d numeric,
 *         price_90d numeric,
 *         return_30d numeric,
 *         return_60d numeric,
 *         return_90d numeric,
 *         updated_at timestamptz
 *       );
 *
 *       create table watchlist (
 *         id uuid primary key default gen_random_uuid(),
 *         ticker text not null unique,
 *         added_at timestamptz default now()
 *       );
 *
 *  3. Settings → API → copy URL + anon key
 *  4. Add to Vercel env vars:
 *       VITE_SUPABASE_URL=https://xxxx.supabase.co
 *       VITE_SUPABASE_ANON_KEY=eyJ...
 */

const SB_URL  = import.meta.env.VITE_SUPABASE_URL
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY
const LOCAL_KEY = 'pulse_signal_log_v2'
const MAX_LOCAL = 200

/* ── helpers ── */
function hasSupabase() { return !!(SB_URL && SB_KEY) }

function sbHeaders() {
  return {
    'Content-Type':  'application/json',
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Prefer':        'return=representation',
  }
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...sbHeaders(), ...(opts.headers || {}) },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}`)
  return res.json()
}

/* ── localStorage helpers ── */
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] }
}
function saveLocal(arr) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr.slice(-MAX_LOCAL))) } catch {}
}

/* ── Public API ── */

/**
 * Track a BUY/HOLD signal call.
 * @param {object} p
 * @param {string} p.ticker
 * @param {string} p.verdict  BUY | HOLD | AVOID
 * @param {number} p.score    0-100
 * @param {number} p.price    price at signal time
 * @param {object} p.factors  { momentum, trend, valuation, sentiment, analyst, earnings, smartmoney? }
 * @param {object} p.reasons  factor reason strings
 */
export async function trackSignal({ ticker, verdict, score, price, factors, reasons }) {
  if (!ticker || score == null || !price) return null

  const entry = {
    ticker,
    verdict,
    score,
    price_at_signal: price,
    factors: factors || {},
    reasons: reasons || {},
    tracked_at: new Date().toISOString(),
  }

  // Supabase first
  if (hasSupabase()) {
    try {
      const rows = await sbFetch('/signal_log', {
        method: 'POST',
        body: JSON.stringify(entry),
      })
      const saved = rows?.[0] || { ...entry, id: Date.now().toString() }
      // Also save to local as cache
      const local = loadLocal()
      local.push(saved)
      saveLocal(local)
      return saved
    } catch (e) {
      console.warn('Supabase save failed, using localStorage', e)
    }
  }

  // localStorage fallback
  const local = loadLocal()
  const id = `local_${Date.now()}`
  const saved = { ...entry, id }
  local.push(saved)
  saveLocal(local)
  return saved
}

/**
 * Load all tracked signals (newest first).
 */
export async function loadSignals() {
  if (hasSupabase()) {
    try {
      const rows = await sbFetch('/signal_log?order=tracked_at.desc&limit=200')
      // Sync to local cache
      saveLocal([...rows].reverse())
      return rows
    } catch (e) {
      console.warn('Supabase load failed, using localStorage', e)
    }
  }
  return loadLocal().reverse()
}

/**
 * Update a signal's outcome prices (called auto after 30/60/90 days).
 */
export async function updateOutcome(id, { price30, price60, price90, priceAtSignal }) {
  const calc = (p) => p != null ? parseFloat(((p - priceAtSignal) / priceAtSignal * 100).toFixed(2)) : null
  const updates = {
    price_30d:  price30  ?? undefined,
    price_60d:  price60  ?? undefined,
    price_90d:  price90  ?? undefined,
    return_30d: calc(price30),
    return_60d: calc(price60),
    return_90d: calc(price90),
    updated_at: new Date().toISOString(),
  }
  // Remove undefined keys
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k])

  if (hasSupabase() && !id.startsWith('local_')) {
    try {
      await sbFetch(`/signal_log?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    } catch (e) {
      console.warn('Supabase update failed', e)
    }
  }

  // Update local cache too
  const local = loadLocal()
  const idx = local.findIndex(r => r.id === id)
  if (idx !== -1) {
    local[idx] = { ...local[idx], ...updates }
    saveLocal(local)
  }
}

/**
 * Delete a single signal log entry.
 */
export async function deleteSignal(id) {
  if (hasSupabase() && !id.startsWith('local_')) {
    try {
      await sbFetch(`/signal_log?id=eq.${id}`, { method: 'DELETE' })
    } catch {}
  }
  const local = loadLocal().filter(r => r.id !== id)
  saveLocal(local)
}

/**
 * Compute accuracy stats from a list of signals.
 */
export function computeStats(signals) {
  const withOutcome30 = signals.filter(s => s.return_30d != null)
  const buyCalls      = withOutcome30.filter(s => s.verdict === 'BUY')
  const buyWins       = buyCalls.filter(s => s.return_30d > 0)
  const avgReturn     = buyCalls.length
    ? (buyCalls.reduce((a, b) => a + (b.return_30d || 0), 0) / buyCalls.length).toFixed(1)
    : null
  const winRate       = buyCalls.length ? Math.round(buyWins.length / buyCalls.length * 100) : null
  const best          = buyCalls.length ? buyCalls.reduce((a, b) => (b.return_30d||0) > (a.return_30d||0) ? b : a, buyCalls[0]) : null
  const worst         = buyCalls.length ? buyCalls.reduce((a, b) => (b.return_30d||0) < (a.return_30d||0) ? b : a, buyCalls[0]) : null

  return { total: signals.length, buyCalls: buyCalls.length, buyWins: buyWins.length, winRate, avgReturn, best, worst }
}
