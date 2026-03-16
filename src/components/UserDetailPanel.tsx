import { useState, useEffect, useMemo } from 'react'
import {
  ExternalLink,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Eye,
  Loader2,
  Shield,
  Sparkles,
  FolderGit2,
  Activity,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { dataCache } from '../services/dataCache'

import {
  GitHubClient,
  type OrgMemberResult,
  type OrgOverviewResult,
  type UserActivitySummary,
  type UserPRSummary,
  type UserEvent,
} from '../api/github'
import type { GitHubAccount } from '../types/config'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import { formatDistanceToNow } from '../utils/dateUtils'
import './UserDetailPanel.css'

interface UserDetailPanelProps {
  org: string
  memberLogin: string
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

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
  const { quotas } = useCopilotUsage()

  const [activity, setActivity] = useState<UserActivitySummary | null>(null)
  const [activityPhase, setActivityPhase] = useState<LoadPhase>('idle')
  const [activityError, setActivityError] = useState<string | null>(null)

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

  const configuredAccount = useMemo(
    () => accounts.find(a => a.username === memberLogin) ?? null,
    [accounts, memberLogin]
  )

  const quotaState = configuredAccount ? quotas[configuredAccount.username] : null

  const profileUrl = member?.url ?? `https://github.com/${memberLogin}`
  const avatarUrl = member?.avatarUrl ?? `https://github.com/${memberLogin}.png?size=96`

  const cacheKey = `user-activity:${org}/${memberLogin}`

  useEffect(() => {
    const cached = dataCache.get<UserActivitySummary>(cacheKey)
    if (cached?.data) {
      setActivity(cached.data)
      setActivityPhase('ready')
      return
    }

    setActivityPhase('loading')
    setActivityError(null)

    let cancelled = false
    const controller = new AbortController()

    const doFetch = async () => {
      const client = new GitHubClient({ accounts }, 7)
      return await client.fetchUserActivity(org, memberLogin)
    }

    doFetch().then(result => {
      dataCache.set(cacheKey, result, 5 * 60 * 1000)
      if (cancelled) return
      setActivity(result)
      setActivityPhase('ready')
    }).catch(err => {
      if (cancelled) return
      setActivityPhase('error')
      setActivityError(err instanceof Error ? err.message : String(err))
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [accounts, org, memberLogin, cacheKey])

  const commitsToday = contributor?.commits ?? 0

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
          <span className="ud-hero-kicker">Member of {org}</span>
          <h2 className="ud-hero-title">{memberLogin}</h2>
          <p className="ud-hero-subtitle">
            {commitsToday > 0
              ? `${commitsToday} commit${commitsToday !== 1 ? 's' : ''} today`
              : 'No commits today'}
          </p>
        </div>
        <div className="ud-hero-actions">
          <button
            className="ud-action-btn"
            onClick={() => window.shell.openExternal(profileUrl)}
          >
            <ExternalLink size={14} />
            Profile
          </button>
          <button
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
              {activity!.recentEvents.slice(0, 12).map((event, i) => (
                <EventRow key={`${event.createdAt}-${i}`} event={event} />
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

      {/* ── Copilot Quota ── */}
      {configuredAccount && (
        <section className="ud-section">
          <h3 className="ud-section-title">
            <Sparkles size={15} />
            Copilot Quota
          </h3>
          {quotaState ? (
            <div className="ud-quota-grid">
              <AccountQuotaCard
                account={configuredAccount as GitHubAccount}
                state={quotaState}
              />
            </div>
          ) : (
            <p className="ud-empty">Copilot quota data is not yet available.</p>
          )}
        </section>
      )}
    </div>
  )
}

