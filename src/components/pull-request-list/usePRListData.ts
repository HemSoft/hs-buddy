import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { PullRequest } from '../../types/pullRequest'
import { GitHubClient, type ProgressCallback, type PRSearchMode } from '../../api/github'
import { useGitHubAccounts, usePRSettings, useCopilotSettings } from '../../hooks/useConfig'
import { useRepoBookmarks, useRepoBookmarkMutations } from '../../hooks/useConvex'
import { useLatest } from '../../hooks/useLatest'
import { useTaskQueue } from '../../hooks/useTaskQueue'
import { parseOwnerRepoFromUrl } from '../../utils/githubUrl'
import { buildAddressCommentsPrompt } from '../../utils/assistantPrompts'
import { getProgressColor } from '../../utils/progressColors'
import { dataCache } from '../../services/dataCache'
import { formatTime } from '../../utils/dateUtils'
import { MS_PER_MINUTE } from '../../constants'
import { isAbortError, throwIfAborted, getUserFacingErrorMessage } from '../../utils/errorUtils'
import { dispatchPRReviewOpen } from '../../utils/prReviewEvents'

function applyCachedPRs(
  data: PullRequest[],
  setPrs: (prs: PullRequest[]) => void,
  setLoading: (v: boolean) => void,
  setRefreshing: (v: boolean) => void,
  setError: (v: string | null) => void,
  onCountChangeRef: { current?: (count: number) => void }
): void {
  setPrs(data)
  setLoading(false)
  setRefreshing(false)
  setError(null)
  onCountChangeRef.current?.(data.length)
}

function handlePRFetchError(
  err: unknown,
  currentFetchId: number,
  fetchIdRef: { current: number },
  mode: string,
  setError: (e: string) => void
): void {
  if (isAbortError(err)) {
    console.log('Fetch cancelled for', mode)
    return
  }
  /* v8 ignore start */
  if (currentFetchId !== fetchIdRef.current) {
    return
    /* v8 ignore stop */
  }
  setError(getUserFacingErrorMessage(err, 'Failed to fetch PRs'))
  console.error('Error fetching PRs:', err)
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

const FETCH_BY_MODE: Record<
  PRSearchMode,
  (client: GitHubClient, cb: ProgressCallback) => Promise<PullRequest[]>
> = {
  'needs-review': (c, cb) => c.fetchNeedsReview(cb),
  'recently-merged': (c, cb) => c.fetchRecentlyMerged(cb),
  'need-a-nudge': (c, cb) => c.fetchNeedANudge(cb),
  'my-prs': (c, cb) => c.fetchMyPRs(cb),
}

async function fetchPRsByMode(
  githubClient: GitHubClient,
  mode: PRSearchMode,
  handleProgress: ProgressCallback
): Promise<PullRequest[]> {
  const fetcher = Object.hasOwn(FETCH_BY_MODE, mode) ? FETCH_BY_MODE[mode] : FETCH_BY_MODE['my-prs']
  return fetcher(githubClient, handleProgress)
}

function markApproved(items: PullRequest[], pr: PullRequest): PullRequest[] {
  return items.map(item =>
    item.repository === pr.repository && item.id === pr.id && !item.iApproved
      ? { ...item, iApproved: true, approvalCount: item.approvalCount + 1 }
      : item
  )
}

function getFreshCachedData(mode: string, refreshInterval: number): PullRequest[] | null {
  /* v8 ignore start */
  const cached = dataCache.get<PullRequest[]>(mode)
  if (!cached) return null
  const intervalMs = refreshInterval * MS_PER_MINUTE
  return Date.now() - cached.fetchedAt < intervalMs ? cached.data : null
  /* v8 ignore stop */
}

function hasExistingPRData(
  prs: PullRequest[],
  cached: ReturnType<typeof dataCache.get<PullRequest[]>> | undefined
): boolean {
  /* v8 ignore start */
  return prs.length > 0 || (cached?.data != null && cached.data.length > 0)
  /* v8 ignore stop */
}

function applyFetchResults(
  results: PullRequest[],
  setPrs: (prs: PullRequest[]) => void,
  onCountChangeRef: React.RefObject<((count: number) => void) | undefined>
): void {
  setPrs(results)
  onCountChangeRef.current?.(results.length)
}

function sortPRResults(results: PullRequest[], mode: string): PullRequest[] {
  if (mode === 'recently-merged') return results
  return results.sort((a, b) => {
    if (a.repository !== b.repository) {
      return a.repository.localeCompare(b.repository)
    }
    return a.id - b.id
  })
}

export function usePRListData(mode: PRSearchMode, onCountChange?: (count: number) => void) {
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

  const onCountChangeRef = useLatest(onCountChange)
  const enqueueRef = useLatest(enqueue)
  const cancelAllRef = useLatest(cancelAll)

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
  }, [mode, onCountChangeRef])

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
    dispatchPRReviewOpen({
      prUrl: pr.url,
      prTitle: pr.title,
      prNumber: pr.id,
      repo: pr.repository,
      /* v8 ignore start */
      org: pr.org || '',
      /* v8 ignore stop */
      author: pr.author,
    })
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
  }, [contextMenu, accounts, recentlyMergedDays, enqueueRef])

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
    [accounts, mode, recentlyMergedDays, enqueueRef]
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
        applyCachedPRs(cached.data, setPrs, setLoading, setRefreshing, setError, onCountChangeRef)
        return
      }
    }
    fetchInProgressRef.current = true
    const currentFetchId = ++fetchIdRef.current
    const fetchPRs = async () => {
      /* v8 ignore start */
      const hasExistingData = hasExistingPRData(prs, cached)
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
            /* v8 ignore start */
            if (!isForceRefresh) {
              const freshData = getFreshCachedData(mode, refreshInterval)
              if (freshData) {
                console.log(
                  `[PullRequestList] Skipping fetch for ${mode} — data became fresh while queued`
                )
                return freshData
              }
            }
            /* v8 ignore stop */
            throwIfAborted(signal)
            const prs = await fetchPRsByMode(githubClient, mode, handleProgress)
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
        sortPRResults(results, mode)
        applyFetchResults(results, setPrs, onCountChangeRef)
        dataCache.set(mode, results)
      } catch (err) {
        handlePRFetchError(err, currentFetchId, fetchIdRef, mode, setError)
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- useLatest ref always holds current value
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

  const PR_MODE_TITLES: Record<PRSearchMode, string> = {
    'my-prs': 'My Pull Requests',
    'needs-review': 'PRs Needing Review',
    'recently-merged': 'Recently Merged PRs',
    'need-a-nudge': 'Needs a nudge',
  }

  const getTitle = () =>
    Object.hasOwn(PR_MODE_TITLES, mode) ? PR_MODE_TITLES[mode] : 'Pull Requests'

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
