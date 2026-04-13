import {
  Sparkles,
  Zap,
  Activity,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { SectionHeading, StatCard } from './DashboardPrimitives'
import { formatCurrency } from '../copilot-usage/quotaUtils'

interface CommandCenterCardProps {
  accountCount: number
  hasCopilotAccounts: boolean
  anyLoading: boolean
  onRefresh: () => void
  onOpenUsage: () => void
  totalUsed: number
  totalOverage: number
  projectedTotal: number | null | undefined
  projectedOverageCost: number | null | undefined
}

export function CommandCenterCard({
  accountCount,
  hasCopilotAccounts,
  anyLoading,
  onRefresh,
  onOpenUsage,
  totalUsed,
  totalOverage,
  projectedTotal,
  projectedOverageCost,
}: CommandCenterCardProps) {
  return (
    <section
      className="welcome-section welcome-section-copilot"
      aria-label="Copilot usage overview"
    >
      <SectionHeading
        kicker="Copilot usage"
        title="Command Center"
        caption="Live spend, projection, and account health at a glance"
      />

      <div className="welcome-usage-strip-header">
        <div className="welcome-usage-strip-title">
          <div className="welcome-stat-icon welcome-stat-icon-copilot">
            <Sparkles size={18} />
          </div>
          <div className="welcome-usage-strip-copy">
            <span className="welcome-usage-strip-name">Connected Accounts</span>
            <span className="welcome-usage-strip-description">
              {hasCopilotAccounts
                ? `${accountCount} connected account${accountCount === 1 ? '' : 's'}`
                : 'No accounts configured'}
            </span>
          </div>
        </div>

        <div className="welcome-usage-actions">
          <button
            type="button"
            className="welcome-usage-btn"
            onClick={onRefresh}
            disabled={anyLoading || !hasCopilotAccounts}
            title="Refresh Copilot usage data"
          >
            <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button type="button" className="welcome-usage-btn" onClick={onOpenUsage}>
            <span>{hasCopilotAccounts ? 'Open Usage' : 'Configure Accounts'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="welcome-usage-stats" aria-live="polite">
        <StatCard
          icon={<Zap size={18} />}
          value={totalUsed.toLocaleString()}
          label="Total Used"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <StatCard
          icon={<Sparkles size={18} />}
          value={formatCurrency(totalOverage)}
          label="Total Overage"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <StatCard
          icon={<Activity size={18} />}
          value={projectedTotal?.toLocaleString() ?? '...'}
          label="Projected"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <StatCard
          icon={<ArrowRight size={18} />}
          value={
            projectedOverageCost != null && projectedOverageCost > 0
              ? formatCurrency(projectedOverageCost)
              : '$0.00'
          }
          label="Est. Overage"
          cardClassName="welcome-usage-stat-card welcome-usage-stat-card-accent"
          iconClassName="welcome-stat-icon-overage"
        />
      </div>
    </section>
  )
}
