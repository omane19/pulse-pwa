/* ── Signal History — tracks every analysis for personal track record ── */
const KEY = 'pulse_signal_history'
const MAX = 200 // keep last 200 signals

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX))) } catch {}
}

export function saveSignal({ ticker, score, verdict, price }) {
  if (!ticker || score == null || !price) return
  const history = load()
  // Don't duplicate within 1 hour for the same ticker
  const recent = history.find(h => h.ticker === ticker && Date.now() - h.ts < 3600000)
  if (recent) return
  history.push({ ticker, score, verdict, price, ts: Date.now() })
  save(history)
}

export function getHistory() { return load().reverse() }

export function getTickerHistory(ticker) {
  return load().filter(h => h.ticker === ticker).reverse()
}

export function clearHistory() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function getAccuracyStats() {
  // Requires current prices — we can only calc for signals > 14 days old with known outcomes
  // Returns summary of saved signals for display
  const all = load()
  const total = all.length
  const byVerdict = { BUY: 0, HOLD: 0, AVOID: 0 }
  all.forEach(h => { if (byVerdict[h.verdict] !== undefined) byVerdict[h.verdict]++ })
  return { total, byVerdict, oldest: all[0]?.ts, newest: all[all.length-1]?.ts }
}
