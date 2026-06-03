import { Zap, RefreshCw, TrendingUp } from 'lucide-react'
import { formatCurrency } from './quotaUtils'

interface UsageHeaderProps {
  totalUsed: number
  totalEntitlement: number
  totalOverageCost: number
  totalSpent: number | null
  projectedSpend: number | null
  projectedTotal: number | null
  projectedOverageCost: number | null
  anyLoading: boolean
  onRefreshAll: () => void
}

function OrgPoolBar({
  totalUsed,
  totalEntitlement,
}: {
  totalUsed: number
  totalEntitlement: number
}) {
  if (totalEntitlement <= 0) return null
  const ratio = (totalUsed / totalEntitlement) * 100
  const pct = Math.min(100, Math.max(0, ratio))
  const pctLabel = ratio >= 0.1 ? ratio.toFixed(1) : ratio > 0 ? '<0.1' : '0'
  return (
    <div className="usage-org-pool" data-testid="org-pool">
      <div className="usage-org-pool-head">
        <span className="usage-org-pool-label">Org Pool</span>
        <span className="usage-org-pool-value">
          {totalUsed.toLocaleString()} / {totalEntitlement.toLocaleString()} ({pctLabel}%)
        </span>
      </div>
      <div className="usage-budget-bar-track">
        <div
          className="usage-budget-bar-fill"
          style={{ width: `${pct}%`, background: '#4ec9b0' }}
        />
      </div>
    </div>
  )
}

function SpendSummary({
  totalSpent,
  projectedSpend,
}: {
  totalSpent: number | null
  projectedSpend: number | null
}) {
  return (
    <>
      {totalSpent != null && (
        <>
          <div className="usage-header-summary-divider" aria-hidden="true" />
          <div className="usage-header-summary-item">
            <span className="usage-header-summary-value">{formatCurrency(totalSpent)}</span>
            <span className="usage-header-summary-label">Total Spend</span>
          </div>
        </>
      )}
      {projectedSpend != null && projectedSpend > 0 && (
        <>
          <div className="usage-header-summary-divider" aria-hidden="true" />
          <div className="usage-header-summary-item usage-header-projected">
            <span className="usage-header-summary-value">
              <TrendingUp size={11} />
              {formatCurrency(projectedSpend)}
            </span>
            <span className="usage-header-summary-label">Proj. Spend</span>
          </div>
        </>
      )}
    </>
  )
}

export function UsageHeader({
  totalUsed,
  totalEntitlement,
  totalOverageCost,
  totalSpent,
  projectedSpend,
  projectedTotal,
  projectedOverageCost,
  anyLoading,
  onRefreshAll,
}: UsageHeaderProps) {
  return (
    <>
      <div className="usage-header">
        <div className="usage-header-left">
          <div className="usage-header-icon">
            <Zap size={20} />
          </div>
          <div>
            <h2>Copilot Usage</h2>
            <p className="usage-subtitle">Copilot AI credit quota per account</p>
          </div>
        </div>
        <div className="usage-header-summary" aria-live="polite">
          <div className="usage-header-summary-item">
            <span className="usage-header-summary-value">{totalUsed.toLocaleString()}</span>
            <span className="usage-header-summary-label">Total Used</span>
          </div>
          <div className="usage-header-summary-divider" aria-hidden="true" />
          <div className="usage-header-summary-item">
            <span className="usage-header-summary-value">{formatCurrency(totalOverageCost)}</span>
            <span className="usage-header-summary-label">Total Overage</span>
          </div>
          <SpendSummary totalSpent={totalSpent} projectedSpend={projectedSpend} />
          {projectedTotal != null && (
            <>
              <div className="usage-header-summary-divider" aria-hidden="true" />
              <div className="usage-header-summary-item usage-header-projected">
                <span className="usage-header-summary-value">
                  <TrendingUp size={11} />
                  {projectedTotal.toLocaleString()}
                </span>
                <span className="usage-header-summary-label">Projected</span>
              </div>
            </>
          )}
          {projectedOverageCost != null && projectedOverageCost > 0 && (
            <>
              <div className="usage-header-summary-divider" aria-hidden="true" />
              <div className="usage-header-summary-item usage-header-projected-overage">
                <span className="usage-header-summary-value">
                  {formatCurrency(projectedOverageCost)}
                </span>
                <span className="usage-header-summary-label">Est. Overage</span>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="usage-refresh-btn"
          onClick={onRefreshAll}
          disabled={anyLoading}
          title="Refresh usage data"
        >
          <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
          Refresh
        </button>
      </div>
      <OrgPoolBar totalUsed={totalUsed} totalEntitlement={totalEntitlement} />
    </>
  )
}
