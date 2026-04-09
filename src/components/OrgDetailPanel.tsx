import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  ExternalLink,
  Filter,
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
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
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

type LoadPhase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'
type RosterFilter = 'all' | 'active' | 'configured' | 'idle'
type RosterSort = 'name' | 'commits'
type OrgContributor = OrgOverviewResult['metrics']['topContributorsToday'][number]
type OrgMember = OrgMemberResult['members'][number]
type CopilotBudgetState = ReturnType<typeof useCopilotUsage>['orgBudgets'][string]
type CopilotQuotaState = ReturnType<typeof useCopilotUsage>['quotas'][string]

interface PersonalQuotaSummary {
  used: number
  remaining: number
  entitlement: number
  overageCost: number
  fetchedAt: number
}

interface RateLimitSnapshot {
  limit: number
  remaining: number
  reset: number
  used: number
}

interface OrgCopilotState {
  usage: OrgCopilotUsageData | null
  phase: LoadPhase
  error: string | null
}

type OrgCopilotAction =
  | { type: 'reset-for-user-namespace' }
  | { type: 'hydrate-cache'; usage: OrgCopilotUsageData | null }
  | { type: 'start-loading'; hasUsage: boolean }
  | { type: 'success'; usage: OrgCopilotUsageData }
  | { type: 'error'; error: string | null }

function createOrgCopilotState(cachedCopilot: OrgCopilotUsageData | null): OrgCopilotState {
  return {
    usage: cachedCopilot,
    phase: cachedCopilot ? 'ready' : 'loading',
    error: null,
  }
}

function orgCopilotReducer(state: OrgCopilotState, action: OrgCopilotAction): OrgCopilotState {
  switch (action.type) {
    case 'reset-for-user-namespace':
      return {
        usage: null,
        phase: 'loading',
        error: null,
      }
    case 'hydrate-cache':
      return {
        usage: action.usage,
        phase: 'ready',
        error: null,
      }
    case 'start-loading':
      return {
        ...state,
        phase: action.hasUsage ? 'refreshing' : 'loading',
        error: null,
      }
    case 'success':
      return {
        usage: action.usage,
        phase: 'ready',
        error: null,
      }
    case 'error':
      return {
        ...state,
        phase: 'error',
        error: action.error,
      }
    default:
      return state
  }
}

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

function resolvePersonalCopilotPhase(
  personalQuotaSummary: PersonalQuotaSummary | null,
  personalQuotaLoading: boolean
): LoadPhase {
  if (personalQuotaSummary) return 'ready'
  if (personalQuotaLoading) return 'loading'
  return 'error'
}

function navigateToOrgUser(org: string, login: string) {
  window.dispatchEvent(
    new CustomEvent('app:navigate', {
      detail: { viewId: `org-user:${org}/${login}` },
    })
  )
}

function OrgDetailHero({
  org,
  overview,
  highlightedMemberLogin,
  liveOverviewPhase,
  liveMembersPhase,
  liveCopilotPhase,
  rateLimit,
  isUpdating,
  onRefresh,
}: {
  org: string
  overview: OrgOverviewResult
  highlightedMemberLogin: string | null
  liveOverviewPhase: LoadPhase
  liveMembersPhase: LoadPhase
  liveCopilotPhase: LoadPhase
  rateLimit: RateLimitSnapshot | null
  isUpdating: boolean
  onRefresh: () => void
}) {
  return (
    <div className="org-detail-hero">
      <div className="org-detail-hero-copy">
        <div className="org-detail-kicker">
          <Building2 size={14} />
          <span>{overview.isUserNamespace ? 'User Namespace' : 'Organization Overview'}</span>
        </div>
        <h2 className="org-detail-title">{org}</h2>
        <p className="org-detail-subtitle">
          Authenticated via @{overview.authenticatedAs}
          {highlightedMemberLogin ? ` · spotlight on ${highlightedMemberLogin}` : ''}
        </p>
        <div className="org-detail-status-row">
          <LivePill label="Overview" phase={liveOverviewPhase} />
          <LivePill label="Members" phase={liveMembersPhase} />
          <LivePill label="Copilot" phase={liveCopilotPhase} />
        </div>
      </div>
      <div className="org-detail-hero-right">
        {rateLimit && (
          <RateLimitGauge
            remaining={rateLimit.remaining}
            limit={rateLimit.limit}
            reset={rateLimit.reset}
          />
        )}
        <div className="org-detail-actions">
          <button className="org-detail-refresh-btn" onClick={onRefresh}>
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
  )
}

function OrgMetricsGrid({
  overview,
  memberCount,
}: {
  overview: OrgOverviewResult
  memberCount: number
}) {
  return (
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
  )
}

function OrgCopilotSection({
  overview,
  copilotUsage,
  personalQuotaSummary,
  configuredAccountsCount,
  budgetState,
  quotaOverage,
  liveCopilotPhase,
  shouldShowPersonalQuotaPulse,
}: {
  overview: OrgOverviewResult
  copilotUsage: OrgCopilotUsageData | null
  personalQuotaSummary: PersonalQuotaSummary | null
  configuredAccountsCount: number
  budgetState: CopilotBudgetState
  quotaOverage: number
  liveCopilotPhase: LoadPhase
  shouldShowPersonalQuotaPulse: boolean
}) {
  return (
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
        {shouldShowPersonalQuotaPulse && personalQuotaSummary ? (
          <>
            <MiniMetric label="Used Premium" value={personalQuotaSummary.used.toLocaleString()} />
            <MiniMetric
              label="Remaining"
              value={personalQuotaSummary.remaining.toLocaleString()}
              accent="cool"
            />
            <MiniMetric
              label="Entitlement"
              value={personalQuotaSummary.entitlement.toLocaleString()}
            />
            <MiniMetric
              label="Overage Cost"
              value={formatCurrency(personalQuotaSummary.overageCost)}
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
            <MiniMetric label="Gross Cost" value={formatCurrency(copilotUsage?.grossCost ?? 0)} />
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
            <strong>{configuredAccountsCount.toLocaleString()}</strong>
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
  )
}

function OrgLeadersSection({
  org,
  contributors,
  nameMap,
  memberLogin,
  hasFullOverview,
}: {
  org: string
  contributors: OrgContributor[]
  nameMap: Map<string, string>
  memberLogin?: string
  hasFullOverview: boolean
}) {
  return (
    <section className="org-detail-section">
      <div className="org-detail-section-header">
        <h3>
          <GitBranch size={15} />
          Today&apos;s Leaders
        </h3>
        <span className="org-detail-section-subtitle">Commits</span>
      </div>
      {contributors.length === 0 && !hasFullOverview ? (
        <div className="org-detail-empty">Activity ranking is still being computed.</div>
      ) : contributors.length === 0 ? (
        <div className="org-detail-empty">No commits recorded yet today.</div>
      ) : (
        <div className="org-detail-leaderboard">
          {contributors.map(contributor => (
            <button
              key={contributor.login}
              className={`org-detail-leader ${memberLogin === contributor.login ? 'active' : ''}`}
              onClick={() => navigateToOrgUser(org, contributor.login)}
            >
              <span className="org-detail-leader-rank">{contributor.commits}</span>
              <span className="org-detail-leader-name">
                {nameMap.get(contributor.login) ?? contributor.login}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function OrgMemberSpotlightSection({
  selectedMember,
  selectedContributor,
  selectedConfiguredAccount,
  selectedMemberQuotaState,
}: {
  selectedMember: OrgMember
  selectedContributor: OrgContributor | null
  selectedConfiguredAccount: GitHubAccount | null
  selectedMemberQuotaState: CopilotQuotaState | null
}) {
  return (
    <section className="org-detail-section org-detail-member-spotlight">
      <div className="org-detail-section-header">
        <h3>
          <Shield size={15} />
          Member Spotlight
        </h3>
      </div>
      <div className="org-detail-member-card">
        <div>
          <div className="org-detail-member-name">
            {selectedMember.name
              ? `${selectedMember.name} (${selectedMember.login})`
              : selectedMember.login}
          </div>
          <div className="org-detail-member-meta">
            {selectedMember.name ? `@${selectedMember.login} · ` : ''}
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
          <AccountQuotaCard account={selectedConfiguredAccount} state={selectedMemberQuotaState} />
        </div>
      ) : (
        <div className="org-detail-empty">No configured Copilot quota card for this member.</div>
      )}
    </section>
  )
}

function OrgConfiguredAccountsSection({
  configuredAccounts,
  quotas,
}: {
  configuredAccounts: GitHubAccount[]
  quotas: ReturnType<typeof useCopilotUsage>['quotas']
}) {
  if (configuredAccounts.length === 0) {
    return null
  }

  return (
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
            account={account}
            state={quotas[account.username]}
          />
        ))}
      </div>
    </section>
  )
}

function useOrgOverviewData({
  accounts,
  org,
  enqueue,
  initialOverview,
  overviewCacheKey,
  overviewTaskName,
}: {
  accounts: GitHubAccount[]
  org: string
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  initialOverview: OrgOverviewResult | null
  overviewCacheKey: string
  overviewTaskName: string
}) {
  const enqueueRef = useRef(enqueue)
  const hasCachedFullOverview = Boolean(dataCache.get<OrgOverviewResult>(overviewCacheKey)?.data)
  const [overview, setOverview] = useState<OrgOverviewResult | null>(() => initialOverview)
  const [overviewPhase, setOverviewPhase] = useState<LoadPhase>(() =>
    hasCachedFullOverview || initialOverview ? 'ready' : 'loading'
  )
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const hasOverviewRef = useRef(Boolean(initialOverview))

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    hasOverviewRef.current = Boolean(overview)
  }, [overview])

  const fetchOverview = useCallback(
    async (forceRefresh = false) => {
      const queue = getTaskQueue('github')
      const cachedOverview = normalizeOverview(
        dataCache.get<OrgOverviewResult>(overviewCacheKey)?.data ?? null
      )
      if (cachedOverview && !forceRefresh) {
        setOverview(cachedOverview)
        setOverviewError(null)
        setOverviewPhase('ready')
        return
      }

      if (queue.hasTaskWithName(overviewTaskName)) {
        return
      }

      setOverviewError(null)
      setOverviewPhase(hasOverviewRef.current ? 'refreshing' : 'loading')

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgOverview(org)
          },
          { name: overviewTaskName, priority: -1 }
        )

        const normalized = normalizeOverview(result)
        startTransition(() => {
          setOverview(normalized)
          setOverviewPhase('ready')
        })
        dataCache.set(overviewCacheKey, normalized)
      } catch (fetchError) {
        if (isAbortError(fetchError)) return
        setOverviewPhase('error')
        setOverviewError(getErrorMessage(fetchError))
      }
    },
    [accounts, org, overviewCacheKey, overviewTaskName]
  )

  return {
    fetchOverview,
    hasFullOverview: hasCachedFullOverview || overviewPhase === 'ready',
    overview,
    overviewError,
    overviewPhase,
  }
}

function useOrgMembersData({
  accounts,
  org,
  enqueue,
  membersCacheKey,
  membersTaskName,
}: {
  accounts: GitHubAccount[]
  org: string
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  membersCacheKey: string
  membersTaskName: string
}) {
  const enqueueRef = useRef(enqueue)
  const cachedMembers = dataCache.get<OrgMemberResult>(membersCacheKey)?.data ?? null
  const [membersResult, setMembersResult] = useState<OrgMemberResult | null>(() => cachedMembers)
  const [membersPhase, setMembersPhase] = useState<LoadPhase>(() =>
    cachedMembers ? 'ready' : 'loading'
  )
  const [membersError, setMembersError] = useState<string | null>(null)
  const hasMembersRef = useRef(Boolean(cachedMembers))

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    hasMembersRef.current = Boolean(membersResult)
  }, [membersResult])

  const fetchMembers = useCallback(
    async (forceRefresh = false) => {
      const queue = getTaskQueue('github')
      const cached = dataCache.get<OrgMemberResult>(membersCacheKey)?.data ?? null
      if (cached && !forceRefresh) {
        setMembersResult(cached)
        setMembersError(null)
        setMembersPhase('ready')
        return
      }

      if (queue.hasTaskWithName(membersTaskName)) {
        return
      }

      setMembersError(null)
      setMembersPhase(hasMembersRef.current ? 'refreshing' : 'loading')

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgMembers(org)
          },
          { name: membersTaskName, priority: -1 }
        )

        startTransition(() => {
          setMembersResult(result)
          setMembersPhase('ready')
        })
        dataCache.set(membersCacheKey, result)
      } catch (fetchError) {
        if (isAbortError(fetchError)) return
        setMembersPhase('error')
        setMembersError(getErrorMessage(fetchError))
      }
    },
    [accounts, membersCacheKey, membersTaskName, org]
  )

  return {
    fetchMembers,
    hasCachedMembers: Boolean(cachedMembers),
    membersError,
    membersPhase,
    membersResult,
  }
}

function useOrgCopilotData({
  org,
  enqueue,
  preferredAccount,
  isUserNamespace,
  copilotCacheKey,
  copilotTaskName,
}: {
  org: string
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  preferredAccount?: string
  isUserNamespace: boolean
  copilotCacheKey: string
  copilotTaskName: string
}) {
  const enqueueRef = useRef(enqueue)
  const cachedCopilot = dataCache.get<OrgCopilotUsageData>(copilotCacheKey)?.data ?? null
  const [copilotState, dispatchCopilot] = useReducer(
    orgCopilotReducer,
    cachedCopilot,
    createOrgCopilotState
  )
  const hasCopilotRef = useRef(Boolean(cachedCopilot))

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    hasCopilotRef.current = Boolean(copilotState.usage)
  }, [copilotState.usage])

  useEffect(() => {
    if (!isUserNamespace) {
      return
    }

    dispatchCopilot({ type: 'reset-for-user-namespace' })
  }, [isUserNamespace])

  const fetchCopilot = useCallback(
    async (forceRefresh = false) => {
      if (isUserNamespace) {
        return
      }

      const queue = getTaskQueue('github')
      const cached = dataCache.get<OrgCopilotUsageData>(copilotCacheKey)?.data ?? null
      if (cached && !forceRefresh) {
        dispatchCopilot({ type: 'hydrate-cache', usage: cached })
        return
      }

      if (queue.hasTaskWithName(copilotTaskName)) {
        return
      }

      dispatchCopilot({ type: 'start-loading', hasUsage: hasCopilotRef.current })

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            return await window.github.getCopilotUsage(org, preferredAccount)
          },
          { name: copilotTaskName, priority: -1 }
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
            dispatchCopilot({ type: 'success', usage: metrics })
          })
          dataCache.set(copilotCacheKey, metrics)
        } else {
          dispatchCopilot({ type: 'error', error: null })
        }
      } catch (fetchError) {
        if (isAbortError(fetchError)) return
        dispatchCopilot({
          type: 'error',
          error: getErrorMessage(fetchError),
        })
      }
    },
    [copilotCacheKey, copilotTaskName, isUserNamespace, org, preferredAccount]
  )

  return {
    copilotError: copilotState.error,
    copilotPhase: copilotState.phase,
    copilotUsage: copilotState.usage,
    fetchCopilot,
    hasCachedCopilot: Boolean(cachedCopilot),
  }
}

function useOrgRateLimit(accounts: GitHubAccount[], org: string) {
  const [rateLimit, setRateLimit] = useState<RateLimitSnapshot | null>(null)

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
    void fetchRateLimit()
  }, [fetchRateLimit])

  useEffect(() => {
    const timer = setInterval(() => {
      void fetchRateLimit()
    }, 60_000)
    return () => clearInterval(timer)
  }, [fetchRateLimit])

  return { rateLimit, fetchRateLimit }
}

function usePersonalQuotaSummary(
  configuredAccounts: GitHubAccount[],
  quotas: ReturnType<typeof useCopilotUsage>['quotas']
) {
  const personalQuotaSummary = useMemo<PersonalQuotaSummary | null>(() => {
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

  return { personalQuotaLoading, personalQuotaSummary }
}

function useOrgDetailData(org: string, memberLogin?: string) {
  const { accounts } = useGitHubAccounts()
  const { refreshInterval } = usePRSettings()
  const { enqueue, stats } = useTaskQueue('github')
  const overviewCacheKey = `org-overview:${org}`
  const membersCacheKey = `org-members:${org}`
  const copilotCacheKey = `org-copilot:${org}`
  const overviewTaskName = `org-detail-overview-${org}`
  const membersTaskName = `org-detail-members-${org}`
  const copilotTaskName = `org-detail-copilot-${org}`
  const initialOverview = buildSeedOverview(org)
  const { quotas, orgBudgets, orgOverageFromQuotas } = useCopilotUsage()
  const configuredAccounts = useMemo(
    () => accounts.filter(account => account.org === org),
    [accounts, org]
  )
  const { personalQuotaLoading, personalQuotaSummary } = usePersonalQuotaSummary(
    configuredAccounts,
    quotas
  )
  const overviewData = useOrgOverviewData({
    accounts,
    org,
    enqueue,
    initialOverview,
    overviewCacheKey,
    overviewTaskName,
  })
  const membersData = useOrgMembersData({
    accounts,
    org,
    enqueue,
    membersCacheKey,
    membersTaskName,
  })
  const preferredAccount = useMemo(
    () =>
      accounts.find(account => account.org === org)?.username ??
      overviewData.overview?.authenticatedAs,
    [accounts, org, overviewData.overview]
  )
  const isUserNamespace = Boolean(overviewData.overview?.isUserNamespace)
  const copilotData = useOrgCopilotData({
    org,
    enqueue,
    preferredAccount,
    isUserNamespace,
    copilotCacheKey,
    copilotTaskName,
  })
  const { rateLimit, fetchRateLimit } = useOrgRateLimit(accounts, org)
  const shouldRefreshOnMount = Boolean(
    initialOverview || membersData.hasCachedMembers || copilotData.hasCachedCopilot
  )

  const githubQueue = getTaskQueue('github')
  void stats
  const isOverviewTaskActive = githubQueue.hasTaskWithName(overviewTaskName)
  const isMembersTaskActive = githubQueue.hasTaskWithName(membersTaskName)
  const isCopilotTaskActive = githubQueue.hasTaskWithName(copilotTaskName)
  const liveOverviewPhase = resolveRefreshPhase(
    overviewData.overviewPhase,
    isOverviewTaskActive,
    overviewData.overview ? 'ready' : 'loading'
  )
  const liveMembersPhase = resolveRefreshPhase(
    membersData.membersPhase,
    isMembersTaskActive,
    membersData.membersResult ? 'ready' : 'loading'
  )
  const liveCopilotPhase = isUserNamespace
    ? resolvePersonalCopilotPhase(personalQuotaSummary, personalQuotaLoading)
    : resolveRefreshPhase(
        copilotData.copilotPhase,
        isCopilotTaskActive,
        copilotData.copilotUsage ? 'ready' : 'error'
      )

  const { fetchOverview } = overviewData
  const { fetchMembers } = membersData
  const { fetchCopilot } = copilotData

  const fetchAll = useCallback(
    async (forceRefresh = false) => {
      const work = [fetchOverview(forceRefresh), fetchMembers(forceRefresh), fetchRateLimit()]
      if (!isUserNamespace) {
        work.push(fetchCopilot(forceRefresh))
      }
      await Promise.allSettled(work)
    },
    [fetchCopilot, fetchRateLimit, isUserNamespace, fetchMembers, fetchOverview]
  )

  useEffect(() => {
    void fetchAll(shouldRefreshOnMount)
  }, [fetchAll, shouldRefreshOnMount])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return
    const timer = setInterval(() => {
      void fetchAll(true)
    }, refreshInterval * MS_PER_MINUTE)
    return () => clearInterval(timer)
  }, [fetchAll, refreshInterval])

  const selectedMember = useMemo(
    () => membersData.membersResult?.members.find(member => member.login === memberLogin) ?? null,
    [memberLogin, membersData.membersResult]
  )
  const selectedConfiguredAccount = useMemo(
    () => configuredAccounts.find(account => account.username === memberLogin) ?? null,
    [configuredAccounts, memberLogin]
  )
  const contributorMap = useMemo(
    () =>
      new Map(
        (overviewData.overview?.metrics.topContributorsToday ?? []).map(contributor => [
          contributor.login,
          contributor,
        ])
      ),
    [overviewData.overview]
  )
  const budgetState = orgBudgets[org]
  const quotaOverage = orgOverageFromQuotas.get(org) ?? 0
  const isInitialLoading = !overviewData.overview && liveOverviewPhase === 'loading'
  const isUpdating = [liveOverviewPhase, liveMembersPhase, liveCopilotPhase].includes('refreshing')
  const selectedContributor = memberLogin ? (contributorMap.get(memberLogin) ?? null) : null
  const selectedMemberQuotaState = selectedConfiguredAccount
    ? quotas[selectedConfiguredAccount.username]
    : null

  return {
    budgetState,
    configuredAccounts,
    contributorMap,
    copilotError: copilotData.copilotError,
    copilotUsage: copilotData.copilotUsage,
    fetchAll,
    hasFullOverview: overviewData.hasFullOverview,
    isInitialLoading,
    isUpdating,
    liveCopilotPhase,
    liveMembersPhase,
    liveOverviewPhase,
    memberCount: membersData.membersResult?.members.length ?? 0,
    members: membersData.membersResult?.members ?? [],
    membersError: membersData.membersError,
    overview: overviewData.overview,
    overviewError: overviewData.overviewError,
    personalQuotaSummary,
    quotaOverage,
    quotas,
    rateLimit,
    selectedConfiguredAccount,
    selectedContributor,
    selectedMember,
    selectedMemberQuotaState,
    shouldShowPersonalQuotaPulse: Boolean(isUserNamespace && personalQuotaSummary),
  }
}

function OrgDetailSkeleton({ org }: { org: string }) {
  return (
    <div className="org-detail-container">
      <div className="org-detail-hero org-detail-skeleton-hero">
        <div className="org-detail-hero-copy">
          <div className="org-detail-kicker">
            <Building2 size={14} />
            <span>Loading…</span>
          </div>
          <h2 className="org-detail-title">{org}</h2>
          <div className="org-detail-status-row">
            <LivePill label="Overview" phase="loading" />
            <LivePill label="Members" phase="loading" />
            <LivePill label="Copilot" phase="loading" />
          </div>
        </div>
      </div>
      <div className="org-detail-metric-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="org-detail-metric-card org-detail-skeleton-card">
            <div className="org-detail-metric-icon org-detail-skeleton-shimmer" />
            <div>
              <div
                className="org-detail-skeleton-line org-detail-skeleton-shimmer"
                style={{ width: '60%' }}
              />
              <div
                className="org-detail-skeleton-line org-detail-skeleton-line-lg org-detail-skeleton-shimmer"
                style={{ width: '40%' }}
              />
              <div
                className="org-detail-skeleton-line org-detail-skeleton-shimmer"
                style={{ width: '80%' }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="org-detail-section-grid">
        <div className="org-detail-section org-detail-skeleton-section">
          <div
            className="org-detail-skeleton-line org-detail-skeleton-shimmer"
            style={{ width: '50%', height: 16 }}
          />
          <div className="org-detail-skeleton-block org-detail-skeleton-shimmer" />
        </div>
        <div className="org-detail-section org-detail-skeleton-section">
          <div
            className="org-detail-skeleton-line org-detail-skeleton-shimmer"
            style={{ width: '50%', height: 16 }}
          />
          <div className="org-detail-skeleton-block org-detail-skeleton-shimmer" />
        </div>
      </div>
    </div>
  )
}

function InlineErrorBanner({
  label,
  message,
  onRetry,
}: {
  label: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="org-detail-inline-error">
      <AlertCircle size={14} />
      <span>
        <strong>{label}</strong>: {message}
      </span>
      {onRetry && (
        <button className="org-detail-inline-error-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

function RosterFilterBar({
  filter,
  sort,
  onFilterChange,
  onSortChange,
  counts,
}: {
  filter: RosterFilter
  sort: RosterSort
  onFilterChange: (f: RosterFilter) => void
  onSortChange: (s: RosterSort) => void
  counts: { all: number; active: number; configured: number; idle: number }
}) {
  const filters: { key: RosterFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'configured', label: 'Configured', count: counts.configured },
    { key: 'idle', label: 'Idle', count: counts.idle },
  ]

  return (
    <div className="org-detail-roster-controls">
      <div className="org-detail-roster-filters">
        <Filter size={12} />
        {filters.map(f => (
          <button
            key={f.key}
            className={`org-detail-roster-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => onFilterChange(f.key)}
          >
            {f.label} <span className="org-detail-roster-filter-count">{f.count}</span>
          </button>
        ))}
      </div>
      <button
        className="org-detail-roster-sort-btn"
        onClick={() => onSortChange(sort === 'name' ? 'commits' : 'name')}
        title={sort === 'name' ? 'Sort by commits' : 'Sort by name'}
      >
        <ArrowUpDown size={12} />
        {sort === 'name' ? 'Name' : 'Commits'}
      </button>
    </div>
  )
}

export function OrgDetailPanel({ org, memberLogin }: OrgDetailPanelProps) {
  const {
    budgetState,
    configuredAccounts,
    contributorMap,
    copilotError,
    copilotUsage,
    fetchAll,
    hasFullOverview,
    isInitialLoading,
    isUpdating,
    liveCopilotPhase,
    liveMembersPhase,
    liveOverviewPhase,
    memberCount,
    members,
    membersError,
    overview,
    overviewError,
    personalQuotaSummary,
    quotaOverage,
    quotas,
    rateLimit,
    selectedConfiguredAccount,
    selectedContributor,
    selectedMember,
    selectedMemberQuotaState,
    shouldShowPersonalQuotaPulse,
  } = useOrgDetailData(org, memberLogin)

  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')
  const [rosterSort, setRosterSort] = useState<RosterSort>('name')

  const nameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      if (m.name) map.set(m.login, m.name)
    }
    return map
  }, [members])

  const configuredLogins = useMemo(
    () => new Set(configuredAccounts.map(a => a.username)),
    [configuredAccounts]
  )

  const rosterCounts = useMemo(() => {
    const active = members.filter(m => contributorMap.has(m.login)).length
    const configured = members.filter(m => configuredLogins.has(m.login)).length
    return {
      all: members.length,
      active,
      configured,
      idle: members.length - active,
    }
  }, [members, contributorMap, configuredLogins])

  const filteredMembers = useMemo(() => {
    let result = members
    switch (rosterFilter) {
      case 'active':
        result = result.filter(m => contributorMap.has(m.login))
        break
      case 'configured':
        result = result.filter(m => configuredLogins.has(m.login))
        break
      case 'idle':
        result = result.filter(m => !contributorMap.has(m.login))
        break
    }
    if (rosterSort === 'commits') {
      result = [...result].sort((a, b) => {
        const ac = contributorMap.get(a.login)?.commits ?? 0
        const bc = contributorMap.get(b.login)?.commits ?? 0
        return bc - ac
      })
    } else {
      result = [...result].sort((a, b) => {
        const an = a.name ?? a.login
        const bn = b.name ?? b.login
        return an.localeCompare(bn)
      })
    }
    return result
  }, [members, rosterFilter, rosterSort, contributorMap, configuredLogins])

  if (isInitialLoading) {
    return <OrgDetailSkeleton org={org} />
  }

  if (overviewError && !overview) {
    return (
      <div className="org-detail-error">
        <AlertCircle size={32} />
        <p className="org-detail-error-title">Failed to load organization overview</p>
        <p className="org-detail-error-detail">{overviewError}</p>
        <button className="org-detail-refresh-btn" onClick={() => fetchAll(true)}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!overview) return null

  return (
    <div className="org-detail-container">
      <OrgDetailHero
        org={org}
        overview={overview}
        highlightedMemberLogin={selectedMember?.login ?? null}
        liveOverviewPhase={liveOverviewPhase}
        liveMembersPhase={liveMembersPhase}
        liveCopilotPhase={liveCopilotPhase}
        rateLimit={rateLimit}
        isUpdating={isUpdating}
        onRefresh={() => fetchAll(true)}
      />

      <OrgMetricsGrid overview={overview} memberCount={memberCount} />

      {isUpdating && (
        <div className="org-detail-update-banner">
          <RefreshCw size={14} className="spin" />
          <span>
            Updating live organization signals in the background. Existing data stays interactive.
          </span>
        </div>
      )}

      {membersError && liveMembersPhase === 'error' && (
        <InlineErrorBanner label="Members" message={membersError} onRetry={() => fetchAll(true)} />
      )}
      {copilotError && liveCopilotPhase === 'error' && (
        <InlineErrorBanner label="Copilot" message={copilotError} onRetry={() => fetchAll(true)} />
      )}

      <div className="org-detail-section-grid">
        <OrgCopilotSection
          overview={overview}
          copilotUsage={copilotUsage}
          personalQuotaSummary={personalQuotaSummary}
          configuredAccountsCount={configuredAccounts.length}
          budgetState={budgetState}
          quotaOverage={quotaOverage}
          liveCopilotPhase={liveCopilotPhase}
          shouldShowPersonalQuotaPulse={shouldShowPersonalQuotaPulse}
        />

        <OrgLeadersSection
          org={org}
          contributors={overview.metrics.topContributorsToday}
          nameMap={nameMap}
          memberLogin={memberLogin}
          hasFullOverview={hasFullOverview}
        />
      </div>

      {selectedMember && (
        <OrgMemberSpotlightSection
          selectedMember={selectedMember}
          selectedContributor={selectedContributor}
          selectedConfiguredAccount={selectedConfiguredAccount}
          selectedMemberQuotaState={selectedMemberQuotaState}
        />
      )}

      <OrgConfiguredAccountsSection configuredAccounts={configuredAccounts} quotas={quotas} />

      <section className="org-detail-section">
        <div className="org-detail-section-header">
          <h3>
            <Users size={15} />
            Member Roster
          </h3>
        </div>
        <RosterFilterBar
          filter={rosterFilter}
          sort={rosterSort}
          onFilterChange={setRosterFilter}
          onSortChange={setRosterSort}
          counts={rosterCounts}
        />
        {filteredMembers.length > 0 ? (
          <div className="org-detail-roster">
            {filteredMembers.map(member => {
              const contributor = contributorMap.get(member.login)
              const isConfigured = configuredLogins.has(member.login)
              return (
                <button
                  key={member.login}
                  className={`org-detail-roster-item ${memberLogin === member.login ? 'active' : ''}`}
                  onClick={() => navigateToOrgUser(org, member.login)}
                >
                  <span className="org-detail-roster-name">
                    {member.name ? `${member.name} (${member.login})` : member.login}
                  </span>
                  <span className="org-detail-roster-meta">
                    {member.name ? `@${member.login} · ` : ''}
                    {contributor ? `${contributor.commits} today` : 'idle today'}
                    {isConfigured ? ' · configured' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        ) : members.length === 0 ? (
          <div className="org-detail-empty">No members returned for this namespace.</div>
        ) : (
          <div className="org-detail-empty">No members match the current filter.</div>
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
