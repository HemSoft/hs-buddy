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
}

export interface AccountQuotaState {
  data: QuotaData | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

export interface Projection {
  projectedTotal: number
  projectedOverage: number
  projectedOverageCost: number
  projectedPercent: number
  dailyRate: number
}

export const OVERAGE_COST_PER_REQUEST = 0.04

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
  const dailyRate = ratePerSecond * 86400
  const projectedOverage = Math.max(0, projectedTotal - premium.entitlement)
  const projectedOverageCost = projectedOverage * OVERAGE_COST_PER_REQUEST
  const projectedPercent =
    premium.entitlement > 0 ? (projectedTotal / premium.entitlement) * 100 : 0

  return { projectedTotal, projectedOverage, projectedOverageCost, projectedPercent, dailyRate }
}

export function getQuotaColor(pct: number | null): string {
  if (pct === null) return '#4ec9b0'
  if (pct >= 90) return '#e85d5d'
  if (pct >= 75) return '#e89b3c'
  if (pct >= 50) return '#dcd34a'
  return '#4ec9b0'
}
