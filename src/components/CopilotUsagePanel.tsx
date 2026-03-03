import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertCircle,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { OVERAGE_COST_PER_REQUEST, computeProjection } from './copilot-usage/quotaUtils'
import type { AccountQuotaState } from './copilot-usage/quotaUtils'
import { OrgBudgetsSection } from './copilot-usage/OrgBudgetsSection'
import { UsageHeader } from './copilot-usage/UsageHeader'
import './CopilotUsagePanel.css'

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

export function CopilotUsagePanel() {
  const { accounts } = useGitHubAccounts()
  const [quotas, setQuotas] = useState<Record<string, AccountQuotaState>>({})
  const [orgBudgets, setOrgBudgets] = useState<Record<string, OrgBudgetState>>({})

  const fetchQuota = useCallback(async (username: string) => {
    setQuotas(prev => ({
      ...prev,
      [username]: { data: prev[username]?.data ?? null, loading: true, error: null, fetchedAt: prev[username]?.fetchedAt ?? null },
    }))

    try {
      const result = await window.github.getCopilotQuota(username)
      if (result.success && result.data) {
        setQuotas(prev => ({
          ...prev,
          [username]: { data: result.data!, loading: false, error: null, fetchedAt: Date.now() },
        }))
      } else {
        setQuotas(prev => ({
          ...prev,
          [username]: { data: null, loading: false, error: result.error || 'Unknown error', fetchedAt: null },
        }))
      }
    } catch (error) {
      setQuotas(prev => ({
        ...prev,
        [username]: {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          fetchedAt: null,
        },
      }))
    }
  }, [])

  // Fetch quota for all accounts on mount
  useEffect(() => {
    const usernames = accounts.map(a => a.username)
    for (const username of usernames) {
      fetchQuota(username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map(a => a.username).join(',')])

  const refreshAll = () => {
    for (const account of accounts) {
      fetchQuota(account.username)
    }
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }

  // Collect unique orgs from account config (deduplicated)
  const uniqueOrgs = useMemo(() => {
    const map = new Map<string, string>() // org → username
    for (const account of accounts) {
      if (account.org && !map.has(account.org)) {
        map.set(account.org, account.username)
      }
    }
    return map
  }, [accounts])

  const fetchBudget = useCallback(async (org: string, username?: string) => {
    setOrgBudgets(prev => ({
      ...prev,
      [org]: { data: prev[org]?.data ?? null, loading: true, error: null },
    }))
    try {
      const result = await window.github.getCopilotBudget(org, username)
      if (result.success && result.data) {
        setOrgBudgets(prev => ({
          ...prev,
          [org]: { data: result.data!, loading: false, error: null },
        }))
      } else {
        setOrgBudgets(prev => ({
          ...prev,
          [org]: { data: null, loading: false, error: result.error || 'Unknown error' },
        }))
      }
    } catch (error) {
      setOrgBudgets(prev => ({
        ...prev,
        [org]: {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }, [])

  // Fetch budgets when unique orgs are known
  useEffect(() => {
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(uniqueOrgs.keys()).join(',')])

  // Auto-refresh on UTC month boundary (checks every 5 minutes)
  useEffect(() => {
    const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
    const currentUTCMonth = () => {
      const now = new Date()
      return now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1)
    }

    const interval = setInterval(() => {
      const nowMonth = currentUTCMonth()
      // Check if any cached budget data is from a previous billing month
      const needsRefresh = (Object.values(orgBudgets) as OrgBudgetState[]).some((state: OrgBudgetState) => {
        if (!state.data) return false
        const dataMonth = state.data.billingYear * 100 + state.data.billingMonth
        return dataMonth < nowMonth
      })

      if (needsRefresh) {
        // Billing cycle changed — force re-fetch everything
        for (const account of accounts) {
          fetchQuota(account.username)
        }
        for (const [org, username] of uniqueOrgs) {
          fetchBudget(org, username)
        }
      }
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, Array.from(uniqueOrgs.keys()).join(',')])

  // Compute per-org overage from account quota data (for orgs without billing API access)
  const orgOverageFromQuotas = useMemo(() => {
    const map = new Map<string, number>() // org → total overage cost
    for (const account of accounts) {
      const state = quotas[account.username]
      const premium = state?.data?.quota_snapshots?.premium_interactions
      if (!premium || !account.org) continue
      const overageByCount = Math.max(0, premium.overage_count)
      const overageByRemaining = Math.max(0, -premium.remaining)
      const overageRequests = Math.max(overageByCount, overageByRemaining)
      const cost = overageRequests * OVERAGE_COST_PER_REQUEST
      map.set(account.org, (map.get(account.org) ?? 0) + cost)
    }
    return map
  }, [accounts, quotas])

  const anyLoading = (Object.values(quotas) as AccountQuotaState[]).some((s: AccountQuotaState) => s.loading)

  const aggregateTotals = (Object.values(quotas) as AccountQuotaState[]).reduce(
    (acc: { totalUsed: number; totalOverageCost: number }, state: AccountQuotaState) => {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium) return acc
      const used = premium.entitlement - premium.remaining
      const overageByCount = Math.max(0, premium.overage_count)
      const overageByRemaining = Math.max(0, -premium.remaining)
      const overageRequests = Math.max(overageByCount, overageByRemaining)
      acc.totalUsed += used
      acc.totalOverageCost += overageRequests * OVERAGE_COST_PER_REQUEST
      return acc
    },
    { totalUsed: 0, totalOverageCost: 0 }
  )

  // Compute aggregate projections across all accounts
  const aggregateProjections = useMemo(() => {
    let projectedTotal = 0
    let projectedOverageCost = 0
    let hasAny = false

    for (const state of Object.values(quotas) as AccountQuotaState[]) {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium || !state.data) continue
      const proj = computeProjection(premium, state.data.quota_reset_date_utc)
      if (!proj) continue
      hasAny = true
      projectedTotal += proj.projectedTotal
      projectedOverageCost += proj.projectedOverageCost
    }

    return hasAny ? { projectedTotal, projectedOverageCost } : null
  }, [quotas])

  return (
    <div className="copilot-usage-panel">
      <UsageHeader
        totalUsed={aggregateTotals.totalUsed}
        totalOverageCost={aggregateTotals.totalOverageCost}
        projectedTotal={aggregateProjections?.projectedTotal ?? null}
        projectedOverageCost={aggregateProjections?.projectedOverageCost ?? null}
        anyLoading={anyLoading}
        onRefreshAll={refreshAll}
      />

      <div className="usage-accounts-grid">
        {accounts.length === 0 ? (
          <div className="usage-empty">
            <AlertCircle size={24} />
            <p>No GitHub accounts configured.</p>
            <p className="usage-empty-hint">Add accounts in Settings → Accounts</p>
          </div>
        ) : (
          accounts.map((account: { username: string; org?: string }) => (
            <AccountQuotaCard
              key={account.username}
              account={{ username: account.username }}
              state={quotas[account.username] as AccountQuotaState | undefined}
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
