import { AlertCircle } from 'lucide-react'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { OrgBudgetsSection } from './copilot-usage/OrgBudgetsSection'
import { UsageHeader } from './copilot-usage/UsageHeader'
import './CopilotUsagePanel.css'

function buildUsageHeaderProps(
  aggregateTotals: { totalUsed: number; totalOverageCost: number },
  aggregateProjections: { projectedTotal?: number; projectedOverageCost?: number } | null,
  anyLoading: boolean,
  refreshAll: () => void
) {
  return {
    totalUsed: aggregateTotals.totalUsed,
    totalOverageCost: aggregateTotals.totalOverageCost,
    projectedTotal: aggregateProjections?.projectedTotal ?? null,
    projectedOverageCost: aggregateProjections?.projectedOverageCost ?? null,
    anyLoading,
    onRefreshAll: refreshAll,
  }
}

function getQuotaAccount(account: { username: string; org?: string }) {
  return { username: account.username, org: account.org ?? '' }
}

export function CopilotUsagePanel() {
  const {
    accounts,
    quotas,
    orgBudgets,
    uniqueOrgs,
    refreshAll,
    anyLoading,
    aggregateTotals,
    aggregateProjections,
    orgOverageFromQuotas,
  } = useCopilotUsage()

  return (
    <div className="copilot-usage-panel">
      <UsageHeader
        {...buildUsageHeaderProps(aggregateTotals, aggregateProjections, anyLoading, refreshAll)}
      />

      <div className="usage-accounts-grid">
        {accounts.length === 0 ? (
          <div className="usage-empty">
            <AlertCircle size={24} />
            <p>No GitHub accounts configured.</p>
            <p className="usage-empty-hint">Add accounts in Settings → Accounts</p>
          </div>
        ) : (
          accounts
            .filter((a: { org?: string }) => a.org !== 'hemsoft')
            .map((account: { username: string; org?: string }) => (
              <AccountQuotaCard
                key={account.username}
                account={getQuotaAccount(account)}
                state={quotas[account.username]}
              />
            ))
        )}
      </div>

      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={orgOverageFromQuotas}
      />
    </div>
  )
}
