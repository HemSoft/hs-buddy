import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import {
  ExternalLink,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Eye,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  FolderGit2,
  Activity,
  Calendar,
  MapPin,
  Building2,
  Users,
  Clock,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { dataCache } from '../services/dataCache'
import { activityReducer, createInitialActivityState } from './userDetailReducer'

import {
  GitHubClient,
  clearAllCaches,
  type OrgMemberResult,
  type OrgOverviewResult,
  type UserActivitySummary,
  type UserPRSummary,
  type UserEvent,
} from '../api/github'
import { UserPremiumUsageSection } from './UserPremiumUsageSection'
import { ContributionGraph } from './ContributionGraph'
import { PRStateIcon } from './shared/PRStateIcon'
import { formatDistanceToNow } from '../utils/dateUtils'
import { getErrorMessage } from '../utils/errorUtils'
import './UserDetailPanel.css'

interface UserDetailPanelProps {
  org: string
  memberLogin: string
}

function navigateToView(viewId: string) {
  window.dispatchEvent(
    new CustomEvent('app:navigate', {
      detail: { viewId },
    })
  )
}

function PRRow({ pr }: { pr: UserPRSummary }) {
  const iconClass =
    pr.state === 'merged'
      ? 'ud-pr-icon ud-pr-merged'
      : pr.state === 'open'
        ? 'ud-pr-icon ud-pr-open'
        : 'ud-pr-icon ud-pr-closed'

  return (
    <button
      type="button"
      className="ud-pr-row"
      onClick={() => window.shell.openExternal(pr.url)}
      title={`${pr.repo}#${pr.number}`}
    >
      <PRStateIcon state={pr.state} size={13} className={iconClass} />
      <span className="ud-pr-title">{pr.title}</span>
      <span className="ud-pr-meta">
        {pr.repo.split('/')[1]}#{pr.number}
      </span>
      <span className="ud-pr-age">{formatDistanceToNow(pr.updatedAt)}</span>
    </button>
  )
}

function EventRow({ event }: { event: UserEvent }) {
  return (
    <div className="ud-event-row">
      <span className="ud-event-type">{event.summary}</span>
      <span className="ud-event-repo">{event.repo.split('/')[1] ?? event.repo}</span>
      <span className="ud-event-age">{formatDistanceToNow(event.createdAt)}</span>
    </div>
  )
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="ud-section-loader">
      <Loader2 size={15} className="spin" />
      <span>Loading {label}…</span>
    </div>
  )
}

function UserDetailHero({
  activity,
  activityPhase,
  avatarUrl,
  commitsToday,
  memberLogin,
  org,
  profileUrl,
  onRefresh,
}: {
  activity: UserActivitySummary | null
  activityPhase: 'idle' | 'loading' | 'ready' | 'error'
  avatarUrl: string
  commitsToday: number
  memberLogin: string
  org: string
  profileUrl: string
  onRefresh: () => void
}) {
  return (
    <div className="ud-hero">
      <img className="ud-hero-avatar" src={avatarUrl} alt={memberLogin} width={56} height={56} />
      <div className="ud-hero-info">
        <span className="ud-hero-kicker">
          {activity?.orgRole === 'admin' ? 'Admin' : 'Member'} of {org}
        </span>
        <h2 className="ud-hero-title">
          {activity?.name ? `${activity.name} (${memberLogin})` : memberLogin}
          {activity?.statusEmoji && (
            <span className="ud-status-emoji" title={activity.statusMessage ?? undefined}>
              {activity.statusEmoji}
            </span>
          )}
        </h2>
        <p className="ud-hero-subtitle">
          {activity?.name ? `${memberLogin} · ` : ''}
          {commitsToday > 0
            ? `${commitsToday} commit${commitsToday !== 1 ? 's' : ''} today`
            : 'No commits today'}
        </p>
      </div>
      <div className="ud-hero-actions">
        <button
          type="button"
          className="ud-action-btn"
          onClick={onRefresh}
          disabled={activityPhase === 'loading'}
          title="Refresh user data"
        >
          <RefreshCw size={14} className={activityPhase === 'loading' ? 'spin' : ''} />
        </button>
        <button
          type="button"
          className="ud-action-btn"
          onClick={() => window.shell.openExternal(profileUrl)}
        >
          <ExternalLink size={14} />
          Profile
        </button>
        <button
          type="button"
          className="ud-action-btn"
          onClick={() => navigateToView(`org-detail:${org}`)}
        >
          <Shield size={14} />
          {org}
        </button>
      </div>
    </div>
  )
}

function UserProfileMeta({ activity }: { activity: UserActivitySummary }) {
  return (
    <div className="ud-profile-meta">
      {/* v8 ignore start */}
      {(activity.teams?.length ?? 0) > 0 && (
        /* v8 ignore stop */
        <span className="ud-meta-item">
          <Users size={13} />
          {activity.teams.join(', ')}
        </span>
      )}
      {activity.company && (
        <span className="ud-meta-item">
          <Building2 size={13} />
          {activity.company}
        </span>
      )}
      {activity.location && (
        <span className="ud-meta-item">
          <MapPin size={13} />
          {activity.location}
        </span>
      )}
      {activity.createdAt && (
        <span className="ud-meta-item">
          <Clock size={13} />
          GitHub since{' '}
          {new Date(activity.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })}
        </span>
      )}
      {activity.bio && <p className="ud-meta-bio">{activity.bio}</p>}
      {activity.statusMessage && (
        <span className="ud-meta-item ud-meta-status">
          {activity.statusEmoji ?? '💬'} {activity.statusMessage}
        </span>
      )}
    </div>
  )
}

function UserMetricsGrid({
  activity,
  activityPhase,
  commitsToday,
}: {
  activity: UserActivitySummary | null
  activityPhase: 'idle' | 'loading' | 'ready' | 'error'
  commitsToday: number
}) {
  return (
    <div className="ud-metric-grid">
      <MetricCard
        icon={<GitCommitHorizontal size={18} />}
        label="Commits Today"
        variant={commitsToday > 0 ? 'warm' : undefined}
      >
        {commitsToday}
      </MetricCard>
      <MetricCard icon={<GitPullRequest size={18} />} label="Open PRs">
        {activityPhase === 'ready' && activity ? (
          activity.openPRCount
        ) : activityPhase === 'loading' ? (
          <Loader2 size={14} className="spin" />
        ) : (
          '—'
        )}
      </MetricCard>
      <MetricCard icon={<GitMerge size={18} />} label="Merged (90d)" variant="cool">
        {activityPhase === 'ready' && activity ? (
          activity.mergedPRCount
        ) : activityPhase === 'loading' ? (
          <Loader2 size={14} className="spin" />
        ) : (
          '—'
        )}
      </MetricCard>
      <MetricCard icon={<FolderGit2 size={18} />} label="Active Repos">
        {activityPhase === 'ready' && activity ? (
          activity.activeRepos.length
        ) : activityPhase === 'loading' ? (
          <Loader2 size={14} className="spin" />
        ) : (
          '—'
        )}
      </MetricCard>
    </div>
  )
}

function UserContributionSection({
  activity,
  activityPhase,
  onScopeUpgrade,
}: {
  activity: UserActivitySummary | null
  activityPhase: 'idle' | 'loading' | 'ready' | 'error'
  onScopeUpgrade?: () => void
}) {
  if (
    activityPhase === 'ready' &&
    activity?.contributionWeeks &&
    activity.totalContributions != null
  ) {
    return (
      <section className="ud-section">
        <h3 className="ud-section-title">
          <Calendar size={15} />
          Contributions
        </h3>
        <ContributionGraph
          weeks={activity.contributionWeeks}
          totalContributions={activity.totalContributions}
          source={activity.contributionSource}
          needsScopeUpgrade={activity.needsReadUserScope}
          onRequestScopeUpgrade={onScopeUpgrade}
        />
      </section>
    )
  }

  if (activityPhase === 'loading') {
    return (
      <section className="ud-section">
        <h3 className="ud-section-title">
          <Calendar size={15} />
          Contributions
        </h3>
        <SectionLoader label="contributions" />
      </section>
    )
  }

  return null
}

function UserPullRequestSections({
  activity,
  activityPhase,
}: {
  activity: UserActivitySummary | null
  activityPhase: 'idle' | 'loading' | 'ready' | 'error'
}) {
  const authoredPRs = activity?.recentPRsAuthored ?? []
  const reviewedPRs = activity?.recentPRsReviewed ?? []

  return (
    <div className="ud-section-grid">
      <section className="ud-section">
        <h3 className="ud-section-title">
          <GitPullRequest size={15} />
          Authored
        </h3>
        {activityPhase === 'loading' ? (
          <SectionLoader label="pull requests" />
        ) : activityPhase === 'ready' && authoredPRs.length > 0 ? (
          <div className="ud-pr-list">
            {authoredPRs.map(pr => (
              <PRRow key={`a-${pr.repo}#${pr.number}`} pr={pr} />
            ))}
          </div>
        ) : activityPhase === 'ready' ? (
          <p className="ud-empty">No recent pull requests.</p>
        ) : null}
      </section>

      <section className="ud-section">
        <h3 className="ud-section-title">
          <Eye size={15} />
          Reviewed
        </h3>
        {activityPhase === 'loading' ? (
          <SectionLoader label="reviews" />
        ) : activityPhase === 'ready' && reviewedPRs.length > 0 ? (
          <div className="ud-pr-list">
            {reviewedPRs.map(pr => (
              <PRRow key={`r-${pr.repo}#${pr.number}`} pr={pr} />
            ))}
          </div>
        ) : activityPhase === 'ready' ? (
          <p className="ud-empty">No recent reviews.</p>
        ) : null}
      </section>
    </div>
  )
}

function UserActivitySection({
  activity,
  activityPhase,
}: {
  activity: UserActivitySummary | null
  activityPhase: 'idle' | 'loading' | 'ready' | 'error'
}) {
  if (
    activityPhase !== 'loading' &&
    (activityPhase !== 'ready' || !activity || activity.recentEvents.length === 0)
  ) {
    return null
  }

  const recentEvents = activity?.recentEvents ?? []

  return (
    <section className="ud-section">
      <h3 className="ud-section-title">
        <Activity size={15} />
        Recent Activity
      </h3>
      {activityPhase === 'loading' ? (
        <SectionLoader label="activity" />
      ) : (
        <div className="ud-event-list">
          {recentEvents.slice(0, 15).map(event => (
            <EventRow key={`${event.type}-${event.repo}-${event.createdAt}`} event={event} />
          ))}
        </div>
      )}
    </section>
  )
}

function UserRepositoriesSection({ activeRepos }: { activeRepos: string[] }) {
  if (activeRepos.length === 0) {
    return null
  }

  return (
    <section className="ud-section">
      <h3 className="ud-section-title">
        <FolderGit2 size={15} />
        Active Repositories
      </h3>
      <div className="ud-repo-chips">
        {activeRepos.map(repo => (
          <button
            type="button"
            key={repo}
            className="ud-repo-chip"
            onClick={() => navigateToView(`repo-detail:${repo}`)}
          >
            <FolderGit2 size={12} />
            {repo.split('/')[1] ?? repo}
          </button>
        ))}
      </div>
    </section>
  )
}

function MetricCard({
  icon,
  label,
  children,
  variant,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  variant?: 'warm' | 'cool'
}) {
  return (
    <div className={`ud-metric-card ${variant ? `ud-metric-card-${variant}` : ''}`}>
      <div className="ud-metric-icon">{icon}</div>
      <div>
        <span className="ud-metric-label">{label}</span>
        <strong className="ud-metric-value">{children}</strong>
      </div>
    </div>
  )
}

export function UserDetailPanel({ org, memberLogin }: UserDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const cacheKey = `user-activity:v3:${org}/${memberLogin}`
  const [activityState, dispatch] = useReducer(
    activityReducer,
    cacheKey,
    createInitialActivityState
  )
  const { activity, phase: activityPhase, error: activityError } = activityState
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    dataCache.delete(cacheKey)
    setRefreshKey(k => k + 1)
  }, [cacheKey])

  const handleScopeUpgrade = useCallback(async () => {
    const result = await window.github.refreshAuthScopes()
    if (result.success) {
      clearAllCaches()
      dataCache.delete(cacheKey)
      setRefreshKey(k => k + 1)
    }
  }, [cacheKey])

  const members = useMemo(
    () => dataCache.get<OrgMemberResult>(`org-members:${org}`)?.data ?? null,
    [org]
  )

  const overview = useMemo(
    () => dataCache.get<OrgOverviewResult>(`org-overview:${org}`)?.data ?? null,
    [org]
  )

  const member = useMemo(
    () => members?.members.find(m => m.login === memberLogin) ?? null,
    [members, memberLogin]
  )

  const contributor = useMemo(() => {
    if (!overview) return null
    /* v8 ignore start */
    return overview.metrics.topContributorsToday.find(c => c.login === memberLogin) ?? null
    /* v8 ignore stop */
  }, [overview, memberLogin])

  const profileUrl = member?.url ?? `https://github.com/${memberLogin}`
  const avatarUrl = member?.avatarUrl ?? `https://github.com/${memberLogin}.png?size=96`

  // Fetch directly on mount — user-initiated action, don't wait behind background tasks
  useEffect(() => {
    const forceRefresh = refreshKey > 0
    const cached = dataCache.get<UserActivitySummary>(cacheKey)
    if (cached?.data && !forceRefresh) {
      dispatch({ type: 'RESET_FROM_CACHE', payload: cached.data })
      return
    }

    dispatch({ type: 'FETCH_START' })

    let cancelled = false

    const doFetch = async () => {
      const client = new GitHubClient({ accounts }, 7)
      return await client.fetchUserActivity(org, memberLogin)
    }

    doFetch()
      .then(result => {
        dataCache.set(cacheKey, result, 5 * 60 * 1000) // 5 min TTL
        /* v8 ignore start */
        if (cancelled) return
        /* v8 ignore stop */
        dispatch({ type: 'FETCH_SUCCESS', payload: result })
      })
      .catch(err => {
        /* v8 ignore start */
        if (cancelled) return
        /* v8 ignore stop */
        dispatch({
          type: 'FETCH_ERROR',
          payload: getErrorMessage(err),
        })
      })

    return () => {
      cancelled = true
    }
  }, [accounts, org, memberLogin, cacheKey, refreshKey])

  const commitsToday = activity?.commitsToday ?? contributor?.commits ?? 0
  const readyActivity = activityPhase === 'ready' ? activity : null

  return (
    <div className="user-detail-container">
      <UserDetailHero
        activity={activity}
        activityPhase={activityPhase}
        avatarUrl={avatarUrl}
        commitsToday={commitsToday}
        memberLogin={memberLogin}
        org={org}
        profileUrl={profileUrl}
        onRefresh={handleRefresh}
      />

      {/* ── Profile Metadata ── */}
      {readyActivity && <UserProfileMeta activity={readyActivity} />}

      {/* ── Metrics ── */}
      <UserMetricsGrid
        activity={activity}
        activityPhase={activityPhase}
        commitsToday={commitsToday}
      />

      {/* ── Error ── */}
      {activityPhase === 'error' && activityError && (
        <div className="ud-error-banner">Failed to load activity: {activityError}</div>
      )}

      {/* ── Contribution Graph ── */}
      <UserContributionSection
        activity={activity}
        activityPhase={activityPhase}
        onScopeUpgrade={handleScopeUpgrade}
      />

      {/* ── PR Grid (Authored + Reviewed) ── */}
      <UserPullRequestSections activity={activity} activityPhase={activityPhase} />

      {/* ── Recent Activity (only when there are events) ── */}
      <UserActivitySection activity={activity} activityPhase={activityPhase} />

      {/* ── Active Repos ── */}
      <UserRepositoriesSection activeRepos={readyActivity?.activeRepos ?? []} />

      {/* ── Copilot Premium Requests ── */}
      <section className="ud-section">
        <h3 className="ud-section-title">
          <Sparkles size={15} />
          Premium Requests
        </h3>
        <UserPremiumUsageSection username={memberLogin} org={org} />
      </section>
    </div>
  )
}
