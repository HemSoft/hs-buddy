import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useGitHubAccounts } from './useConfig'
import {
  OVERAGE_COST_PER_CREDIT,
  computeProjection,
  type AccountQuotaState,
} from '../components/copilot-usage/quotaUtils'
import type { OrgBudgetState } from '../components/copilot-usage/types'
import { MS_PER_MINUTE } from '../constants'
import { getErrorMessage } from '../utils/errorUtils'

function getPremiumInteractions(state: AccountQuotaState | undefined) {
  return state?.data?.quota_snapshots?.premium_interactions ?? null
}

function computeOverageRequests(premium: { overage_count: number; remaining: number }): number {
  const overageByCount = Math.max(0, premium.overage_count)
  const overageByRemaining = Math.max(0, -premium.remaining)
  return Math.max(overageByCount, overageByRemaining)
}

function getQuotaProjection(state: AccountQuotaState) {
  const premium = getPremiumInteractions(state)
  if (!premium || !state.data) {
    return null
  }

  return computeProjection(premium, state.data.quota_reset_date_utc)
}

function computeAggregateProjections(quotas: Record<string, AccountQuotaState>) {
  let projectedTotal = 0
  let projectedOverageCost = 0
  let hasAny = false

  for (const state of Object.values(quotas)) {
    const projection = getQuotaProjection(state)
    if (!projection) {
      continue
    }

    hasAny = true
    projectedTotal += projection.projectedTotal
    projectedOverageCost += projection.projectedOverageCost
  }

  if (!hasAny) {
    return null
  }

  return { projectedTotal, projectedOverageCost }
}

function computeOrgOverage(
  accounts: { username: string; org: string }[],
  quotas: Record<string, AccountQuotaState>
): Map<string, number> {
  const map = new Map<string, number>()
  for (const account of accounts) {
    const premium = getPremiumInteractions(quotas[account.username])
    if (!premium || !account.org) continue
    const overageRequests = computeOverageRequests(premium)
    const cost = overageRequests * OVERAGE_COST_PER_CREDIT
    map.set(account.org, (map.get(account.org) ?? 0) + cost)
  }
  return map
}

function computeAggregateTotals(quotas: Record<string, AccountQuotaState>) {
  return Object.values(quotas).reduce(
    (acc, state) => {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium) return acc
      const used = premium.entitlement - premium.remaining
      const overageRequests = computeOverageRequests(premium)
      acc.totalUsed += used
      acc.totalOverageCost += overageRequests * OVERAGE_COST_PER_CREDIT
      return acc
    },
    { totalUsed: 0, totalOverageCost: 0 }
  )
}

function needsMonthRolloverRefresh(orgBudgets: Record<string, OrgBudgetState>): boolean {
  const now = new Date()
  const currentUtcMonth = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1)
  return Object.values(orgBudgets).some(state => {
    if (!state.data) return false
    const dataMonth = state.data.billingYear * 100 + state.data.billingMonth
    return dataMonth < currentUtcMonth
  })
}

type QuotaSetter = Dispatch<SetStateAction<Record<string, AccountQuotaState>>>
type BudgetSetter = Dispatch<SetStateAction<Record<string, OrgBudgetState>>>

async function doFetchQuota(username: string, setQuotas: QuotaSetter): Promise<void> {
  setQuotas(prev => ({
    ...prev,
    [username]: {
      data: prev[username]?.data ?? null,
      loading: true,
      error: null,
      fetchedAt: prev[username]?.fetchedAt ?? null,
    },
  }))

  try {
    const result = await window.github.getCopilotQuota(username)
    setQuotas(prev => ({
      ...prev,
      [username]:
        result.success && result.data
          ? { data: result.data, loading: false, error: null, fetchedAt: Date.now() }
          : {
              data: null,
              loading: false,
              error: result.error || 'Unknown error',
              fetchedAt: null,
            },
    }))
  } catch (error: unknown) {
    setQuotas(prev => ({
      ...prev,
      [username]: { data: null, loading: false, error: getErrorMessage(error), fetchedAt: null },
    }))
  }
}

async function doFetchBudget(
  org: string,
  username: string | undefined,
  setOrgBudgets: BudgetSetter
): Promise<void> {
  setOrgBudgets(prev => ({
    ...prev,
    [org]: { data: prev[org]?.data ?? null, loading: true, error: null },
  }))

  try {
    const result = await window.github.getCopilotBudget(org, username)
    setOrgBudgets(prev => ({
      ...prev,
      [org]:
        result.success && result.data
          ? { data: result.data, loading: false, error: null }
          : { data: null, loading: false, error: result.error || 'Unknown error' },
    }))
  } catch (error: unknown) {
    setOrgBudgets(prev => ({
      ...prev,
      [org]: { data: null, loading: false, error: getErrorMessage(error) },
    }))
  }
}

export function useCopilotUsage() {
  const { accounts } = useGitHubAccounts()
  const [quotas, setQuotas] = useState<Record<string, AccountQuotaState>>({})
  const [orgBudgets, setOrgBudgets] = useState<Record<string, OrgBudgetState>>({})

  const uniqueOrgs = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts) {
      if (account.org && !map.has(account.org)) {
        map.set(account.org, account.username)
      }
    }
    return map
  }, [accounts])

  const fetchQuota = useCallback(async (username: string) => doFetchQuota(username, setQuotas), [])

  const fetchBudget = useCallback(
    async (org: string, username?: string) => doFetchBudget(org, username, setOrgBudgets),
    []
  )

  const accountUsernamesKey = useMemo(
    () => accounts.map(account => account.username).join(','),
    [accounts]
  )
  const uniqueOrgsKey = useMemo(() => Array.from(uniqueOrgs.keys()).join(','), [uniqueOrgs])

  useEffect(() => {
    for (const account of accounts) {
      fetchQuota(account.username)
    }
  }, [accounts, accountUsernamesKey, fetchQuota])

  useEffect(() => {
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }, [fetchBudget, uniqueOrgs, uniqueOrgsKey])

  const refreshAll = useCallback(() => {
    for (const account of accounts) {
      fetchQuota(account.username)
    }
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }, [accounts, fetchBudget, fetchQuota, uniqueOrgs])

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (needsMonthRolloverRefresh(orgBudgets)) refreshAll()
    }, 5 * MS_PER_MINUTE)

    return () => clearInterval(refreshInterval)
  }, [orgBudgets, refreshAll])

  const orgOverageFromQuotas = useMemo(
    () => computeOrgOverage(accounts, quotas),
    [accounts, quotas]
  )

  const anyLoading = useMemo(() => Object.values(quotas).some(state => state.loading), [quotas])

  const aggregateTotals = useMemo(() => computeAggregateTotals(quotas), [quotas])

  const aggregateProjections = useMemo(() => computeAggregateProjections(quotas), [quotas])

  return {
    accounts,
    quotas,
    orgBudgets,
    uniqueOrgs,
    refreshAll,
    anyLoading,
    aggregateTotals,
    aggregateProjections,
    orgOverageFromQuotas,
  }
}
