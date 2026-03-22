import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useGitHubAccounts } from './useConfig'
import { OVERAGE_COST_PER_REQUEST, computeProjection } from '../components/copilot-usage/quotaUtils'
import type { AccountQuotaState } from '../components/copilot-usage/quotaUtils'
import type { OrgBudgetState } from '../components/copilot-usage/types'
import { getErrorMessage } from '../utils/errorUtils'

type FetchResult<T> = {
  success: boolean
  data?: T
  error?: string
}

function applyFetchResult<K extends string, TState, TData>(
  setter: Dispatch<SetStateAction<Record<K, TState>>>,
  key: K,
  toLoading: (previous: TState | undefined) => TState,
  toSuccess: (data: TData) => TState,
  toError: (error: string) => TState,
  fetcher: () => Promise<FetchResult<TData>>
) {
  setter(prev => ({
    ...prev,
    [key]: toLoading(prev[key]),
  }))

  fetcher()
    .then(result => {
      setter(prev => ({
        ...prev,
        [key]:
          result.success && result.data
            ? toSuccess(result.data)
            : toError(result.error || 'Unknown error'),
      }))
    })
    .catch(error => {
      setter(prev => ({
        ...prev,
        [key]: toError(getErrorMessage(error)),
      }))
    })
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

  const fetchQuota = useCallback(async (username: string) => {
    applyFetchResult(
      setQuotas,
      username,
      previous => ({
        data: previous?.data ?? null,
        loading: true,
        error: null,
        fetchedAt: previous?.fetchedAt ?? null,
      }),
      data => ({ data, loading: false, error: null, fetchedAt: Date.now() }),
      error => ({ data: null, loading: false, error, fetchedAt: null }),
      () => window.github.getCopilotQuota(username)
    )
  }, [])

  const fetchBudget = useCallback(async (org: string, username?: string) => {
    applyFetchResult(
      setOrgBudgets,
      org,
      previous => ({ data: previous?.data ?? null, loading: true, error: null }),
      data => ({ data, loading: false, error: null }),
      error => ({ data: null, loading: false, error }),
      () => window.github.getCopilotBudget(org, username)
    )
  }, [])

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
    const refreshInterval = setInterval(
      () => {
        const now = new Date()
        const currentUtcMonth = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1)

        const needsRefresh = Object.values(orgBudgets).some(state => {
          if (!state.data) {
            return false
          }
          const dataMonth = state.data.billingYear * 100 + state.data.billingMonth
          return dataMonth < currentUtcMonth
        })

        if (needsRefresh) {
          refreshAll()
        }
      },
      5 * 60 * 1000
    )

    return () => clearInterval(refreshInterval)
  }, [orgBudgets, refreshAll])

  const orgOverageFromQuotas = useMemo(() => {
    const map = new Map<string, number>()
    for (const account of accounts) {
      const state = quotas[account.username]
      const premium = state?.data?.quota_snapshots?.premium_interactions
      if (!premium || !account.org) {
        continue
      }

      const overageByCount = Math.max(0, premium.overage_count)
      const overageByRemaining = Math.max(0, -premium.remaining)
      const overageRequests = Math.max(overageByCount, overageByRemaining)
      const cost = overageRequests * OVERAGE_COST_PER_REQUEST
      map.set(account.org, (map.get(account.org) ?? 0) + cost)
    }
    return map
  }, [accounts, quotas])

  const anyLoading = useMemo(() => Object.values(quotas).some(state => state.loading), [quotas])

  const aggregateTotals = useMemo(
    () =>
      Object.values(quotas).reduce(
        (acc, state) => {
          const premium = state.data?.quota_snapshots?.premium_interactions
          if (!premium) {
            return acc
          }

          const used = premium.entitlement - premium.remaining
          const overageByCount = Math.max(0, premium.overage_count)
          const overageByRemaining = Math.max(0, -premium.remaining)
          const overageRequests = Math.max(overageByCount, overageByRemaining)

          acc.totalUsed += used
          acc.totalOverageCost += overageRequests * OVERAGE_COST_PER_REQUEST
          return acc
        },
        { totalUsed: 0, totalOverageCost: 0 }
      ),
    [quotas]
  )

  const aggregateProjections = useMemo(() => {
    let projectedTotal = 0
    let projectedOverageCost = 0
    let hasAny = false

    for (const state of Object.values(quotas)) {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium || !state.data) {
        continue
      }

      const projection = computeProjection(premium, state.data.quota_reset_date_utc)
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
  }, [quotas])

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
