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

type PullRequestCacheEntry = ReturnType<typeof dataCache.get<PullRequest[]>>
type PullRequestCountChangeRef = React.RefObject<((count: number) => void) | undefined>
type PullRequestEnqueue = ReturnType<typeof useTaskQueue>['enqueue']
type PullRequestAccounts = ReturnType<typeof useGitHubAccounts>['accounts']
type RepoBookmarks = ReturnType<typeof useRepoBookmarks>

function hasExistingPRData(prs: PullRequest[], cached: PullRequestCacheEntry | undefined): boolean {
  /* v8 ignore start */
  return prs.length > 0 || (cached?.data != null && cached.data.length > 0)
  /* v8 ignore stop */
}

function shouldSkipPRFetchEffect(
  accountsLoading: boolean,
  prSettingsLoading: boolean,
  fetchInProgress: boolean,
  mode: PRSearchMode
): boolean {
  if (accountsLoading) return true
  if (prSettingsLoading) return true
  if (!fetchInProgress) return false
  console.log(`Skipping duplicate fetch for ${mode} - fetch already in progress`)
  return true
}

function getCachedPRFetchState(
  mode: PRSearchMode,
  forceRefresh: boolean,
  refreshInterval: number,
  setPrs: (prs: PullRequest[]) => void,
  setLoading: (value: boolean) => void,
  setRefreshing: (value: boolean) => void,
  setError: (value: string | null) => void,
  onCountChangeRef: PullRequestCountChangeRef
): { cached: PullRequestCacheEntry; usedCachedData: boolean } {
  const cached = dataCache.get<PullRequest[]>(mode)
  if (forceRefresh || !cached) {
    return { cached, usedCachedData: false }
  }
  const intervalMs = refreshInterval * MS_PER_MINUTE
  const timeSinceLastFetch = Date.now() - cached.fetchedAt
  if (timeSinceLastFetch >= intervalMs) {
    return { cached, usedCachedData: false }
  }
  console.log(`Using cached PRs for ${mode} (${Math.round(timeSinceLastFetch / 1000)}s old)`)
  applyCachedPRs(cached.data, setPrs, setLoading, setRefreshing, setError, onCountChangeRef)
  return { cached, usedCachedData: true }
}

function updatePRLoadingState(
  hasExistingData: boolean,
  setLoading: (value: boolean) => void,
  setRefreshing: (value: boolean) => void
): void {
  if (hasExistingData) {
    setRefreshing(true)
    setLoading(false)
    return
  }
  setLoading(true)
}

function resetPRLoadState(
  setError: (value: string | null) => void,
  setProgress: (value: LoadingProgress | null) => void,
  setTotalPrsFound: (value: number) => void
): void {
  setError(null)
  setProgress(null)
  setTotalPrsFound(0)
}

async function fetchQueuedPRs(
  enqueue: PullRequestEnqueue,
  githubClient: GitHubClient,
  mode: PRSearchMode,
  forceRefresh: boolean,
  refreshInterval: number,
  handleProgress: ProgressCallback
): Promise<PullRequest[]> {
  return enqueue(
    async signal => {
      if (!forceRefresh) {
        const freshData = getFreshCachedData(mode, refreshInterval)
        if (freshData) {
          console.log(
            `[PullRequestList] Skipping fetch for ${mode} — data became fresh while queued`
          )
          return freshData
        }
      }
      throwIfAborted(signal)
      return fetchPRsByMode(githubClient, mode, handleProgress)
    },
    { name: `fetch-${mode}` }
  )
}

interface LoadPullRequestsOptions {
  accounts: PullRequestAccounts
  cached: PullRequestCacheEntry
  currentFetchId: number
  enqueue: PullRequestEnqueue
  fetchIdRef: { current: number }
  fetchInProgressRef: { current: boolean }
  forceRefresh: boolean
  handleProgress: ProgressCallback
  mode: PRSearchMode
  onCountChangeRef: PullRequestCountChangeRef
  prs: PullRequest[]
  recentlyMergedDays: number
  refreshInterval: number
  setError: (value: string | null) => void
  setLoading: (value: boolean) => void
  setProgress: (value: LoadingProgress | null) => void
  setPrs: (prs: PullRequest[]) => void
  setRefreshing: (value: boolean) => void
  setTotalPrsFound: (value: number) => void
}

async function loadPullRequests(opts: LoadPullRequestsOptions): Promise<void> {
  updatePRLoadingState(
    hasExistingPRData(opts.prs, opts.cached),
    opts.setLoading,
    opts.setRefreshing
  )
  resetPRLoadState(opts.setError, opts.setProgress, opts.setTotalPrsFound)
  try {
    if (opts.accounts.length === 0) {
      opts.setError('No GitHub accounts configured. Please add an account in Settings.')
      opts.setLoading(false)
      return
    }
    const githubClient = new GitHubClient({ accounts: opts.accounts }, opts.recentlyMergedDays)
    console.log(
      'Fetching PRs for',
      opts.accounts.length,
      'account(s)...',
      'mode:',
      opts.mode,
      'recentlyMergedDays:',
      opts.recentlyMergedDays
    )
    const results = await fetchQueuedPRs(
      opts.enqueue,
      githubClient,
      opts.mode,
      opts.forceRefresh,
      opts.refreshInterval,
      opts.handleProgress
    )
    if (opts.currentFetchId !== opts.fetchIdRef.current) {
      console.log('Ignoring stale fetch result for', opts.mode)
      return
    }
    console.log('Found PRs:', results.length)
    sortPRResults(results, opts.mode)
    applyFetchResults(results, opts.setPrs, opts.onCountChangeRef)
    dataCache.set(opts.mode, results)
  } catch (err: unknown) {
    handlePRFetchError(err, opts.currentFetchId, opts.fetchIdRef, opts.mode, opts.setError)
  } finally {
    if (opts.currentFetchId === opts.fetchIdRef.current) {
      opts.setLoading(false)
      opts.setRefreshing(false)
      opts.fetchInProgressRef.current = false
    }
  }
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

function getRepoBookmarkOwner(pr: PullRequest) {
  return pr.org || ''
}

function getRepoBookmarkKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

function findRepoBookmark(bookmarks: RepoBookmarks, owner: string, repo: string) {
  return (
    (bookmarks ?? []).find(bookmark => bookmark.owner === owner && bookmark.repo === repo) ?? null
  )
}

async function syncRepoBookmark(params: {
  bookmarks: RepoBookmarks
  bookmarkedRepoKeys: Set<string>
  createBookmark: (args: {
    folder: string
    owner: string
    repo: string
    url: string
    description: string
  }) => Promise<unknown>
  removeBookmark: (args: { id: string }) => Promise<unknown>
  pr: PullRequest
}) {
  const owner = getRepoBookmarkOwner(params.pr)
  const repo = params.pr.repository
  const key = getRepoBookmarkKey(owner, repo)

  if (params.bookmarkedRepoKeys.has(key)) {
    const bookmark = findRepoBookmark(params.bookmarks, owner, repo)
    if (bookmark) {
      await params.removeBookmark({ id: bookmark._id })
    }
    return
  }

  await params.createBookmark({
    folder: owner,
    owner,
    repo,
    url: params.pr.url.replace(/\/pull\/\d+$/, ''),
    description: '',
  })
}

function getApproveKey(pr: PullRequest) {
  return `${pr.repository}-${pr.id}`
}

function syncApprovedCache(mode: PRSearchMode, pr: PullRequest) {
  const cached = dataCache.get<PullRequest[]>(mode)
  if (!cached?.data) {
    return
  }

  dataCache.set(mode, markApproved(cached.data, pr))
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
    await syncRepoBookmark({
      bookmarks,
      bookmarkedRepoKeys,
      createBookmark,
      removeBookmark,
      pr: contextMenu.pr,
    })
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
    } catch (err: unknown) {
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
    } catch (error: unknown) {
      console.error('Failed to copy PR link:', error)
    }
    setContextMenu(null)
  }, [contextMenu])

  const handleApprove = useCallback(
    async (pr: PullRequest) => {
      if (pr.iApproved) return
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) return
      const approveKey = getApproveKey(pr)
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
        syncApprovedCache(mode, pr)
      } catch (error: unknown) {
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
    if (
      shouldSkipPRFetchEffect(accountsLoading, prSettingsLoading, fetchInProgressRef.current, mode)
    ) {
      return
    }
    const isForceRefresh = forceRefresh > 0
    const { cached, usedCachedData } = getCachedPRFetchState(
      mode,
      isForceRefresh,
      refreshInterval,
      setPrs,
      setLoading,
      setRefreshing,
      setError,
      onCountChangeRef
    )
    if (usedCachedData) {
      return
    }
    fetchInProgressRef.current = true
    const currentFetchId = ++fetchIdRef.current
    void loadPullRequests({
      accounts,
      cached,
      currentFetchId,
      enqueue: enqueueRef.current,
      fetchIdRef,
      fetchInProgressRef,
      forceRefresh: isForceRefresh,
      handleProgress,
      mode,
      onCountChangeRef,
      prs,
      recentlyMergedDays,
      refreshInterval,
      setError,
      setLoading,
      setProgress,
      setPrs,
      setRefreshing,
      setTotalPrsFound,
    })
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
