import './styles/main.css'
import { load0050Data, getCutoverDate, type Loaded0050Data } from './lib/data-0050'
import { formatDate, formatNTD, formatPercent } from './lib/format'
import {
  compute0050AsOfToday,
  simulateInvestment,
  type HoldingsAsOfToday,
} from './lib/invest'
import {
  buildSchedule,
  getRepaymentProgressAsOfToday,
  validatePlans,
  type RepaymentProgress,
} from './lib/loan'

interface AppState {
  dataLabel: string
  dataReady: boolean
}

const state: AppState = {
  dataLabel: '載入中…',
  dataReady: false,
}

let cachedData: Loaded0050Data | null = null

function renderShell(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <header class="hero">
      <h1>學貸還款 vs 0050 投資試算</h1>
      <p>比較「盡快還清」與「最長分期＋把差額投入元大台灣50」的差異</p>
    </header>
    <div class="layout">
      <section class="card">
        <h2>貸款資訊</h2>
        <form id="calc-form" class="form-grid">
          <div class="field">
            <label for="principal">貸款金額（新台幣）</label>
            <input id="principal" name="principal" type="number" inputmode="decimal" min="1" value="500000" required />
          </div>
          <div class="field">
            <label for="start-date">開始還款日</label>
            <input id="start-date" name="startDate" type="date" required />
          </div>
          <div class="field">
            <label for="rate">年利率（%）</label>
            <input id="rate" name="rate" type="number" inputmode="decimal" min="0" step="0.01" value="2" required />
          </div>
          <h2 style="margin:0.5rem 0 0; grid-column:1/-1; font-size:1rem;">還款方案</h2>
          <div class="field">
            <label for="installments">積極還款期數（月）</label>
            <input id="installments" name="installments" type="number" min="1" step="1" value="60" required />
            <p class="hint">愈少期數，每月還款愈高、總利息愈少</p>
          </div>
          <div class="field">
            <label for="semesters">貸款學期數</label>
            <input id="semesters" name="semesters" type="number" min="1" step="1" value="8" required />
            <p class="hint">最長分期 = 學期數 × 12（就學貸款常見：一學期對應一年）</p>
          </div>
          <p id="max-months-hint" class="hint" style="grid-column:1/-1; margin:0;"></p>
          <button type="submit" class="btn-primary" id="submit-btn">開始試算</button>
        </form>
        <div id="form-error" class="error-banner" hidden></div>
      </section>
      <section id="results" class="results-panel hidden">
        <div class="loading" id="results-loading">計算中…</div>
        <div id="results-content" hidden></div>
      </section>
    </div>
    <footer class="disclaimer">
      <strong>免責聲明：</strong>本工具僅供教育與試算，不構成投資、稅務或貸款建議。0050 歷史報酬不代表未來績效；未來區間採過去 10 年 CAGR 估算，非保證報酬。實際還款條件請以承貸銀行與就學貸款辦法為準。
    </footer>
  `

  const startInput = document.getElementById('start-date') as HTMLInputElement
  const pastDefault = new Date()
  pastDefault.setFullYear(pastDefault.getFullYear() - 2)
  startInput.value = pastDefault.toISOString().slice(0, 10)

  const semestersInput = document.getElementById('semesters') as HTMLInputElement
  const updateHint = () => {
    const s = Number(semestersInput.value) || 0
    const hint = document.getElementById('max-months-hint')!
    hint.textContent = `最長分期：${s * 12} 期（${s} 學期 × 12 個月）`
  }
  semestersInput.addEventListener('input', updateHint)
  updateHint()

  document.getElementById('calc-form')!.addEventListener('submit', (e) => {
    e.preventDefault()
    runCalculation()
  })
}

function renderResults(content: string): void {
  const panel = document.getElementById('results')!
  const loading = document.getElementById('results-loading')!
  const resultsContent = document.getElementById('results-content')!
  panel.classList.remove('hidden')
  loading.hidden = true
  resultsContent.hidden = false
  resultsContent.innerHTML = content
}

function showError(message: string): void {
  const el = document.getElementById('form-error')!
  el.textContent = message
  el.hidden = false
}

function clearError(): void {
  const el = document.getElementById('form-error')!
  el.hidden = true
}

function statBlock(label: string, value: string): string {
  return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`
}

function heroMetric(label: string, value: string, hint?: string): string {
  return `
    <div class="hero-metric">
      <div class="hero-metric-label">${label}</div>
      <div class="hero-metric-value">${value}</div>
      ${hint ? `<div class="hero-metric-hint">${hint}</div>` : ''}
    </div>`
}

function isStartDateInPast(startDate: Date): boolean {
  const cutover = getCutoverDate()
  const startMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    1,
  )
  return startMonth < cutover
}

function formatUnits(units: number): string {
  if (units <= 0) return '0'
  if (units >= 100) return units.toFixed(1)
  return units.toFixed(2)
}

function renderCompareAsOfToday(
  loan: RepaymentProgress,
  holdings: HoldingsAsOfToday,
  monthlySurplus: number,
  investFutureHint: string,
): string {
  const remainingTotal = loan.remainingBalance + loan.remainingPayments

  return `
    <div class="compare-dual">
      <div class="compare-pillar compare-pillar-loan">
        <h3>貸款進度（最長分期）</h3>
        <p class="hint">截至今日已完成的還款期數：${loan.monthsPaid} 期</p>
        <div class="hero-metrics">
          ${heroMetric('至今已還', formatNTD(loan.paidToDate), `其中本金 ${formatNTD(loan.principalPaidToDate)}`)}
          ${heroMetric('尚須還款', formatNTD(remainingTotal), `剩餘本金 ${formatNTD(loan.remainingBalance)}，尚餘 ${loan.remainingMonths} 期`)}
        </div>
      </div>
      <div class="compare-pillar compare-pillar-stock">
        <h3>0050 投資現況（差額投入）</h3>
        <p class="hint">每月投入差額 ${formatNTD(monthlySurplus)}，已過月份依 0050 收盤價估算</p>
        <div class="hero-metrics">
          ${heroMetric('累積投入', formatNTD(holdings.totalContributed), `已投入 ${holdings.monthsInvested} 個月`)}
          ${heroMetric('今日現值', formatNTD(holdings.currentValue), `約 ${formatUnits(holdings.estimatedUnits)} 單位（${holdings.latestPriceDate.slice(0, 7)} 收盤價）`)}
        </div>
        <p class="hint compare-footnote">${investFutureHint}</p>
      </div>
    </div>
  `
}

function renderCompareEmpty(): string {
  return `
    <div class="compare-empty">
      <p>請將<strong>開始還款日</strong>設在今天以前，以查看「至今已還／尚須還款」與「0050 累積投入／今日現值」。</p>
    </div>
  `
}

function runCalculation(): void {
  clearError()

  const principal = Number((document.getElementById('principal') as HTMLInputElement).value)
  const rate = Number((document.getElementById('rate') as HTMLInputElement).value)
  const installments = Number((document.getElementById('installments') as HTMLInputElement).value)
  const semesters = Number((document.getElementById('semesters') as HTMLInputElement).value)
  const startDate = new Date((document.getElementById('start-date') as HTMLInputElement).value)

  const maxMonths = semesters * 12
  const validationError = validatePlans(installments, maxMonths)
  if (validationError) {
    showError(validationError)
    return
  }

  if (!state.dataReady || !cachedData) {
    showError('0050 資料尚未載入完成，請稍候再試。')
    return
  }

  const loanBase = { principal, annualRatePercent: rate, startDate }
  const planA = buildSchedule({ ...loanBase, months: installments })
  const planB = buildSchedule({ ...loanBase, months: maxMonths })

  const monthlySurplus = planA.monthlyPayment - planB.monthlyPayment
  const startInPast = isStartDateInPast(startDate)

  const loanProgress = getRepaymentProgressAsOfToday(planB.schedule, principal)
  const holdings = compute0050AsOfToday({
    startDate,
    aggressiveMonths: installments,
    monthlySurplus,
    prices: cachedData.prices,
    returns: cachedData.returns,
  })

  const invest = simulateInvestment({
    startDate,
    aggressiveMonths: installments,
    horizonMonths: maxMonths,
    monthlySurplus,
    returns: cachedData.returns,
    projectedMonthlyReturn: cachedData.projectedMonthlyReturn,
    projectedAnnualReturn: cachedData.projectedAnnualReturn,
  })

  const futureHint =
    invest.future.monthCount > 0
      ? `預估未來（${invest.future.monthCount} 期）再投入約 ${formatNTD(invest.future.contributed)}，假設年化 ${formatPercent(invest.projectedAnnualReturn)} CAGR。`
      : monthlySurplus <= 0
        ? '積極與最長分期月付相同，無差額可投入 0050。'
        : '投資期皆在過去，無未來預估月份。'

  const compareSection = startInPast
    ? renderCompareAsOfToday(loanProgress, holdings, monthlySurplus, futureHint)
    : renderCompareEmpty()

  renderResults(`
    <div class="card plan-card">
      <h2>方案 A：積極還款（${installments} 期）</h2>
      <div class="stat-grid">
        ${statBlock('每月還款', formatNTD(planA.monthlyPayment))}
        ${statBlock('平均每期', formatNTD(planA.averageInstallment))}
        ${statBlock('總還款金額', formatNTD(planA.totalPaid))}
        ${statBlock('清償日', formatDate(planA.payoffDate))}
      </div>
    </div>
    <div class="card plan-card plan-b">
      <h2>方案 B：最長分期（${maxMonths} 期）</h2>
      <div class="stat-grid">
        ${statBlock('每月還款（最低）', formatNTD(planB.monthlyPayment))}
        ${statBlock('平均每期', formatNTD(planB.averageInstallment))}
        ${statBlock('總還款金額', formatNTD(planB.totalPaid))}
        ${statBlock('清償日', formatDate(planB.payoffDate))}
      </div>
    </div>
    <div class="card compare-card">
      <h2>截至今日：還款 vs 0050 現況</h2>
      <p class="hint">假設採最長分期，並把與積極方案之差額投入 0050（${installments} 個月內）</p>
      ${compareSection}
      <p class="data-source">0050 資料：${state.dataLabel}</p>
    </div>
  `)
}

async function initData(): Promise<void> {
  const data = await load0050Data()
  cachedData = data
  state.dataLabel = data.label
  state.dataReady = true
}

renderShell()
initData().catch(async () => {
  try {
    const data = await load0050Data()
    cachedData = data
    state.dataLabel = data.label
  } catch {
    state.dataLabel = '內建備援（載入失敗）'
  }
  state.dataReady = true
})
