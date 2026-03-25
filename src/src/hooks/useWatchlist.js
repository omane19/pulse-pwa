import { useState, useEffect, useCallback } from 'react'

const LOCAL_KEY = 'pulse_watchlist_v1'
const SB_URL    = import.meta.env.VITE_SUPABASE_URL
const SB_KEY    = import.meta.env.VITE_SUPABASE_ANON_KEY

function hasSupabase() { return !!(SB_URL && SB_KEY) }

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
  }
}

/* ── localStorage helpers ── */
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [] } catch { return [] }
}
function saveLocal(arr) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)) } catch {}
}

/* ── Supabase helpers ── */
async function sbLoadList() {
  if (!hasSupabase()) return null
  try {
    const res = await fetch(`${SB_URL}/rest/v1/watchlist?select=ticker&order=added_at.asc`, {
      headers: sbHeaders()
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(r => r.ticker) : null
  } catch { return null }
}

async function sbAddTicker(ticker) {
  if (!hasSupabase()) return false
  try {
    const res = await fetch(`${SB_URL}/rest/v1/watchlist`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ticker })
    })
    return res.ok || res.status === 409  // 409 = already exists (unique constraint), treat as success
  } catch { return false }
}

async function sbRemoveTicker(ticker) {
  if (!hasSupabase()) return false
  try {
    const res = await fetch(`${SB_URL}/rest/v1/watchlist?ticker=eq.${encodeURIComponent(ticker)}`, {
      method: 'DELETE',
      headers: sbHeaders()
    })
    return res.ok
  } catch { return false }
}

/* ── Hook ── */
export function useWatchlist() {
  const [list, setList] = useState(() => loadLocal())

  // On mount: try to load from Supabase, merge with local
  useEffect(() => {
    sbLoadList().then(remote => {
      if (remote !== null) {
        // Merge: union of remote + local, remote is source of truth
        const local = loadLocal()
        const merged = [...new Set([...remote, ...local])]
        setList(merged)
        saveLocal(merged)
        // If local had entries Supabase doesn't, push them up
        const toSync = local.filter(t => !remote.includes(t))
        toSync.forEach(t => sbAddTicker(t))
      }
    })
  }, [])

  const add = useCallback((ticker) => {
    const t = ticker.toUpperCase().trim()
    if (!t) return
    setList(prev => {
      if (prev.includes(t)) return prev
      const next = [...prev, t]
      saveLocal(next)
      sbAddTicker(t)  // fire and forget — localStorage already updated
      return next
    })
  }, [])

  const remove = useCallback((ticker) => {
    setList(prev => {
      const next = prev.filter(t => t !== ticker)
      saveLocal(next)
      sbRemoveTicker(ticker)  // fire and forget
      return next
    })
  }, [])

  const has = useCallback((ticker) => list.includes(ticker), [list])

  return { list, add, remove, has }
}
