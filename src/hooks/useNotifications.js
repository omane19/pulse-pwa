/* ── Watchlist notifications hook ── */
import { useState, useCallback } from 'react'

const SW_URL = '/sw.js'

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register(SW_URL)
    await navigator.serviceWorker.ready
    return reg
  } catch { return null }
}

export function useNotifications() {
  const [permission, setPermission] = useState(() => {
    try { return Notification.permission } catch { return 'unavailable' }
  })
  const [swReg, setSwReg] = useState(null)

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unavailable'
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      const reg = await registerSW()
      setSwReg(reg)
    }
    return perm
  }, [])

  /* Send a local (non-push) notification directly from the app */
  const notify = useCallback(async (title, body, ticker) => {
    if (permission !== 'granted') return
    let reg = swReg
    if (!reg) { reg = await registerSW(); setSwReg(reg) }
    if (reg) {
      reg.showNotification(title, {
        body, icon: '/icons/icon-192.png',
        tag: `pulse-${ticker || 'alert'}`,
        data: { ticker }
      })
    } else if ('Notification' in window) {
      new Notification(title, { body })
    }
  }, [permission, swReg])

  /* Schedule a daily check — sends notification if any watchlist ticker has a BUY signal */
  const scheduleWatchlistAlert = useCallback(async (watchlistSignals) => {
    if (permission !== 'granted') return
    const buys = watchlistSignals.filter(s => s.verdict === 'BUY')
    if (!buys.length) return
    const tickers = buys.map(s => s.ticker).slice(0, 3).join(', ')
    await notify(
      `◈ PULSE — ${buys.length} BUY Signal${buys.length > 1 ? 's' : ''}`,
      `${tickers} ${buys.length > 3 ? `+${buys.length - 3} more` : ''} on your watchlist`,
      buys[0].ticker
    )
  }, [permission, notify])

  return { permission, requestPermission, notify, scheduleWatchlistAlert }
}
