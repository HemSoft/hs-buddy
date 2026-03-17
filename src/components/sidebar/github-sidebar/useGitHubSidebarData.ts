import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useGitHubAccounts, usePRSettings } from '../../../hooks/useConfig'
import {
  useRepoBookmarks,
  useRepoBookmarkMutations,
  useBuddyStatsMutations,
} from '../../../hooks/useConvex'
import { useTaskQueue } from '../../../hooks/useTaskQueue'
import {
  GitHubClient,
  type OrgRepo,
  type OrgMember,
  type RepoCommit,
  type RepoIssue,
  type OrgRepoResult,
  type OrgMemberResult,
  type OrgOverviewResult,
  type RepoCounts,
  type RepoPullRequest,
} from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoFromUrl } from '../../../utils/githubUrl'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import { MS_PER_MINUTE } from '../../../constants'

export interface SidebarItem {
  id: string
  label: string
}

const ABORT_ERROR_MESSAGE = 'Cancelled'
const ABORT_ERROR_NAME = 'AbortError'

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException(ABORT_ERROR_MESSAGE, ABORT_ERROR_NAME)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME
}

function getUniqueOrgs(accounts: Array<{ org?: string }>): string[] {
  return (Array.from(new Set(accounts.map(a => a.org))).filter(Boolean) as string[]).sort()
}

function mapRepoPRToPullRequest(pr: RepoPullRequest, org: string): PullRequest {
  return {
    source: 'GitHub',
    repository: pr.url.split('/')[4] || pr.url,
    id: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatarUrl: pr.authorAvatarUrl || undefined,
    url: pr.url,
    state: pr.state,
    approvalCount: pr.approvalCount ?? 0,
    assigneeCount: pr.assigneeCount ?? 0,
    iApproved: pr.iApproved ?? false,
    created: pr.createdAt ? new Date(pr.createdAt) : null,
    updatedAt: pr.updatedAt,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    date: pr.updatedAt || pr.createdAt,
    org,
  }
}

export function useGitHubSidebarData() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['pull-requests', 'organizations'])
  )
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)

  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-show-bookmarked-only')
      .then((value: boolean) => {
        setShowBookmarkedOnly(value)
      })
      .catch(() => {
        /* use default */
      })
  }, [])

  const [orgRepos, setOrgRepos] = useState<Record<string, OrgRepo[]>>({})
  const [orgMeta, setOrgMeta] = useState<
    Record<string, { authenticatedAs: string; isUserNamespace: boolean }>
  >({})
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({})
  const [loadingOrgMembers, setLoadingOrgMembers] = useState<Set<string>>(new Set())
  const [expandedOrgUserGroups, setExpandedOrgUserGroups] = useState<Set<string>>(new Set())
  const [orgContributorCounts, setOrgContributorCounts] = useState<Record<string, Record<string, number>>>({})
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

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const fetchedOrgMembersRef = useRef<Set<string>>(new Set())
  const fetchedOrgOverviewRef = useRef<Set<string>>(new Set())
  const [repoCounts, setRepoCounts] = useState<Record<string, RepoCounts>>({})
  const [loadingRepoCounts, setLoadingRepoCounts] = useState<Set<string>>(new Set())
  const fetchedCountsRef = useRef<Set<string>>(new Set())
  const [expandedPrGroups, setExpandedPrGroups] = useState<Set<string>>(new Set())
  const [prContextMenu, setPrContextMenu] = useState<{
    x: number
    y: number
    pr: PullRequest
  } | null>(null)
  const [approvingPrKey, setApprovingPrKey] = useState<string | null>(null)
  const [expandedPRNodes, setExpandedPRNodes] = useState<Set<string>>(new Set())
  const [expandedRepoIssueGroups, setExpandedRepoIssueGroups] = useState<Set<string>>(new Set())
  const [expandedRepoIssueStateGroups, setExpandedRepoIssueStateGroups] = useState<Set<string>>(
    new Set()
  )
  const [expandedRepoPRGroups, setExpandedRepoPRGroups] = useState<Set<string>>(new Set())
  const [expandedRepoPRStateGroups, setExpandedRepoPRStateGroups] = useState<Set<string>>(new Set())
  const [expandedRepoCommitGroups, setExpandedRepoCommitGroups] = useState<Set<string>>(new Set())
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
  const [expandedSFLGroups, setExpandedSFLGroups] = useState<Set<string>>(new Set())
  const fetchedSFLRef = useRef<Set<string>>(new Set())
  const [prTreeData, setPrTreeData] = useState<Record<string, PullRequest[]>>(() => ({
    'pr-my-prs': dataCache.get<PullRequest[]>('my-prs')?.data || [],
    'pr-needs-review': dataCache.get<PullRequest[]>('needs-review')?.data || [],
    'pr-need-a-nudge': dataCache.get<PullRequest[]>('need-a-nudge')?.data || [],
    'pr-recently-merged': dataCache.get<PullRequest[]>('recently-merged')?.data || [],
  }))

  const uniqueOrgs = getUniqueOrgs(accounts)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshTick(Date.now())
    }, 60_000)
    return () => clearInterval(intervalId)
  }, [])

  const bookmarkedRepoKeys = useMemo(
    () => new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`)),
    [bookmarks]
  )

  useEffect(() => {
    for (const org of uniqueOrgs) {
      const cached = dataCache.get<OrgRepoResult>(`org-repos:${org}`)
      if (cached?.data && 'repos' in cached.data && Array.isArray(cached.data.repos)) {
        setOrgRepos(prev => ({ ...prev, [org]: cached.data.repos }))
        setOrgMeta(prev => ({
          ...prev,
          [org]: {
            authenticatedAs: cached.data.authenticatedAs,
            isUserNamespace: cached.data.isUserNamespace,
          },
        }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueOrgs.join(',')])

  useEffect(() => {
    const unsubscribe = dataCache.subscribe(key => {
      if (key.startsWith('org-repos:')) {
        const org = key.replace('org-repos:', '')
        const updated = dataCache.get<OrgRepoResult>(key)
        if (updated?.data && 'repos' in updated.data && Array.isArray(updated.data.repos)) {
          setOrgRepos(prev => ({ ...prev, [org]: updated.data.repos }))
          setOrgMeta(prev => ({
            ...prev,
            [org]: {
              authenticatedAs: updated.data.authenticatedAs,
              isUserNamespace: updated.data.isUserNamespace,
            },
          }))
        }
        return
      }
      if (key.startsWith('repo-counts:')) {
        const repoKey = key.replace('repo-counts:', '')
        const updated = dataCache.get<RepoCounts>(key)
        if (updated?.data) {
          setRepoCounts(prev => ({ ...prev, [repoKey]: updated.data }))
        }
        return
      }
      if (key.startsWith('repo-prs:')) {
        const repoKey = key.replace('repo-prs:', '')
        const updated = dataCache.get<RepoPullRequest[]>(key)
        if (!updated?.data) return
        const [, ownerRepo] = repoKey.split(':', 2)
        const [org, ...repoParts] = ownerRepo.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) return
        setRepoPrTreeData(prev => ({
          ...prev,
          [repoKey]: updated.data.map(repoPr => mapRepoPRToPullRequest(repoPr, org)),
        }))
        return
      }
      if (key.startsWith('repo-commits:')) {
        const repoKey = key.replace('repo-commits:', '')
        const updated = dataCache.get<RepoCommit[]>(key)
        if (updated?.data) {
          setRepoCommitTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
        return
      }
      if (key.startsWith('repo-issues:')) {
        const repoKey = key.replace('repo-issues:', '')
        const updated = dataCache.get<RepoIssue[]>(key)
        if (updated?.data) {
          setRepoIssueTreeData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
        return
      }
      if (key.startsWith('sfl-status:')) {
        const repoKey = key.replace('sfl-status:', '')
        const updated = dataCache.get<SFLRepoStatus>(key)
        if (updated?.data) {
          setSflStatusData(prev => ({ ...prev, [repoKey]: updated.data }))
        }
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const refreshAllOrgs = () => {
      const orgs = getUniqueOrgs(accounts)
      for (const org of orgs) {
        const cacheKey = `org-repos:${org}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        console.log(`[OrgRefresh] ${org}: stale, queueing background refresh`)
        enqueueRef
          .current(
            async signal => {
              if (dataCache.isFresh(cacheKey, intervalMs)) return
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
            if (isAbortError(err)) return
            console.warn(`[OrgRefresh] ${org} failed:`, err)
          })
      }
    }
    console.log(`[OrgRefresh] Setting up auto-refresh: ${refreshInterval} minutes`)
    refreshTimerRef.current = setInterval(refreshAllOrgs, intervalMs)
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [refreshInterval, accounts])

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const fetchOrgRepos = useCallback(
    async (org: string) => {
      const cached = dataCache.get<OrgRepoResult>(`org-repos:${org}`)
      if (cached?.data && 'repos' in cached.data && Array.isArray(cached.data.repos)) {
        setOrgRepos(prev => ({ ...prev, [org]: cached.data.repos }))
        setOrgMeta(prev => ({
          ...prev,
          [org]: {
            authenticatedAs: cached.data.authenticatedAs,
            isUserNamespace: cached.data.isUserNamespace,
          },
        }))
        return
      }
      if (cached?.data) {
        dataCache.delete(`org-repos:${org}`)
      }
      setLoadingOrgs(prev => new Set([...prev, org]))
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
        setOrgRepos(prev => ({ ...prev, [org]: result.repos }))
        setOrgMeta(prev => ({
          ...prev,
          [org]: {
            authenticatedAs: result.authenticatedAs,
            isUserNamespace: result.isUserNamespace,
          },
        }))
        dataCache.set(`org-repos:${org}`, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.error(`Failed to fetch repos for ${org}:`, error)
        setOrgRepos(prev => ({ ...prev, [org]: [] }))
      } finally {
        setLoadingOrgs(prev => {
          const next = new Set(prev)
          next.delete(org)
          return next
        })
      }
    },
    [accounts]
  )

  const toggleOrg = useCallback(
    (org: string) => {
      setExpandedOrgs(prev => {
        const next = new Set(prev)
        if (next.has(org)) {
          next.delete(org)
        } else {
          next.add(org)
          incrementStat({ field: 'reposBrowsed' }).catch(() => {})
          if (!orgRepos[org]) {
            fetchOrgRepos(org)
          }
        }
        return next
      })
    },
    [orgRepos, fetchOrgRepos, incrementStat]
  )

  const fetchOrgMembers = useCallback(
    async (org: string, forceRefresh = false) => {
      const cacheKey = `org-members:${org}`
      const cached = dataCache.get<OrgMemberResult>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setOrgMembers(prev => ({ ...prev, [org]: cached.data.members }))
        return
      }

      setLoadingOrgMembers(prev => new Set(prev).add(org))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgMembers(org)
          },
          { name: `org-members-${org}`, priority: -1 }
        )
        setOrgMembers(prev => ({ ...prev, [org]: result.members }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[OrgMembers] ${org} failed:`, error)
      } finally {
        setLoadingOrgMembers(prev => {
          const next = new Set(prev)
          next.delete(org)
          return next
        })
      }
    },
    [accounts]
  )

  const fetchOrgOverview = useCallback(
    async (org: string, forceRefresh = false) => {
      const cacheKey = `org-overview:${org}`
      const cached = dataCache.get<OrgOverviewResult>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setOrgContributorCounts(prev => ({
          ...prev,
          [org]: Object.fromEntries(
            cached.data.metrics.topContributorsToday.map(contributor => [contributor.login, contributor.commits])
          ),
        }))
        return
      }

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgOverview(org)
          },
          { name: `org-overview-${org}`, priority: -1 }
        )
        setOrgContributorCounts(prev => ({
          ...prev,
          [org]: Object.fromEntries(
            result.metrics.topContributorsToday.map(contributor => [contributor.login, contributor.commits])
          ),
        }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[OrgOverview] ${org} failed:`, error)
      }
    },
    [accounts]
  )

  const toggleOrgUserGroup = useCallback(
    (org: string) => {
      const shouldFetchMembers = !fetchedOrgMembersRef.current.has(org)
      const shouldFetchOverview = !fetchedOrgOverviewRef.current.has(org)

      setExpandedOrgUserGroups(prev => {
        const next = new Set(prev)
        if (next.has(org)) {
          next.delete(org)
        } else {
          next.add(org)
        }
        return next
      })

      if (shouldFetchMembers) {
        fetchedOrgMembersRef.current.add(org)
        fetchOrgMembers(org)
      }
      if (shouldFetchOverview) {
        fetchedOrgOverviewRef.current.add(org)
        fetchOrgOverview(org)
      }
    },
    [fetchOrgMembers, fetchOrgOverview]
  )

  const toggleBookmarkRepoByValues = useCallback(
    async (org: string, repoName: string, repoUrl: string) => {
      const key = `${org}/${repoName}`
      if (bookmarkedRepoKeys.has(key)) {
        const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
        if (bookmark) {
          await removeBookmark({ id: bookmark._id })
        }
        return
      }
      await createBookmark({
        folder: org,
        owner: org,
        repo: repoName,
        url: repoUrl,
        description: '',
      })
      incrementStat({ field: 'bookmarksCreated' }).catch(() => {})
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
    await toggleBookmarkRepoByValues(org, repoName, repoUrl)
  }

  const fetchRepoCountsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      const cacheKey = `repo-counts:${key}`
      const cached = dataCache.get<RepoCounts>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setRepoCounts(prev => ({ ...prev, [key]: cached.data }))
        return
      }
      setLoadingRepoCounts(prev => new Set([...prev, key]))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const config = { accounts }
            const client = new GitHubClient(config, 7)
            return await client.fetchRepoCounts(org, repoName)
          },
          { name: `repo-counts-${key}`, priority: -1 }
        )
        setRepoCounts(prev => ({ ...prev, [key]: result }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`Failed to fetch counts for ${key}:`, error)
      } finally {
        setLoadingRepoCounts(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [accounts]
  )

  const fetchSFLStatusForRepo = useCallback(
    async (org: string, repoName: string, isRefresh = false) => {
      const key = `${org}/${repoName}`
      const cacheKey = `sfl-status:${key}`
      if (!isRefresh) {
        const cached = dataCache.get<SFLRepoStatus>(cacheKey)
        if (cached?.data) {
          setSflStatusData(prev => ({ ...prev, [key]: cached.data }))
          return
        }
      }
      setLoadingSFLStatus(prev => new Set([...prev, key]))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchSFLStatus(org, repoName)
          },
          { name: `sfl-status-${key}`, priority: -1 }
        )
        setSflStatusData(prev => ({ ...prev, [key]: result }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[SFLStatus] ${key} failed:`, error)
      } finally {
        setLoadingSFLStatus(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [accounts]
  )

  const toggleRepo = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetchCounts = !fetchedCountsRef.current.has(key)
      const shouldFetchSFL = !fetchedSFLRef.current.has(key)
      setExpandedRepos(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      if (shouldFetchCounts) {
        fetchedCountsRef.current.add(key)
        fetchRepoCountsForRepo(org, repoName)
      }
      if (shouldFetchSFL) {
        fetchedSFLRef.current.add(key)
        fetchSFLStatusForRepo(org, repoName)
      }
    },
    [fetchRepoCountsForRepo, fetchSFLStatusForRepo]
  )

  const fetchRepoPRsForRepo = useCallback(
    async (org: string, repoName: string, state: 'open' | 'closed', forceRefresh = false) => {
      const key = `${state}:${org}/${repoName}`
      const cacheKey = `repo-prs:${key}`
      const maxAgeMs = refreshInterval > 0 ? refreshInterval * MS_PER_MINUTE : null
      const cached = dataCache.get<RepoPullRequest[]>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setRepoPrTreeData(prev => ({
          ...prev,
          [key]: cached.data.map(repoPr => mapRepoPRToPullRequest(repoPr, org)),
        }))
        if (maxAgeMs && dataCache.isFresh(cacheKey, maxAgeMs)) {
          return
        }
      }
      setLoadingRepoPRs(prev => new Set(prev).add(key))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoPRs(org, repoName, state)
          },
          { name: `repo-pr-tree-${state}-${org}-${repoName}`, priority: -1 }
        )
        setRepoPrTreeData(prev => ({
          ...prev,
          [key]: result.map(repoPr => mapRepoPRToPullRequest(repoPr, org)),
        }))
        dataCache.set(cacheKey, result)
        if (state === 'open') {
          const countsCacheKey = `repo-counts:${org}/${repoName}`
          const existingCounts = dataCache.get<RepoCounts>(countsCacheKey)
          dataCache.set(countsCacheKey, {
            issues: existingCounts?.data?.issues ?? 0,
            prs: result.length,
          })
        }
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[RepoPRTree] ${key} failed:`, error)
      } finally {
        setLoadingRepoPRs(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [accounts, refreshInterval]
  )

  const toggleRepoPRGroup = useCallback((org: string, repoName: string) => {
    const key = `${org}/${repoName}`
    setExpandedRepoPRGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const toggleRepoPRStateGroup = useCallback(
    (org: string, repoName: string, state: 'open' | 'closed') => {
      const key = `${org}/${repoName}:${state}`
      const fetchKey = `${state}:${org}/${repoName}`
      const shouldFetch = !fetchedRepoPRsRef.current.has(fetchKey)
      setExpandedRepoPRStateGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      if (shouldFetch) {
        fetchedRepoPRsRef.current.add(fetchKey)
        fetchRepoPRsForRepo(org, repoName, state)
      }
    },
    [fetchRepoPRsForRepo]
  )

  const toggleRepoIssueGroup = useCallback((org: string, repoName: string) => {
    const key = `${org}/${repoName}`
    setExpandedRepoIssueGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const fetchRepoIssuesForRepo = useCallback(
    async (org: string, repoName: string, state: 'open' | 'closed', forceRefresh = false) => {
      const key = `${state}:${org}/${repoName}`
      const cacheKey = `repo-issues:${key}`
      const maxAgeMs = refreshInterval > 0 ? refreshInterval * MS_PER_MINUTE : null
      const cached = dataCache.get<RepoIssue[]>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setRepoIssueTreeData(prev => ({ ...prev, [key]: cached.data }))
        if (maxAgeMs && dataCache.isFresh(cacheKey, maxAgeMs)) {
          return
        }
      }
      setLoadingRepoIssues(prev => new Set(prev).add(key))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoIssues(org, repoName, state)
          },
          { name: `repo-issues-tree-${state}-${org}-${repoName}`, priority: -1 }
        )
        setRepoIssueTreeData(prev => ({ ...prev, [key]: result }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[RepoIssueTree] ${key} failed:`, error)
      } finally {
        setLoadingRepoIssues(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [accounts, refreshInterval]
  )

  const toggleRepoIssueStateGroup = useCallback(
    (org: string, repoName: string, state: 'open' | 'closed') => {
      const key = `${org}/${repoName}:${state}`
      const fetchKey = `${state}:${org}/${repoName}`
      const shouldFetch = !fetchedRepoIssuesRef.current.has(fetchKey)
      setExpandedRepoIssueStateGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      if (shouldFetch) {
        fetchedRepoIssuesRef.current.add(fetchKey)
        fetchRepoIssuesForRepo(org, repoName, state)
      }
    },
    [fetchRepoIssuesForRepo]
  )

  const fetchRepoCommitsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      const cacheKey = `repo-commits:${key}`
      const maxAgeMs = refreshInterval > 0 ? refreshInterval * MS_PER_MINUTE : null
      const cached = dataCache.get<RepoCommit[]>(cacheKey)
      if (cached?.data && !forceRefresh) {
        setRepoCommitTreeData(prev => ({ ...prev, [key]: cached.data }))
        if (maxAgeMs && dataCache.isFresh(cacheKey, maxAgeMs)) {
          return
        }
      }
      setLoadingRepoCommits(prev => new Set(prev).add(key))
      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoCommits(org, repoName)
          },
          { name: `repo-commit-tree-${org}-${repoName}`, priority: -1 }
        )
        setRepoCommitTreeData(prev => ({ ...prev, [key]: result }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (isAbortError(error)) return
        console.warn(`[RepoCommitTree] ${key} failed:`, error)
      } finally {
        setLoadingRepoCommits(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [accounts, refreshInterval]
  )

  const toggleRepoCommitGroup = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedRepoCommitsRef.current.has(key)
      setExpandedRepoCommitGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      if (shouldFetch) {
        fetchedRepoCommitsRef.current.add(key)
        fetchRepoCommitsForRepo(org, repoName)
      }
    },
    [fetchRepoCommitsForRepo]
  )

  const toggleSFLGroup = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedSFLRef.current.has(key)
      setExpandedSFLGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      if (shouldFetch) {
        fetchedSFLRef.current.add(key)
        fetchSFLStatusForRepo(org, repoName)
      }
    },
    [fetchSFLStatusForRepo]
  )

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      for (const key of fetchedRepoPRsRef.current) {
        const cacheKey = `repo-prs:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        const [state, ownerRepo] = key.split(':', 2)
        const [org, ...repoParts] = ownerRepo.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName || (state !== 'open' && state !== 'closed')) continue
        fetchRepoPRsForRepo(org, repoName, state, true)
      }
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts.length, fetchRepoPRsForRepo, refreshInterval])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      for (const key of fetchedRepoCommitsRef.current) {
        const cacheKey = `repo-commits:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        const [org, ...repoParts] = key.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) continue
        fetchRepoCommitsForRepo(org, repoName, true)
      }
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts.length, fetchRepoCommitsForRepo, refreshInterval])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      for (const key of fetchedSFLRef.current) {
        const cacheKey = `sfl-status:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        const [org, ...repoParts] = key.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) continue
        fetchSFLStatusForRepo(org, repoName, true)
      }
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts.length, fetchSFLStatusForRepo, refreshInterval])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const intervalId = setInterval(() => {
      for (const key of fetchedRepoIssuesRef.current) {
        const cacheKey = `repo-issues:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue
        const [state, ownerRepo] = key.split(':', 2)
        const [org, ...repoParts] = ownerRepo.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName || (state !== 'open' && state !== 'closed')) continue
        fetchRepoIssuesForRepo(org, repoName, state, true)
      }
    }, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts.length, fetchRepoIssuesForRepo, refreshInterval])

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const refreshRepoCounts = () => {
      for (const key of fetchedCountsRef.current) {
        const cacheKey = `repo-counts:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) {
          continue
        }
        const [org, ...repoParts] = key.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) continue
        enqueueRef
          .current(
            async signal => {
              throwIfAborted(signal)
              const client = new GitHubClient({ accounts }, 7)
              const result = await client.fetchRepoCounts(org, repoName)
              dataCache.set(cacheKey, result)
            },
            { name: `refresh-repo-counts-${key}`, priority: -1 }
          )
          .catch(error => {
            if (isAbortError(error)) return
            console.warn(`[RepoCountsRefresh] ${key} failed:`, error)
          })
      }
    }
    const intervalId = setInterval(refreshRepoCounts, intervalMs)
    return () => clearInterval(intervalId)
  }, [accounts, refreshInterval])

  const prItems: SidebarItem[] = [
    { id: 'pr-my-prs', label: 'My PRs' },
    { id: 'pr-needs-review', label: 'Needs Review' },
    { id: 'pr-need-a-nudge', label: 'Needs a nudge' },
    { id: 'pr-recently-merged', label: 'Recently Merged' },
  ]

  useEffect(() => {
    const viewIdByCacheKey: Record<string, string> = {
      'my-prs': 'pr-my-prs',
      'needs-review': 'pr-needs-review',
      'need-a-nudge': 'pr-need-a-nudge',
      'recently-merged': 'pr-recently-merged',
    }
    const unsubscribe = dataCache.subscribe(key => {
      const viewId = viewIdByCacheKey[key]
      if (!viewId) return
      const data = dataCache.get<PullRequest[]>(key)?.data || []
      setPrTreeData(prev => ({ ...prev, [viewId]: data }))
    })
    return unsubscribe
  }, [])

  const togglePRGroup = (itemId: string) => {
    setExpandedPrGroups(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const togglePRNode = (prViewId: string) => {
    setExpandedPRNodes(prev => {
      const next = new Set(prev)
      if (next.has(prViewId)) next.delete(prViewId)
      else next.add(prViewId)
      return next
    })
  }

  const openPRReview = (pr: PullRequest) => {
    window.dispatchEvent(
      new CustomEvent('pr-review:open', {
        detail: {
          prUrl: pr.url,
          prTitle: pr.title,
          prNumber: pr.id,
          repo: pr.repository,
          org: pr.org || '',
          author: pr.author,
        },
      })
    )
  }

  const openTreePRContextMenu = (e: React.MouseEvent, pr: PullRequest) => {
    e.preventDefault()
    setPrContextMenu({ x: e.clientX, y: e.clientY, pr })
  }

  useEffect(() => {
    if (!prContextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPrContextMenu(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [prContextMenu])

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }

  const applyApproveToTree = useCallback((target: PullRequest) => {
    setPrTreeData(prev => {
      const next: Record<string, PullRequest[]> = { ...prev }
      for (const [groupId, items] of Object.entries(prev) as Array<[string, PullRequest[]]>) {
        next[groupId] = items.map(item => {
          if (
            item.id !== target.id ||
            item.repository !== target.repository ||
            item.source !== target.source ||
            item.iApproved
          )
            return item
          return { ...item, iApproved: true, approvalCount: item.approvalCount + 1 }
        })
      }
      return next
    })
  }, [])

  const handleApprovePR = useCallback(
    async (pr: PullRequest) => {
      if (pr.iApproved) return
      const parsed = parseOwnerRepoFromUrl(pr.url)
      const owner = pr.org || parsed?.owner
      const repo = pr.repository || parsed?.repo
      if (!owner || !repo) return
      const prKey = `${pr.source}-${pr.repository}-${pr.id}`
      setApprovingPrKey(prKey)
      try {
        await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            await client.approvePullRequest(owner, repo, pr.id)
          },
          { name: `approve-sidebar-pr-${owner}-${repo}-${pr.id}` }
        )
        applyApproveToTree(pr)
      } catch (error) {
        if (isAbortError(error)) return
        console.error('Failed to approve PR from sidebar:', error)
      } finally {
        setApprovingPrKey(null)
      }
    },
    [accounts, applyApproveToTree]
  )

  return {
    prContextMenu,
    setPrContextMenu,
    approvingPrKey,
    bookmarkedRepoKeys,
    expandedSections,
    prItems,
    prTreeData,
    expandedPrGroups,
    expandedPRNodes,
    uniqueOrgs,
    orgRepos,
    orgMeta,
    orgMembers,
    loadingOrgMembers,
    expandedOrgUserGroups,
    orgContributorCounts,
    loadingOrgs,
    expandedOrgs,
    expandedRepos,
    expandedRepoIssueGroups,
    expandedRepoIssueStateGroups,
    expandedRepoPRGroups,
    expandedRepoPRStateGroups,
    expandedRepoCommitGroups,
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
    expandedSFLGroups,
    showBookmarkedOnly,
    setShowBookmarkedOnly,
    refreshTick,
    toggleSection,
    toggleOrg,
    toggleOrgUserGroup,
    toggleRepo,
    toggleRepoIssueGroup,
    toggleRepoIssueStateGroup,
    toggleRepoPRGroup,
    toggleRepoPRStateGroup,
    toggleRepoCommitGroup,
    toggleSFLGroup,
    togglePRGroup,
    togglePRNode,
    openTreePRContextMenu,
    handleBookmarkToggle,
    handleApprovePR,
    copyToClipboard,
    openPRReview,
    toggleBookmarkRepoByValues,
  }
}
