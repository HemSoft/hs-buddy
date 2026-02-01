import { useEffect, useState } from 'react'
import type { PullRequest } from '../types/pullRequest'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import './PullRequestList.css'
import { ExternalLink, GitPullRequest, Check, Clock } from 'lucide-react'

interface PullRequestListProps {
  mode: 'my-prs' | 'needs-review' | 'recently-merged'
}

export function PullRequestList({ mode }: PullRequestListProps) {
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const { recentlyMergedDays, loading: prSettingsLoading } = usePRSettings()

  useEffect(() => {
    // Don't fetch until accounts and settings are loaded
    if (accountsLoading || prSettingsLoading) {
      return
    }

    const fetchPRs = async () => {
      setLoading(true)
      setError(null)

      try {
        // Check if accounts are configured
        if (accounts.length === 0) {
          setError('No GitHub accounts configured. Please add an account in Settings.')
          setLoading(false)
          return
        }

        const config = {
          github: {
            accounts,
          },
          bitbucket: {
            workspaces: [],
          },
        }

        const githubClient = new GitHubClient(config.github, recentlyMergedDays)
        console.log('Fetching PRs for', accounts.length, 'account(s)...', 'mode:', mode, 'recentlyMergedDays:', recentlyMergedDays);
        
        let results: PullRequest[];
        switch (mode) {
          case 'needs-review':
            results = await githubClient.fetchNeedsReview();
            break;
          case 'recently-merged':
            results = await githubClient.fetchRecentlyMerged();
            break;
          case 'my-prs':
          default:
            results = await githubClient.fetchMyPRs();
            break;
        }
        
        console.log('Found PRs:', results.length);

        // Sort by repository, then by PR number
        results.sort((a, b) => {
          if (a.repository !== b.repository) {
            return a.repository.localeCompare(b.repository)
          }
          return a.id - b.id
        })

        setPrs(results)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch PRs')
        console.error('Error fetching PRs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPRs()
  }, [mode, accounts, accountsLoading, recentlyMergedDays, prSettingsLoading])

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString()
  }

  const getTitle = () => {
    switch (mode) {
      case 'my-prs':
        return 'My Pull Requests'
      case 'needs-review':
        return 'PRs Needing Review'
      case 'recently-merged':
        return 'Recently Merged PRs'
      default:
        return 'Pull Requests'
    }
  }

  if (loading) {
    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
        </div>
        <div className="pr-list-loading">
          <Clock className="spin" size={24} />
          <p>Loading pull requests...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
        </div>
        <div className="pr-list-error">
          <p className="error-message">⚠️ {error}</p>
          {accounts.length === 0 && (
            <>
              <p className="error-hint">
                You need to configure at least one GitHub account in Settings.
              </p>
              <p className="hint">
                On first launch, environment variables (VITE_GITHUB_USERNAME, VITE_GITHUB_ORG)
                will be migrated to the config automatically.
              </p>
            </>
          )}
          {accounts.length > 0 && (
            <>
              <p className="error-hint">
                Make sure you're authenticated with GitHub CLI:
              </p>
              <ul>
                <li><code>gh auth status</code> - Check authentication status</li>
                <li><code>gh auth login</code> - Log in to GitHub</li>
              </ul>
            </>
          )}
        </div>
      </div>
    )
  }

  if (prs.length === 0) {
    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
        </div>
        <div className="pr-list-empty">
          <GitPullRequest size={48} />
          <p>No pull requests found</p>
          <p className="empty-subtitle">All clear! ✨</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-list-container">
      <div className="pr-list-header">
        <h2>{getTitle()}</h2>
        <span className="pr-count">{prs.length} PR{prs.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="pr-list">
        {prs.map((pr) => (
          <div key={`${pr.source}-${pr.id}-${pr.repository}`} className="pr-item">
            <div className="pr-item-header">
              <div className="pr-title-row">
                <GitPullRequest size={16} className="pr-icon" />
                <div 
                  className="pr-title" 
                  onClick={() => window.shell.openExternal(pr.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      window.shell.openExternal(pr.url)
                    }
                  }}
                >
                  {pr.title}
                  <ExternalLink size={14} className="external-link-icon" />
                </div>
              </div>
              <div className="pr-meta">
                <span className="pr-source">{pr.source === 'GitHub' ? 'GH' : 'BB'}</span>
                <span className="pr-repo">{pr.repository}</span>
                <span className="pr-number">#{pr.id}</span>
                <span className="pr-author">by {pr.author}</span>
              </div>
            </div>
            <div className="pr-item-footer">
              <div className="pr-approvals">
                {pr.iApproved && <Check size={14} className="approved-icon" />}
                <span>
                  {pr.approvalCount}/{pr.assigneeCount > 0 ? pr.assigneeCount : '?'} approvals
                </span>
              </div>
              <div className="pr-date">
                <Clock size={14} />
                <span>{formatDate(pr.created)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
