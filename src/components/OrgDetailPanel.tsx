import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Building2,
  ExternalLink,
  FolderKanban,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import {
  GitHubClient,
  type OrgMemberResult,
  type OrgOverviewResult,
  type OrgRepoResult,
} from '../api/github'
import { dataCache } from '../services/dataCache'
import { getTaskQueue } from '../services/taskQueue'
import { MS_PER_MINUTE } from '../constants'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import type { GitHubAccount } from '../types/config'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { OVERAGE_COST_PER_REQUEST, formatCurrency } from './copilot-usage/quotaUtils'
import { formatDistanceToNow, formatTime } from '../utils/dateUtils'
import { RateLimitGauge } from './RateLimitGauge'
import './CopilotUsagePanel.css'
import './OrgDetailPanel.css'

interface OrgDetailPanelProps {
  org: string
  memberLogin?: string
}

interface OrgCopilotUsageData {
  org: string
  premiumRequests: number
  grossCost: number
  discount: number
  netCost: number
  businessSeats: number
  fetchedAt: number
}

const EMPTY_COPILOT_USAGE: OrgCopilotUsageData | null = null

type LoadPhase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

function normalizeOverview(result: OrgOverviewResult | null): OrgOverviewResult | null {
  if (!result) {
    return null
  }

  return {
    ...result,
    metrics: {
      ...result.metrics,
      repoCount: result.metrics.repoCount ?? 0,
      privateRepoCount: result.metrics.privateRepoCount ?? 0,
      archivedRepoCount: result.metrics.archivedRepoCount ?? 0,
      openIssueCount: result.metrics.openIssueCount ?? 0,
      openPullRequestCount: result.metrics.openPullRequestCount ?? 0,
      totalStars: result.metrics.totalStars ?? 0,
      totalForks: result.metrics.totalForks ?? 0,
      activeReposToday: result.metrics.activeReposToday ?? 0,
      commitsToday: result.metrics.commitsToday ?? 0,
      topContributorsToday: result.metrics.topContributorsToday ?? [],
    },
  }
}

function buildSeedOverview(org: string): OrgOverviewResult | null {
  const cachedOverview = normalizeOverview(
    dataCache.get<OrgOverviewResult>(`org-overview:${org}`)?.data ?? null
  )
  if (cachedOverview) {
    return cachedOverview
  }

  const cachedRepos = dataCache.get<OrgRepoResult>(`org-repos:${org}`)?.data ?? null
  if (!cachedRepos) {
    return null
  }

  const repos = cachedRepos.repos
  return {
    authenticatedAs: cachedRepos.authenticatedAs,
    isUserNamespace: cachedRepos.isUserNamespace,
    metrics: {
      org,
      repoCount: repos.length,
      privateRepoCount: repos.filter(repo => repo.isPrivate).length,
      archivedRepoCount: repos.filter(repo => repo.isArchived).length,
      openIssueCount: 0,
      openPullRequestCount: 0,
      totalStars: repos.reduce((sum, repo) => sum + repo.stargazersCount, 0),
      totalForks: repos.reduce((sum, repo) => sum + repo.forksCount, 0),
      activeReposToday: 0,
      commitsToday: 0,
      lastPushAt:
        repos
          .map(repo => repo.pushedAt)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null,
      topContributorsToday: [],
    },
  }
}

function resolveRefreshPhase(
  phase: LoadPhase,
  isTaskActive: boolean,
  settledPhase: Exclude<LoadPhase, 'refreshing'>
): LoadPhase {
  if (phase !== 'refreshing' || isTaskActive) {
    return phase
  }

  return settledPhase
}

export function OrgDetailPanel({ org, memberLogin }: OrgDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { refreshInterval } = usePRSettings()
  const { enqueue, stats } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const overviewCacheKey = `org-overview:${org}`
  const membersCacheKey = `org-members:${org}`
  const copilotCacheKey = `org-copilot:${org}`
  const overviewTaskName = `org-detail-overview-${org}`
  const membersTaskName = `org-detail-members-${org}`
  const copilotTaskName = `org-detail-copilot-${org}`
  const initialOverview = buildSeedOverview(org)
  const hasCachedFullOverview = Boolean(dataCache.get<OrgOverviewResult>(overviewCacheKey)?.data)
  const hasCachedMembers = Boolean(dataCache.get<OrgMemberResult>(membersCacheKey)?.data)
  const hasCachedCopilot = Boolean(dataCache.get<OrgCopilotUsageData>(copilotCacheKey)?.data)

  const [overview, setOverview] = useState<OrgOverviewResult | null>(() => initialOverview)
  const [members, setMembers] = useState<OrgMemberResult | null>(
    () => dataCache.get<OrgMemberResult>(membersCacheKey)?.data ?? null
  )
  const [copilotUsage, setCopilotUsage] = useState<OrgCopilotUsageData | null>(EMPTY_COPILOT_USAGE)
  const [overviewPhase, setOverviewPhase] = useState<LoadPhase>(() =>
    hasCachedFullOverview || initialOverview ? 'ready' : 'loading'
  )
  const [membersPhase, setMembersPhase] = useState<LoadPhase>(() =>
    hasCachedMembers ? 'ready' : 'loading'
  )
  const [copilotPhase, setCopilotPhase] = useState<LoadPhase>('loading')
  const [rateLimit, setRateLimit] = useState<{ limit: number; remaining: number; reset: number; used: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shouldRefreshOnMount = Boolean(initialOverview || hasCachedMembers || hasCachedCopilot)
  const hasOverviewRef = useRef(Boolean(initialOverview))
  const hasMembersRef = useRef(Boolean(dataCache.get<OrgMemberResult>(membersCacheKey)?.data))
  const hasCopilotRef = useRef(Boolean(dataCache.get<OrgCopilotUsageData>(copilotCacheKey)?.data))
  const preferredAccountRef = useRef<string | undefined>(undefined)
  const isUserNamespaceRef = useRef(Boolean(initialOverview?.isUserNamespace))

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    hasOverviewRef.current = Boolean(overview)
    preferredAccountRef.current =
      accounts.find(account => account.org === org)?.username ?? overview?.authenticatedAs
    isUserNamespaceRef.current = Boolean(overview?.isUserNamespace)
  }, [accounts, org, overview])

  useEffect(() => {
    hasMembersRef.current = Boolean(members)
  }, [members])

  useEffect(() => {
    hasCopilotRef.current = Boolean(copilotUsage)
  }, [copilotUsage])

  const { quotas, orgBudgets, orgOverageFromQuotas } = useCopilotUsage()

  const configuredAccounts = useMemo(
    () => accounts.filter(account => account.org === org),
    [accounts, org]
  )

  const personalQuotaSummary = useMemo(() => {
    const relevantStates = configuredAccounts
      .map(account => quotas[account.username])
      .filter((state): state is NonNullable<typeof state> =>
        Boolean(state?.data?.quota_snapshots?.premium_interactions)
      )

    if (relevantStates.length === 0) {
      return null
    }

    return relevantStates.reduce(
      (acc, state) => {
        const premium = state.data!.quota_snapshots.premium_interactions
        const used = premium.entitlement - premium.remaining
        const overageByCount = Math.max(0, premium.overage_count)
        const overageByRemaining = Math.max(0, -premium.remaining)
        const overageRequests = Math.max(overageByCount, overageByRemaining)

        acc.used += used
        acc.remaining += premium.remaining
        acc.entitlement += premium.entitlement
        acc.overageCost += overageRequests * OVERAGE_COST_PER_REQUEST
        acc.fetchedAt = Math.max(acc.fetchedAt, state.fetchedAt ?? 0)

        return acc
      },
      { used: 0, remaining: 0, entitlement: 0, overageCost: 0, fetchedAt: 0 }
    )
  }, [configuredAccounts, quotas])

  const personalQuotaLoading = useMemo(
    () =>
      configuredAccounts.length > 0 &&
      configuredAccounts.some(account => {
        const state = quotas[account.username]
        return !state || state.loading
      }),
    [configuredAccounts, quotas]
  )

  useEffect(() => {
    if (!isUserNamespaceRef.current) {
      return
    }

    if (personalQuotaLoading) {
      setCopilotPhase('loading')
      return
    }

    setCopilotPhase(personalQuotaSummary ? 'ready' : 'error')
  }, [personalQuotaLoading, personalQuotaSummary])

  const githubQueue = getTaskQueue('github')
  void stats // referenced to preserve reactivity from useTaskQueue
  const isOverviewTaskActive = githubQueue.hasTaskWithName(overviewTaskName)
  const isMembersTaskActive = githubQueue.hasTaskWithName(membersTaskName)
  const isCopilotTaskActive = githubQueue.hasTaskWithName(copilotTaskName)
  const liveOverviewPhase = resolveRefreshPhase(
    overviewPhase,
    isOverviewTaskActive,
    overview ? 'ready' : 'loading'
  )
  const liveMembersPhase = resolveRefreshPhase(
    membersPhase,
    isMembersTaskActive,
    members ? 'ready' : 'loading'
  )
  const liveCopilotPhase = resolveRefreshPhase(
    copilotPhase,
    isCopilotTaskActive,
    isUserNamespaceRef.current
      ? personalQuotaSummary
        ? 'ready'
        : personalQuotaLoading
          ? 'loading'
          : 'error'
      : copilotUsage
        ? 'ready'
        : 'error'
  )

  const selectedMember = useMemo(
    () => members?.members.find(member => member.login === memberLogin) ?? null,
    [memberLogin, members]
  )

  const selectedConfiguredAccount = useMemo(
    () => configuredAccounts.find(account => account.username === memberLogin) ?? null,
    [configuredAccounts, memberLogin]
  )

  const contributorMap = useMemo(
    () =>
      new Map(
        (overview?.metrics.topContributorsToday ?? []).map(contributor => [
          contributor.login,
          contributor,
        ])
      ),
    [overview]
  )

  const selectedContributor = memberLogin ? (contributorMap.get(memberLogin) ?? null) : null
  const budgetState = orgBudgets[org]
  const quotaOverage = orgOverageFromQuotas.get(org) ?? 0

  const hasFullOverview = hasCachedFullOverview || overviewPhase === 'ready'

  const fetchOverview = useCallback(
    async (forceRefresh = false) => {
      const queue = getTaskQueue('github')
      const taskName = overviewTaskName
      const cachedOverview = normalizeOverview(
        dataCache.get<OrgOverviewResult>(overviewCacheKey)?.data ?? null
      )
      if (cachedOverview && !forceRefresh) {
        setOverview(cachedOverview)
        setOverviewPhase('ready')
        return
      }

      if (queue.hasTaskWithName(taskName)) {
        return
      }

      setOverviewPhase(hasOverviewRef.current ? 'refreshing' : 'loading')

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgOverview(org)
          },
          { name: taskName, priority: -1 }
        )

        startTransition(() => {
          setOverview(normalizeOverview(result))
          setOverviewPhase('ready')
        })
        dataCache.set(overviewCacheKey, normalizeOverview(result))
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setOverviewPhase('error')
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
      }
    },
    [accounts, org, overviewCacheKey, overviewTaskName]
  )

  const fetchMembers = useCallback(
    async (forceRefresh = false) => {
      const queue = getTaskQueue('github')
      const taskName = membersTaskName
      const cachedMembers = dataCache.get<OrgMemberResult>(membersCacheKey)?.data ?? null
      if (cachedMembers && !forceRefresh) {
        setMembers(cachedMembers)
        setMembersPhase('ready')
        return
      }

      if (queue.hasTaskWithName(taskName)) {
        return
      }

      setMembersPhase(hasMembersRef.current ? 'refreshing' : 'loading')

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgMembers(org)
          },
          { name: taskName, priority: -1 }
        )

        startTransition(() => {
          setMembers(result)
          setMembersPhase('ready')
        })
        dataCache.set(membersCacheKey, result)
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setMembersPhase('error')
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
      }
    },
    [accounts, membersCacheKey, membersTaskName, org]
  )

  const fetchCopilot = useCallback(
    async (forceRefresh = false) => {
      if (isUserNamespaceRef.current) {
        return
      }

      const queue = getTaskQueue('github')
      const taskName = copilotTaskName
      const cachedCopilot = dataCache.get<OrgCopilotUsageData>(copilotCacheKey)?.data ?? null
      if (cachedCopilot && !forceRefresh) {
        setCopilotUsage(cachedCopilot)
        setCopilotPhase('ready')
        return
      }

      if (queue.hasTaskWithName(taskName)) {
        return
      }

      setCopilotPhase(hasCopilotRef.current ? 'refreshing' : 'loading')

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            return await window.github.getCopilotUsage(org, preferredAccountRef.current)
          },
          { name: taskName, priority: -1 }
        )
        if (result.success && result.data) {
          const metrics: OrgCopilotUsageData = {
            org: result.data.org,
            premiumRequests: result.data.premiumRequests,
            grossCost: result.data.grossCost,
            discount: result.data.discount,
            netCost: result.data.netCost,
            businessSeats: result.data.businessSeats,
            fetchedAt: result.data.fetchedAt,
          }
          startTransition(() => {
            setCopilotUsage(metrics)
            setCopilotPhase('ready')
          })
          dataCache.set(copilotCacheKey, metrics)
        } else {
          setCopilotPhase('error')
        }
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return
        setCopilotPhase('error')
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
      }
    },
    [copilotCacheKey, copilotTaskName, org]
  )

  const fetchAll = useCallback(
    async (forceRefresh = false) => {
      setError(null)
      const work = [fetchOverview(forceRefresh), fetchMembers(forceRefresh)]
      if (!isUserNamespaceRef.current) {
        work.push(fetchCopilot(forceRefresh))
      }
      await Promise.allSettled(work)
    },
    [fetchCopilot, fetchMembers, fetchOverview]
  )

  const fetchRateLimit = useCallback(async () => {
    try {
      const client = new GitHubClient({ accounts }, 7)
      const result = await client.getRateLimit(org)
      setRateLimit(result)
    } catch {
      // silently ignore — gauge just won't render
    }
  }, [accounts, org])

  useEffect(() => {
    fetchAll(shouldRefreshOnMount)
    fetchRateLimit()
  }, [fetchAll, fetchRateLimit, shouldRefreshOnMount])

  useEffect(() => {
    const timer = setInterval(fetchRateLimit, 60_000)
    return () => clearInterval(timer)
  }, [fetchRateLimit])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const timer = setInterval(() => fetchAll(true), intervalMs)
    return () => clearInterval(timer)
  }, [fetchAll, refreshInterval])

  const isInitialLoading = !overview && liveOverviewPhase === 'loading'
  const isUpdating =
    liveOverviewPhase === 'refreshing' ||
    liveMembersPhase === 'refreshing' ||
    liveCopilotPhase === 'refreshing'

  if (isInitialLoading) {
    return (
      <div className="org-detail-loading">
        <RefreshCw size={32} className="spin" />
        <p>Building organization overview...</p>
        <p className="org-detail-loading-sub">{org}</p>
      </div>
    )
  }

  if (error && !overview) {
    return (
      <div className="org-detail-error">
        <AlertCircle size={32} />
        <p className="org-detail-error-title">Failed to load organization overview</p>
        <p className="org-detail-error-detail">{error}</p>
        <button className="org-detail-refresh-btn" onClick={() => fetchAll(true)}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!overview) return null

  const memberCount = members?.members.length ?? 0
  const selectedMemberQuotaState = selectedConfiguredAccount
    ? quotas[selectedConfiguredAccount.username]
    : null
  const shouldShowPersonalQuotaPulse = overview.isUserNamespace && Boolean(personalQuotaSummary)

  return (
    <div className="org-detail-container">
      <div className="org-detail-hero">
        <div className="org-detail-hero-copy">
          <div className="org-detail-kicker">
            <Building2 size={14} />
            <span>{overview.isUserNamespace ? 'User Namespace' : 'Organization Overview'}</span>
          </div>
          <h2 className="org-detail-title">{org}</h2>
          <p className="org-detail-subtitle">
            Authenticated via @{overview.authenticatedAs}
            {selectedMember ? ` · spotlight on ${selectedMember.login}` : ''}
          </p>
          <div className="org-detail-status-row">
            <LivePill label="Overview" phase={liveOverviewPhase} />
            <LivePill label="Members" phase={liveMembersPhase} />
            <LivePill label="Copilot" phase={liveCopilotPhase} />
          </div>
        </div>
        <div className="org-detail-hero-right">
          {rateLimit && (
            <RateLimitGauge remaining={rateLimit.remaining} limit={rateLimit.limit} reset={rateLimit.reset} />
          )}
          <div className="org-detail-actions">
            <button className="org-detail-refresh-btn" onClick={() => fetchAll(true)}>
              <RefreshCw size={14} />
              {isUpdating ? 'Updating…' : 'Refresh'}
            </button>
            <button
              className="org-detail-link-btn"
              onClick={() => window.shell.openExternal(`https://github.com/${org}`)}
            >
              <ExternalLink size={14} />
              Open GitHub
            </button>
          </div>
        </div>
      </div>

      <div className="org-detail-metric-grid">
        <MetricCard
          icon={FolderKanban}
          label="Repositories"
          value={overview.metrics.repoCount.toLocaleString()}
          detail={`${overview.metrics.privateRepoCount} private · ${overview.metrics.archivedRepoCount} archived`}
        />
        <MetricCard
          icon={GitCommitHorizontal}
          label="Commits Today"
          value={overview.metrics.commitsToday.toLocaleString()}
          detail={`${overview.metrics.activeReposToday} active repos`}
          accent="warm"
        />
        <MetricCard
          icon={Star}
          label="Stars"
          value={overview.metrics.totalStars.toLocaleString()}
          detail={`${overview.metrics.totalForks.toLocaleString()} forks`}
          accent="cool"
        />
        <MetricCard
          icon={GitPullRequest}
          label="Open PRs"
          value={overview.metrics.openPullRequestCount.toLocaleString()}
          detail={`${overview.metrics.openIssueCount.toLocaleString()} open issues`}
        />
        <MetricCard
          icon={Users}
          label="Members"
          value={memberCount.toLocaleString()}
          detail={
            overview.metrics.lastPushAt
              ? `last push ${formatDistanceToNow(overview.metrics.lastPushAt)}`
              : 'no recent pushes'
          }
        />
      </div>

      {isUpdating && (
        <div className="org-detail-update-banner">
          <RefreshCw size={14} className="spin" />
          <span>
            Updating live organization signals in the background. Existing data stays interactive.
          </span>
        </div>
      )}

      <div className="org-detail-section-grid">
        <section className="org-detail-section org-detail-copilot-section">
          <div className="org-detail-section-header">
            <h3>
              <Sparkles size={15} />
              {overview.isUserNamespace ? 'Copilot Quota' : 'Copilot Pulse'}
            </h3>
            {!overview.isUserNamespace && copilotUsage?.fetchedAt && (
              <span className="org-detail-fetched-at">{formatTime(copilotUsage.fetchedAt)}</span>
            )}
            {overview.isUserNamespace && personalQuotaSummary?.fetchedAt ? (
              <span className="org-detail-fetched-at">
                {formatTime(personalQuotaSummary.fetchedAt)}
              </span>
            ) : null}
          </div>
          <div className="org-detail-copilot-grid">
            {shouldShowPersonalQuotaPulse ? (
              <>
                <MiniMetric
                  label="Used Premium"
                  value={personalQuotaSummary!.used.toLocaleString()}
                />
                <MiniMetric
                  label="Remaining"
                  value={personalQuotaSummary!.remaining.toLocaleString()}
                  accent="cool"
                />
                <MiniMetric
                  label="Entitlement"
                  value={personalQuotaSummary!.entitlement.toLocaleString()}
                />
                <MiniMetric
                  label="Overage Cost"
                  value={formatCurrency(personalQuotaSummary!.overageCost)}
                  accent="warm"
                />
              </>
            ) : (
              <>
                <MiniMetric
                  label="Premium Requests"
                  value={(copilotUsage?.premiumRequests ?? 0).toLocaleString()}
                />
                <MiniMetric
                  label="Net Cost"
                  value={formatCurrency(copilotUsage?.netCost ?? 0)}
                  accent="warm"
                />
                <MiniMetric
                  label="Gross Cost"
                  value={formatCurrency(copilotUsage?.grossCost ?? 0)}
                />
                <MiniMetric
                  label="Business Seats"
                  value={(copilotUsage?.businessSeats ?? 0).toLocaleString()}
                  accent="cool"
                />
              </>
            )}
          </div>
          {liveCopilotPhase !== 'ready' && !copilotUsage && !shouldShowPersonalQuotaPulse && (
            <div className="org-detail-empty org-detail-empty-inline">
              {overview.isUserNamespace
                ? 'Waiting for personal quota data.'
                : 'Copilot metrics are still warming up.'}
            </div>
          )}
          {overview.isUserNamespace ? (
            <div className="org-detail-budget-band">
              <div>
                <span className="org-detail-budget-label">Namespace Type</span>
                <strong>Personal quota</strong>
              </div>
              <div>
                <span className="org-detail-budget-label">Configured Accounts</span>
                <strong>{configuredAccounts.length.toLocaleString()}</strong>
              </div>
              <div>
                <span className="org-detail-budget-label">My Share</span>
                <strong>{formatCurrency(personalQuotaSummary?.overageCost ?? quotaOverage)}</strong>
              </div>
            </div>
          ) : (
            <div className="org-detail-budget-band">
              <div>
                <span className="org-detail-budget-label">Budget</span>
                <strong>
                  {budgetState?.data?.budgetAmount !== null &&
                  budgetState?.data?.budgetAmount !== undefined
                    ? formatCurrency(budgetState.data.budgetAmount)
                    : 'Not set'}
                </strong>
              </div>
              <div>
                <span className="org-detail-budget-label">Spent</span>
                <strong>{formatCurrency(budgetState?.data?.spent ?? 0)}</strong>
              </div>
              <div>
                <span className="org-detail-budget-label">My Share</span>
                <strong>{formatCurrency(quotaOverage)}</strong>
              </div>
            </div>
          )}
        </section>

        <section className="org-detail-section">
          <div className="org-detail-section-header">
            <h3>
              <GitBranch size={15} />
              Today&apos;s Leaders
            </h3>
          </div>
          {overview.metrics.topContributorsToday.length === 0 && !hasFullOverview ? (
            <div className="org-detail-empty">Activity ranking is still being computed.</div>
          ) : overview.metrics.topContributorsToday.length === 0 ? (
            <div className="org-detail-empty">No commits recorded yet today.</div>
          ) : (
            <div className="org-detail-leaderboard">
              {overview.metrics.topContributorsToday.map(contributor => (
                <button
                  key={contributor.login}
                  className={`org-detail-leader ${memberLogin === contributor.login ? 'active' : ''}`}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('app:navigate', {
                        detail: { viewId: `org-user:${org}/${contributor.login}` },
                      })
                    )
                  }
                >
                  <span className="org-detail-leader-rank">{contributor.commits}</span>
                  <span className="org-detail-leader-name">{contributor.login}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedMember && (
        <section className="org-detail-section org-detail-member-spotlight">
          <div className="org-detail-section-header">
            <h3>
              <Shield size={15} />
              Member Spotlight
            </h3>
          </div>
          <div className="org-detail-member-card">
            <div>
              <div className="org-detail-member-name">{selectedMember.login}</div>
              <div className="org-detail-member-meta">
                {selectedMember.type}
                {selectedContributor
                  ? ` · ${selectedContributor.commits} commits today`
                  : ' · no commits today'}
              </div>
            </div>
            <button
              className="org-detail-link-btn"
              onClick={() => window.shell.openExternal(selectedMember.url)}
            >
              <ExternalLink size={14} />
              Profile
            </button>
          </div>
          {selectedConfiguredAccount && selectedMemberQuotaState ? (
            <div className="org-detail-account-grid org-detail-account-grid-single">
              <AccountQuotaCard
                account={selectedConfiguredAccount as GitHubAccount}
                state={selectedMemberQuotaState}
              />
            </div>
          ) : (
            <div className="org-detail-empty">
              No configured Copilot quota card for this member.
            </div>
          )}
        </section>
      )}

      {configuredAccounts.length > 0 && (
        <section className="org-detail-section">
          <div className="org-detail-section-header">
            <h3>
              <Users size={15} />
              Configured Accounts
            </h3>
          </div>
          <div className="org-detail-account-grid">
            {configuredAccounts.map(account => (
              <AccountQuotaCard
                key={account.username}
                account={account as GitHubAccount}
                state={quotas[account.username]}
              />
            ))}
          </div>
        </section>
      )}

      <section className="org-detail-section">
        <div className="org-detail-section-header">
          <h3>
            <Users size={15} />
            Member Roster
          </h3>
        </div>
        {members?.members.length ? (
          <div className="org-detail-roster">
            {members.members.map(member => {
              const contributor = contributorMap.get(member.login)
              const isConfigured = configuredAccounts.some(
                account => account.username === member.login
              )
              return (
                <button
                  key={member.login}
                  className={`org-detail-roster-item ${memberLogin === member.login ? 'active' : ''}`}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('app:navigate', {
                        detail: { viewId: `org-user:${org}/${member.login}` },
                      })
                    )
                  }
                >
                  <span className="org-detail-roster-name">{member.login}</span>
                  <span className="org-detail-roster-meta">
                    {contributor ? `${contributor.commits} today` : 'idle today'}
                    {isConfigured ? ' · configured' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="org-detail-empty">No members returned for this namespace.</div>
        )}
      </section>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = 'default',
}: {
  icon: typeof Building2
  label: string
  value: string
  detail: string
  accent?: 'default' | 'warm' | 'cool'
}) {
  return (
    <div className={`org-detail-metric-card org-detail-metric-card-${accent}`}>
      <div className="org-detail-metric-icon">
        <Icon size={16} />
      </div>
      <div>
        <div className="org-detail-metric-label">{label}</div>
        <div className="org-detail-metric-value">{value}</div>
        <div className="org-detail-metric-detail">{detail}</div>
      </div>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  accent = 'default',
}: {
  label: string
  value: string
  accent?: 'default' | 'warm' | 'cool'
}) {
  return (
    <div className={`org-detail-mini-metric org-detail-mini-metric-${accent}`}>
      <span className="org-detail-mini-label">{label}</span>
      <strong className="org-detail-mini-value">{value}</strong>
    </div>
  )
}

function LivePill({ label, phase }: { label: string; phase: LoadPhase }) {
  const phaseLabel =
    phase === 'refreshing'
      ? 'Updating…'
      : phase === 'loading'
        ? 'Loading…'
        : phase === 'error'
          ? 'Unavailable'
          : 'Live'

  return (
    <span className={`org-detail-live-pill org-detail-live-pill-${phase}`}>
      <span className="org-detail-live-pill-label">{label}</span>
      <span className="org-detail-live-pill-value">{phaseLabel}</span>
    </span>
  )
}
