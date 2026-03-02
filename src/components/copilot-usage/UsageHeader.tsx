import { Zap, RefreshCw } from 'lucide-react'
import { formatCurrency } from './AccountQuotaCard'

interface UsageHeaderProps {
  totalUsed: number
  totalOverageCost: number
  anyLoading: boolean
  onRefreshAll: () => void
}

export function UsageHeader({ totalUsed, totalOverageCost, anyLoading, onRefreshAll }: UsageHeaderProps) {
  return (
    <div className="usage-header">
      <div className="usage-header-left">
        <div className="usage-header-icon">
          <Zap size={20} />
        </div>
        <div>
          <h2>Copilot Usage</h2>
          <p className="usage-subtitle">Copilot premium request quota per account</p>
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
      </div>
      <button className="usage-refresh-btn" onClick={onRefreshAll} disabled={anyLoading} title="Refresh usage data">
        <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
        Refresh
      </button>
    </div>
  )
}
