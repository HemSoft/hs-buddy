export interface QuotaSnapshot {
  entitlement: number
  overage_count: number
  overage_permitted: boolean
  percent_remaining: number
  quota_id: string
  quota_remaining: number
  remaining: number
  unlimited: boolean
  timestamp_utc: string
}

export interface QuotaData {
  login: string
  copilot_plan: string
  quota_reset_date: string
  quota_reset_date_utc: string
  organization_login_list: string[]
  quota_snapshots: {
    chat: QuotaSnapshot
    completions: QuotaSnapshot
    premium_interactions: QuotaSnapshot
  }
  /** Gross AI Credit value consumed this period (list price). Present for synthesized org-pool data. */
  grossCost?: number
  /** Net billed amount this period ($0 while within the included allotment). */
  netCost?: number
}

export interface AccountQuotaState {
  data: QuotaData | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

interface Projection {
  projectedTotal: number
  projectedOverage: number
  projectedOverageCost: number
  projectedPercent: number
  dailyRate: number
}

/**
 * AI Credit overage rate under June 2026 usage-based billing: $0.01 per credit.
 * (Replaced the pre-June Premium Request rate of $0.04 per request.)
 */
export const OVERAGE_COST_PER_CREDIT = 0.01
const SECONDS_PER_DAY = 86_400

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function computeProjection(premium: QuotaSnapshot, resetDateStr: string): Projection | null {
  // All billing math in UTC to match GitHub Copilot billing cycle
  const resetDate = new Date(resetDateStr)
  const nowMs = Date.now()

  // Estimate billing period start (1 month before reset) in UTC
  const periodStart = new Date(
    Date.UTC(
      resetDate.getUTCFullYear(),
      resetDate.getUTCMonth() - 1,
      resetDate.getUTCDate(),
      resetDate.getUTCHours(),
      resetDate.getUTCMinutes()
    )
  )
  // Handle month-length overflow: e.g. Mar 31 → "Feb 31" → rolls to Mar 3
  if (periodStart.getUTCMonth() === resetDate.getUTCMonth()) {
    periodStart.setUTCDate(0) // clamp to last day of intended month
  }

  const totalMs = resetDate.getTime() - periodStart.getTime()
  const elapsedMs = nowMs - periodStart.getTime()
  const elapsedSeconds = elapsedMs / 1000
  const totalSeconds = totalMs / 1000

  // Need at least 1 second of elapsed time
  if (elapsedSeconds < 1) return null

  const used = premium.entitlement - premium.remaining
  const ratePerSecond = used / elapsedSeconds
  const projectedTotal = Math.round(ratePerSecond * totalSeconds)
  const dailyRate = ratePerSecond * SECONDS_PER_DAY
  const projectedOverage = Math.max(0, projectedTotal - premium.entitlement)
  const projectedOverageCost = projectedOverage * OVERAGE_COST_PER_CREDIT
  const projectedPercent =
    premium.entitlement > 0 ? (projectedTotal / premium.entitlement) * 100 : 0

  return { projectedTotal, projectedOverage, projectedOverageCost, projectedPercent, dailyRate }
}

interface BudgetProjection {
  projectedSpend: number
  dailySpendRate: number
}

/**
 * Projects org-level budget spending to month-end based on elapsed billing period.
 * Returns null when the billing period hasn't started, has already ended,
 * or when there's zero spend to project from.
 */
function isWithinBillingPeriod(asOfMs: number, periodStart: Date, periodEnd: Date): boolean {
  return asOfMs >= periodStart.getTime() && asOfMs < periodEnd.getTime()
}

export function computeBudgetProjection(
  spent: number,
  billingYear: number,
  billingMonth: number,
  asOfMs: number = Date.now()
): BudgetProjection | null {
  if (spent <= 0) return null

  const periodStart = new Date(Date.UTC(billingYear, billingMonth - 1, 1))
  const periodEnd = new Date(Date.UTC(billingYear, billingMonth, 1))

  if (!isWithinBillingPeriod(asOfMs, periodStart, periodEnd)) return null

  const totalMs = periodEnd.getTime() - periodStart.getTime()
  const elapsedMs = asOfMs - periodStart.getTime()

  if (elapsedMs < 1000) return null

  const fractionElapsed = elapsedMs / totalMs
  const dailySpendRate = (spent / elapsedMs) * 86_400_000
  const projectedSpend = spent / fractionElapsed

  return { projectedSpend, dailySpendRate }
}

export function getQuotaColor(pct: number | null): string {
  if (pct === null) return '#4ec9b0'
  if (pct >= 90) return '#e85d5d'
  if (pct >= 75) return '#e89b3c'
  if (pct >= 50) return '#dcd34a'
  return '#4ec9b0'
}

/**
 * AI Credits included per seat per billing month.
 * GitHub's promotional allotment is 7,000 for 2026-06..2026-08, otherwise 3,900.
 */
export function creditsPerSeat(year: number, month: number): number {
  if (year === 2026 && month >= 6 && month <= 8) return 7000
  return 3900
}

/** Total AI Credit allotment for an org = seats × per-seat credits (rounded). */
export function computeCreditAllotment(seats: number, year: number, month: number): number {
  return Math.round(seats * creditsPerSeat(year, month))
}

/** Org-pool AI Credit metrics sourced from the live billing/usage endpoint. */
export interface OrgPoolMetrics {
  login: string
  plan: string
  org: string
  usedCredits: number
  grossCost: number
  netCost: number
  seats: number
  billingYear: number
  billingMonth: number
}

const UNLIMITED_SNAPSHOT: QuotaSnapshot = {
  entitlement: 0,
  overage_count: 0,
  overage_permitted: false,
  percent_remaining: 100,
  quota_id: '',
  quota_remaining: 0,
  remaining: 0,
  unlimited: true,
  timestamp_utc: '',
}

/** First day of the month after the given (1-based) billing month, in UTC ISO form. */
function firstOfNextMonthUtc(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString()
}

/**
 * Build a `QuotaData` from org-pool AI Credit metrics so the existing account
 * card, projection, and aggregate consumers (all of which derive
 * `used = entitlement - remaining`) render correct numbers under AI Credits billing.
 */
export function synthesizeQuotaData(m: OrgPoolMetrics): QuotaData {
  const allotment = computeCreditAllotment(m.seats, m.billingYear, m.billingMonth)
  const used = Math.round(m.usedCredits)
  const remaining = allotment - used
  const overage = Math.max(0, used - allotment)
  const percentRemaining =
    allotment > 0 ? Math.max(0, (remaining / allotment) * 100) : used > 0 ? 0 : 100
  const resetUtc = firstOfNextMonthUtc(m.billingYear, m.billingMonth)

  return {
    login: m.login,
    copilot_plan: m.plan,
    quota_reset_date: resetUtc.slice(0, 10),
    quota_reset_date_utc: resetUtc,
    organization_login_list: m.org ? [m.org] : [],
    grossCost: m.grossCost,
    netCost: m.netCost,
    quota_snapshots: {
      chat: UNLIMITED_SNAPSHOT,
      completions: UNLIMITED_SNAPSHOT,
      premium_interactions: {
        entitlement: allotment,
        overage_count: overage,
        overage_permitted: true,
        percent_remaining: percentRemaining,
        quota_id: 'premium_interactions',
        quota_remaining: remaining,
        remaining,
        unlimited: false,
        timestamp_utc: new Date().toISOString(),
      },
    },
  }
}
