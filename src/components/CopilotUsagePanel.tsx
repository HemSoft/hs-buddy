import { AlertCircle } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import type { AccountQuotaState } from './copilot-usage/quotaUtils'
import type { OrgBudgetState } from './copilot-usage/types'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { TopUsersSection } from './copilot-usage/TopUsersSection'
import { UsageHeader } from './copilot-usage/UsageHeader'
import './CopilotUsagePanel.css'

type CopilotUsageAccount = { username: string; org?: string }

function resolveProjection(
  aggregateProjections:
    | { projectedTotal?: number; projectedOverageCost?: number }
    | null
    | undefined
) {
  return {
    projectedTotal: aggregateProjections?.projectedTotal ?? null,
    projectedOverageCost: aggregateProjections?.projectedOverageCost ?? null,
  }
}

function AccountsGrid({
  accounts,
  quotas,
  orgBudgets,
  orgOverageFromQuotas,
}: {
  accounts: CopilotUsageAccount[]
  quotas: Record<string, AccountQuotaState>
  orgBudgets: Record<string, OrgBudgetState>
  orgOverageFromQuotas: Map<string, number>
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
        .filter(account => account.org !== 'hemsoft')
        .map(account => renderAccountQuotaCard(account, quotas, orgBudgets, orgOverageFromQuotas))}
    </>
  )
}

function renderAccountQuotaCard(
  account: CopilotUsageAccount,
  quotas: Record<string, AccountQuotaState>,
  orgBudgets: Record<string, OrgBudgetState>,
  orgOverageFromQuotas: Map<string, number>
) {
  const org = account.org ?? ''
  return (
    <AccountQuotaCard
      key={account.username}
      account={{ username: account.username, org }}
      state={quotas[account.username]}
      budgetState={account.org ? orgBudgets[account.org] : undefined}
      quotaOverage={account.org ? (orgOverageFromQuotas.get(account.org) ?? 0) : 0}
    />
  )
}

export function CopilotUsagePanel() {
  const [enterpriseUsersRefreshToken, setEnterpriseUsersRefreshToken] = useState(0)
  const {
    accounts,
    quotas,
    orgBudgets,
    refreshAll,
    anyLoading,
    aggregateTotals,
    aggregateProjections,
    aggregateSpend,
    orgOverageFromQuotas,
  } = useCopilotUsage()

  const projections = resolveProjection(aggregateProjections)
  const handleRefreshAll = useCallback(() => {
    refreshAll()
    setEnterpriseUsersRefreshToken(token => token + 1)
  }, [refreshAll])

  return (
    <div className="copilot-usage-panel">
      <UsageHeader
        totalUsed={aggregateTotals.totalUsed}
        totalEntitlement={aggregateTotals.totalEntitlement}
        totalOverageCost={aggregateTotals.totalOverageCost}
        totalSpent={aggregateSpend?.totalSpent ?? null}
        projectedSpend={aggregateSpend?.projectedSpend ?? null}
        projectedTotal={projections.projectedTotal}
        projectedOverageCost={projections.projectedOverageCost}
        anyLoading={anyLoading}
        onRefreshAll={handleRefreshAll}
      />

      <div className="usage-accounts-grid">
        <AccountsGrid
          accounts={accounts}
          quotas={quotas}
          orgBudgets={orgBudgets}
          orgOverageFromQuotas={orgOverageFromQuotas}
        />
      </div>

      <TopUsersSection refreshToken={enterpriseUsersRefreshToken} />
    </div>
  )
}
