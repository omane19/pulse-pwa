export function timeAgo(ts) {
  if (!ts) return { label: '?', badge: 'old' }
  const secs = (Date.now() - ts * 1000) / 1000
  const mins = Math.floor(secs / 60); const hrs = Math.floor(secs / 3600); const days = Math.floor(secs / 86400)
  if (secs < 60)  return { label: 'just now', badge: 'live' }
  if (mins < 10)  return { label: `${mins}m`, badge: 'breaking' }
  if (mins < 60)  return { label: `${mins}m ago`, badge: 'new' }
  if (hrs < 24)   return { label: `${hrs}h ago`, badge: hrs < 6 ? 'new' : 'today' }
  if (days === 1) return { label: 'Yesterday', badge: 'today' }
  return { label: `${days}d ago`, badge: 'old' }
}

export function getTier(source) {
  const src = (source || '').toLowerCase()
  for (const [tier, info] of Object.entries(SOURCE_TIERS)) {
    if (parseInt(tier) === 4) continue
    if (info.sources && info.sources.some(s => src.includes(s.toLowerCase()))) return parseInt(tier)
  }
  return 4
}

export function smartSummary(title, body) {
  const text = (body || '').trim()
  if (text.length < 60) return null
  const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.length >= 50 && s.length <= 250)
  if (!sents.length) return null
  const kws = ['revenue','profit','earnings','growth','beat','miss','raised','lowered','expects','guidance','acquisition','deal','billion','million','percent','%','quarter','fiscal','rose','fell','surged','dropped','shares','dividend','buyback','forecast','upgraded','downgraded']
  const best = sents.reduce((best, s) => {
    const sl = s.toLowerCase()
    const sc = kws.filter(k => sl.includes(k)).length * 2 + (s.length > 80 && s.length < 200 ? 1 : 0)
    return sc > best.score ? { s, score: sc } : best
  }, { s: sents[0], score: 0 }).s
  return best.length > 200 ? best.slice(0, 200).replace(/\s\S+$/, '') + '…' : best
}