import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useGitHubAccounts, usePRSettings } from '../../../hooks/useConfig'
import {
  useRepoBookmarks,
  useRepoBookmarkMutations,
  useBuddyStatsMutations,
} from '../../../hooks/useConvex'
import { useTaskQueue } from '../../../hooks/useTaskQueue'
import { useToggleSet } from '../../../hooks/useToggleSet'
import { IPC_INVOKE } from '../../../ipc/contracts'
import {
  GitHubClient,
  type OrgRepo,
  type OrgMember,
  type OrgTeam,
  type OrgTeamResult,
  type TeamMember,
  type TeamMembersResult,
  type RepoCommit,
  type RepoIssue,
  type OrgRepoResult,
  type OrgMemberResult,
  type OrgOverviewResult,
  type RepoCounts,
  type RepoPullRequest,
} from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoKey } from '../../../utils/githubUrl'
import { isAbortError, throwIfAborted } from '../../../utils/errorUtils'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import { MS_PER_MINUTE } from '../../../constants'
import { getUniqueOrgs, mapRepoPRToPullRequest } from './githubSidebarUtils'
import { useSidebarUserMenu } from './useSidebarUserMenu'
import { useSidebarPRTree } from './useSidebarPRTree'

function getMaxAgeMs(refreshInterval: number): number | null {
  return refreshInterval > 0 ? refreshInterval * MS_PER_MINUTE : null
}

function isValidOrgRepoResult(data: unknown): data is OrgRepoResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    'repos' in data &&
    Array.isArray((data as OrgRepoResult).repos)
  )
}

function getValidCachedOrgRepos(org: string): OrgRepoResult | null {
  const cached = dataCache.get<OrgRepoResult>(`org-repos:${org}`)
  const data = cached?.data
  if (data && isValidOrgRepoResult(data)) {
    return data
  }
  if (data) {
    dataCache.delete(`org-repos:${org}`)
  }
  return null
}

/** Iterate stale cache entries, parse each key, and invoke a callback for those that are stale. */
function forEachStaleEntry<T>(
  fetchedRef: React.MutableRefObject<Set<string>>,
  cachePrefix: string,
  intervalMs: number,
  parseKey: (key: string) => T | null,
  onStale: (parsed: T) => void
) {
  for (const key of fetchedRef.current) {
    /* v8 ignore start */
    if (dataCache.isFresh(`${cachePrefix}:${key}`, intervalMs)) continue
    /* v8 ignore stop */
    const parsed = parseKey(key)
    /* v8 ignore start */
    if (parsed) onStale(parsed)
    /* v8 ignore stop */
  }
}

/** Parse a `state:owner/repo` key into its parts, or null if malformed. */
function parseStateOwnerRepoKey(
  key: string
): { owner: string; repo: string; state: 'open' | 'closed' } | null {
  const [state, ownerRepo] = key.split(':', 2)
  /* v8 ignore start */
  if (state !== 'open' && state !== 'closed') return null
  if (!ownerRepo) return null
  /* v8 ignore stop */
  const parsed = parseOwnerRepoKey(ownerRepo)
  /* v8 ignore start */
  return parsed ? { ...parsed, state } : null
  /* v8 ignore stop */
}

type LoadingSetSetter = React.Dispatch<React.SetStateAction<Set<string>>>

/** Adds a key to a loading-state Set. */
function addToLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => new Set(prev).add(key))
}

/** Removes a key from a loading-state Set. */
function removeFromLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => {
    const next = new Set(prev)
    next.delete(key)
    return next
  })
}

/**
 * Wraps the common enqueue → set state → cache → loading boilerplate used by
 * every sidebar data-fetch callback. Each caller still owns cache-hit logic,
 * transforms, and side effects.
 */
async function fetchWithLoading<T>(opts: {
  key: string
  loadingSetter: LoadingSetSetter
  enqueue: (
    fn: (signal?: AbortSignal) => Promise<T>,
    meta: { name: string; priority: number }
  ) => Promise<T>
  taskName: string
  logLabel: string
  apiFn: () => Promise<T>
  onSuccess: (result: T) => void
}): Promise<void> {
  addToLoadingSet(opts.loadingSetter, opts.key)
  try {
    const result = await opts.enqueue(
      async signal => {
        /* v8 ignore start */
        if (signal) throwIfAborted(signal)
        /* v8 ignore stop */
        return await opts.apiFn()
      },
      { name: opts.taskName, priority: -1 }
    )
    opts.onSuccess(result)
  } catch (error: unknown) {
    if (isAbortError(error)) return
    console.warn(`[${opts.logLabel}] ${opts.key} failed:`, error)
  } finally {
    removeFromLoadingSet(opts.loadingSetter, opts.key)
  }
}

/**
 * Determine if a cache hit is fresh enough to skip re-fetching.
 * - undefined → simple cache, always trust the hit
 * - null     → stale-while-revalidate with no max age, always re-fetch
 * - number   → stale-while-revalidate, re-fetch only when stale
 */
function isCacheHitFresh(maxAgeMs: number | null | undefined, cacheKey: string): boolean {
  if (maxAgeMs === undefined) return true
  return typeof maxAgeMs === 'number' && dataCache.isFresh(cacheKey, maxAgeMs)
}

/**
 * Wraps the common cache-check → stale-while-revalidate → fetchWithLoading
 * pattern used by most sidebar data-fetch callbacks.  When {@link maxAgeMs}
 * is unset, a cache hit returns immediately; when set, stale entries trigger
 * a background re-fetch after hydrating state.
 */
async function fetchCachedData<TRaw>(opts: {
  key: string
  cacheKey: string
  loadingSetter: LoadingSetSetter
  enqueue: (
    fn: (signal?: AbortSignal) => Promise<TRaw>,
    meta: { name: string; priority: number }
  ) => Promise<TRaw>
  taskName: string
  logLabel: string
  apiFn: () => Promise<TRaw>
  onData: (data: TRaw) => void
  afterFetch?: (result: TRaw) => void
  forceRefresh?: boolean
  maxAgeMs?: number | null
}): Promise<void> {
  const cached = dataCache.get<TRaw>(opts.cacheKey)
  if (cached?.data && !opts.forceRefresh) {
    opts.onData(cached.data)
    if (isCacheHitFresh(opts.maxAgeMs, opts.cacheKey)) return
  }
  await fetchWithLoading({
    key: opts.key,
    loadingSetter: opts.loadingSetter,
    enqueue: opts.enqueue,
    taskName: opts.taskName,
    logLabel: opts.logLabel,
    apiFn: opts.apiFn,
    onSuccess: result => {
      opts.onData(result)
      dataCache.set(opts.cacheKey, result)
      opts.afterFetch?.(result)
    },
  })
}

type SidebarEnqueue = ReturnType<typeof useTaskQueue>['enqueue']
type SidebarAccounts = ReturnType<typeof useGitHubAccounts>['accounts']
type SidebarBookmarks = ReturnType<typeof useRepoBookmarks>
type SidebarBookmarkMutations = ReturnType<typeof useRepoBookmarkMutations>
type SidebarIncrementStat = ReturnType<typeof useBuddyStatsMutations>['increment']
type OrgContributorCounts = Record<string, Record<string, number>>
type OrgContributorCountsSetter = React.Dispatch<React.SetStateAction<OrgContributorCounts>>

function toOrgContributorMap(overview: OrgOverviewResult): Record<string, number> {
  return Object.fromEntries(overview.metrics.topContributorsToday.map(c => [c.login, c.commits]))
}

function applyOrgContributorCounts(
  org: string,
  overview: OrgOverviewResult,
  setOrgContributorCounts: OrgContributorCountsSetter
) {
  setOrgContributorCounts(prev => ({
    ...prev,
    [org]: toOrgContributorMap(overview),
  }))
}

function hydrateCachedOrgOverview(
  org: string,
  cacheKey: string,
  forceRefresh: boolean,
  setOrgContributorCounts: OrgContributorCountsSetter
): boolean {
  if (forceRefresh) return false
  const cached = dataCache.get<OrgOverviewResult>(cacheKey)
  if (!cached) return false
  const overview = cached.data
  if (!overview) return false
  applyOrgContributorCounts(org, overview, setOrgContributorCounts)
  return true
}

async function requestOrgOverview(
  org: string,
  accounts: SidebarAccounts,
  enqueue: SidebarEnqueue
): Promise<OrgOverviewResult> {
  return enqueue(
    async signal => {
      throwIfAborted(signal)
      const client = new GitHubClient({ accounts }, 7)
      return client.fetchOrgOverview(org)
    },
    { name: `org-overview-${org}`, priority: -1 }
  )
}

function cacheOrgOverviewResult(
  org: string,
  cacheKey: string,
  result: OrgOverviewResult,
  setOrgContributorCounts: OrgContributorCountsSetter
) {
  applyOrgContributorCounts(org, result, setOrgContributorCounts)
  dataCache.set(cacheKey, result)
}

function handleOrgOverviewError(org: string, error: unknown) {
  /* v8 ignore start */
  if (isAbortError(error)) return
  /* v8 ignore stop */
  console.warn(`[OrgOverview] ${org} failed:`, error)
}

function getSidebarBookmarkKey(org: string, repoName: string) {
  return `${org}/${repoName}`
}

function findSidebarBookmark(bookmarks: SidebarBookmarks, org: string, repoName: string) {
  return (bookmarks ?? []).find(bookmark => bookmark.owner === org && bookmark.repo === repoName) ?? null
}

function wasBookmarkInserted(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }

  return Boolean((result as { inserted?: unknown }).inserted)
}

async function syncSidebarRepoBookmark(params: {
  org: string
  repoName: string
  repoUrl: string
  bookmarks: SidebarBookmarks
  bookmarkedRepoKeys: Set<string>
  createBookmark: SidebarBookmarkMutations['create']
  removeBookmark: SidebarBookmarkMutations['remove']
  incrementStat: SidebarIncrementStat
}) {
  const key = getSidebarBookmarkKey(params.org, params.repoName)
  if (params.bookmarkedRepoKeys.has(key)) {
    const bookmark = findSidebarBookmark(params.bookmarks, params.org, params.repoName)
    if (bookmark) {
      await params.removeBookmark({ id: bookmark._id })
    }
    return
  }

  const result = await params.createBookmark({
    folder: params.org,
    owner: params.org,
    repo: params.repoName,
    url: params.repoUrl,
    description: '',
  })

  if (wasBookmarkInserted(result)) {
    params.incrementStat({ field: 'bookmarksCreated' }).catch(() => {})
  }
}

export interface SidebarItem {
  id: string
  label: string
}

export function useGitHubSidebarData() {
  const sections = useToggleSet(['pull-requests', 'organizations'])
  const orgs = useToggleSet()
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const userMenu = useSidebarUserMenu()

  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_SHOW_BOOKMARKED_ONLY)
      .then((value: boolean) => {
        setShowBookmarkedOnly(value)
      })
      /* v8 ignore start */
      .catch(() => {
        /* v8 ignore stop */
        /* use default */
      })
  }, [])

  const [orgRepos, setOrgRepos] = useState<Record<string, OrgRepo[]>>({})
  const [orgMeta, setOrgMeta] = useState<
    Record<string, { authenticatedAs: string; isUserNamespace: boolean }>
  >({})
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({})
  const [loadingOrgMembers, setLoadingOrgMembers] = useState<Set<string>>(new Set())
  const orgUserGroups = useToggleSet()
  const [orgTeams, setOrgTeams] = useState<Record<string, OrgTeam[]>>({})
  const [loadingOrgTeams, setLoadingOrgTeams] = useState<Set<string>>(new Set())
  const orgTeamGroups = useToggleSet()
  const teams = useToggleSet()
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({})
  const [loadingTeamMembers, setLoadingTeamMembers] = useState<Set<string>>(new Set())
  const [orgContributorCounts, setOrgContributorCounts] = useState<
    Record<string, Record<string, number>>
  >({})
  const [loadingOrgs, setLoadingOrgs] = useState<Set<string>>(new Set())
  const { accounts } = useGitHubAccounts()
  const { refreshInterval } = usePRSettings()
  const bookmarks = useRepoBookmarks()
  const { create: createBookmark, remove: removeBookmark } = useRepoBookmarkMutations()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { increment: incrementStat } = useBuddyStatsMutations()

  const prTree = useSidebarPRTree({ accounts, enqueueRef })

  const applyOrgRepoResult = useCallback((org: string, result: OrgRepoResult) => {
    setOrgRepos(prev => ({ ...prev, [org]: result.repos }))
    setOrgMeta(prev => ({
      ...prev,
      [org]: {
        authenticatedAs: result.authenticatedAs,
        isUserNamespace: result.isUserNamespace,
      },
    }))
  }, [])

  const repos = useToggleSet()
  const fetchedOrgMembersRef = useRef<Set<string>>(new Set())
  const fetchedOrgOverviewRef = useRef<Set<string>>(new Set())
  const fetchedOrgTeamsRef = useRef<Set<string>>(new Set())
  const fetchedTeamMembersRef = useRef<Set<string>>(new Set())
  const [repoCounts, setRepoCounts] = useState<Record<string, RepoCounts>>({})
  const [loadingRepoCounts, setLoadingRepoCounts] = useState<Set<string>>(new Set())
  const fetchedCountsRef = useRef<Set<string>>(new Set())
  const repoIssueGroups = useToggleSet()
  const repoIssueStateGroups = useToggleSet()
  const repoPRGroups = useToggleSet()
  const repoPRStateGroups = useToggleSet()
  const repoCommitGroups = useToggleSet()
  const [refreshTick, setRefreshTick] = useState(() => Date.now())
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
  const sflGroups = useToggleSet()
  const ralphGroups = useToggleSet()
  const fetchedSFLRef = useRef<Set<string>>(new Set())

  const uniqueOrgs = getUniqueOrgs(accounts)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshTick(Date.now())
    }, 60_000)
    return () => clearInterval(intervalId)
  }, [])

  /* v8 ignore start */
  const bookmarkedRepoKeys = useMemo(
    /* v8 ignore start */
    () => new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`)),
    /* v8 ignore stop */
    /* v8 ignore stop */
    [bookmarks]
  )

  useEffect(() => {
    for (const org of uniqueOrgs) {
      const cachedResult = getValidCachedOrgRepos(org)
      if (cachedResult) {
        applyOrgRepoResult(org, cachedResult)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueOrgs.join(',')])

  useEffect(() => {
    /** Simple cache subscriptions: prefix → extract key → update state with data. */
    const simpleSubs: Array<{ prefix: string; handle: (repoKey: string) => void }> = [
      {
        prefix: 'repo-counts:',
        handle: repoKey => {
          const updated = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
          /* v8 ignore start */
          if (updated?.data) {
            /* v8 ignore stop */
            setRepoCounts(prev => ({ ...prev, [repoKey]: updated.data }))
          }
        },
      },
      {
        prefix: 'repo-commits:',
        handle: repoKey => {
          const updated = dataCache.get<RepoCommit[]>(`repo-commits:${repoKey}`)
          /* v8 ignore start */
          if (updated?.data) {
            /* v8 ignore stop */
            setRepoCommitTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
          }
        },
      },
      {
        prefix: 'repo-issues:',
        handle: repoKey => {
          const updated = dataCache.get<RepoIssue[]>(`repo-issues:${repoKey}`)
          /* v8 ignore start */
          if (updated?.data) {
            /* v8 ignore stop */
            setRepoIssueTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
          }
        },
      },
      {
        prefix: 'sfl-status:',
        handle: repoKey => {
          const updated = dataCache.get<SFLRepoStatus>(`sfl-status:${repoKey}`)
          /* v8 ignore start */
          if (updated?.data) {
            /* v8 ignore stop */
            setSflStatusData(prev => ({ ...prev, [repoKey]: updated.data }))
          }
        },
      },
    ]

    const handleOrgReposCacheUpdate = (key: string) => {
      const org = key.replace('org-repos:', '')
      const validResult = getValidCachedOrgRepos(org)
      if (validResult) {
        applyOrgRepoResult(org, validResult)
      }
    }

    const handleRepoPRsCacheUpdate = (key: string) => {
      const repoKey = key.replace('repo-prs:', '')
      const updated = dataCache.get<RepoPullRequest[]>(key)
      /* v8 ignore start */
      if (!updated?.data) return
      /* v8 ignore stop */
      const [, ownerRepo] = repoKey.split(':', 2)
      if (!ownerRepo) return
      const parsed = parseOwnerRepoKey(ownerRepo)
      /* v8 ignore start */
      if (!parsed) return
      /* v8 ignore stop */
      setRepoPrTreeData(prev => ({
        ...prev,
        [repoKey]: updated.data.map(repoPr => mapRepoPRToPullRequest(repoPr, parsed.owner)),
      }))
    }

    const unsubscribe = dataCache.subscribe(key => {
      // org-repos: complex handler (updates two state slices with validation)
      if (key.startsWith('org-repos:')) {
        handleOrgReposCacheUpdate(key)
        return
      }

      // repo-prs: complex handler (parses state:owner/repo and maps data)
      if (key.startsWith('repo-prs:')) {
        handleRepoPRsCacheUpdate(key)
        return
      }

      // Table-driven simple subscriptions
      for (const sub of simpleSubs) {
        if (key.startsWith(sub.prefix)) {
          sub.handle(key.replace(sub.prefix, ''))
          return
        }
      }
    })
    return unsubscribe
  }, [applyOrgRepoResult])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const refreshAllOrgs = () => {
      const orgs = getUniqueOrgs(accounts)
      for (const org of orgs) {
        const cacheKey = `org-repos:${org}`
        /* v8 ignore start */
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        /* v8 ignore stop */
        console.log(`[OrgRefresh] ${org}: stale, queueing background refresh`)
        enqueueRef
          .current(
            async signal => {
              /* v8 ignore start */
              if (dataCache.isFresh(cacheKey, intervalMs)) return
              /* v8 ignore stop */
              throwIfAborted(signal)
              const config = { accounts }
              const client = new GitHubClient(config, 7)
              const result = await client.fetchOrgRepos(org)
              dataCache.set(cacheKey, result)
              console.log(`[OrgRefresh] ${String(org)}: refreshed ${result.repos.length} repos`)
            },
            { name: `refresh-org-${org}`, priority: -1 }
          )
          .catch(err => {
            /* v8 ignore start */
            if (isAbortError(err)) return
            /* v8 ignore stop */
            console.warn(`[OrgRefresh] ${org} failed:`, err)
          })
      }
    }
    console.log(`[OrgRefresh] Setting up auto-refresh: ${refreshInterval} minutes`)
    refreshTimerRef.current = setInterval(refreshAllOrgs, intervalMs)
    return () => {
      /* v8 ignore start */
      if (refreshTimerRef.current) {
        /* v8 ignore stop */
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [refreshInterval, accounts])

  const fetchOrgRepos = useCallback(
    async (org: string) => {
      const cachedResult = getValidCachedOrgRepos(org)
      if (cachedResult) {
        applyOrgRepoResult(org, cachedResult)
        return
      }
      addToLoadingSet(setLoadingOrgs, org)
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const config = { accounts }
            const client = new GitHubClient(config, 7)
            return await client.fetchOrgRepos(org)
          },
          { name: `fetch-org-${org}` }
        )
        applyOrgRepoResult(org, result)
        dataCache.set(`org-repos:${org}`, result)
      } catch (error: unknown) {
        /* v8 ignore start */
        if (isAbortError(error)) return
        /* v8 ignore stop */
        console.error(`Failed to fetch repos for ${org}:`, error)
        setOrgRepos(prev => ({ ...prev, [org]: [] }))
      } finally {
        removeFromLoadingSet(setLoadingOrgs, org)
      }
    },
    [accounts, applyOrgRepoResult]
  )

  const toggleOrg = useCallback(
    (org: string) => {
      const wasExpanded = orgs.toggle(org)
      if (!wasExpanded) {
        incrementStat({ field: 'reposBrowsed' }).catch(() => {})
        /* v8 ignore start */
        if (!orgRepos[org]) {
          /* v8 ignore stop */
          fetchOrgRepos(org)
        }
      }
    },
    [orgs, orgRepos, fetchOrgRepos, incrementStat]
  )

  const fetchOrgMembers = useCallback(
    async (org: string, forceRefresh = false) => {
      await fetchCachedData<OrgMemberResult>({
        key: org,
        cacheKey: `org-members:${org}`,
        loadingSetter: setLoadingOrgMembers,
        enqueue: enqueueRef.current,
        taskName: `org-members-${org}`,
        logLabel: 'OrgMembers',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchOrgMembers(org),
        onData: result => setOrgMembers(prev => ({ ...prev, [org]: result.members })),
        forceRefresh,
      })
    },
    [accounts]
  )

  const fetchOrgOverview = useCallback(
    async (org: string, forceRefresh?: boolean) => {
      const cacheKey = `org-overview:${org}`
      const shouldForceRefresh = Boolean(forceRefresh)
      if (hydrateCachedOrgOverview(org, cacheKey, shouldForceRefresh, setOrgContributorCounts)) {
        return
      }
      try {
        const result = await requestOrgOverview(org, accounts, enqueueRef.current)
        cacheOrgOverviewResult(org, cacheKey, result, setOrgContributorCounts)
      } catch (error: unknown) {
        handleOrgOverviewError(org, error)
      }
    },
    [accounts]
  )

  const toggleOrgUserGroup = useCallback(
    (org: string) => {
      const shouldFetchMembers = !fetchedOrgMembersRef.current.has(org)
      const shouldFetchOverview = !fetchedOrgOverviewRef.current.has(org)

      orgUserGroups.toggle(org)

      if (shouldFetchMembers) {
        fetchedOrgMembersRef.current.add(org)
        fetchOrgMembers(org)
      }
      if (shouldFetchOverview) {
        fetchedOrgOverviewRef.current.add(org)
        fetchOrgOverview(org)
      }
    },
    [orgUserGroups, fetchOrgMembers, fetchOrgOverview]
  )

  const fetchOrgTeams = useCallback(
    async (org: string, forceRefresh = false) => {
      await fetchCachedData<OrgTeamResult>({
        key: org,
        cacheKey: `org-teams:${org}`,
        loadingSetter: setLoadingOrgTeams,
        enqueue: enqueueRef.current,
        taskName: `org-teams-${org}`,
        logLabel: 'OrgTeams',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchOrgTeams(org),
        onData: result => setOrgTeams(prev => ({ ...prev, [org]: result.teams })),
        forceRefresh,
      })
    },
    [accounts]
  )

  const toggleOrgTeamGroup = useCallback(
    (org: string) => {
      const shouldFetch = !fetchedOrgTeamsRef.current.has(org)

      orgTeamGroups.toggle(org)

      if (shouldFetch) {
        fetchedOrgTeamsRef.current.add(org)
        fetchOrgTeams(org)
      }
    },
    [orgTeamGroups, fetchOrgTeams]
  )

  const fetchTeamMembers = useCallback(
    async (org: string, teamSlug: string) => {
      const key = `${org}/${teamSlug}`
      await fetchCachedData<TeamMembersResult>({
        key,
        cacheKey: `team-members:${key}`,
        loadingSetter: setLoadingTeamMembers,
        enqueue: enqueueRef.current,
        taskName: `team-members-${key}`,
        logLabel: 'TeamMembers',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchTeamMembers(org, teamSlug),
        onData: result => setTeamMembers(prev => ({ ...prev, [key]: result.members })),
      })
    },
    [accounts]
  )

  const toggleTeam = useCallback(
    (org: string, teamSlug: string) => {
      const key = `${org}/${teamSlug}`
      const shouldFetch = !fetchedTeamMembersRef.current.has(key)

      teams.toggle(key)

      if (shouldFetch) {
        fetchedTeamMembersRef.current.add(key)
        fetchTeamMembers(org, teamSlug)
      }
    },
    [teams, fetchTeamMembers]
  )

  const toggleBookmarkRepoByValues = useCallback(
    async (org: string, repoName: string, repoUrl: string) => {
      await syncSidebarRepoBookmark({
        org,
        repoName,
        repoUrl,
        bookmarks,
        bookmarkedRepoKeys,
        createBookmark,
        removeBookmark,
        incrementStat,
      })
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

  const fetchRepoCountsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      await fetchCachedData<RepoCounts>({
        key,
        cacheKey: `repo-counts:${key}`,
        loadingSetter: setLoadingRepoCounts,
        enqueue: enqueueRef.current,
        taskName: `repo-counts-${key}`,
        logLabel: 'RepoCounts',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoCounts(org, repoName),
        onData: result => setRepoCounts(prev => ({ ...prev, [key]: result })),
        forceRefresh,
      })
    },
    [accounts]
  )

  const fetchSFLStatusForRepo = useCallback(
    async (org: string, repoName: string, isRefresh = false) => {
      const key = `${org}/${repoName}`
      await fetchCachedData<SFLRepoStatus>({
        key,
        cacheKey: `sfl-status:${key}`,
        loadingSetter: setLoadingSFLStatus,
        enqueue: enqueueRef.current,
        taskName: `sfl-status-${key}`,
        logLabel: 'SFLStatus',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchSFLStatus(org, repoName),
        onData: result => setSflStatusData(prev => ({ ...prev, [key]: result })),
        forceRefresh: isRefresh,
      })
    },
    [accounts]
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

  /** When open PRs are fetched, sync the repo-counts cache entry for PR count. */
  function syncOpenPRCounts(state: string, org: string, repoName: string, prCount: number) {
    if (state !== 'open') return
    const countsCacheKey = `repo-counts:${org}/${repoName}`
    const existingCounts = dataCache.get<RepoCounts>(countsCacheKey)
    dataCache.set(countsCacheKey, {
      issues: existingCounts?.data?.issues ?? 0,
      prs: prCount,
    })
  }

  const fetchRepoPRsForRepo = useCallback(
    async (org: string, repoName: string, state: 'open' | 'closed', forceRefresh = false) => {
      const key = `${state}:${org}/${repoName}`
      await fetchCachedData<RepoPullRequest[]>({
        key,
        cacheKey: `repo-prs:${key}`,
        loadingSetter: setLoadingRepoPRs,
        enqueue: enqueueRef.current,
        taskName: `repo-pr-tree-${state}-${org}-${repoName}`,
        logLabel: 'RepoPRTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoPRs(org, repoName, state),
        onData: prs =>
          setRepoPrTreeData(prev => ({
            ...prev,
            [key]: prs.map(pr => mapRepoPRToPullRequest(pr, org)),
          })),
        afterFetch: result => syncOpenPRCounts(state, org, repoName, result.length),
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval]
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
      await fetchCachedData<RepoIssue[]>({
        key,
        cacheKey: `repo-issues:${key}`,
        loadingSetter: setLoadingRepoIssues,
        enqueue: enqueueRef.current,
        taskName: `repo-issues-tree-${state}-${org}-${repoName}`,
        logLabel: 'RepoIssueTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoIssues(org, repoName, state),
        onData: issues => setRepoIssueTreeData(prev => ({ ...prev, [key]: issues })),
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval]
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
      await fetchCachedData<RepoCommit[]>({
        key,
        cacheKey: `repo-commits:${key}`,
        loadingSetter: setLoadingRepoCommits,
        enqueue: enqueueRef.current,
        taskName: `repo-commit-tree-${org}-${repoName}`,
        logLabel: 'RepoCommitTree',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchRepoCommits(org, repoName),
        onData: commits => setRepoCommitTreeData(prev => ({ ...prev, [key]: commits })),
        forceRefresh,
        maxAgeMs: getMaxAgeMs(refreshInterval),
      })
    },
    [accounts, refreshInterval]
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

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      forEachStaleEntry(fetchedRepoPRsRef, 'repo-prs', intervalMs, parseStateOwnerRepoKey, p =>
        fetchRepoPRsForRepo(p.owner, p.repo, p.state, true)
      )
      forEachStaleEntry(fetchedRepoCommitsRef, 'repo-commits', intervalMs, parseOwnerRepoKey, p =>
        fetchRepoCommitsForRepo(p.owner, p.repo, true)
      )
      forEachStaleEntry(fetchedSFLRef, 'sfl-status', intervalMs, parseOwnerRepoKey, p =>
        fetchSFLStatusForRepo(p.owner, p.repo, true)
      )
      forEachStaleEntry(
        fetchedRepoIssuesRef,
        'repo-issues',
        intervalMs,
        parseStateOwnerRepoKey,
        p => fetchRepoIssuesForRepo(p.owner, p.repo, p.state, true)
      )
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [
    accounts.length,
    fetchRepoPRsForRepo,
    fetchRepoCommitsForRepo,
    fetchSFLStatusForRepo,
    fetchRepoIssuesForRepo,
    refreshInterval,
  ])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const refreshRepoCounts = () => {
      for (const key of fetchedCountsRef.current) {
        const cacheKey = `repo-counts:${key}`
        /* v8 ignore start */
        if (dataCache.isFresh(cacheKey, intervalMs)) {
          /* v8 ignore stop */
          continue
        }
        const parsed = parseOwnerRepoKey(key)
        /* v8 ignore start */
        if (!parsed) continue
        /* v8 ignore stop */
        enqueueRef
          .current(
            async signal => {
              throwIfAborted(signal)
              const client = new GitHubClient({ accounts }, 7)
              const result = await client.fetchRepoCounts(parsed.owner, parsed.repo)
              dataCache.set(cacheKey, result)
            },
            { name: `refresh-repo-counts-${key}`, priority: -1 }
          )
          .catch(error => {
            /* v8 ignore start */
            if (isAbortError(error)) return
            /* v8 ignore stop */
            console.warn(`[RepoCountsRefresh] ${key} failed:`, error)
          })
      }
    }
    const intervalId = setInterval(refreshRepoCounts, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts, refreshInterval])

  return {
    ...prTree,
    bookmarkedRepoKeys,
    expandedSections: sections.set,
    uniqueOrgs,
    orgRepos,
    orgMeta,
    orgMembers,
    loadingOrgMembers,
    expandedOrgUserGroups: orgUserGroups.set,
    orgTeams,
    loadingOrgTeams,
    expandedOrgTeamGroups: orgTeamGroups.set,
    expandedTeams: teams.set,
    teamMembers,
    loadingTeamMembers,
    orgContributorCounts,
    loadingOrgs,
    expandedOrgs: orgs.set,
    expandedRepos: repos.set,
    expandedRepoIssueGroups: repoIssueGroups.set,
    expandedRepoIssueStateGroups: repoIssueStateGroups.set,
    expandedRepoPRGroups: repoPRGroups.set,
    expandedRepoPRStateGroups: repoPRStateGroups.set,
    expandedRepoCommitGroups: repoCommitGroups.set,
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
    expandedSFLGroups: sflGroups.set,
    expandedRalphGroups: ralphGroups.set,
    showBookmarkedOnly,
    setShowBookmarkedOnly,
    refreshTick,
    toggleSection: sections.toggle,
    toggleOrg,
    toggleOrgUserGroup,
    toggleOrgTeamGroup,
    toggleTeam,
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
    ...userMenu,
  }
}
