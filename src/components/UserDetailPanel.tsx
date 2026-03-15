import { useMemo } from 'react'
import {
  ExternalLink,
  GitCommitHorizontal,
  Shield,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { dataCache } from '../services/dataCache'
import type { OrgMemberResult, OrgOverviewResult } from '../api/github'
import type { GitHubAccount } from '../types/config'
import { AccountQuotaCard } from './copilot-usage/AccountQuotaCard'
import './UserDetailPanel.css'

interface UserDetailPanelProps {
  org: string
  memberLogin: string
}

export function UserDetailPanel({ org, memberLogin }: UserDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { quotas } = useCopilotUsage()

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

  return (
    <div className="user-detail-container">
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

      <div className="user-detail-section-grid">
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <GitCommitHorizontal size={15} />
              Activity
            </h3>
          </div>
          <div className="user-detail-metric-row">
            <div className={`user-detail-metric ${contributor ? 'user-detail-metric-warm' : ''}`}>
              <span className="user-detail-metric-label">Commits Today</span>
              <strong className="user-detail-metric-value">
                {contributor?.commits ?? 0}
              </strong>
            </div>
            <div className="user-detail-metric">
              <span className="user-detail-metric-label">Account Type</span>
              <strong className="user-detail-metric-value">
                {member?.type ?? 'Unknown'}
              </strong>
            </div>
            <div className={`user-detail-metric ${configuredAccount ? 'user-detail-metric-cool' : ''}`}>
              <span className="user-detail-metric-label">Configured</span>
              <strong className="user-detail-metric-value">
                {configuredAccount ? 'Yes' : 'No'}
              </strong>
            </div>
          </div>
        </section>

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

      {!configuredAccount && (
        <section className="user-detail-section">
          <div className="user-detail-section-header">
            <h3>
              <Sparkles size={15} />
              Copilot Quota
            </h3>
          </div>
          <div className="user-detail-empty">
            This user is not a configured account. Add their credentials in Settings to see Copilot quota data.
          </div>
        </section>
      )}
    </div>
  )
}
