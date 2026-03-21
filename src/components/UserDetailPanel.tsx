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
  type OrgMemberResult,
  type OrgOverviewResult,
  type UserActivitySummary,
  type UserPRSummary,
  type UserEvent,
} from '../api/github'
import { UserPremiumUsageSection } from './UserPremiumUsageSection'
import { ContributionGraph } from './ContributionGraph'
import { formatDistanceToNow } from '../utils/dateUtils'
import './UserDetailPanel.css'

interface UserDetailPanelProps {
  org: string
  memberLogin: string
}

function PRStateIcon({ state }: { state: string }) {
  switch (state) {
    case 'merged':
      return <GitMerge size={13} className="ud-pr-icon ud-pr-merged" />
    case 'open':
      return <GitPullRequest size={13} className="ud-pr-icon ud-pr-open" />
    default:
      return <GitPullRequest size={13} className="ud-pr-icon ud-pr-closed" />
  }
}

function PRRow({ pr }: { pr: UserPRSummary }) {
  return (
    <button
      type="button"
      className="ud-pr-row"
      onClick={() => window.shell.openExternal(pr.url)}
      title={`${pr.repo}#${pr.number}`}
    >
      <PRStateIcon state={pr.state} />
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

function MetricCard({ icon, label, children, variant }: {
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
  const [activityState, dispatch] = useReducer(activityReducer, cacheKey, createInitialActivityState)
  const { activity, phase: activityPhase, error: activityError } = activityState
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    dataCache.delete(cacheKey)
    setRefreshKey(k => k + 1)
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
    return overview.metrics.topContributorsToday.find(c => c.login === memberLogin) ?? null
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
        if (cancelled) return
        dispatch({ type: 'FETCH_SUCCESS', payload: result })
      })
      .catch(err => {
        if (cancelled) return
        dispatch({
          type: 'FETCH_ERROR',
          payload: err instanceof Error ? err.message : String(err),
        })
      })

    return () => {
      cancelled = true
    }
  }, [accounts, org, memberLogin, cacheKey, refreshKey])

  const commitsToday = activity?.commitsToday ?? contributor?.commits ?? 0

  return (
    <div className="user-detail-container">
      {/* ── Hero ── */}
      <div className="ud-hero">
        <img
          className="ud-hero-avatar"
          src={avatarUrl}
          alt={memberLogin}
          width={56}
          height={56}
        />
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
            onClick={handleRefresh}
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
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('app:navigate', {
                  detail: { viewId: `org-detail:${org}` },
                })
              )
            }
          >
            <Shield size={14} />
            {org}
          </button>
        </div>
      </div>

      {/* ── Profile Metadata ── */}
      {activityPhase === 'ready' && (
        <div className="ud-profile-meta">
          {(activity!.teams?.length ?? 0) > 0 && (
            <span className="ud-meta-item">
              <Users size={13} />
              {activity!.teams.join(', ')}
            </span>
          )}
          {activity!.company && (
            <span className="ud-meta-item">
              <Building2 size={13} />
              {activity!.company}
            </span>
          )}
          {activity!.location && (
            <span className="ud-meta-item">
              <MapPin size={13} />
              {activity!.location}
            </span>
          )}
          {activity!.createdAt && (
            <span className="ud-meta-item">
              <Clock size={13} />
              GitHub since {new Date(activity!.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          )}
          {activity!.bio && (
            <p className="ud-meta-bio">{activity!.bio}</p>
          )}
          {activity!.statusMessage && (
            <span className="ud-meta-item ud-meta-status">
              {activity!.statusEmoji ?? '💬'} {activity!.statusMessage}
            </span>
          )}
        </div>
      )}

      {/* ── Metrics ── */}
      <div className="ud-metric-grid">
        <MetricCard
          icon={<GitCommitHorizontal size={18} />}
          label="Commits Today"
          variant={commitsToday > 0 ? 'warm' : undefined}
        >
          {commitsToday}
        </MetricCard>
        <MetricCard icon={<GitPullRequest size={18} />} label="Open PRs">
          {activityPhase === 'ready'
            ? activity!.openPRCount
            : activityPhase === 'loading'
              ? <Loader2 size={14} className="spin" />
              : '—'}
        </MetricCard>
        <MetricCard icon={<GitMerge size={18} />} label="Merged (90d)" variant="cool">
          {activityPhase === 'ready'
            ? activity!.mergedPRCount
            : activityPhase === 'loading'
              ? <Loader2 size={14} className="spin" />
              : '—'}
        </MetricCard>
        <MetricCard icon={<FolderGit2 size={18} />} label="Active Repos">
          {activityPhase === 'ready'
            ? activity!.activeRepos.length
            : activityPhase === 'loading'
              ? <Loader2 size={14} className="spin" />
              : '—'}
        </MetricCard>
      </div>

      {/* ── Error ── */}
      {activityPhase === 'error' && activityError && (
        <div className="ud-error-banner">
          Failed to load activity: {activityError}
        </div>
      )}

      {/* ── Contribution Graph ── */}
      {activityPhase === 'ready' && activity!.contributionWeeks && activity!.totalContributions != null && (
        <section className="ud-section">
          <h3 className="ud-section-title">
            <Calendar size={15} />
            Contributions
          </h3>
          <ContributionGraph
            weeks={activity!.contributionWeeks}
            totalContributions={activity!.totalContributions}
          />
        </section>
      )}
      {activityPhase === 'loading' && (
        <section className="ud-section">
          <h3 className="ud-section-title">
            <Calendar size={15} />
            Contributions
          </h3>
          <SectionLoader label="contributions" />
        </section>
      )}

      {/* ── PR Grid (Authored + Reviewed) ── */}
      <div className="ud-section-grid">
        <section className="ud-section">
          <h3 className="ud-section-title">
            <GitPullRequest size={15} />
            Authored
          </h3>
          {activityPhase === 'loading' ? (
            <SectionLoader label="pull requests" />
          ) : activityPhase === 'ready' && activity!.recentPRsAuthored.length > 0 ? (
            <div className="ud-pr-list">
              {activity!.recentPRsAuthored.map(pr => (
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
          ) : activityPhase === 'ready' && activity!.recentPRsReviewed.length > 0 ? (
            <div className="ud-pr-list">
              {activity!.recentPRsReviewed.map(pr => (
                <PRRow key={`r-${pr.repo}#${pr.number}`} pr={pr} />
              ))}
            </div>
          ) : activityPhase === 'ready' ? (
            <p className="ud-empty">No recent reviews.</p>
          ) : null}
        </section>
      </div>

      {/* ── Recent Activity (only when there are events) ── */}
      {(activityPhase === 'loading' ||
        (activityPhase === 'ready' && activity!.recentEvents.length > 0)) && (
        <section className="ud-section">
          <h3 className="ud-section-title">
            <Activity size={15} />
            Recent Activity
          </h3>
          {activityPhase === 'loading' ? (
            <SectionLoader label="activity" />
          ) : (
            <div className="ud-event-list">
              {activity!.recentEvents.slice(0, 15).map((event) => (
                <EventRow key={`${event.type}-${event.repo}-${event.createdAt}`} event={event} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Active Repos ── */}
      {activityPhase === 'ready' && activity!.activeRepos.length > 0 && (
        <section className="ud-section">
          <h3 className="ud-section-title">
            <FolderGit2 size={15} />
            Active Repositories
          </h3>
          <div className="ud-repo-chips">
            {activity!.activeRepos.map(repo => (
              <button
                type="button"
                key={repo}
                className="ud-repo-chip"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('app:navigate', {
                      detail: { viewId: `repo-detail:${repo}` },
                    })
                  )
                }
              >
                <FolderGit2 size={12} />
                {repo.split('/')[1] ?? repo}
              </button>
            ))}
          </div>
        </section>
      )}

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
