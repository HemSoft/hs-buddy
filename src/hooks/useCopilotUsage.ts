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
  computeBudgetProjection,
  synthesizeQuotaData,
  type AccountQuotaState,
} from '../components/copilot-usage/quotaUtils'
import type { OrgBudgetState } from '../components/copilot-usage/types'
import type { GitHubAccount } from '../types/config'
import { MS_PER_MINUTE } from '../constants'
import { getErrorMessage } from '../utils/errorUtils'

interface OrgAccountGroup {
  org: string
  usernames: string[]
}

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

function groupAccountsByOrg(accounts: { username: string; org: string }[]): OrgAccountGroup[] {
  const groups = new Map<string, OrgAccountGroup>()
  for (const account of accounts) {
    if (!account.org) continue
    let group = groups.get(account.org)
    if (!group) {
      group = { org: account.org, usernames: [] }
      groups.set(account.org, group)
    }
    group.usernames.push(account.username)
  }
  return [...groups.values()]
}

function selectRepresentativeState(
  usernames: string[],
  quotas: Partial<Record<string, AccountQuotaState>>
): AccountQuotaState | undefined {
  let fallback: AccountQuotaState | undefined
  for (const username of usernames) {
    const state = quotas[username]
    if (!state) continue
    if (state.data) return state
    fallback ??= state
  }
  return fallback
}

/**
 * One representative quota state per unique org.
 *
 * Under AI Credits billing every account in the same org synthesizes the
 * identical org-wide pool snapshot, so aggregating across all accounts would
 * multiply org usage by the number of accounts in that org. Deduplicating by
 * org keeps cross-org sums correct while counting each org pool once.
 *
 * Because each account fetches with its own token and org billing access can
 * differ between accounts, the representative is the first account (in config
 * order) whose fetch produced usable `data`, falling back to an error/loading
 * state only when no account in that org has data yet.
 */
function selectOrgRepresentatives(
  accounts: { username: string; org: string }[],
  quotas: Record<string, AccountQuotaState>
): { org: string; state: AccountQuotaState }[] {
  const reps: { org: string; state: AccountQuotaState }[] = []
  for (const { org, usernames } of groupAccountsByOrg(accounts)) {
    const chosen = selectRepresentativeState(usernames, quotas)
    if (chosen) reps.push({ org, state: chosen })
  }
  return reps
}

function computeAggregateProjections(reps: { org: string; state: AccountQuotaState }[]) {
  let projectedTotal = 0
  let projectedOverageCost = 0
  let hasAny = false

  for (const { state } of reps) {
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

function computeOrgOverage(reps: { org: string; state: AccountQuotaState }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const { org, state } of reps) {
    const premium = getPremiumInteractions(state)
    if (!premium) continue
    const overageRequests = computeOverageRequests(premium)
    map.set(org, overageRequests * OVERAGE_COST_PER_CREDIT)
  }
  return map
}

function computeAggregateTotals(reps: { org: string; state: AccountQuotaState }[]) {
  return reps.reduce(
    (acc, { state }) => {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium) return acc
      const used = premium.entitlement - premium.remaining
      const overageRequests = computeOverageRequests(premium)
      acc.totalUsed += used
      acc.totalEntitlement += premium.entitlement
      acc.totalOverageCost += overageRequests * OVERAGE_COST_PER_CREDIT
      return acc
    },
    { totalUsed: 0, totalEntitlement: 0, totalOverageCost: 0 }
  )
}

/**
 * Aggregate dollar spend across every org budget.
 *
 * `totalSpent` sums each org's net billed spend so far this period. `projectedSpend`
 * extrapolates each org to month-end (same linear model as the per-org card) and sums
 * the results, so the header total stays consistent with the individual projections.
 *
 * Orgs whose card hides a projection — those billing from the quota pool
 * (`useQuotaOverage`) or with unavailable spend (`spentUnavailable`) — are excluded
 * from both sums to avoid mixing dollar spend with credit-pool overage estimates.
 * Returns null when no org contributes a usable dollar figure.
 */
function computeAggregateSpend(
  orgBudgets: Record<string, OrgBudgetState>
): { totalSpent: number; projectedSpend: number } | null {
  let totalSpent = 0
  let projectedSpend = 0
  let hasAny = false

  for (const state of Object.values(orgBudgets)) {
    const d = state.data
    if (!d || d.useQuotaOverage || d.spentUnavailable) continue
    if (typeof d.spent !== 'number' || !Number.isFinite(d.spent)) continue

    hasAny = true
    totalSpent += d.spent

    const projection = computeBudgetProjection(d.spent, d.billingYear, d.billingMonth, d.fetchedAt)
    projectedSpend += projection ? projection.projectedSpend : d.spent
  }

  if (!hasAny) return null

  return { totalSpent, projectedSpend }
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

const NO_ORG_POOL_ERROR = 'Per-account AI Credit data requires an organization with Copilot seats.'

function setQuotaError(setQuotas: QuotaSetter, username: string, error: string): void {
  setQuotas(prev => ({
    ...prev,
    [username]: { data: null, loading: false, error, fetchedAt: null },
  }))
}

/**
 * Fetch the org AI Credit pool for an account and synthesize a quota snapshot.
 * Under June 2026 AI Credits billing the per-user quota endpoint reports zeros,
 * so usage is derived from the org billing/usage pool (used credits, gross/net,
 * seats → allotment). Accounts without an org or seats degrade to an explicit
 * "unavailable" message rather than misleading zeros.
 */
async function doFetchQuota(account: GitHubAccount, setQuotas: QuotaSetter): Promise<void> {
  const { username, org } = account

  setQuotas(prev => ({
    ...prev,
    [username]: {
      data: prev[username]?.data ?? null,
      loading: true,
      error: null,
      fetchedAt: prev[username]?.fetchedAt ?? null,
    },
  }))

  if (!org) {
    setQuotaError(setQuotas, username, NO_ORG_POOL_ERROR)
    return
  }

  try {
    const result = await window.github.getCopilotUsage(org, username)
    if (!result.success || !result.data) {
      setQuotaError(setQuotas, username, result.error || 'Unknown error')
      return
    }

    const d = result.data
    if (d.seats <= 0) {
      setQuotaError(setQuotas, username, NO_ORG_POOL_ERROR)
      return
    }

    const data = synthesizeQuotaData({
      login: username,
      plan: d.seatPlan,
      org,
      usedCredits: d.premiumRequests,
      grossCost: d.grossCost,
      netCost: d.netCost,
      seats: d.seats,
      billingYear: d.billingYear,
      billingMonth: d.billingMonth,
      userCredits: d.userCredits,
    })
    setQuotas(prev => ({
      ...prev,
      [username]: { data, loading: false, error: null, fetchedAt: Date.now() },
    }))
  } catch (error: unknown) {
    setQuotaError(setQuotas, username, getErrorMessage(error))
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

  const fetchQuota = useCallback(
    async (account: GitHubAccount) => doFetchQuota(account, setQuotas),
    []
  )

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
      fetchQuota(account)
    }
  }, [accounts, accountUsernamesKey, fetchQuota])

  useEffect(() => {
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }, [fetchBudget, uniqueOrgs, uniqueOrgsKey])

  const refreshAll = useCallback(() => {
    for (const account of accounts) {
      fetchQuota(account)
    }
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }, [accounts, fetchBudget, fetchQuota, uniqueOrgs])

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (needsMonthRolloverRefresh(orgBudgets)) refreshAll()
    }, 5 * MS_PER_MINUTE)

    return () => {
      clearInterval(refreshInterval)
    }
  }, [orgBudgets, refreshAll])

  const orgRepresentatives = useMemo(
    () => selectOrgRepresentatives(accounts, quotas),
    [accounts, quotas]
  )

  const orgOverageFromQuotas = useMemo(
    () => computeOrgOverage(orgRepresentatives),
    [orgRepresentatives]
  )

  const anyLoading = useMemo(() => Object.values(quotas).some(state => state.loading), [quotas])

  const aggregateTotals = useMemo(
    () => computeAggregateTotals(orgRepresentatives),
    [orgRepresentatives]
  )

  const aggregateProjections = useMemo(
    () => computeAggregateProjections(orgRepresentatives),
    [orgRepresentatives]
  )

  const aggregateSpend = useMemo(() => computeAggregateSpend(orgBudgets), [orgBudgets])

  return {
    accounts,
    quotas,
    orgBudgets,
    uniqueOrgs,
    refreshAll,
    anyLoading,
    aggregateTotals,
    aggregateProjections,
    aggregateSpend,
    orgOverageFromQuotas,
  }
}
