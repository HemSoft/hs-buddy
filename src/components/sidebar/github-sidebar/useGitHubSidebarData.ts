import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'
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
  type OrgRepoResult,
  type OrgOverviewResult,
} from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoKey } from '../../../utils/githubUrl'
import { isAbortError, throwIfAborted } from '../../../utils/errorUtils'
import { MS_PER_MINUTE } from '../../../constants'
import { getUniqueOrgs } from './githubSidebarUtils'
import { useSidebarUserMenu } from './useSidebarUserMenu'
import { useSidebarPRTree } from './useSidebarPRTree'
import { useSidebarRepoActions } from './useSidebarRepoActions'
import { useSidebarOrgActions } from './useSidebarOrgActions'

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

export function getCachedOrgOverview(org: string, forceRefresh: boolean): OrgOverviewResult | null {
  if (forceRefresh) return null
  const cached = dataCache.get<OrgOverviewResult>(`org-overview:${org}`)
  return cached?.data ?? null
}

type RepoBookmarkRecord = {
  _id: Id<'repoBookmarks'>
  owner?: string | null
  repo?: string | null
}

export function findRepoBookmark(
  bookmarks: RepoBookmarkRecord[] | null | undefined,
  org: string,
  repoName: string
): RepoBookmarkRecord | null {
  return (
    (bookmarks ?? []).find(bookmark => bookmark.owner === org && bookmark.repo === repoName) ?? null
  )
}

export async function removeRepoBookmarkByValues(
  bookmarks: RepoBookmarkRecord[] | null | undefined,
  org: string,
  repoName: string,
  removeBookmark: ReturnType<typeof useRepoBookmarkMutations>['remove']
): Promise<void> {
  const bookmark = findRepoBookmark(bookmarks, org, repoName)
  if (!bookmark) return
  await removeBookmark({ id: bookmark._id })
}

export function recordBookmarkInsert(
  result: { inserted?: boolean } | null | undefined,
  incrementStat: ReturnType<typeof useBuddyStatsMutations>['increment']
): void {
  if (result?.inserted) {
    incrementStat({ field: 'bookmarksCreated' }).catch(/* v8 ignore next */ () => {})
  }
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

  const [refreshTick, setRefreshTick] = useState(() => Date.now())

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

  const repoActions = useSidebarRepoActions({
    accounts,
    enqueueRef,
    refreshInterval,
    bookmarkedRepoKeys,
    bookmarks,
    createBookmark,
    removeBookmark,
    incrementStat,
  })

  const orgActions = useSidebarOrgActions({ accounts, enqueueRef })

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

  const uniqueOrgs = getUniqueOrgs(accounts)

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
    const handleOrgReposCacheUpdate = (key: string) => {
      const org = key.replace('org-repos:', '')
      const validResult = getValidCachedOrgRepos(org)
      if (validResult) {
        applyOrgRepoResult(org, validResult)
      }
    }

    const unsubscribe = dataCache.subscribe(key => {
      if (key.startsWith('org-repos:')) {
        handleOrgReposCacheUpdate(key)
        return
      }
      repoActions.handleRepoCacheUpdate(key)
    })
    return unsubscribe
  }, [applyOrgRepoResult, repoActions])

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

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      forEachStaleEntry(
        repoActions.fetchedRepoPRsRef,
        'repo-prs',
        intervalMs,
        parseStateOwnerRepoKey,
        p => repoActions.fetchRepoPRsForRepo(p.owner, p.repo, p.state, true)
      )
      forEachStaleEntry(
        repoActions.fetchedRepoCommitsRef,
        'repo-commits',
        intervalMs,
        parseOwnerRepoKey,
        p => repoActions.fetchRepoCommitsForRepo(p.owner, p.repo, true)
      )
      forEachStaleEntry(repoActions.fetchedSFLRef, 'sfl-status', intervalMs, parseOwnerRepoKey, p =>
        repoActions.fetchSFLStatusForRepo(p.owner, p.repo, true)
      )
      forEachStaleEntry(
        repoActions.fetchedRepoIssuesRef,
        'repo-issues',
        intervalMs,
        parseStateOwnerRepoKey,
        p => repoActions.fetchRepoIssuesForRepo(p.owner, p.repo, p.state, true)
      )
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts.length, repoActions, refreshInterval])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const refreshRepoCounts = () => {
      for (const key of repoActions.fetchedCountsRef.current) {
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
  }, [accounts, refreshInterval, repoActions.fetchedCountsRef])

  return {
    ...prTree,
    bookmarkedRepoKeys,
    expandedSections: sections.set,
    uniqueOrgs,
    orgRepos,
    orgMeta,
    ...orgActions,
    loadingOrgs,
    expandedOrgs: orgs.set,
    ...repoActions,
    showBookmarkedOnly,
    setShowBookmarkedOnly,
    refreshTick,
    toggleSection: sections.toggle,
    toggleOrg,
    ...userMenu,
  }
}
