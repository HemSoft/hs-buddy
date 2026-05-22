import { AlertCircle } from 'lucide-react'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { OrgBudgetsSection } from './copilot-usage/OrgBudgetsSection'
import { UsageHeader } from './copilot-usage/UsageHeader'
import './CopilotUsagePanel.css'

function resolveProjection(aggregateProjections: { projectedTotal?: number; projectedOverageCost?: number } | null | undefined) {
  return {
    projectedTotal: aggregateProjections?.projectedTotal ?? null,
    projectedOverageCost: aggregateProjections?.projectedOverageCost ?? null,
  }
}

function AccountsGrid({ accounts, quotas }: {
  accounts: { username: string; org?: string }[]
  quotas: Record<string, unknown>
}) {
  if (accounts.length === 0) {
    return (
      <div className="usage-empty">
        <AlertCircle size={24} />
        <p>No GitHub accounts configured.</p>
        <p className="usage-empty-hint">Add accounts in Settings → Accounts</p>
      </div>
    )
  }
  return (
    <>
      {accounts
        .filter((a: { org?: string }) => a.org !== 'hemsoft')
        .map((account: { username: string; org?: string }) => (
          <AccountQuotaCard
            key={account.username}
            account={{ username: account.username, org: account.org ?? '' }}
            state={quotas[account.username]}
          />
        ))}
    </>
  )
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

  const projections = resolveProjection(aggregateProjections)

  return (
    <div className="copilot-usage-panel">
      <UsageHeader
        totalUsed={aggregateTotals.totalUsed}
        totalOverageCost={aggregateTotals.totalOverageCost}
        projectedTotal={projections.projectedTotal}
        projectedOverageCost={projections.projectedOverageCost}
        anyLoading={anyLoading}
        onRefreshAll={refreshAll}
      />

      <div className="usage-accounts-grid">
        <AccountsGrid accounts={accounts} quotas={quotas} />
      </div>

      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={orgOverageFromQuotas}
      />
    </div>
  )
}
