import { getCutoverDate } from './data-0050'
import { addMonths } from './format'

export interface LoanInputs {
  principal: number
  annualRatePercent: number
  months: number
  startDate: Date
}

export interface LoanPlan {
  monthlyPayment: number
  totalPaid: number
  averageInstallment: number
  months: number
  payoffDate: Date
  schedule: LoanMonth[]
}

export interface LoanMonth {
  monthIndex: number
  paymentDate: Date
  payment: number
  interest: number
  principal: number
  balance: number
}

export function calcPayment(
  principal: number,
  annualRatePercent: number,
  months: number,
): number {
  if (months <= 0) return 0
  if (principal <= 0) return 0
  const annualRate = annualRatePercent / 100
  if (annualRate === 0) return principal / months

  const r = annualRate / 12
  const factor = Math.pow(1 + r, months)
  return (principal * r * factor) / (factor - 1)
}

export function buildSchedule(inputs: LoanInputs): LoanPlan {
  const { principal, annualRatePercent, months, startDate } = inputs
  const payment = calcPayment(principal, annualRatePercent, months)
  const annualRate = annualRatePercent / 100
  const monthlyRate = annualRate / 12

  let balance = principal
  const schedule: LoanMonth[] = []

  for (let i = 1; i <= months; i++) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate
    const principalPaid = Math.min(payment - interest, balance)
    const actualPayment = interest + principalPaid
    balance = Math.max(0, balance - principalPaid)

    schedule.push({
      monthIndex: i,
      paymentDate: addMonths(startDate, i - 1),
      payment: actualPayment,
      interest,
      principal: principalPaid,
      balance,
    })

    if (balance <= 0.01) break
  }

  const totalPaid = schedule.reduce((sum, row) => sum + row.payment, 0)
  const lastMonth = schedule[schedule.length - 1]

  return {
    monthlyPayment: payment,
    totalPaid,
    averageInstallment: payment,
    months,
    payoffDate: lastMonth?.paymentDate ?? addMonths(startDate, months - 1),
    schedule,
  }
}

export interface RepaymentProgress {
  monthsPaid: number
  paidToDate: number
  principalPaidToDate: number
  remainingBalance: number
  remainingPayments: number
  remainingMonths: number
}

function isPaymentCompleted(paymentDate: Date, cutover: Date): boolean {
  const paymentMonth = new Date(
    paymentDate.getFullYear(),
    paymentDate.getMonth(),
    1,
  )
  return paymentMonth < cutover
}

export function getRepaymentProgressAsOfToday(
  schedule: LoanMonth[],
  initialPrincipal?: number,
): RepaymentProgress {
  const cutover = getCutoverDate()
  const completed = schedule.filter((row) =>
    isPaymentCompleted(row.paymentDate, cutover),
  )
  const future = schedule.filter(
    (row) => !isPaymentCompleted(row.paymentDate, cutover),
  )

  const paidToDate = completed.reduce((sum, row) => sum + row.payment, 0)
  const principalPaidToDate = completed.reduce(
    (sum, row) => sum + row.principal,
    0,
  )
  const remainingPayments = future.reduce((sum, row) => sum + row.payment, 0)
  const lastCompleted = completed[completed.length - 1]
  let remainingBalance = lastCompleted?.balance ?? 0
  if (completed.length === 0) {
    remainingBalance =
      initialPrincipal ??
      (schedule[0] ? schedule[0].balance + schedule[0].principal : 0)
  }

  return {
    monthsPaid: completed.length,
    paidToDate,
    principalPaidToDate,
    remainingBalance,
    remainingPayments,
    remainingMonths: future.length,
  }
}

export function validatePlans(
  aggressiveMonths: number,
  maxMonths: number,
): string | null {
  if (aggressiveMonths <= 0 || maxMonths <= 0) {
    return '分期期數與學期數必須大於 0。'
  }
  if (aggressiveMonths > maxMonths) {
    return `積極還款期數（${aggressiveMonths} 期）不可超過最長分期（${maxMonths} 期 = 學期數 × 12）。`
  }
  return null
}
