import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '../public/data/0050-monthly.json')

const SYMBOL = '0050.TW'
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

const period2 = Math.floor(Date.now() / 1000)
const period1 = period2 - 20 * 365 * 24 * 60 * 60
const url = `${YAHOO_CHART}/${SYMBOL}?period1=${period1}&period2=${period2}&interval=1d`

const res = await fetch(url, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
})

if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
const json = await res.json()

const result = json.chart?.result?.[0]
const timestamps = result?.timestamp ?? []
const closes = result?.indicators?.quote?.[0]?.close ?? []

const daily = []
for (let i = 0; i < timestamps.length; i++) {
  const close = closes[i]
  if (close == null || Number.isNaN(close)) continue
  daily.push({
    date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
    close,
  })
}

if (!daily.length) throw new Error('Yahoo returned empty data')

const byMonth = new Map()
for (const row of daily) {
  const ym = row.date.slice(0, 7)
  byMonth.set(ym, row.close)
}

const prices = [...byMonth.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([ym, close]) => ({ date: `${ym}-01`, close }))

const returns = []
for (let i = 1; i < prices.length; i++) {
  const prev = prices[i - 1].close
  const curr = prices[i].close
  returns.push({
    date: prices[i].date,
    monthlyReturn: (curr - prev) / prev,
  })
}

const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  source: 'Yahoo Finance',
  prices,
  returns,
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(payload))
console.log(`Wrote ${prices.length} months to ${outPath}`)
