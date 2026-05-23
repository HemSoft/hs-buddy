import { useState, useCallback, useRef } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { useGitHubAccounts } from '../../../hooks/useConfig'
import { useToggleSet } from '../../../hooks/useToggleSet'
import {
  GitHubClient,
  type RepoCounts,
  type RepoPullRequest,
  type RepoCommit,
  type RepoIssue,
} from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoKey } from '../../../utils/githubUrl'
import { throwIfAborted } from '../../../utils/errorUtils'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import { mapRepoPRToPullRequest } from './githubSidebarUtils'

type EnqueueFn = (
  fn: (signal?: AbortSignal) => Promise<unknown>,
  meta: { name: string; priority?: number }
) => Promise<unknown>

type LoadingSetSetter = React.Dispatch<React.SetStateAction<Set<string>>>

function addToLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => new Set(prev).add(key))
}

function removeFromLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => {
    const next = new Set(prev)
    next.delete(key)
    return next
  })
}

function isCacheHitFresh(maxAgeMs: number | null | undefined, cacheKey: string): boolean {
  if (maxAgeMs === undefined) return true
  return typeof maxAgeMs === 'number' && dataCache.isFresh(cacheKey, maxAgeMs)
}

function shouldUseCachedData<TRaw>(
  cacheKey: string,
  forceRefresh: boolean | undefined,
  maxAgeMs: number | null | undefined,
  onData: (data: TRaw) => void
): boolean {
  const cached = dataCache.get<TRaw>(cacheKey)
  if (!cached?.data || forceRefresh) return false
  onData(cached.data)
  return isCacheHitFresh(maxAgeMs, cacheKey)
}

async function fetchCachedRepoData<TRaw>(opts: {
  key: string
  cacheKey: string
  loadingSetter: LoadingSetSetter
  enqueue: EnqueueFn
  taskName: string
  logLabel: string
  apiFn: () => Promise<TRaw>
  onData: (data: TRaw) => void
  afterFetch?: (result: TRaw) => void
  forceRefresh?: boolean
  maxAgeMs?: number | null
}): Promise<void> {
  if (shouldUseCachedData(opts.cacheKey, opts.forceRefresh, opts.maxAgeMs, opts.onData)) return
  addToLoadingSet(opts.loadingSetter, opts.key)
  try {
    const result = (await opts.enqueue(
      async signal => {
        /* v8 ignore start */
        if (signal) throwIfAborted(signal)
        /* v8 ignore stop */
        return await opts.apiFn()
      },
      { name: opts.taskName, priority: -1 }
    )) as TRaw
    opts.onData(result)
    dataCache.set(opts.cacheKey, result)
    opts.afterFetch?.(result)
  } catch (error: unknown) {
    console.warn(`[${opts.logLabel}] ${opts.key} failed:`, error)
  } finally {
    removeFromLoadingSet(opts.loadingSetter, opts.key)
  }
}

function getMaxAgeMs(refreshInterval: number): number | null {
  const MS_PER_MINUTE = 60_000
  return refreshInterval > 0 ? refreshInterval * MS_PER_MINUTE : null
}

interface UseSidebarRepoActionsOptions {
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
  enqueueRef: React.MutableRefObject<EnqueueFn>
  refreshInterval: number
  bookmarkedRepoKeys: Set<string>
  bookmarks:
    | Array<{ _id: Id<'repoBookmarks'>; owner?: string | null; repo?: string | null }>
    | null
    | undefined
  createBookmark: (data: {
    folder: string
    owner: string
    repo: string
    url: string
    description: string
  }) => Promise<{ inserted?: boolean } | null | undefined>
  removeBookmark: (data: { id: Id<'repoBookmarks'> }) => Promise<unknown>
  incrementStat: (data: { field: string }) => Promise<unknown>
}

async function removeExistingBookmark(
  org: string,
  repoName: string,
  bookmarks: UseSidebarRepoActionsOptions['bookmarks'],
  removeBookmark: UseSidebarRepoActionsOptions['removeBookmark']
): Promise<void> {
  /* v8 ignore start -- defensive: bookmarkedRepoKeys is derived from bookmarks */
  const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
  if (bookmark) await removeBookmark({ id: bookmark._id })
  /* v8 ignore stop */
}

function handleSimplePrefixCacheUpdate(
  key: string,
  handlers: Record<string, (repoKey: string) => void>
): boolean {
  for (const [prefix, handle] of Object.entries(handlers)) {
    if (key.startsWith(prefix)) {
      handle(key.replace(prefix, ''))
      return true
    }
  }
  return false
}

function handleRepoPrCacheUpdate(
  key: string,
  setRepoPrTreeData: React.Dispatch<React.SetStateAction<Record<string, PullRequest[]>>>
): boolean {
  const repoKey = key.replace('repo-prs:', '')
  const updated = dataCache.get<RepoPullRequest[]>(key)
  /* v8 ignore start */
  if (!updated?.data) return true
  /* v8 ignore stop */
  const [, ownerRepo] = repoKey.split(':', 2)
  if (!ownerRepo) return true
  const parsed = parseOwnerRepoKey(ownerRepo)
  /* v8 ignore start */
  if (!parsed) return true
  /* v8 ignore stop */
  setRepoPrTreeData(prev => ({
    ...prev,
    [repoKey]: updated.data.map(repoPr => mapRepoPRToPullRequest(repoPr, parsed.owner)),
  }))
  return true
}

export function useSidebarRepoActions(opts: UseSidebarRepoActionsOptions) {
  const {
    accounts,
    enqueueRef,
    refreshInterval,
    bookmarkedRepoKeys,
    bookmarks,
    createBookmark,
    removeBookmark,
    incrementStat,
  } = opts

  const repos = useToggleSet()
  const repoIssueGroups = useToggleSet()
  const repoIssueStateGroups = useToggleSet()
  const repoPRGroups = useToggleSet()
  const repoPRStateGroups = useToggleSet()
  const repoCommitGroups = useToggleSet()
  const sflGroups = useToggleSet()
  const ralphGroups = useToggleSet()

  const [repoCounts, setRepoCounts] = useState<Record<string, RepoCounts>>({})
  const [loadingRepoCounts, setLoadingRepoCounts] = useState<Set<string>>(new Set())
  const fetchedCountsRef = useRef<Set<string>>(new Set())

  const [repoPrTreeData, setRepoPrTreeData] = useState<Record<string, PullRequest[]>>({})
  const [repoCommitTreeData, setRepoCommitTreeData] = useState<Record<string, RepoCommit[]>>({})
  const [repoIssueTreeData, setRepoIssueTreeData] = useState<Record<string, RepoIssue[]>>({})
  const fetchedRepoPRsRef = useRef<Set<string>>(new Set())
  const fetchedRepoCommitsRef = useRef<Set<string>>(new Set())
  const fetchedRepoIssuesRef = useRef<Set<string>>(new Set())
  const [loadingRepoCommits, setLoadingRepoCommits] = useState<Set<string>>(new Set())
  const [loadingRepoPRs, setLoadingRepoPRs] = useState<Set<string>>(new Set())
  const [loadingRepoIssues, setLoadingRepoIssues] = useState<Set<string>>(new Set())

  const [sflStatusData, setSflStatusData] = useState<Record<string, SFLRepoStatus>>({})
  const [loadingSFLStatus, setLoadingSFLStatus] = useState<Set<string>>(new Set())
  const fetchedSFLRef = useRef<Set<string>>(new Set())

  const fetchRepoCountsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      await fetchCachedRepoData<RepoCounts>({
        key,
        cacheKey: `repo-counts:${key}`,
        loadingSetter: setLoadingRepoCounts,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `repo-counts-${key}`,
        logLabel: 'RepoCounts',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoCounts(org, repoName),
        onData: result => setRepoCounts(prev => ({ ...prev, [key]: result })),
        forceRefresh,
      })
    },
    [accounts, enqueueRef]
  )

  const fetchSFLStatusForRepo = useCallback(
    async (org: string, repoName: string, isRefresh = false) => {
      const key = `${org}/${repoName}`
      await fetchCachedRepoData<SFLRepoStatus>({
        key,
        cacheKey: `sfl-status:${key}`,
        loadingSetter: setLoadingSFLStatus,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `sfl-status-${key}`,
        logLabel: 'SFLStatus',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchSFLStatus(org, repoName),
        onData: result => setSflStatusData(prev => ({ ...prev, [key]: result })),
        forceRefresh: isRefresh,
      })
    },
    [accounts, enqueueRef]
  )

  const toggleRepo = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetchCounts = !fetchedCountsRef.current.has(key)
      const shouldFetchSFL = !fetchedSFLRef.current.has(key)
      repos.toggle(key)
      if (shouldFetchCounts) {
        fetchedCountsRef.current.add(key)
        fetchRepoCountsForRepo(org, repoName)
      }
      if (shouldFetchSFL) {
        fetchedSFLRef.current.add(key)
        fetchSFLStatusForRepo(org, repoName)
      }
    },
    [repos, fetchRepoCountsForRepo, fetchSFLStatusForRepo]
  )

  const fetchRepoPRsForRepo = useCallback(
    async (org: string, repoName: string, state: 'open' | 'closed', forceRefresh = false) => {
      const key = `${state}:${org}/${repoName}`
      await fetchCachedRepoData<RepoPullRequest[]>({
        key,
        cacheKey: `repo-prs:${key}`,
        loadingSetter: setLoadingRepoPRs,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `repo-pr-tree-${state}-${org}-${repoName}`,
        logLabel: 'RepoPRTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoPRs(org, repoName, state),
        onData: prs =>
          setRepoPrTreeData(prev => ({
            ...prev,
            [key]: prs.map(pr => mapRepoPRToPullRequest(pr, org)),
          })),
        afterFetch: result => {
          if (state !== 'open') return
          const countsCacheKey = `repo-counts:${org}/${repoName}`
          const existingCounts = dataCache.get<RepoCounts>(countsCacheKey)
          dataCache.set(countsCacheKey, {
            issues: existingCounts?.data?.issues ?? 0,
            prs: result.length,
          })
        },
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval, enqueueRef]
  )

  const toggleRepoPRStateGroup = useCallback(
    (org: string, repoName: string, state: 'open' | 'closed') => {
      const key = `${org}/${repoName}:${state}`
      const fetchKey = `${state}:${org}/${repoName}`
      const shouldFetch = !fetchedRepoPRsRef.current.has(fetchKey)
      repoPRStateGroups.toggle(key)
      if (shouldFetch) {
        fetchedRepoPRsRef.current.add(fetchKey)
        fetchRepoPRsForRepo(org, repoName, state)
      }
    },
    [repoPRStateGroups, fetchRepoPRsForRepo]
  )

  const fetchRepoIssuesForRepo = useCallback(
    async (org: string, repoName: string, state: 'open' | 'closed', forceRefresh = false) => {
      const key = `${state}:${org}/${repoName}`
      await fetchCachedRepoData<RepoIssue[]>({
        key,
        cacheKey: `repo-issues:${key}`,
        loadingSetter: setLoadingRepoIssues,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `repo-issues-tree-${state}-${org}-${repoName}`,
        logLabel: 'RepoIssueTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoIssues(org, repoName, state),
        onData: issues => setRepoIssueTreeData(prev => ({ ...prev, [key]: issues })),
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval, enqueueRef]
  )

  const toggleRepoIssueStateGroup = useCallback(
    (org: string, repoName: string, state: 'open' | 'closed') => {
      const key = `${org}/${repoName}:${state}`
      const fetchKey = `${state}:${org}/${repoName}`
      const shouldFetch = !fetchedRepoIssuesRef.current.has(fetchKey)
      repoIssueStateGroups.toggle(key)
      if (shouldFetch) {
        fetchedRepoIssuesRef.current.add(fetchKey)
        fetchRepoIssuesForRepo(org, repoName, state)
      }
    },
    [repoIssueStateGroups, fetchRepoIssuesForRepo]
  )

  const fetchRepoCommitsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      await fetchCachedRepoData<RepoCommit[]>({
        key,
        cacheKey: `repo-commits:${key}`,
        loadingSetter: setLoadingRepoCommits,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `repo-commit-tree-${org}-${repoName}`,
        logLabel: 'RepoCommitTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoCommits(org, repoName),
        onData: commits => setRepoCommitTreeData(prev => ({ ...prev, [key]: commits })),
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval, enqueueRef]
  )

  const toggleRepoCommitGroup = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedRepoCommitsRef.current.has(key)
      repoCommitGroups.toggle(key)
      if (shouldFetch) {
        fetchedRepoCommitsRef.current.add(key)
        fetchRepoCommitsForRepo(org, repoName)
      }
    },
    [repoCommitGroups, fetchRepoCommitsForRepo]
  )

  const toggleSFLGroup = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedSFLRef.current.has(key)
      sflGroups.toggle(key)
      if (shouldFetch) {
        fetchedSFLRef.current.add(key)
        fetchSFLStatusForRepo(org, repoName)
      }
    },
    [sflGroups, fetchSFLStatusForRepo]
  )

  const toggleRalphGroup = useCallback(
    (org: string, repoName: string) => {
      ralphGroups.toggle(`${org}/${repoName}`)
    },
    [ralphGroups]
  )

  const toggleBookmarkRepoByValues = useCallback(
    async (org: string, repoName: string, repoUrl: string) => {
      const key = `${org}/${repoName}`
      if (bookmarkedRepoKeys.has(key)) {
        await removeExistingBookmark(org, repoName, bookmarks, removeBookmark)
        return
      }
      const result = await createBookmark({
        folder: org,
        owner: org,
        repo: repoName,
        url: repoUrl,
        description: '',
      })
      if (result?.inserted) {
        incrementStat({ field: 'bookmarksCreated' }).catch(/* v8 ignore next */ () => {})
      }
    },
    [bookmarkedRepoKeys, bookmarks, createBookmark, removeBookmark, incrementStat]
  )

  const handleBookmarkToggle = async (
    e: React.MouseEvent,
    org: string,
    repoName: string,
    repoUrl: string
  ) => {
    e.stopPropagation()
    try {
      await toggleBookmarkRepoByValues(org, repoName, repoUrl)
    } catch (err: unknown) {
      console.error(`[Bookmark] toggle failed for ${org}/${repoName}:`, err)
    }
  }

  /** Apply incoming cache updates for repo-level data. Returns true if handled. */
  const handleRepoCacheUpdate = useCallback((key: string): boolean => {
    if (key.startsWith('repo-prs:')) {
      return handleRepoPrCacheUpdate(key, setRepoPrTreeData)
    }

    return handleSimplePrefixCacheUpdate(key, {
      'repo-counts:': repoKey => {
        const updated = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
        /* v8 ignore start */
        if (updated?.data) {
          /* v8 ignore stop */
          setRepoCounts(prev => ({ ...prev, [repoKey]: updated.data }))
        }
      },
      'repo-commits:': repoKey => {
        const updated = dataCache.get<RepoCommit[]>(`repo-commits:${repoKey}`)
        /* v8 ignore start */
        if (updated?.data) {
          /* v8 ignore stop */
          setRepoCommitTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
      },
      'repo-issues:': repoKey => {
        const updated = dataCache.get<RepoIssue[]>(`repo-issues:${repoKey}`)
        /* v8 ignore start */
        if (updated?.data) {
          /* v8 ignore stop */
          setRepoIssueTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
      },
      'sfl-status:': repoKey => {
        const updated = dataCache.get<SFLRepoStatus>(`sfl-status:${repoKey}`)
        /* v8 ignore start */
        if (updated?.data) {
          /* v8 ignore stop */
          setSflStatusData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
      },
    })
  }, [])

  return {
    // State
    repoCounts,
    loadingRepoCounts,
    repoPrTreeData,
    repoCommitTreeData,
    repoIssueTreeData,
    loadingRepoCommits,
    loadingRepoPRs,
    loadingRepoIssues,
    sflStatusData,
    loadingSFLStatus,
    // Toggle sets
    expandedRepos: repos.set,
    expandedRepoIssueGroups: repoIssueGroups.set,
    expandedRepoIssueStateGroups: repoIssueStateGroups.set,
    expandedRepoPRGroups: repoPRGroups.set,
    expandedRepoPRStateGroups: repoPRStateGroups.set,
    expandedRepoCommitGroups: repoCommitGroups.set,
    expandedSFLGroups: sflGroups.set,
    expandedRalphGroups: ralphGroups.set,
    // Actions
    toggleRepo,
    toggleRepoIssueGroup: (org: string, repo: string) => repoIssueGroups.toggle(`${org}/${repo}`),
    toggleRepoIssueStateGroup,
    toggleRepoPRGroup: (org: string, repo: string) => repoPRGroups.toggle(`${org}/${repo}`),
    toggleRepoPRStateGroup,
    toggleRepoCommitGroup,
    toggleSFLGroup,
    toggleRalphGroup,
    handleBookmarkToggle,
    toggleBookmarkRepoByValues,
    // Internal refs for refresh logic
    fetchedCountsRef,
    fetchedRepoPRsRef,
    fetchedRepoCommitsRef,
    fetchedRepoIssuesRef,
    fetchedSFLRef,
    // Fetch functions for refresh
    fetchRepoCountsForRepo,
    fetchRepoPRsForRepo,
    fetchRepoCommitsForRepo,
    fetchRepoIssuesForRepo,
    fetchSFLStatusForRepo,
    // Cache handler
    handleRepoCacheUpdate,
  }
}
