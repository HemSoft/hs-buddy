import { Building2, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react'
import { formatCurrency, getQuotaColor, computeBudgetProjection } from './quotaUtils'
import type { OrgBudgetState } from './types'
import { formatTime } from '../../utils/dateUtils'

interface OrgBudgetsSectionProps {
  uniqueOrgs: Map<string, string>
  orgBudgets: Record<string, OrgBudgetState>
  orgOverageFromQuotas: Map<string, number>
}

interface BudgetCardMetrics {
  effectiveBudget: number | null
  displaySpent: number
  myShare: number
  pct: number | null
  mySharePct: number | null
  barColor: string
}

function resolveEffectiveBudget(d: NonNullable<OrgBudgetState['data']>): number | null {
  return d.budgetAmount ?? null
}

function clampPct(value: number, budget: number): number {
  return Math.min((value / budget) * 100, 100)
}

function computeBudgetCardMetrics(
  d: NonNullable<OrgBudgetState['data']>,
  quotaOverage: number
): BudgetCardMetrics {
  const effectiveBudget = resolveEffectiveBudget(d)
  /* v8 ignore start */
  const displaySpent = d.useQuotaOverage ? quotaOverage : (d.spent ?? 0)
  /* v8 ignore stop */
  const myShare = d.useQuotaOverage ? 0 : quotaOverage
  const barValue = Math.max(displaySpent, myShare)

  if (!effectiveBudget) {
    return {
      effectiveBudget,
      displaySpent,
      myShare,
      pct: null,
      mySharePct: null,
      barColor: getQuotaColor(null),
    }
  }

  const pct = clampPct(barValue, effectiveBudget)
  const mySharePct = myShare > 0 ? Math.min((myShare / effectiveBudget) * 100, pct) : null
  const barColor = getQuotaColor(pct)
  return { effectiveBudget, displaySpent, myShare, pct, mySharePct, barColor }
}

function BudgetProjectionView({
  d,
  effectiveBudget,
}: {
  d: NonNullable<OrgBudgetState['data']>
  effectiveBudget: number | null
}) {
  if (d.useQuotaOverage || d.spentUnavailable) return null

  const budgetProjection = computeBudgetProjection(
    d.spent,
    d.billingYear,
    d.billingMonth,
    d.fetchedAt
  )
  if (!budgetProjection) return null

  const overBudget =
    effectiveBudget !== null ? Math.max(0, budgetProjection.projectedSpend - effectiveBudget) : null

  return (
    <div className="usage-projection">
      <div className="usage-projection-header">
        <TrendingUp size={12} />
        <span>Month-End Projection</span>
      </div>
      <div className="usage-projection-stats">
        <div className="usage-projection-stat">
          <span className="usage-projection-value">
            {formatCurrency(budgetProjection.projectedSpend)}
          </span>
          <span className="usage-projection-label">Projected</span>
        </div>
        <div className="usage-projection-stat">
          <span className="usage-projection-value">
            {formatCurrency(budgetProjection.dailySpendRate)}
          </span>
          <span className="usage-projection-label">Per Day</span>
        </div>
        {overBudget !== null && overBudget > 0 && (
          <div className="usage-projection-stat usage-projection-overage">
            <span className="usage-projection-value">{formatCurrency(overBudget)}</span>
            <span className="usage-projection-label">Over Budget</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BudgetLimitLabel({
  effectiveBudget,
  useQuotaOverage,
}: {
  effectiveBudget: number | null
  useQuotaOverage?: boolean
}) {
  if (effectiveBudget !== null) {
    return <span className="usage-budget-limit">of {formatCurrency(effectiveBudget)}</span>
  }
  return (
    <span className="usage-budget-limit">{useQuotaOverage ? 'from quota' : 'no budget set'}</span>
  )
}

function BudgetCardBody({
  d,
  metrics,
}: {
  d: NonNullable<OrgBudgetState['data']>
  metrics: BudgetCardMetrics
}) {
  const { effectiveBudget, displaySpent, myShare, pct, mySharePct, barColor } = metrics

  return (
    <>
      <div className="usage-budget-bar-track">
        <div
          className="usage-budget-bar-fill"
          style={{ width: `${pct ?? 0}%`, background: barColor }}
        />
        {mySharePct !== null && mySharePct > 0 && (
          <div
            className="usage-budget-bar-myshare"
            style={{ width: `${mySharePct}%` }}
            title={`My share: ${formatCurrency(myShare)}`}
          />
        )}
      </div>
      <div className="usage-budget-amounts">
        <span className="usage-budget-spent" style={{ color: barColor }}>
          {formatCurrency(displaySpent)} {d.useQuotaOverage ? 'overage' : 'spent'}
        </span>
        {myShare > 0 && !d.useQuotaOverage && (
          <span className="usage-budget-myshare-label">{formatCurrency(myShare)} mine</span>
        )}
        <BudgetLimitLabel effectiveBudget={effectiveBudget} useQuotaOverage={d.useQuotaOverage} />
      </div>

      <BudgetProjectionView d={d} effectiveBudget={effectiveBudget} />
      <div className="usage-budget-footer">
        <span className="usage-budget-period">
          {new Date(d.billingYear, d.billingMonth - 1).toLocaleDateString(undefined, {
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <span className="usage-fetched-at">{formatTime(d.fetchedAt)}</span>
      </div>
    </>
  )
}

function BudgetCardHeader({
  org,
  loading,
  preventFurtherUsage,
}: {
  org: string
  loading: boolean
  preventFurtherUsage?: boolean
}) {
  return (
    <div className="usage-budget-card-header">
      <span className="usage-budget-org-name">
        <Building2 size={13} />
        {org}
      </span>
      {loading && <RefreshCw size={12} className="spin" />}
      {preventFurtherUsage && (
        <span className="usage-budget-stop-badge" title="Usage stopped at limit">
          <ShieldAlert size={11} />
          Stop at limit
        </span>
      )}
    </div>
  )
}

function BudgetCardError({ error }: { error: string }) {
  return (
    <p className="usage-budget-error">
      {error.includes('enhanced billing') ? 'Not on enhanced billing' : 'Failed to load'}
    </p>
  )
}

const BUDGET_CARD_DEFAULTS: OrgBudgetState = { data: null, loading: false, error: null }

function BudgetCard({
  org,
  state,
  quotaOverage,
}: {
  org: string
  state: OrgBudgetState
  quotaOverage: number
}) {
  const { data: d, loading, error } = { ...BUDGET_CARD_DEFAULTS, ...state }
  const metrics = d ? computeBudgetCardMetrics(d, quotaOverage) : null

  return (
    <div className="usage-budget-card">
      <BudgetCardHeader org={org} loading={loading} preventFurtherUsage={d?.preventFurtherUsage} />

      {error && !d && <BudgetCardError error={error} />}

      {metrics && <BudgetCardBody d={d!} metrics={metrics} />}
    </div>
  )
}

export function OrgBudgetsSection({
  uniqueOrgs,
  orgBudgets,
  orgOverageFromQuotas,
}: OrgBudgetsSectionProps) {
  if (uniqueOrgs.size === 0) return null

  return (
    <div className="usage-budgets-section">
      <h3 className="usage-budgets-heading">
        <Building2 size={14} />
        Org Budgets
      </h3>
      <div className="usage-budgets-grid">
        {Array.from(uniqueOrgs.keys())
          .filter(org => org !== 'hemsoft')
          .map(org => (
            <BudgetCard
              key={org}
              org={org}
              state={orgBudgets[org] ?? BUDGET_CARD_DEFAULTS}
              quotaOverage={orgOverageFromQuotas.get(org) ?? 0}
            />
          ))}
      </div>
    </div>
  )
}
