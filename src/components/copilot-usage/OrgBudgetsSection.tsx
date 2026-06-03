import { Building2, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react'
import { formatCurrency, getQuotaColor, computeBudgetProjection } from './quotaUtils'
import type { OrgBudgetState } from './types'
import { formatTime } from '../../utils/dateUtils'

interface OrgBudgetsSectionProps {
  uniqueOrgs: Map<string, string>
  orgBudgets: Record<string, OrgBudgetState>
  orgOverageFromQuotas: Map<string, number>
}

interface OrgBudgetSummaryProps {
  state: OrgBudgetState | undefined
  quotaOverage: number
}

interface BudgetCardMetrics {
  effectiveBudget: number | null
  displaySpent: number
  myShare: number
  pct: number | null
  mySharePct: number | null
  barColor: string
}

interface BudgetUsageAmounts {
  displaySpent: number
  myShare: number
}

function resolveEffectiveBudget(d: NonNullable<OrgBudgetState['data']>): number | null {
  return d.budgetAmount ?? null
}

function clampPct(value: number, budget: number): number {
  return Math.min((value / budget) * 100, 100)
}

function resolveBudgetUsageAmounts(
  d: NonNullable<OrgBudgetState['data']>,
  quotaOverage: number
): BudgetUsageAmounts {
  const spent = d.spent ?? 0

  if (d.useQuotaOverage) {
    return { displaySpent: quotaOverage, myShare: 0 }
  }

  return { displaySpent: spent, myShare: quotaOverage }
}

function resolveMySharePct(myShare: number, effectiveBudget: number, pct: number): number | null {
  if (myShare <= 0) return null

  return Math.min((myShare / effectiveBudget) * 100, pct)
}

function computeBudgetCardMetrics(
  d: NonNullable<OrgBudgetState['data']>,
  quotaOverage: number
): BudgetCardMetrics {
  const effectiveBudget = resolveEffectiveBudget(d)
  const { displaySpent, myShare } = resolveBudgetUsageAmounts(d, quotaOverage)
  const barValue = Math.max(displaySpent, myShare)

  if (effectiveBudget === null || effectiveBudget === 0) {
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
  const mySharePct = resolveMySharePct(myShare, effectiveBudget, pct)
  const barColor = getQuotaColor(pct)
  return { effectiveBudget, displaySpent, myShare, pct, mySharePct, barColor }
}

function canRenderBudgetProjection(d: NonNullable<OrgBudgetState['data']>): boolean {
  if (d.useQuotaOverage) return false

  return !d.spentUnavailable
}

function resolveBudgetProjection(d: NonNullable<OrgBudgetState['data']>) {
  return computeBudgetProjection(d.spent, d.billingYear, d.billingMonth, d.fetchedAt)
}

function resolveOverBudget(effectiveBudget: number | null, projectedSpend: number): number | null {
  if (effectiveBudget === null) return null

  return Math.max(0, projectedSpend - effectiveBudget)
}

function BudgetProjectionOverage({ overBudget }: { overBudget: number | null }) {
  if (overBudget === null || overBudget <= 0) return null

  return (
    <div className="usage-projection-stat usage-projection-overage">
      <span className="usage-projection-value">{formatCurrency(overBudget)}</span>
      <span className="usage-projection-label">Over Budget</span>
    </div>
  )
}

function BudgetProjectionView({
  d,
  effectiveBudget,
}: {
  d: NonNullable<OrgBudgetState['data']>
  effectiveBudget: number | null
}) {
  if (!canRenderBudgetProjection(d)) return null

  const budgetProjection = resolveBudgetProjection(d)
  if (!budgetProjection) return null

  const overBudget = resolveOverBudget(effectiveBudget, budgetProjection.projectedSpend)

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
        <BudgetProjectionOverage overBudget={overBudget} />
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

function resolveBudgetBarWidth(pct: number | null): string {
  return `${pct ?? 0}%`
}

function resolveSpentLabel(useQuotaOverage: boolean): string {
  return useQuotaOverage ? 'overage' : 'spent'
}

function BudgetMyShareBar({ mySharePct, myShare }: { mySharePct: number | null; myShare: number }) {
  if (mySharePct === null || mySharePct <= 0) return null

  return (
    <div
      className="usage-budget-bar-myshare"
      style={{ width: `${mySharePct}%` }}
      title={`My share: ${formatCurrency(myShare)}`}
    />
  )
}

function BudgetMyShareLabel({
  myShare,
  useQuotaOverage,
}: {
  myShare: number
  useQuotaOverage: boolean
}) {
  if (myShare <= 0 || useQuotaOverage) return null

  return <span className="usage-budget-myshare-label">{formatCurrency(myShare)} mine</span>
}

function BudgetProgressBar({
  effectiveBudget,
  pct,
  barColor,
  mySharePct,
  myShare,
}: Pick<BudgetCardMetrics, 'effectiveBudget' | 'pct' | 'barColor' | 'mySharePct' | 'myShare'>) {
  if (effectiveBudget === null || pct === null) return null

  return (
    <div className="usage-budget-bar-track">
      <div
        className="usage-budget-bar-fill"
        style={{ width: resolveBudgetBarWidth(pct), background: barColor }}
      />
      <BudgetMyShareBar mySharePct={mySharePct} myShare={myShare} />
    </div>
  )
}

function BudgetGrossLabel({ gross, useQuotaOverage }: { gross: number; useQuotaOverage: boolean }) {
  if (gross <= 0 || useQuotaOverage) return null

  return (
    <span
      className="usage-budget-gross-label"
      title="Gross AI Credit value consumed (list price; net is what is billed)"
    >
      {formatCurrency(gross)} consumed
    </span>
  )
}

function BudgetCardFooter({
  billingYear,
  billingMonth,
  fetchedAt,
}: {
  billingYear: number
  billingMonth: number
  fetchedAt: number
}) {
  return (
    <div className="usage-budget-footer">
      <span className="usage-budget-period">
        {new Date(billingYear, billingMonth - 1).toLocaleDateString(undefined, {
          month: 'short',
          year: 'numeric',
        })}
      </span>
      <span className="usage-fetched-at">{formatTime(fetchedAt)}</span>
    </div>
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
      <BudgetProgressBar
        effectiveBudget={effectiveBudget}
        pct={pct}
        barColor={barColor}
        mySharePct={mySharePct}
        myShare={myShare}
      />
      <div className="usage-budget-amounts">
        <span className="usage-budget-spent" style={{ color: barColor }}>
          {formatCurrency(displaySpent)} {resolveSpentLabel(d.useQuotaOverage)}
        </span>
        <BudgetGrossLabel gross={d.gross ?? 0} useQuotaOverage={d.useQuotaOverage} />
        <BudgetMyShareLabel myShare={myShare} useQuotaOverage={d.useQuotaOverage} />
        <BudgetLimitLabel effectiveBudget={effectiveBudget} useQuotaOverage={d.useQuotaOverage} />
      </div>

      <BudgetProjectionView d={d} effectiveBudget={effectiveBudget} />
      <BudgetCardFooter
        billingYear={d.billingYear}
        billingMonth={d.billingMonth}
        fetchedAt={d.fetchedAt}
      />
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

function resolveBudgetCardState(state: OrgBudgetState): OrgBudgetState {
  return { ...BUDGET_CARD_DEFAULTS, ...state }
}

function resolvePreventFurtherUsage(data: OrgBudgetState['data']): boolean | undefined {
  return data?.preventFurtherUsage
}

function BudgetCardErrorContent({
  error,
  data,
}: {
  error: string | null
  data: OrgBudgetState['data']
}) {
  if (!error || data) return null

  return <BudgetCardError error={error} />
}

function BudgetCardMetricsContent({
  data,
  quotaOverage,
}: {
  data: OrgBudgetState['data']
  quotaOverage: number
}) {
  if (!data) return null

  const metrics = computeBudgetCardMetrics(data, quotaOverage)
  return <BudgetCardBody d={data} metrics={metrics} />
}

export function OrgBudgetSummary({ state, quotaOverage }: OrgBudgetSummaryProps) {
  if (!state) return null

  const { data: d, loading, error } = resolveBudgetCardState(state)
  const preventFurtherUsage = resolvePreventFurtherUsage(d)

  return (
    <div className="usage-org-budget-summary" data-testid="org-budget-summary">
      <div className="usage-org-budget-summary-header">
        <span className="usage-org-budget-summary-title">
          <Building2 size={12} />
          Org Budget
        </span>
        {loading && <RefreshCw size={12} className="spin" />}
        {preventFurtherUsage && (
          <span className="usage-budget-stop-badge" title="Usage stopped at limit">
            <ShieldAlert size={11} />
            Stop at limit
          </span>
        )}
      </div>
      <BudgetCardErrorContent error={error} data={d} />
      <BudgetCardMetricsContent data={d} quotaOverage={quotaOverage} />
    </div>
  )
}

function BudgetCard({
  org,
  state,
  quotaOverage,
}: {
  org: string
  state: OrgBudgetState
  quotaOverage: number
}) {
  const { data: d, loading, error } = resolveBudgetCardState(state)
  const preventFurtherUsage = resolvePreventFurtherUsage(d)

  return (
    <div className="usage-budget-card">
      <BudgetCardHeader org={org} loading={loading} preventFurtherUsage={preventFurtherUsage} />
      <BudgetCardErrorContent error={error} data={d} />
      <BudgetCardMetricsContent data={d} quotaOverage={quotaOverage} />
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
        {Array.from(uniqueOrgs.keys()).flatMap(org =>
          org === 'hemsoft'
            ? []
            : [
                <BudgetCard
                  key={org}
                  org={org}
                  state={orgBudgets[org] ?? BUDGET_CARD_DEFAULTS}
                  quotaOverage={orgOverageFromQuotas.get(org) ?? 0}
                />,
              ]
        )}
      </div>
    </div>
  )
}
