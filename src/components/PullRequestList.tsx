import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { PullRequest } from '../types/pullRequest'
import { GitHubClient, type ProgressCallback } from '../api/github'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import { useRepoBookmarks, useRepoBookmarkMutations } from '../hooks/useConvex'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { dataCache } from '../services/dataCache'
import './PullRequestList.css'
import { ExternalLink, GitPullRequest, Check, Clock, Loader2, RefreshCw, Star, Sparkles } from 'lucide-react'

interface PullRequestListProps {
  mode: 'my-prs' | 'needs-review' | 'recently-merged'
  onCountChange?: (count: number) => void
}

interface LoadingProgress {
  currentAccount: number
  totalAccounts: number
  accountName: string
  org: string
  status: 'authenticating' | 'fetching' | 'done' | 'error'
  prsFound?: number
  totalPrsFound: number
  error?: string
}

export function PullRequestList({ mode, onCountChange }: PullRequestListProps) {
  const cachedEntry = dataCache.get<PullRequest[]>(mode)
  const [prs, setPrs] = useState<PullRequest[]>(cachedEntry?.data || [])
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [refreshing, setRefreshing] = useState(false) // Background refresh (has data, fetching update)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LoadingProgress | null>(null)
  const [totalPrsFound, setTotalPrsFound] = useState(0)
  const [forceRefresh, setForceRefresh] = useState(0) // Manual refresh trigger
  const [updateTimes, setUpdateTimes] = useState<{
    lastUpdated: string
    nextUpdate: string
    progress: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pr: PullRequest } | null>(
    null
  )
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const { recentlyMergedDays, refreshInterval, loading: prSettingsLoading } = usePRSettings()
  const bookmarks = useRepoBookmarks()
  const { create: createBookmark, remove: removeBookmark } = useRepoBookmarkMutations()
  const { enqueue, cancelAll } = useTaskQueue('github')
  const fetchIdRef = useRef(0) // Track fetch operation to ignore stale results
  const fetchInProgressRef = useRef(false) // Guard against duplicate fetches (StrictMode)

  // Build bookmarked repo keys for quick lookup
  const bookmarkedRepoKeys = useMemo(
    () => new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`)),
    [bookmarks]
  )

  // Refs for callbacks to avoid triggering effect re-runs
  const onCountChangeRef = useRef(onCountChange)
  const enqueueRef = useRef(enqueue)
  const cancelAllRef = useRef(cancelAll)
  useEffect(() => {
    onCountChangeRef.current = onCountChange
  }, [onCountChange])
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])
  useEffect(() => {
    cancelAllRef.current = cancelAll
  }, [cancelAll])

  // Format time as HH:MM AM/PM
  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }, [])

  // Calculate progress bar color based on percentage (green -> yellow -> orange -> red)
  const getProgressColor = useCallback((progress: number) => {
    if (progress <= 25) return '#4ec9b0' // Green - fresh
    if (progress <= 50) return '#dcd34a' // Yellow - moderate
    if (progress <= 75) return '#e89b3c' // Orange - getting stale
    return '#e85d5d' // Red - stale
  }, [])

  // Subscribe to dataCache updates from prefetch service
  // When prefetch completes for this mode, update our state without re-fetching
  useEffect(() => {
    const unsubscribe = dataCache.subscribe(key => {
      if (key === mode) {
        const updated = dataCache.get<PullRequest[]>(mode)
        if (updated?.data) {
          setPrs(updated.data)
          setLoading(false)
          setRefreshing(false)
          onCountChangeRef.current?.(updated.data.length)
        }
      }
    })
    return unsubscribe
  }, [mode])

  // Update the last/next update times display
  useEffect(() => {
    const updateTimesDisplay = () => {
      const cached = dataCache.get<PullRequest[]>(mode)
      if (cached && refreshInterval) {
        const now = Date.now()
        const lastUpdated = formatTime(cached.fetchedAt)
        const nextUpdateTimestamp = cached.fetchedAt + refreshInterval * 60 * 1000
        const nextUpdate = formatTime(nextUpdateTimestamp)

        // Calculate progress (0 = just updated, 100 = time for next update)
        const totalInterval = refreshInterval * 60 * 1000
        const elapsed = now - cached.fetchedAt
        const progress = Math.min(100, Math.max(0, (elapsed / totalInterval) * 100))

        setUpdateTimes({ lastUpdated, nextUpdate, progress })
      } else {
        setUpdateTimes(null)
      }
    }

    updateTimesDisplay()
    // Update every 5 seconds to keep progress bar smooth
    const interval = setInterval(updateTimesDisplay, 5000)
    return () => clearInterval(interval)
  }, [mode, prs, refreshInterval, formatTime])

  const handleProgress: ProgressCallback = useCallback(p => {
    setProgress(prev => {
      // Calculate cumulative total
      let newTotal = prev?.totalPrsFound ?? 0
      if (p.status === 'done' && p.prsFound !== undefined) {
        newTotal += p.prsFound
      }
      setTotalPrsFound(newTotal)
      return { ...p, totalPrsFound: newTotal }
    })
  }, [])

  const handleManualRefresh = useCallback(() => {
    setForceRefresh(prev => prev + 1)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, pr: PullRequest) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pr })
  }, [])

  const handleBookmarkRepo = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const org = pr.org || ''
    const repoName = pr.repository
    const key = `${org}/${repoName}`

    if (bookmarkedRepoKeys.has(key)) {
      const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
      if (bookmark) await removeBookmark({ id: bookmark._id })
    } else {
      await createBookmark({
        folder: org,
        owner: org,
        repo: repoName,
        url: pr.url.replace(/\/pull\/\d+$/, ''),
        description: '',
      })
    }
    setContextMenu(null)
  }, [contextMenu, bookmarks, bookmarkedRepoKeys, createBookmark, removeBookmark])

  const handleAIReview = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
    try {
      const result = await window.copilot.execute({
        prompt: `Please do a thorough PR review on ${pr.url}. Analyze the code changes for bugs, security issues, performance problems, and code quality. Categorize findings by severity: 🔴 Critical, 🟡 Medium, 🟢 Nitpick.`,
        category: 'pr-review',
        metadata: {
          prUrl: pr.url,
          prTitle: pr.title,
          prNumber: pr.id,
          repo: pr.repository,
          org: pr.org,
          author: pr.author,
        },
      })
      // Navigate to the result tab
      if (result.success && result.resultId) {
        window.dispatchEvent(
          new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
        )
      }
    } catch (err) {
      console.error('Failed to request AI review:', err)
    }
    setContextMenu(null)
  }, [contextMenu])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    // Don't fetch until accounts and settings are loaded
    if (accountsLoading || prSettingsLoading) {
      return
    }

    // Guard against duplicate fetches (React StrictMode double-invokes effects)
    if (fetchInProgressRef.current) {
      console.log(`Skipping duplicate fetch for ${mode} - fetch already in progress`)
      return
    }

    // Check if we have fresh cached data (unless force refresh)
    const cached = dataCache.get<PullRequest[]>(mode)
    const isForceRefresh = forceRefresh > 0

    if (cached && !isForceRefresh) {
      const intervalMs = refreshInterval * 60 * 1000
      const timeSinceLastFetch = Date.now() - cached.fetchedAt

      // If cached data is fresh enough, use it and skip fetch
      if (timeSinceLastFetch < intervalMs) {
        console.log(`Using cached PRs for ${mode} (${Math.round(timeSinceLastFetch / 1000)}s old)`)
        setPrs(cached.data)
        setLoading(false)
        setRefreshing(false)
        setError(null)
        onCountChangeRef.current?.(cached.data.length)
        return
      }
    }

    // Mark fetch as in progress
    fetchInProgressRef.current = true

    // Increment fetch ID to track this specific fetch operation
    const currentFetchId = ++fetchIdRef.current

    const fetchPRs = async () => {
      // If we have existing data, show it while refreshing in the background
      // (no full-page loading spinner — just a subtle refresh indicator)
      const hasExistingData = prs.length > 0 || (cached?.data && cached.data.length > 0)
      if (hasExistingData) {
        setRefreshing(true)
        setLoading(false)
      } else {
        setLoading(true)
      }
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
        console.log(
          'Fetching PRs for',
          accounts.length,
          'account(s)...',
          'mode:',
          mode,
          'recentlyMergedDays:',
          recentlyMergedDays
        )

        // Enqueue the fetch operation to prevent concurrent API calls
        const results = await enqueueRef.current(
          async signal => {
            // Re-check freshness right before executing.
            // The prefetch service may have already updated this data while
            // this task was waiting in the queue.
            const freshCheck = dataCache.get<PullRequest[]>(mode)
            if (freshCheck && !isForceRefresh) {
              const intervalMs = refreshInterval * 60 * 1000
              if (Date.now() - freshCheck.fetchedAt < intervalMs) {
                console.log(
                  `[PullRequestList] Skipping fetch for ${mode} — data became fresh while queued`
                )
                return freshCheck.data
              }
            }

            // Check if this fetch was cancelled
            if (signal.aborted) {
              throw new DOMException('Fetch cancelled', 'AbortError')
            }

            let prs: PullRequest[]
            switch (mode) {
              case 'needs-review':
                prs = await githubClient.fetchNeedsReview(handleProgress)
                break
              case 'recently-merged':
                prs = await githubClient.fetchRecentlyMerged(handleProgress)
                break
              case 'my-prs':
              default:
                prs = await githubClient.fetchMyPRs(handleProgress)
                break
            }
            return prs
          },
          { name: `fetch-${mode}` }
        )

        // Ignore results if a newer fetch has started
        if (currentFetchId !== fetchIdRef.current) {
          console.log('Ignoring stale fetch result for', mode)
          return
        }

        console.log('Found PRs:', results.length)

        // For recently-merged, keep the date sort from the API (newest first)
        // For other modes, sort by repository then PR number
        if (mode !== 'recently-merged') {
          results.sort((a, b) => {
            if (a.repository !== b.repository) {
              return a.repository.localeCompare(b.repository)
            }
            return a.id - b.id
          })
        }

        setPrs(results)
        // Update the persistent data cache (memory + disk)
        dataCache.set(mode, results)
        // Report count to parent
        onCountChangeRef.current?.(results.length)
      } catch (err) {
        // Ignore cancellation errors
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log('Fetch cancelled for', mode)
          return
        }
        // Ignore if a newer fetch has started
        if (currentFetchId !== fetchIdRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch PRs')
        console.error('Error fetching PRs:', err)
      } finally {
        // Only update loading state if this is still the current fetch
        if (currentFetchId === fetchIdRef.current) {
          setLoading(false)
          setRefreshing(false)
          fetchInProgressRef.current = false
        }
      }
    }

    fetchPRs()

    // Cleanup: cancel pending tasks when mode changes or component unmounts
    return () => {
      fetchInProgressRef.current = false
      cancelAllRef.current()
    }
    // Only re-fetch when these values actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    accounts,
    accountsLoading,
    recentlyMergedDays,
    prSettingsLoading,
    forceRefresh,
    refreshInterval,
  ])

  // Auto-refresh interval timer
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) {
      return
    }

    const intervalMs = refreshInterval * 60 * 1000
    console.log(`Setting up auto-refresh interval: ${refreshInterval} minutes`)

    const intervalId = setInterval(() => {
      console.log(`Auto-refresh triggered for ${mode}`)
      // Clear the in-progress flag to allow refresh
      fetchInProgressRef.current = false
      setForceRefresh(prev => prev + 1)
    }, intervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [mode, refreshInterval])

  const formatDate = (date: Date | string | null) => {
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
      ? Math.round(
          ((progress.currentAccount - (progress.status === 'done' ? 0 : 1)) /
            progress.totalAccounts) *
            100
        )
      : 0

    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
          <div className="pr-header-actions">
            <button className="refresh-button" disabled title="Refreshing...">
              <Loader2 size={16} className="spin" />
            </button>
          </div>
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
                <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="progress-detail">
                Account {progress.currentAccount} of {progress.totalAccounts}:{' '}
                {progress.accountName} ({progress.org})
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
          <div className="pr-header-actions">
            <button className="refresh-button" onClick={handleManualRefresh} title="Retry">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="pr-list-error">
          <p className="error-message">⚠️ {error}</p>
          {accounts.length === 0 && (
            <>
              <p className="error-hint">
                You need to configure at least one GitHub account in Settings.
              </p>
              <p className="hint">
                On first launch, environment variables (VITE_GITHUB_USERNAME, VITE_GITHUB_ORG) will
                be migrated to the config automatically.
              </p>
            </>
          )}
          {accounts.length > 0 && (
            <>
              <p className="error-hint">Make sure you're authenticated with GitHub CLI:</p>
              <ul>
                <li>
                  <code>gh auth status</code> - Check authentication status
                </li>
                <li>
                  <code>gh auth login</code> - Log in to GitHub
                </li>
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
          <div className="pr-header-actions">
            {updateTimes && (
              <div className="update-times">
                <div className="update-times-content">
                  <span className="update-label">Updated</span>
                  <span className="update-time">{updateTimes.lastUpdated}</span>
                  <span className="update-separator">·</span>
                  <span className="update-label">Next</span>
                  <span className="update-time">{updateTimes.nextUpdate}</span>
                </div>
                <div className="update-progress-track">
                  <div
                    className="update-progress-bar"
                    style={{
                      width: `${updateTimes.progress}%`,
                      backgroundColor: getProgressColor(updateTimes.progress),
                    }}
                  />
                </div>
              </div>
            )}
            <button
              className="refresh-button"
              onClick={handleManualRefresh}
              title="Refresh"
              disabled={refreshing}
            >
              {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            </button>
          </div>
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
        <div className="pr-header-actions">
          <span className="pr-count">
            {prs.length} PR{prs.length !== 1 ? 's' : ''}
            {refreshing && <span className="refreshing-badge">Refreshing...</span>}
          </span>
          {updateTimes && (
            <div className="update-times">
              <div className="update-times-content">
                <span className="update-label">Updated</span>
                <span className="update-time">{updateTimes.lastUpdated}</span>
                <span className="update-separator">·</span>
                <span className="update-label">Next</span>
                <span className="update-time">{updateTimes.nextUpdate}</span>
              </div>
              <div className="update-progress-track">
                <div
                  className="update-progress-bar"
                  style={{
                    width: `${updateTimes.progress}%`,
                    backgroundColor: getProgressColor(updateTimes.progress),
                  }}
                />
              </div>
            </div>
          )}
          <button
            className="refresh-button"
            onClick={handleManualRefresh}
            title="Refresh"
            disabled={refreshing}
          >
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>
      <div className="pr-list">
        {/* Context Menu Overlay */}
        {contextMenu && (
          <>
            <div className="pr-context-menu-overlay" onClick={closeContextMenu} />
            <div className="pr-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
              <button onClick={handleAIReview}>
                <Sparkles size={14} />
                Request AI Review
              </button>
              <button onClick={handleBookmarkRepo}>
                <Star
                  size={14}
                  fill={
                    bookmarkedRepoKeys.has(`${contextMenu.pr.org}/${contextMenu.pr.repository}`)
                      ? 'currentColor'
                      : 'none'
                  }
                />
                {bookmarkedRepoKeys.has(`${contextMenu.pr.org}/${contextMenu.pr.repository}`)
                  ? `Unbookmark ${contextMenu.pr.repository}`
                  : `Bookmark ${contextMenu.pr.repository}`}
              </button>
            </div>
          </>
        )}
        {prs.map(pr => (
          <div
            key={`${pr.source}-${pr.id}-${pr.repository}`}
            className="pr-item"
            onClick={() => window.shell.openExternal(pr.url)}
            onContextMenu={e => handleContextMenu(e, pr)}
            role="link"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                window.shell.openExternal(pr.url)
              }
            }}
          >
            <div className="pr-item-header">
              <div className="pr-title-row">
                <GitPullRequest size={16} className="pr-icon" />
                <div className="pr-title">
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
                <span className="pr-author">
                  {pr.authorAvatarUrl && (
                    <img src={pr.authorAvatarUrl} alt={pr.author} className="pr-author-avatar" />
                  )}
                  {pr.author}
                </span>
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
                <span>{formatDate(mode === 'recently-merged' ? pr.date : pr.created)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
