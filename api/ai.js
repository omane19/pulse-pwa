/**
 * PULSE AI Summary — Anthropic Claude (Haiku) serverless endpoint
 * POST /api/ai  { ticker, company, score, verdict, pe, growth, headlines[] }
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
    ticker    = '',
    company   = ticker,
    score     = null,
    verdict   = '',
    pe        = null,
    growth    = null,
    maxDD     = null,
    headlines = [],
    sector    = '',
  } = req.body || {}

  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const newsLine = headlines.slice(0, 3).join(' | ') || 'no recent news'
  const prompt = [
    `Summarize ${ticker} (${company}${sector ? ', ' + sector : ''}) in 2 sentences for a retail investor.`,
    `PULSE Score: ${score ?? '?'}/100 — ${verdict || 'N/A'}.`,
    pe     != null ? `P/E: ${pe}×.`                    : '',
    growth != null ? `Revenue growth: ${growth > 0 ? '+' : ''}${growth}%.` : '',
    maxDD  != null ? `Max drawdown: ${maxDD}%.`         : '',
    `Recent news: ${newsLine}.`,
    `Be direct and specific. No disclaimers. No "I" or "we".`,
  ].filter(Boolean).join(' ')

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':          key,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 180,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!upstream.ok) {
      const txt = await upstream.text()
      console.error('Anthropic error:', upstream.status, txt.slice(0, 200))
      return res.status(upstream.status).json({ error: 'AI request failed' })
    }

    const data = await upstream.json()
    const summary = data.content?.[0]?.text?.trim() || ''

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(200).json({ summary })

  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'AI timeout' })
    return res.status(500).json({ error: 'AI error' })
  }
}
