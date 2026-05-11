/**
 * PULSE AI Brief — Anthropic Claude (Haiku) serverless endpoint
 * POST /api/ai  { ticker, company, score, verdict, pe, growth, rsi, ma50,
 *                 price, weekHigh52, weekLow52, beatRate, beatStreak,
 *                 analystBull, insiderNet, earningsDate, sector, headlines[] }
 * Returns: { summary: "..." }
 *
 * Add ANTHROPIC_KEY to Vercel environment variables to enable.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.ANTHROPIC_KEY
  if (!key) {
    return res.status(503).json({ error: 'AI not configured — add ANTHROPIC_KEY to Vercel env vars' })
  }

  const {
    ticker       = '',
    company      = ticker,
    score        = null,
    verdict      = '',
    pe           = null,
    growth       = null,
    rsi          = null,
    ma50         = null,
    price        = null,
    weekHigh52   = null,
    weekLow52    = null,
    beatRate     = null,
    beatStreak   = null,
    analystBull  = null,
    insiderNet   = null,
    earningsDate = null,
    sector       = '',
    headlines    = [],
  } = req.body || {}

  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const priceRange  = weekHigh52 && weekLow52 ? `52W $${weekLow52}–$${weekHigh52}` : 'range N/A'
  const maPosition  = price && ma50 ? `${price > ma50 ? 'above' : 'below'} MA50 at $${ma50}` : 'MA50 N/A'
  const newsLine    = headlines.slice(0, 3).join(' | ') || 'none'
  const insiderLine = insiderNet != null
    ? (insiderNet > 0 ? `net buying (+${insiderNet} transactions)` : `net selling (${insiderNet} transactions)`)
    : 'data unavailable'

  const prompt = `You are an elite equity analyst writing for a sophisticated retail investor. Analyze ${ticker} (${company}${sector ? ', ' + sector : ''}).

DATA:
- PULSE Score: ${score ?? '?'}/100 — ${verdict || 'N/A'}
- Price: $${price ?? '?'} | ${priceRange} | ${maPosition}
- RSI-14: ${rsi ?? '?'} | P/E: ${pe ?? '?'}x | Revenue growth YoY: ${growth != null ? (growth > 0 ? '+' : '') + growth + '%' : '?'}
- Earnings beat rate: ${beatRate != null ? beatRate + '%' : '?'} | Beat streak: ${beatStreak != null ? beatStreak + ' consecutive quarters' : '?'}
- Analyst consensus: ${analystBull != null ? analystBull + '% bullish' : '?'} | Insider activity: ${insiderLine}
- Next catalyst: ${earningsDate ? 'earnings ' + earningsDate : 'no upcoming earnings in 60 days'}
- Recent news: ${newsLine}

Write exactly 5 sentences of plain prose. Each sentence must do exactly one job in this order:
1. The specific catalyst or factor driving the signal RIGHT NOW — name the actual driver, be precise.
2. The technical picture: price vs MA50, RSI reading and what it signals, momentum direction.
3. The strongest single fundamental reason to be bullish OR bearish — pick a side, be direct.
4. The single biggest risk in the next 30–60 days — be specific about what could go wrong, not generic.
5. One actionable insight: name a specific price level that matters, what would confirm or break the thesis, or what to watch next.

Rules: plain prose only, no markdown, no headings, no bold, no asterisks, no bullets, no disclaimers, no "I" or "we", no "note that", no "it is worth". Output exactly 5 sentences of plain text.`

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!upstream.ok) {
      const txt = await upstream.text()
      console.error('Anthropic error:', upstream.status, txt.slice(0, 200))
      return res.status(upstream.status).json({ error: 'AI request failed' })
    }

    const data    = await upstream.json()
    const summary = data.content?.[0]?.text?.trim() || ''

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(200).json({ summary })

  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'AI timeout' })
    return res.status(500).json({ error: 'AI error' })
  }
}
