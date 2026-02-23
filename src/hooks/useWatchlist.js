import { useState, useEffect, useCallback } from 'react'

const KEY = 'pulse_watchlist_v1'

export function useWatchlist() {
  const [list, setList] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
  })

  const save = useCallback((newList) => {
    setList(newList)
    try { localStorage.setItem(KEY, JSON.stringify(newList)) } catch {}
  }, [])

  const add = useCallback((ticker) => {
    const t = ticker.toUpperCase().trim()
    if (!t) return
    setList(prev => {
      if (prev.includes(t)) return prev
      const next = [...prev, t]
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const remove = useCallback((ticker) => {
    setList(prev => {
      const next = prev.filter(t => t !== ticker)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const has = useCallback((ticker) => list.includes(ticker), [list])

  return { list, add, remove, has }
}
