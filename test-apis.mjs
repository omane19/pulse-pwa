/**
 * API Test Script — run AFTER starting: npx vercel dev
 * OR paste each fetch() call in browser console at https://intel-pulse.vercel.app
 * Usage: node test-apis.mjs
 *
 * All FMP calls use the stable API (/stable/...) via our proxy
 */

const BASE = 'http://localhost:3000'

async function fmp(path) {
  const url = `${BASE}/api/proxy?provider=fmp&path=${encodeURIComponent(path)}`
  const r = await fetch(url)
  const text = await r.text()
  if (!r.ok) { console.log(`   RAW ERROR (${r.status}):`, text.slice(0, 200)); return { __error: `HTTP ${r.status}` } }
  try {
    const json = JSON.parse(text)
    if (json?.['Error Message'] || json?.error || json?.message) {
      console.log('   FMP ERROR:', (json['Error Message'] || json.error || json.message).slice?.(0, 150) ?? json.error)
    }
    return json
  } catch { console.log('   NOT JSON:', text.slice(0, 150)); return {} }
}

function check(label, data, validate) {
  const ok = validate(data)
  console.log(`${ok ? '✅' : '❌'}  ${label}`)
  if (!ok) console.log('   Response:', JSON.stringify(data).slice(0, 200))
  return ok
}

console.log('\n=== PULSE API TEST (stable endpoints) ===')
console.log('Testing against:', BASE)
console.log('─'.repeat(50))

// ── 1. Historical Price EOD (core of backtest)
console.log('\n[1] HISTORICAL PRICES — stable/historical-price-eod/full')
{
  const from = '2020-01-01', to = '2020-06-30'
  const d = await fmp(`/historical-price-eod/full?symbol=AAPL&from=${from}&to=${to}`)
  const arr = Array.isArray(d) ? d : (d?.historical || [])
  check(`Got ${arr.length} days (expect ~125)`, arr, a => a.length >= 100)
  if (arr.length) {
    console.log(`   Sample: ${arr[0]?.date} → close $${arr[0]?.close}`)
    console.log(`   Fields: ${Object.keys(arr[0]).join(', ')}`)
  }
}

// ── 2. Ratios TTM (P/E, P/B, ROE — what the app actually uses)
console.log('\n[2] RATIOS TTM — stable/ratios-ttm')
{
  const d = await fmp(`/ratios-ttm?symbol=AAPL`)
  const r = Array.isArray(d) ? d[0] : d
  check(`Got ratios object`, r, x => x && (x.peRatioTTM != null || x.priceEarningsRatioTTM != null || x.pbRatioTTM != null))
  if (r && !r.__error) {
    console.log(`   P/E TTM: ${r.peRatioTTM ?? r.priceEarningsRatioTTM ?? 'N/A'}`)
    console.log(`   P/B TTM: ${r.pbRatioTTM ?? r.priceToBookRatioTTM ?? 'N/A'}`)
    console.log(`   ROE TTM: ${r.returnOnEquityTTM ?? 'N/A'}`)
    console.log(`   Fields (first 10): ${Object.keys(r).slice(0, 10).join(', ')}...`)
  }
}

// ── 3. Income Statement Growth (revenue/EPS growth — what app uses for backtest)
console.log('\n[3] INCOME STATEMENT GROWTH — stable/income-statement-growth')
{
  const d = await fmp(`/income-statement-growth?symbol=AAPL&period=annual&limit=5`)
  const arr = Array.isArray(d) ? d : []
  check(`Got ${arr.length} years (expect 5)`, arr, a => a.length >= 1)
  if (arr.length) {
    const r = arr[0]
    console.log(`   Year: ${r.date || r.calendarYear}`)
    console.log(`   Revenue growth: ${r.growthRevenue ?? r.revenueGrowth ?? 'N/A'}`)
    console.log(`   EPS growth: ${r.growthEPS ?? r.epsGrowth ?? r.epsgrowth ?? 'N/A'}`)
  }
}

// ── 4. Earnings Beat/Miss History (app uses /earnings not /earnings-surprises)
console.log('\n[4] EARNINGS HISTORY — stable/earnings')
{
  const d = await fmp(`/earnings?symbol=AAPL&limit=8`)
  const arr = Array.isArray(d) ? d : Array.isArray(d?.earnings) ? d.earnings : []
  check(`Got ${arr.length} quarters (expect 8)`, arr, a => a.length >= 1)
  if (arr.length) {
    const r = arr[0]
    console.log(`   Latest: ${r.date}`)
    console.log(`   Actual EPS: ${r.epsActual ?? r.actual ?? 'N/A'}`)
    console.log(`   Est EPS: ${r.epsEstimated ?? r.estimate ?? 'N/A'}`)
    const beat = (r.epsActual ?? r.actual) > (r.epsEstimated ?? r.estimate)
    console.log(`   Beat? ${beat ? 'YES ✓' : 'MISS ✗'}`)
    console.log(`   Fields: ${Object.keys(r).join(', ')}`)
  }
}

// ── 5. News with Ticker Symbols (app uses /news/stock?symbols=)
console.log('\n[5] STOCK NEWS — stable/news/stock')
{
  const d = await fmp(`/news/stock?symbols=AAPL&limit=5`)
  const arr = Array.isArray(d) ? d : []
  check(`Got ${arr.length} articles (expect 5)`, arr, a => a.length >= 1)
  if (arr.length) {
    const r = arr[0]
    console.log(`   Headline: ${(r.title || r.headline || '').slice(0, 60)}`)
    console.log(`   Symbols field: ${r.symbols ? JSON.stringify(r.symbols).slice(0,80) : 'none'}`)
    console.log(`   Fields: ${Object.keys(r).join(', ')}`)
  }
}

// ── 6. General Market News
console.log('\n[6] GENERAL NEWS — stable/news/latest')
{
  const d = await fmp(`/news/latest?limit=5`)
  const arr = Array.isArray(d) ? d : []
  check(`Got ${arr.length} articles`, arr, a => a.length >= 1)
  if (arr.length) {
    const r = arr[0]
    console.log(`   Headline: ${(r.title || r.headline || '').slice(0, 60)}`)
    const sym = r.symbols || r.tickers || r.affectedStocks
    console.log(`   Tickers present? ${sym ? `YES → ${JSON.stringify(sym).slice(0, 100)}` : 'NO'}`)
  }
}

// ── 7. Reddit/Apewisdom (no API key needed, public)
console.log('\n[7] REDDIT SENTIMENT — Apewisdom (public)')
{
  try {
    const r = await fetch('https://apewisdom.io/api/v1.0/filter/all-stocks/page/1')
    const d = await r.json()
    const results = d?.results || []
    check(`Got ${results.length} stocks`, results, a => a.length >= 1)
    if (results.length) {
      console.log(`   #1: ${results[0].ticker} — ${results[0].mentions} mentions`)
      console.log(`   Fields: ${Object.keys(results[0]).join(', ')}`)
    }
  } catch(e) {
    console.log(`❌  Reddit (Apewisdom): ${e.message}`)
  }
}

// ── 8. Key Metrics TTM (valuation for backtest scoring)
console.log('\n[8] KEY METRICS TTM — stable/key-metrics-ttm')
{
  const d = await fmp(`/key-metrics-ttm?symbol=AAPL`)
  const r = Array.isArray(d) ? d[0] : d
  check(`Got key metrics`, r, x => x && Object.keys(x).length > 3)
  if (r && !r.__error) {
    console.log(`   EV/EBITDA: ${r.evToEbitdaTTM ?? 'N/A'}`)
    console.log(`   FCF Yield: ${r.freeCashFlowYieldTTM ?? 'N/A'}`)
    console.log(`   Fields (first 10): ${Object.keys(r).slice(0, 10).join(', ')}...`)
  }
}

console.log('\n' + '─'.repeat(50))
console.log('Done.\n')
