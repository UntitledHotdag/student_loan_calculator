import { toYearMonth } from './format'
import {
  getCloseForMonth,
  getCutoverDate,
  getLatestClose,
  getReturnForMonth,
  isPastMonth,
  type MonthlyPrice,
  type MonthlyReturn,
} from './data-0050'

export interface InvestInputs {
  startDate: Date
  aggressiveMonths: number
  horizonMonths: number
  monthlySurplus: number
  returns: MonthlyReturn[]
  projectedMonthlyReturn: number
  projectedAnnualReturn: number
}

export interface InvestMonth {
  monthIndex: number
  contribution: number
  returnRate: number
  portfolioAfter: number
  phase: 'past' | 'future'
}

export interface InvestSegment {
  contributed: number
  monthCount: number
  portfolioAtCutover?: number
  projectedGain?: number
  periodStart?: string
  periodEnd?: string
}

export interface HoldingsAsOfToday {
  monthsInvested: number
  totalContributed: number
  estimatedUnits: number
  currentValue: number
  latestPriceDate: string
  compoundedValue: number
}

export interface Compute0050AsOfTodayInputs {
  startDate: Date
  aggressiveMonths: number
  monthlySurplus: number
  prices: MonthlyPrice[]
  returns: MonthlyReturn[]
}

export function compute0050AsOfToday(
  inputs: Compute0050AsOfTodayInputs,
): HoldingsAsOfToday {
  const { startDate, aggressiveMonths, monthlySurplus, prices, returns } = inputs
  const cutover = getCutoverDate()
  const contribution = monthlySurplus > 0 ? monthlySurplus : 0

  let totalContributed = 0
  let estimatedUnits = 0
  let compoundedValue = 0
  let monthsInvested = 0

  for (let i = 0; i < aggressiveMonths; i++) {
    const paymentDate = new Date(startDate)
    paymentDate.setMonth(paymentDate.getMonth() + i)
    if (!isPastMonth(paymentDate, cutover)) break

    const ym = toYearMonth(paymentDate)
    const close = getCloseForMonth(prices, ym)
    const returnRate = getReturnForMonth(returns, ym)

    totalContributed += contribution
    if (close > 0) {
      estimatedUnits += contribution / close
    }
    compoundedValue = (compoundedValue + contribution) * (1 + returnRate)
    monthsInvested++
  }

  const latest = getLatestClose(prices)
  const currentValue = estimatedUnits * latest.close

  return {
    monthsInvested,
    totalContributed,
    estimatedUnits,
    currentValue,
    latestPriceDate: latest.date,
    compoundedValue,
  }
}

export interface InvestResult {
  portfolioValue: number
  totalContributed: number
  projectedAnnualReturn: number
  cutoverLabel: string
  past: InvestSegment
  future: InvestSegment
  months: InvestMonth[]
}

export function simulateInvestment(inputs: InvestInputs): InvestResult {
  const {
    startDate,
    aggressiveMonths,
    monthlySurplus,
    returns,
    projectedMonthlyReturn,
    projectedAnnualReturn,
  } = inputs

  const cutover = getCutoverDate()
  const cutoverLabel = `${cutover.getFullYear()}-${String(cutover.getMonth() + 1).padStart(2, '0')}`

  let portfolio = 0
  let totalContributed = 0
  let pastContributed = 0
  let futureContributed = 0
  let pastMonthCount = 0
  let futureMonthCount = 0
  let portfolioAtCutover = 0
  let pastPeriodStart: string | undefined
  let pastPeriodEnd: string | undefined
  let futurePeriodStart: string | undefined
  let futurePeriodEnd: string | undefined

  const months: InvestMonth[] = []
  const contribution = monthlySurplus > 0 ? monthlySurplus : 0
  const investMonths = aggressiveMonths

  for (let i = 0; i < investMonths; i++) {
    const paymentDate = new Date(startDate)
    paymentDate.setMonth(paymentDate.getMonth() + i)
    const ym = toYearMonth(paymentDate)
    const isPast = isPastMonth(paymentDate, cutover)
    const returnRate = isPast
      ? getReturnForMonth(returns, ym)
      : projectedMonthlyReturn
    const phase = isPast ? 'past' : 'future'

    if (isPast) {
      pastMonthCount++
      pastContributed += contribution
      if (!pastPeriodStart) pastPeriodStart = ym
      pastPeriodEnd = ym
    } else {
      futureMonthCount++
      futureContributed += contribution
      if (!futurePeriodStart) futurePeriodStart = ym
      futurePeriodEnd = ym
    }

    portfolio = (portfolio + contribution) * (1 + returnRate)
    totalContributed += contribution

    if (isPast) {
      portfolioAtCutover = portfolio
    }

    months.push({
      monthIndex: i + 1,
      contribution,
      returnRate,
      portfolioAfter: portfolio,
      phase,
    })
  }

  const futureProjectedGain =
    futureMonthCount > 0
      ? portfolio - portfolioAtCutover - futureContributed
      : 0

  return {
    portfolioValue: portfolio,
    totalContributed,
    projectedAnnualReturn,
    cutoverLabel,
    past: {
      contributed: pastContributed,
      monthCount: pastMonthCount,
      portfolioAtCutover:
        pastMonthCount > 0 ? portfolioAtCutover : 0,
      periodStart: pastPeriodStart,
      periodEnd: pastPeriodEnd,
    },
    future: {
      contributed: futureContributed,
      monthCount: futureMonthCount,
      projectedGain: futureProjectedGain,
      periodStart: futurePeriodStart,
      periodEnd: futurePeriodEnd,
    },
    months,
  }
}
