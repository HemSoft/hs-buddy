import { useEffect, useState, useCallback, useRef } from 'react'
import type { PullRequest } from '../types/pullRequest'
import { GitHubClient, type ProgressCallback } from '../api/github'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import './PullRequestList.css'
import { ExternalLink, GitPullRequest, Check, Clock, Loader2 } from 'lucide-react'

interface PullRequestListProps {
  mode: 'my-prs' | 'needs-review' | 'recently-merged'
  onCountChange?: (count: number) => void
}

interface LoadingProgress {
  currentAccount: number;
  totalAccounts: number;
  accountName: string;
  org: string;
  status: 'authenticating' | 'fetching' | 'done' | 'error';
  prsFound?: number;
  totalPrsFound: number;
  error?: string;
}

export function PullRequestList({ mode, onCountChange }: PullRequestListProps) {
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LoadingProgress | null>(null)
  const [totalPrsFound, setTotalPrsFound] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0) // For interval-based refresh
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const { recentlyMergedDays, refreshInterval, autoRefresh, loading: prSettingsLoading } = usePRSettings()
  const { enqueue, cancelAll } = useTaskQueue('github')
  const fetchIdRef = useRef(0) // Track fetch operation to ignore stale results
  const lastFetchTimeRef = useRef<number>(0) // Track when we last fetched

  // Auto-refresh on window focus only if interval has elapsed
  useEffect(() => {
    if (!autoRefresh) return
    
    const handleFocus = () => {
      const now = Date.now()
      const intervalMs = refreshInterval * 60 * 1000
      if (lastFetchTimeRef.current > 0 && now - lastFetchTimeRef.current >= intervalMs) {
        setRefreshTrigger(prev => prev + 1)
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [autoRefresh, refreshInterval])

  const handleProgress: ProgressCallback = useCallback((p) => {
    setProgress(prev => {
      // Calculate cumulative total
      let newTotal = prev?.totalPrsFound ?? 0;
      if (p.status === 'done' && p.prsFound !== undefined) {
        newTotal += p.prsFound;
      }
      setTotalPrsFound(newTotal);
      return { ...p, totalPrsFound: newTotal };
    });
  }, [])

  useEffect(() => {
    // Don't fetch until accounts and settings are loaded
    if (accountsLoading || prSettingsLoading) {
      return
    }

    // Increment fetch ID to track this specific fetch operation
    const currentFetchId = ++fetchIdRef.current

    const fetchPRs = async () => {
      setLoading(true)
      setError(null)
      setProgress(null)
      setTotalPrsFound(0)

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
        
        // Enqueue the fetch operation to prevent concurrent API calls
        const results = await enqueue(
          async (signal) => {
            // Check if this fetch was cancelled
            if (signal.aborted) {
              throw new DOMException('Fetch cancelled', 'AbortError')
            }

            let prs: PullRequest[];
            switch (mode) {
              case 'needs-review':
                prs = await githubClient.fetchNeedsReview(handleProgress);
                break;
              case 'recently-merged':
                prs = await githubClient.fetchRecentlyMerged(handleProgress);
                break;
              case 'my-prs':
              default:
                prs = await githubClient.fetchMyPRs(handleProgress);
                break;
            }
            return prs;
          },
          { name: `fetch-${mode}` }
        );
        
        // Ignore results if a newer fetch has started
        if (currentFetchId !== fetchIdRef.current) {
          console.log('Ignoring stale fetch result for', mode);
          return;
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
        // Track when we successfully fetched
        lastFetchTimeRef.current = Date.now()
        // Report count to parent
        onCountChange?.(results.length)
      } catch (err) {
        // Ignore cancellation errors
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log('Fetch cancelled for', mode);
          return;
        }
        // Ignore if a newer fetch has started
        if (currentFetchId !== fetchIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch PRs')
        console.error('Error fetching PRs:', err)
      } finally {
        // Only update loading state if this is still the current fetch
        if (currentFetchId === fetchIdRef.current) {
          setLoading(false)
        }
      }
    }

    fetchPRs()

    // Cleanup: cancel pending tasks when mode changes or component unmounts
    return () => {
      cancelAll()
    }
  }, [mode, accounts, accountsLoading, recentlyMergedDays, prSettingsLoading, refreshTrigger, handleProgress, onCountChange, enqueue, cancelAll])

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
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
    const progressPercent = progress 
      ? Math.round(((progress.currentAccount - (progress.status === 'done' ? 0 : 1)) / progress.totalAccounts) * 100)
      : 0;
    
    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
        </div>
        <div className="pr-list-loading">
          <Loader2 className="spin" size={24} />
          {progress ? (
            <div className="loading-progress">
              <p className="progress-main">
                {progress.status === 'authenticating' && 'Authenticating...'}
                {progress.status === 'fetching' && 'Fetching PRs...'}
                {progress.status === 'done' && `Found ${progress.prsFound} PRs`}
                {progress.status === 'error' && `Error: ${progress.error}`}
              </p>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="progress-detail">
                Account {progress.currentAccount} of {progress.totalAccounts}: {progress.accountName} ({progress.org})
              </p>
              {totalPrsFound > 0 && (
                <p className="progress-total">
                  {totalPrsFound} PR{totalPrsFound !== 1 ? 's' : ''} found so far
                </p>
              )}
            </div>
          ) : (
            <p>Loading pull requests...</p>
          )}
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
                {pr.orgAvatarUrl ? (
                  <img 
                    src={pr.orgAvatarUrl} 
                    alt={pr.org || pr.source} 
                    className="pr-org-avatar"
                    title={pr.org}
                  />
                ) : (
                  <span className="pr-source">{pr.source === 'GitHub' ? 'GH' : 'BB'}</span>
                )}
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
