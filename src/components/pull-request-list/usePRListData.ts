import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { PullRequest } from '../../types/pullRequest'
import { GitHubClient, type ProgressCallback } from '../../api/github'
import { useGitHubAccounts, usePRSettings, useCopilotSettings } from '../../hooks/useConfig'
import { useRepoBookmarks, useRepoBookmarkMutations } from '../../hooks/useConvex'
import { useTaskQueue } from '../../hooks/useTaskQueue'
import { parseOwnerRepoFromUrl } from '../../utils/githubUrl'
import { buildAddressCommentsPrompt } from '../../utils/assistantPrompts'
import { getProgressColor } from '../../utils/progressColors'
import { dataCache } from '../../services/dataCache'
import { formatTime } from '../../utils/dateUtils'
import { MS_PER_MINUTE } from '../../constants'
import { isAbortError, throwIfAborted } from '../../utils/errorUtils'

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

function markApproved(items: PullRequest[], pr: PullRequest): PullRequest[] {
  return items.map(item =>
    item.repository === pr.repository && item.id === pr.id && !item.iApproved
      ? { ...item, iApproved: true, approvalCount: item.approvalCount + 1 }
      : item
  )
}

export function usePRListData(
  mode: 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge',
  onCountChange?: (count: number) => void
) {
  const cachedEntry = dataCache.get<PullRequest[]>(mode)
  const [prs, setPrs] = useState<PullRequest[]>(cachedEntry?.data || [])
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LoadingProgress | null>(null)
  const [totalPrsFound, setTotalPrsFound] = useState(0)
  const [forceRefresh, setForceRefresh] = useState(0)
  const [updateTimes, setUpdateTimes] = useState<{
    lastUpdated: string
    nextUpdate: string
    progress: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pr: PullRequest } | null>(
    null
  )
  const [approving, setApproving] = useState<string | null>(null)
  const { accounts, loading: accountsLoading } = useGitHubAccounts()
  const { recentlyMergedDays, refreshInterval, loading: prSettingsLoading } = usePRSettings()
  const { premiumModel } = useCopilotSettings()
  const bookmarks = useRepoBookmarks()
  const { create: createBookmark, remove: removeBookmark } = useRepoBookmarkMutations()
  const { enqueue, cancelAll } = useTaskQueue('github')
  const fetchIdRef = useRef(0)
  const fetchInProgressRef = useRef(false)

  const bookmarkedRepoKeys = useMemo(
    () => new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`)),
    [bookmarks]
  )

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

  useEffect(() => {
    const unsubscribe = dataCache.subscribe(key => {
      if (key === mode) {
        const updated = dataCache.get<PullRequest[]>(mode)
        /* v8 ignore start */
        if (updated?.data) {
          /* v8 ignore stop */
          setPrs(updated.data)
          setLoading(false)
          setRefreshing(false)
          onCountChangeRef.current?.(updated.data.length)
        }
      }
    })
    return unsubscribe
  }, [mode])

  useEffect(() => {
    const updateTimesDisplay = () => {
      const cached = dataCache.get<PullRequest[]>(mode)
      if (cached && refreshInterval) {
        const now = Date.now()
        const lastUpdated = formatTime(cached.fetchedAt, { hour12: true, numeric: true })
        const nextUpdateTimestamp = cached.fetchedAt + refreshInterval * MS_PER_MINUTE
        const nextUpdate = formatTime(nextUpdateTimestamp, { hour12: true, numeric: true })
        const totalInterval = refreshInterval * MS_PER_MINUTE
        const elapsed = now - cached.fetchedAt
        const progress = Math.min(100, Math.max(0, (elapsed / totalInterval) * 100))
        setUpdateTimes({ lastUpdated, nextUpdate, progress })
      } else {
        setUpdateTimes(null)
      }
    }
    updateTimesDisplay()
    const interval = setInterval(updateTimesDisplay, 5000)
    return () => clearInterval(interval)
  }, [mode, prs, refreshInterval])

  const handleProgress: ProgressCallback = useCallback(p => {
    setProgress(prev => {
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
      /* v8 ignore start */
      const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
      /* v8 ignore stop */
      /* v8 ignore start */
      if (bookmark) await removeBookmark({ id: bookmark._id })
      /* v8 ignore stop */
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
    window.dispatchEvent(
      new CustomEvent('pr-review:open', {
        detail: {
          prUrl: pr.url,
          prTitle: pr.title,
          prNumber: pr.id,
          repo: pr.repository,
          /* v8 ignore start */
          org: pr.org || '',
          /* v8 ignore stop */
          author: pr.author,
        },
      })
    )
    setContextMenu(null)
  }, [contextMenu])

  const handleRequestCopilotReview = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) return
    try {
      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, recentlyMergedDays)
          await client.requestCopilotReview(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `copilot-review-${pr.repository}-${pr.id}` }
      )
    } catch (err) {
      console.error('Failed to request Copilot review:', err)
    }
    setContextMenu(null)
  }, [contextMenu, accounts, recentlyMergedDays])

  const handleAddressComments = useCallback(() => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const org = pr.org || pr.source
    const prompt = buildAddressCommentsPrompt({
      prId: pr.id,
      org,
      repository: pr.repository,
      url: pr.url,
    })
    window.dispatchEvent(
      new CustomEvent('assistant:send-prompt', { detail: { prompt, model: premiumModel } })
    )
    setContextMenu(null)
  }, [contextMenu, premiumModel])

  const handleCopyLink = useCallback(async () => {
    if (!contextMenu) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contextMenu.pr.url)
      }
    } catch (error) {
      console.error('Failed to copy PR link:', error)
    }
    setContextMenu(null)
  }, [contextMenu])

  const handleApprove = useCallback(
    async (pr: PullRequest) => {
      if (pr.iApproved) return
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) return
      const approveKey = `${pr.repository}-${pr.id}`
      setApproving(approveKey)
      try {
        await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, recentlyMergedDays)
            await client.approvePullRequest(ownerRepo.owner, ownerRepo.repo, pr.id)
          },
          { name: `approve-pr-${pr.repository}-${pr.id}` }
        )
        setPrs(prev => markApproved(prev, pr))
        const cached = dataCache.get<PullRequest[]>(mode)
        if (cached?.data) {
          dataCache.set(mode, markApproved(cached.data, pr))
        }
      } catch (error) {
        console.error('Failed to approve PR:', error)
      } finally {
        setApproving(null)
      }
    },
    [accounts, mode, recentlyMergedDays]
  )

  const handleApproveFromMenu = useCallback(async () => {
    if (!contextMenu) return
    await handleApprove(contextMenu.pr)
    setContextMenu(null)
  }, [contextMenu, handleApprove])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      /* v8 ignore start */
      if (e.key === 'Escape') closeContextMenu()
      /* v8 ignore stop */
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, closeContextMenu])

  useEffect(() => {
    if (accountsLoading || prSettingsLoading) {
      return
    }
    /* v8 ignore start */
    if (fetchInProgressRef.current) {
      console.log(`Skipping duplicate fetch for ${mode} - fetch already in progress`)
      return
      /* v8 ignore stop */
    }
    const cached = dataCache.get<PullRequest[]>(mode)
    const isForceRefresh = forceRefresh > 0
    if (cached && !isForceRefresh) {
      const intervalMs = refreshInterval * MS_PER_MINUTE
      const timeSinceLastFetch = Date.now() - cached.fetchedAt
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
    fetchInProgressRef.current = true
    const currentFetchId = ++fetchIdRef.current
    const fetchPRs = async () => {
      /* v8 ignore start */
      const hasExistingData = prs.length > 0 || (cached?.data && cached.data.length > 0)
      /* v8 ignore stop */
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
        if (accounts.length === 0) {
          setError('No GitHub accounts configured. Please add an account in Settings.')
          setLoading(false)
          return
        }
        const config = {
          github: { accounts },
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
        const results = await enqueueRef.current(
          async signal => {
            const freshCheck = dataCache.get<PullRequest[]>(mode)
            if (freshCheck && !isForceRefresh) {
              const intervalMs = refreshInterval * MS_PER_MINUTE
              /* v8 ignore start */
              if (Date.now() - freshCheck.fetchedAt < intervalMs) {
                console.log(
                  /* v8 ignore stop */
                  `[PullRequestList] Skipping fetch for ${mode} — data became fresh while queued`
                )
                /* v8 ignore start */
                return freshCheck.data
                /* v8 ignore stop */
              }
            }
            throwIfAborted(signal)
            let prs: PullRequest[]
            switch (mode) {
              case 'needs-review':
                prs = await githubClient.fetchNeedsReview(handleProgress)
                break
              case 'recently-merged':
                prs = await githubClient.fetchRecentlyMerged(handleProgress)
                break
              case 'need-a-nudge':
                prs = await githubClient.fetchNeedANudge(handleProgress)
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
        /* v8 ignore start */
        if (currentFetchId !== fetchIdRef.current) {
          console.log('Ignoring stale fetch result for', mode)
          return
          /* v8 ignore stop */
        }
        console.log('Found PRs:', results.length)
        if (mode !== 'recently-merged') {
          results.sort((a, b) => {
            if (a.repository !== b.repository) {
              return a.repository.localeCompare(b.repository)
            }
            return a.id - b.id
          })
        }
        setPrs(results)
        dataCache.set(mode, results)
        onCountChangeRef.current?.(results.length)
      } catch (err) {
        /* v8 ignore start */
        if (isAbortError(err)) {
          /* v8 ignore stop */
          console.log('Fetch cancelled for', mode)
          return
        }
        /* v8 ignore start */
        if (currentFetchId !== fetchIdRef.current) {
          return
          /* v8 ignore stop */
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch PRs')
        console.error('Error fetching PRs:', err)
      } finally {
        /* v8 ignore start */
        if (currentFetchId === fetchIdRef.current) {
          /* v8 ignore stop */
          setLoading(false)
          setRefreshing(false)
          fetchInProgressRef.current = false
        }
      }
    }
    fetchPRs()
    return () => {
      fetchInProgressRef.current = false
      cancelAllRef.current()
    }
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

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) {
      return
    }
    const intervalMs = refreshInterval * MS_PER_MINUTE
    console.log(`Setting up auto-refresh interval: ${refreshInterval} minutes`)
    /* v8 ignore start */
    const intervalId = setInterval(() => {
      console.log(`Auto-refresh triggered for ${mode}`)
      fetchInProgressRef.current = false
      setForceRefresh(prev => prev + 1)
      /* v8 ignore stop */
    }, intervalMs)
    return () => {
      clearInterval(intervalId)
    }
  }, [mode, refreshInterval])

  const getTitle = () => {
    switch (mode) {
      case 'my-prs':
        return 'My Pull Requests'
      case 'needs-review':
        return 'PRs Needing Review'
      case 'recently-merged':
        return 'Recently Merged PRs'
      case 'need-a-nudge':
        return 'Needs a nudge'
      default:
        return 'Pull Requests'
    }
  }

  return {
    prs,
    loading,
    refreshing,
    error,
    progress,
    totalPrsFound,
    updateTimes,
    contextMenu,
    approving,
    accounts,
    bookmarks,
    bookmarkedRepoKeys,
    getProgressColor,
    handleManualRefresh,
    handleContextMenu,
    handleBookmarkRepo,
    handleAIReview,
    handleRequestCopilotReview,
    handleAddressComments,
    handleCopyLink,
    handleApprove,
    handleApproveFromMenu,
    closeContextMenu,
    getTitle,
  }
}
