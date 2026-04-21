import { Building2, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react'
import { formatCurrency, getQuotaColor, computeBudgetProjection } from './quotaUtils'
import type { OrgBudgetState } from './types'
import { formatTime } from '../../utils/dateUtils'

interface OrgBudgetsSectionProps {
  uniqueOrgs: Map<string, string>
  orgBudgets: Record<string, OrgBudgetState>
  orgOverageFromQuotas: Map<string, number>
}

const PERSONAL_BUDGETS: Record<string, number> = { hemsoft: 50 }

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
        {Array.from(uniqueOrgs.keys()).map(org => {
          const state = orgBudgets[org]
          const d = state?.data
          const quotaOverage = orgOverageFromQuotas.get(org) ?? 0
          const effectiveBudget = d?.budgetAmount ?? PERSONAL_BUDGETS[org.toLowerCase()] ?? null
          const displaySpent = d?.useQuotaOverage ? quotaOverage : (d?.spent ?? 0)
          const myShare = !d?.useQuotaOverage ? quotaOverage : 0
          const barValue = Math.max(displaySpent, myShare)
          const pct = effectiveBudget ? Math.min((barValue / effectiveBudget) * 100, 100) : null
          /* v8 ignore start */
          const mySharePct =
            effectiveBudget && myShare > 0
              ? Math.min((myShare / effectiveBudget) * 100, pct ?? 100)
              : null
          /* v8 ignore stop */

          const barColor = getQuotaColor(pct)

          return (
            <div key={org} className="usage-budget-card">
              <div className="usage-budget-card-header">
                <span className="usage-budget-org-name">
                  <Building2 size={13} />
                  {org}
                </span>
                {state?.loading && <RefreshCw size={12} className="spin" />}
                {d?.preventFurtherUsage && (
                  <span className="usage-budget-stop-badge" title="Usage stopped at limit">
                    <ShieldAlert size={11} />
                    Stop at limit
                  </span>
                )}
              </div>

              {state?.error && !d && (
                <p className="usage-budget-error">
                  {state.error.includes('enhanced billing')
                    ? 'Not on enhanced billing'
                    : 'Failed to load'}
                </p>
              )}

              {d && (
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
                      <span className="usage-budget-myshare-label">
                        {formatCurrency(myShare)} mine
                      </span>
                    )}
                    {effectiveBudget !== null ? (
                      <span className="usage-budget-limit">
                        of {formatCurrency(effectiveBudget)}
                      </span>
                    ) : (
                      <span className="usage-budget-limit">
                        {d.useQuotaOverage ? 'from quota' : 'no budget set'}
                      </span>
                    )}
                  </div>

                  {!d.useQuotaOverage &&
                    !d.spentUnavailable &&
                    (() => {
                      const budgetProjection = computeBudgetProjection(
                        d.spent,
                        d.billingYear,
                        d.billingMonth,
                        d.fetchedAt
                      )
                      if (!budgetProjection) return null
                      const overBudget =
                        effectiveBudget !== null
                          ? Math.max(0, budgetProjection.projectedSpend - effectiveBudget)
                          : null
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
                                <span className="usage-projection-value">
                                  {formatCurrency(overBudget)}
                                </span>
                                <span className="usage-projection-label">Over Budget</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
