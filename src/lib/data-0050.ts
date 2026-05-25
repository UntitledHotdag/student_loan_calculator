export interface MonthlyPrice {
  date: string
  close: number
}

export interface MonthlyReturn {
  date: string
  monthlyReturn: number
}

export interface Data0050Bundle {
  updatedAt: string
  source: string
  prices: MonthlyPrice[]
  returns: MonthlyReturn[]
}

export type DataSource = 'live' | 'bundled'

export interface Loaded0050Data {
  returns: MonthlyReturn[]
  prices: MonthlyPrice[]
  updatedAt: string
  source: DataSource
  label: string
  projectedAnnualReturn: number
  projectedMonthlyReturn: number
}

const SYMBOL = '0050.TW'
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'
const BUNDLED_URL = `${import.meta.env.BASE_URL}data/0050-monthly.json`
const CAGR_YEARS = 10

const FETCH_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

export function buildReturnsFromDaily(
  daily: { date: string; close: number }[],
): { prices: MonthlyPrice[]; returns: MonthlyReturn[] } {
  const byMonth = new Map<string, number>()
  for (const row of daily) {
    const ym = row.date.slice(0, 7)
    byMonth.set(ym, row.close)
  }

  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, close]) => ({ date: `${ym}-01`, close }))

  const returns: MonthlyReturn[] = []
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1].close
    const curr = months[i].close
    returns.push({
      date: months[i].date,
      monthlyReturn: (curr - prev) / prev,
    })
  }

  return { prices: months, returns }
}

export function computeHistoricalCAGR(
  prices: MonthlyPrice[],
  years = CAGR_YEARS,
): { annualReturn: number; monthlyReturn: number } {
  if (prices.length < 2) {
    return { annualReturn: 0, monthlyReturn: 0 }
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  const end = sorted[sorted.length - 1]
  const cutoff = new Date(end.date)
  cutoff.setFullYear(cutoff.getFullYear() - years)
  const cutoffYm = cutoff.toISOString().slice(0, 7)

  let start = sorted[0]
  for (const row of sorted) {
    if (row.date.slice(0, 7) >= cutoffYm) {
      start = row
      break
    }
  }

  if (start.close <= 0 || end.close <= 0) {
    return { annualReturn: 0, monthlyReturn: 0 }
  }

  const startDate = new Date(start.date)
  const endDate = new Date(end.date)
  const yearFraction =
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

  if (yearFraction <= 0) {
    return { annualReturn: 0, monthlyReturn: 0 }
  }

  const annualReturn = Math.pow(end.close / start.close, 1 / yearFraction) - 1
  const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1
  return { annualReturn, monthlyReturn }
}

function parseYahooChart(json: unknown): { date: string; close: number }[] {
  const chart = json as {
    chart?: {
      result?: Array<{
        timestamp?: number[]
        indicators?: { quote?: Array<{ close?: (number | null)[] }> }
      }>
    }
  }

  const result = chart.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []

  const daily: { date: string; close: number }[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (close == null || Number.isNaN(close)) continue
    daily.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close,
    })
  }
  return daily
}

function buildYahooUrl(period1: number, period2: number): string {
  return `${YAHOO_CHART}/${SYMBOL}?period1=${period1}&period2=${period2}&interval=1d`
}

export async function fetchYahoo0050(
  period1?: number,
  period2?: number,
): Promise<{ prices: MonthlyPrice[]; returns: MonthlyReturn[] }> {
  const p2 = period2 ?? Math.floor(Date.now() / 1000)
  const p1 = period1 ?? p2 - 20 * 365 * 24 * 60 * 60

  const res = await fetch(buildYahooUrl(p1, p2), { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)

  const json = await res.json()
  const daily = parseYahooChart(json)
  if (!daily.length) throw new Error('Yahoo 回傳空資料')

  return buildReturnsFromDaily(daily)
}

function attachCagr(data: {
  prices: MonthlyPrice[]
  returns: MonthlyReturn[]
  updatedAt: string
  source: DataSource
  label: string
}): Loaded0050Data {
  const { annualReturn, monthlyReturn } = computeHistoricalCAGR(data.prices)
  return {
    ...data,
    projectedAnnualReturn: annualReturn,
    projectedMonthlyReturn: monthlyReturn,
  }
}

async function fetchBundled(): Promise<Loaded0050Data> {
  const res = await fetch(BUNDLED_URL)
  if (!res.ok) throw new Error('無法載入內建 0050 資料')
  const bundle = (await res.json()) as Data0050Bundle
  return attachCagr({
    returns: bundle.returns,
    prices: bundle.prices,
    updatedAt: bundle.updatedAt,
    source: 'bundled',
    label: `內建備援（${bundle.source}，更新 ${bundle.updatedAt}）`,
  })
}

async function fetchYahooLive(): Promise<Loaded0050Data> {
  const { prices, returns } = await fetchYahoo0050()
  const lastYm = returns[returns.length - 1]?.date.slice(0, 7) ?? ''
  return attachCagr({
    returns,
    prices,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'live',
    label: `Yahoo Finance ${SYMBOL}（至 ${lastYm}）`,
  })
}

export async function load0050Data(): Promise<Loaded0050Data> {
  try {
    return await fetchYahooLive()
  } catch {
    return fetchBundled()
  }
}

export function getReturnForMonth(
  returns: MonthlyReturn[],
  yearMonth: string,
): number {
  const exact = returns.find((r) => r.date.startsWith(yearMonth))
  if (exact) return exact.monthlyReturn

  const sorted = [...returns].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return 0

  if (yearMonth < sorted[0].date.slice(0, 7)) return sorted[0].monthlyReturn
  const last = sorted[sorted.length - 1]
  if (yearMonth > last.date.slice(0, 7)) return last.monthlyReturn

  let prior = sorted[0]
  for (const row of sorted) {
    if (row.date.slice(0, 7) > yearMonth) break
    prior = row
  }
  return prior.monthlyReturn
}

export function getCutoverDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function isPastMonth(paymentDate: Date, cutover: Date): boolean {
  const paymentMonth = new Date(
    paymentDate.getFullYear(),
    paymentDate.getMonth(),
    1,
  )
  return paymentMonth < cutover
}

export function getCloseForMonth(
  prices: MonthlyPrice[],
  yearMonth: string,
): number {
  const exact = prices.find((p) => p.date.startsWith(yearMonth))
  if (exact) return exact.close

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return 0

  if (yearMonth < sorted[0].date.slice(0, 7)) return sorted[0].close
  const last = sorted[sorted.length - 1]
  if (yearMonth > last.date.slice(0, 7)) return last.close

  let prior = sorted[0]
  for (const row of sorted) {
    if (row.date.slice(0, 7) > yearMonth) break
    prior = row
  }
  return prior.close
}

export function getLatestClose(prices: MonthlyPrice[]): {
  close: number
  date: string
} {
  if (prices.length === 0) return { close: 0, date: '' }
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  const last = sorted[sorted.length - 1]
  return { close: last.close, date: last.date }
}
