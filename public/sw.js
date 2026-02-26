/* PULSE Service Worker — handles push notifications and caching */
const CACHE = 'pulse-v1'

/* ── Install: cache app shell ── */
self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim())
})

/* ── Push: show notification ── */
self.addEventListener('push', e => {
  let data = { title: '◈ PULSE', body: 'Market update ready', ticker: null }
  try { data = { ...data, ...e.data.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'pulse-signal',
      data: { ticker: data.ticker },
      actions: data.ticker ? [{ action: 'dive', title: `Analyze ${data.ticker}` }] : []
    })
  )
})

/* ── Notification click: open app to ticker ── */
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const ticker = e.notification.data?.ticker
  const url = ticker ? `/?ticker=${ticker}` : '/'
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      const existing = list.find(w => w.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.postMessage({ type: 'NAVIGATE_TICKER', ticker })
      } else {
        clients.openWindow(url)
      }
    })
  )
})

/* ── Background sync for watchlist alerts ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_CHECK') {
    // Received from app when watchlist changes — acknowledged
    e.ports?.[0]?.postMessage({ ok: true })
  }
})
