/* eslint-disable react-refresh/only-export-components */
import { RefreshCw, AlertCircle, ExternalLink, Building2, Crown, Briefcase, TrendingUp } from 'lucide-react'
import { UsageRing } from './UsageRing'

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

const OVERAGE_COST_PER_REQUEST = 0.04

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatPlan(plan: string): string {
  const planNames: Record<string, string> = {
    enterprise: 'Enterprise',
    business: 'Business',
    individual_pro: 'Pro+',
    individual: 'Pro',
    free: 'Free',
  }
  return planNames[plan] || plan
}

function PlanIcon({ plan }: { plan: string }) {
  if (plan === 'enterprise') return <Building2 size={13} />
  if (plan === 'business') return <Briefcase size={13} />
  return <Crown size={13} />
}

function formatResetDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntilReset(dateStr: string) {
  const resetDate = new Date(dateStr)
  const now = new Date()
  const diff = resetDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export interface AccountQuotaCardProps {
  account: { username: string }
  state: AccountQuotaState | undefined
}

export interface Projection {
  projectedTotal: number
  projectedOverage: number
  projectedOverageCost: number
  projectedPercent: number
  dailyRate: number
}

export function computeProjection(
  premium: QuotaSnapshot,
  resetDateStr: string
): Projection | null {
  // All billing math in UTC to match GitHub Copilot billing cycle
  const resetDate = new Date(resetDateStr)
  const nowMs = Date.now()

  // Estimate billing period start (1 month before reset) in UTC
  const periodStart = new Date(Date.UTC(
    resetDate.getUTCFullYear(),
    resetDate.getUTCMonth() - 1,
    resetDate.getUTCDate(),
    resetDate.getUTCHours(),
    resetDate.getUTCMinutes()
  ))
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
  const projectedPercent = premium.entitlement > 0
    ? (projectedTotal / premium.entitlement) * 100
    : 0

  return { projectedTotal, projectedOverage, projectedOverageCost, projectedPercent, dailyRate }
}

export { OVERAGE_COST_PER_REQUEST, formatCurrency }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AccountQuotaCard({ account, state }: any) {
  const data = state?.data
  const premium = data?.quota_snapshots?.premium_interactions
  const percentUsed = premium ? 100 - premium.percent_remaining : 0
  const used = premium ? premium.entitlement - premium.remaining : 0
  const total = premium?.entitlement ?? 0
  const overageByCount = Math.max(0, premium?.overage_count ?? 0)
  const overageByRemaining = Math.max(0, -(premium?.remaining ?? 0))
  const overageRequests = Math.max(overageByCount, overageByRemaining)
  const overageCost = overageRequests * OVERAGE_COST_PER_REQUEST

  const projection = data && premium
    ? computeProjection(premium, data.quota_reset_date_utc)
    : null

  return (
    <div className="usage-account-card">
      {state?.loading && !data && (
        <div className="usage-account-loading">
          <RefreshCw size={16} className="spin" />
          <span>Loading...</span>
        </div>
      )}

      {state?.error && !data && (
        <div className="usage-account-error">
          <AlertCircle size={16} />
          <div>
            <strong>{account.username}</strong>
            <p>{state.error.includes('404') ? 'No Copilot subscription' : 'Failed to load'}</p>
          </div>
        </div>
      )}

      {data && premium && (
        <>
          <div className="usage-account-header">
            <div className="usage-account-identity">
              <span className="usage-account-name">{data.login}</span>
              <span className="usage-account-plan">
                <PlanIcon plan={data.copilot_plan} />
                {formatPlan(data.copilot_plan)}
              </span>
            </div>
            {state?.loading && <RefreshCw size={12} className="spin" />}
          </div>

          <div className="usage-account-body">
            <UsageRing percentUsed={percentUsed} projectedPercent={projection?.projectedPercent} size={110} strokeWidth={9} />
            <div className="usage-account-stats">
              <div className="usage-stat">
                <span className="usage-stat-value">{used.toLocaleString()}</span>
                <span className="usage-stat-label">Used</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-value">{premium.remaining.toLocaleString()}</span>
                <span className="usage-stat-label">Remaining</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-value">{total.toLocaleString()}</span>
                <span className="usage-stat-label">Entitlement</span>
              </div>
              {overageRequests > 0 && (
                <div className="usage-stat usage-stat-overage">
                  <span className="usage-stat-value">{formatCurrency(overageCost)}</span>
                  <span className="usage-stat-label">Overage Cost</span>
                </div>
              )}
            </div>
          </div>

          {projection && (
            <div className="usage-projection">
              <div className="usage-projection-header">
                <TrendingUp size={12} />
                <span>Month-End Projection</span>
              </div>
              <div className="usage-projection-stats">
                <div className="usage-projection-stat">
                  <span className="usage-projection-value">{projection.projectedTotal.toLocaleString()}</span>
                  <span className="usage-projection-label">Projected</span>
                </div>
                <div className="usage-projection-stat">
                  <span className="usage-projection-value">{Math.round(projection.dailyRate).toLocaleString()}</span>
                  <span className="usage-projection-label">Per Day</span>
                </div>
                {projection.projectedOverage > 0 && (
                  <div className="usage-projection-stat usage-projection-overage">
                    <span className="usage-projection-value">{formatCurrency(projection.projectedOverageCost)}</span>
                    <span className="usage-projection-label">Est. Overage</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="usage-account-footer">
            <div className="usage-account-reset">
              Resets {formatResetDate(data.quota_reset_date_utc)}
              <span className="usage-reset-days">({daysUntilReset(data.quota_reset_date_utc)}d)</span>
            </div>
            <div className="usage-account-links">
              {state?.fetchedAt && (
                <span className="usage-fetched-at">{formatTime(state.fetchedAt)}</span>
              )}
              <button
                className="usage-link-btn"
                onClick={() => window.shell.openExternal('https://github.com/settings/copilot')}
                title="Open Copilot settings on GitHub"
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </div>

          {data.organization_login_list.length > 0 && (
            <div className="usage-account-orgs">
              <Building2 size={11} />
              <span>{data.organization_login_list.join(', ')}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
