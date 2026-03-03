import { Building2, RefreshCw, ShieldAlert } from 'lucide-react'
import { formatCurrency } from './quotaUtils'

interface OrgBudgetData {
  org: string
  budgetAmount: number | null
  preventFurtherUsage: boolean
  spent: number
  spentUnavailable: boolean
  useQuotaOverage: boolean
  billingMonth: number
  billingYear: number
  fetchedAt: number
}

interface OrgBudgetState {
  data: OrgBudgetData | null
  loading: boolean
  error: string | null
}

interface OrgBudgetsSectionProps {
  uniqueOrgs: Map<string, string>
  orgBudgets: Record<string, OrgBudgetState>
  orgOverageFromQuotas: Map<string, number>
}

const PERSONAL_BUDGETS: Record<string, number> = { hemsoft: 50 }

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function OrgBudgetsSection({ uniqueOrgs, orgBudgets, orgOverageFromQuotas }: OrgBudgetsSectionProps) {
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
          const pct = effectiveBudget ? Math.min((displaySpent / effectiveBudget) * 100, 100) : null
          const myShare = !d?.useQuotaOverage ? Math.min(quotaOverage, displaySpent) : 0
          const mySharePct = effectiveBudget && myShare > 0
            ? Math.min((myShare / effectiveBudget) * 100, pct ?? 100)
            : null

          const barColor = pct === null ? '#4ec9b0'
            : pct >= 90 ? '#e85d5d'
            : pct >= 75 ? '#e89b3c'
            : pct >= 50 ? '#dcd34a'
            : '#4ec9b0'

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
                  {state.error.includes('enhanced billing') ? 'Not on enhanced billing' : 'Failed to load'}
                </p>
              )}

              {d && (
                <>
                  <div className="usage-budget-bar-track">
                    <div className="usage-budget-bar-fill" style={{ width: `${pct ?? 0}%`, background: barColor }} />
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
                      {formatCurrency(displaySpent)}{' '}
                      {d.useQuotaOverage ? 'overage' : 'spent'}
                    </span>
                    {myShare > 0 && !d.useQuotaOverage && (
                      <span className="usage-budget-myshare-label">
                        {formatCurrency(myShare)} mine
                      </span>
                    )}
                    {effectiveBudget !== null ? (
                      <span className="usage-budget-limit">of {formatCurrency(effectiveBudget)}</span>
                    ) : (
                      <span className="usage-budget-limit">
                        {d.useQuotaOverage ? 'from quota' : 'no budget set'}
                      </span>
                    )}
                  </div>
                  <div className="usage-budget-footer">
                    <span className="usage-budget-period">
                      {new Date(d.billingYear, d.billingMonth - 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
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
