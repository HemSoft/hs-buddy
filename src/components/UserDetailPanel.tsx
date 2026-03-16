import { useState, useEffect, useMemo } from 'react'
import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Eye,
  Loader2,
  Shield,
  Sparkles,
  UserRound,
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
      <span className="ud-pr-age">{formatDistanceToNow(pr.updatedAt)} ago</span>
    </button>
  )
}

function EventRow({ event }: { event: UserEvent }) {
  return (
    <div className="ud-event-row">
      <span className="ud-event-type">{event.summary}</span>
      <span className="ud-event-repo">{event.repo.split('/')[1] ?? event.repo}</span>
      <span className="ud-event-age">{formatDistanceToNow(event.createdAt)} ago</span>
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

  const cacheKey = `user-activity:${org}/${memberLogin}`

  // Fetch directly on mount — user-initiated action, don't wait behind background tasks
  useEffect(() => {
    // Check cache first (covers HMR and fast re-mount scenarios)
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
      dataCache.set(cacheKey, result, 5 * 60 * 1000) // 5 min TTL
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

  return (
    <div className="user-detail-container">
      {/* Hero */}
      <div className="user-detail-hero">
        <div>
          <div className="user-detail-kicker">
            <UserRound size={14} />
            <span>Member of {org}</span>
          </div>
          <h2 className="user-detail-title">
            {memberLogin}
            {member?.type && (
              <span className="user-detail-type-badge">{member.type}</span>
            )}
          </h2>
          <p className="user-detail-subtitle">
            {contributor
              ? `${contributor.commits} commit${contributor.commits !== 1 ? 's' : ''} today`
              : 'No commits today'}
          </p>
        </div>
        <div className="user-detail-actions">
          <button
            className="user-detail-link-btn"
            onClick={() => window.shell.openExternal(profileUrl)}
          >
            <ExternalLink size={14} />
            GitHub Profile
          </button>
          <button
            className="user-detail-link-btn"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('app:navigate', {
                  detail: { viewId: `org-detail:${org}` },
                })
              )
            }
          >
            <Shield size={14} />
            {org} Overview
          </button>
        </div>
      </div>

      {/* Stat cards — always visible, progressive data */}
      <div className="user-detail-metric-row">
        <div className={`user-detail-metric ${contributor ? 'user-detail-metric-warm' : ''}`}>
          <span className="user-detail-metric-label">Commits Today</span>
          <strong className="user-detail-metric-value">
            {contributor?.commits ?? 0}
          </strong>
        </div>
        <div className="user-detail-metric">
          <span className="user-detail-metric-label">Open PRs</span>
          <strong className="user-detail-metric-value">
            {activityPhase === 'ready' ? activity!.openPRCount : (
              activityPhase === 'loading' ? <Loader2 size={14} className="spin" /> : '—'
            )}
          </strong>
        </div>
        <div className="user-detail-metric">
          <span className="user-detail-metric-label">Merged (90d)</span>
          <strong className="user-detail-metric-value">
            {activityPhase === 'ready' ? activity!.mergedPRCount : (
              activityPhase === 'loading' ? <Loader2 size={14} className="spin" /> : '—'
            )}
          </strong>
        </div>
        <div className="user-detail-metric">
          <span className="user-detail-metric-label">Active Repos</span>
          <strong className="user-detail-metric-value">
            {activityPhase === 'ready' ? activity!.activeRepos.length : (
              activityPhase === 'loading' ? <Loader2 size={14} className="spin" /> : '—'
            )}
          </strong>
        </div>
        <div className="user-detail-metric">
          <span className="user-detail-metric-label">Account Type</span>
          <strong className="user-detail-metric-value">
            {member?.type ?? 'Unknown'}
          </strong>
        </div>
      </div>

      {/* Error banner */}
      {activityPhase === 'error' && activityError && (
        <div className="ud-error-banner">
          Failed to load activity: {activityError}
        </div>
      )}

      {/* Content grid — PRs + Events */}
      <div className="user-detail-section-grid">
        {/* Authored PRs */}
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <GitPullRequest size={15} />
              Pull Requests Authored
            </h3>
          </div>
          {activityPhase === 'loading' ? (
            <SectionLoader label="pull requests" />
          ) : activityPhase === 'ready' && activity!.recentPRsAuthored.length > 0 ? (
            <div className="ud-pr-list">
              {activity!.recentPRsAuthored.map(pr => (
                <PRRow key={`${pr.repo}#${pr.number}`} pr={pr} />
              ))}
            </div>
          ) : activityPhase === 'ready' ? (
            <div className="user-detail-empty">No recent pull requests authored in {org}.</div>
          ) : null}
        </section>

        {/* Reviewed PRs */}
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <Eye size={15} />
              Pull Requests Reviewed
            </h3>
          </div>
          {activityPhase === 'loading' ? (
            <SectionLoader label="reviews" />
          ) : activityPhase === 'ready' && activity!.recentPRsReviewed.length > 0 ? (
            <div className="ud-pr-list">
              {activity!.recentPRsReviewed.map(pr => (
                <PRRow key={`${pr.repo}#${pr.number}`} pr={pr} />
              ))}
            </div>
          ) : activityPhase === 'ready' ? (
            <div className="user-detail-empty">No recent reviews in {org}.</div>
          ) : null}
        </section>
      </div>

      {/* Recent Events */}
      <section className="user-detail-section">
        <div className="user-detail-section-header">
          <h3>
            <Activity size={15} />
            Recent Activity
          </h3>
        </div>
        {activityPhase === 'loading' ? (
          <SectionLoader label="activity" />
        ) : activityPhase === 'ready' && activity!.recentEvents.length > 0 ? (
          <div className="ud-event-list">
            {activity!.recentEvents.slice(0, 15).map((event, i) => (
              <EventRow key={`${event.createdAt}-${i}`} event={event} />
            ))}
          </div>
        ) : activityPhase === 'ready' ? (
          <div className="user-detail-empty">No recent public activity found for {memberLogin} in {org}.</div>
        ) : null}
      </section>

      {/* Active Repos */}
      {activityPhase === 'ready' && activity!.activeRepos.length > 0 && (
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <FolderGit2 size={15} />
              Active Repositories
            </h3>
          </div>
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
                {repo.split('/')[1] ?? repo}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Copilot Quota — only shown if the user is a configured account */}
      {configuredAccount && (
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <Sparkles size={15} />
              Copilot Quota
            </h3>
          </div>
          {quotaState ? (
            <div className="user-detail-account-grid">
              <AccountQuotaCard
                account={configuredAccount as GitHubAccount}
                state={quotaState}
              />
            </div>
          ) : (
            <div className="user-detail-empty">
              Copilot quota data is not yet available for this account.
            </div>
          )}
        </section>
      )}
    </div>
  )
}

