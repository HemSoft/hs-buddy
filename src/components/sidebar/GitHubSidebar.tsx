import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Folder,
  FolderOpen,
  Star,
  Filter,
  GitPullRequest,
  Building2,
  Loader2,
  ExternalLink,
  Sparkles,
  Copy,
  ThumbsUp,
} from 'lucide-react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useGitHubAccounts, usePRSettings } from '../../hooks/useConfig'
import {
  useRepoBookmarks,
  useRepoBookmarkMutations,
  useBuddyStatsMutations,
} from '../../hooks/useConvex'
import { useTaskQueue } from '../../hooks/useTaskQueue'
import {
  GitHubClient,
  type OrgRepo,
  type OrgRepoResult,
  type RepoCounts,
  type RepoPullRequest,
} from '../../api/github'
import { dataCache } from '../../services/dataCache'
import type { PullRequest } from '../../types/pullRequest'
import type { PRDetailSection } from '../../utils/prDetailView'
import { createPRDetailViewId } from '../../utils/prDetailView'

interface SidebarItem {
  id: string
  label: string
}

interface GitHubSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
}

function formatUpdatedAge(fetchedAt: number): string {
  const elapsedMs = Date.now() - fetchedAt
  if (elapsedMs < 60_000) return 'updated now'

  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  if (elapsedMinutes < 60) return `updated ${elapsedMinutes}m ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  return `updated ${elapsedHours}h ago`
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

function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}

export function GitHubSidebar({ onItemSelect, selectedItem, counts, badgeProgress }: GitHubSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['pull-requests', 'organizations'])
  )
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)

  // Load persisted bookmark filter on mount
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

  // Repo expansion state (tracks which repos are expanded to show Issues/PRs children)
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [repoCounts, setRepoCounts] = useState<Record<string, RepoCounts>>({})
  const [loadingRepoCounts, setLoadingRepoCounts] = useState<Set<string>>(new Set())
  const fetchedCountsRef = useRef<Set<string>>(new Set())
  const [expandedPrGroups, setExpandedPrGroups] = useState<Set<string>>(new Set(['pr-my-prs']))
  const [prContextMenu, setPrContextMenu] = useState<{ x: number; y: number; pr: PullRequest } | null>(
    null
  )
  const [approvingPrKey, setApprovingPrKey] = useState<string | null>(null)
  const [expandedPRNodes, setExpandedPRNodes] = useState<Set<string>>(new Set())
  const [expandedRepoPRGroups, setExpandedRepoPRGroups] = useState<Set<string>>(new Set())
  const [refreshTick, setRefreshTick] = useState(Date.now())
  const [repoPrTreeData, setRepoPrTreeData] = useState<Record<string, PullRequest[]>>({})
  const fetchedRepoPRsRef = useRef<Set<string>>(new Set())
  const [prTreeData, setPrTreeData] = useState<Record<string, PullRequest[]>>(() => ({
    'pr-my-prs': dataCache.get<PullRequest[]>('my-prs')?.data || [],
    'pr-needs-review': dataCache.get<PullRequest[]>('needs-review')?.data || [],
    'pr-need-a-nudge': dataCache.get<PullRequest[]>('need-a-nudge')?.data || [],
    'pr-recently-merged': dataCache.get<PullRequest[]>('recently-merged')?.data || [],
  }))

  // Get unique orgs from accounts
  const uniqueOrgs = Array.from(new Set(accounts.map(a => a.org))).sort()

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshTick(Date.now())
    }, 60_000)

    return () => clearInterval(intervalId)
  }, [])

  // Build a set of bookmarked repo keys for quick lookup: "org/repo"
  const bookmarkedRepoKeys = useMemo(
    () => new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`)),
    [bookmarks]
  )

  // Hydrate from dataCache on mount — show cached data immediately (same as PRs)
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

  // Subscribe to dataCache updates — react when prefetch or auto-refresh completes
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

        const [org, ...repoParts] = repoKey.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) return

        setRepoPrTreeData(prev => ({
          ...prev,
          [repoKey]: updated.data.map(repoPr => mapRepoPRToPullRequest(repoPr, org)),
        }))
      }
    })
    return unsubscribe
  }, [])

  // Auto-refresh timer — same pattern as PullRequestList
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return

    const intervalMs = refreshInterval * 60 * 1000

    const refreshAllOrgs = () => {
      const orgs = Array.from(new Set(accounts.map(a => a.org))).sort()
      for (const org of orgs) {
        const cacheKey = `org-repos:${org}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue

        console.log(`[OrgRefresh] ${org}: stale, queueing background refresh`)
        enqueueRef
          .current(
            async signal => {
              if (dataCache.isFresh(cacheKey, intervalMs)) return
              if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')

              const config = { accounts }
              const client = new GitHubClient(config, 7)
              const result = await client.fetchOrgRepos(org)
              dataCache.set(cacheKey, result)
              console.log(`[OrgRefresh] ${org}: refreshed ${result.repos.length} repos`)
            },
            { name: `refresh-org-${org}`, priority: -1 }
          )
          .catch(err => {
            if (err instanceof DOMException && err.name === 'AbortError') return
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
      // Check dataCache first — validate shape since cache format changed
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

      // Clear stale cache entry with old shape
      if (cached?.data) {
        dataCache.delete(`org-repos:${org}`)
      }

      setLoadingOrgs(prev => new Set([...prev, org]))
      try {
        // Use the task queue for concurrency control (same as PRs)
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
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
        if (error instanceof DOMException && error.name === 'AbortError') return
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
          // Track stat: repos browsed (fire-and-forget)
          incrementStat({ field: 'reposBrowsed' }).catch(() => {})
          // Fetch repos if not cached
          if (!orgRepos[org]) {
            fetchOrgRepos(org)
          }
        }
        return next
      })
    },
    [orgRepos, fetchOrgRepos, incrementStat]
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

  // Fetch issue/PR counts for a repo (used when expanding repos in sidebar)
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
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const config = { accounts }
            const client = new GitHubClient(config, 7)
            return await client.fetchRepoCounts(org, repoName)
          },
          { name: `repo-counts-${key}`, priority: -1 }
        )
        setRepoCounts(prev => ({ ...prev, [key]: result }))
        dataCache.set(cacheKey, result)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
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

  // Toggle repo expansion — fetch counts on first expand
  const toggleRepo = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedCountsRef.current.has(key)
      setExpandedRepos(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      // Fetch counts on first expand (outside state updater to avoid side effects)
      if (shouldFetch) {
        fetchedCountsRef.current.add(key)
        fetchRepoCountsForRepo(org, repoName)
      }
    },
    [fetchRepoCountsForRepo]
  )

  const fetchRepoPRsForRepo = useCallback(
    async (org: string, repoName: string, forceRefresh = false) => {
      const key = `${org}/${repoName}`
      const cacheKey = `repo-prs:${key}`
      const maxAgeMs = refreshInterval > 0 ? refreshInterval * 60 * 1000 : null

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

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoPRs(org, repoName)
          },
          { name: `repo-pr-tree-${org}-${repoName}`, priority: -1 }
        )

        setRepoPrTreeData(prev => ({
          ...prev,
          [key]: result.map(repoPr => mapRepoPRToPullRequest(repoPr, org)),
        }))
        dataCache.set(cacheKey, result)

        const countsCacheKey = `repo-counts:${key}`
        const existingCounts = dataCache.get<RepoCounts>(countsCacheKey)
        dataCache.set(countsCacheKey, {
          issues: existingCounts?.data?.issues ?? 0,
          prs: result.length,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.warn(`[RepoPRTree] ${key} failed:`, error)
      }
    },
    [accounts, refreshInterval]
  )

  const toggleRepoPRGroup = useCallback(
    (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const shouldFetch = !fetchedRepoPRsRef.current.has(key)

      setExpandedRepoPRGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })

      if (shouldFetch) {
        fetchedRepoPRsRef.current.add(key)
        fetchRepoPRsForRepo(org, repoName)
      }
    },
    [fetchRepoPRsForRepo]
  )

  // Auto-refresh repo PR trees that were expanded at least once
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return

    const intervalMs = refreshInterval * 60 * 1000
    const intervalId = setInterval(() => {
      for (const key of fetchedRepoPRsRef.current) {
        const cacheKey = `repo-prs:${key}`
        if (dataCache.isFresh(cacheKey, intervalMs)) continue

        const [org, ...repoParts] = key.split('/')
        const repoName = repoParts.join('/')
        if (!org || !repoName) continue
        fetchRepoPRsForRepo(org, repoName, true)
      }
    }, intervalMs)

    return () => clearInterval(intervalId)
  }, [accounts.length, fetchRepoPRsForRepo, refreshInterval])

  // Auto-refresh repo counts that have been fetched at least once
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || accounts.length === 0) return

    const intervalMs = refreshInterval * 60 * 1000

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
              if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
              const client = new GitHubClient({ accounts }, 7)
              const result = await client.fetchRepoCounts(org, repoName)
              dataCache.set(cacheKey, result)
            },
            { name: `refresh-repo-counts-${key}`, priority: -1 }
          )
          .catch(error => {
            if (error instanceof DOMException && error.name === 'AbortError') return
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
      if (!viewId) {
        return
      }

      const data = dataCache.get<PullRequest[]>(key)?.data || []
      setPrTreeData(prev => ({ ...prev, [viewId]: data }))
    })

    return unsubscribe
  }, [])

  const togglePRGroup = (itemId: string) => {
    setExpandedPrGroups(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
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

  const togglePRNode = (prViewId: string) => {
    setExpandedPRNodes(prev => {
      const next = new Set(prev)
      if (next.has(prViewId)) {
        next.delete(prViewId)
      } else {
        next.add(prViewId)
      }
      return next
    })
  }

  const prSubNodes: Array<{ key: PRDetailSection; label: string }> = [
    { key: 'conversation', label: 'Conversation' },
    { key: 'commits', label: 'Commits' },
    { key: 'checks', label: 'Checks' },
    { key: 'files-changed', label: 'Files changed' },
  ]

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
      for (const [groupId, items] of Object.entries(prev)) {
        next[groupId] = items.map(item => {
          if (
            item.id !== target.id ||
            item.repository !== target.repository ||
            item.source !== target.source ||
            item.iApproved
          ) {
            return item
          }
          return {
            ...item,
            iApproved: true,
            approvalCount: item.approvalCount + 1,
          }
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
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            await client.approvePullRequest(owner, repo, pr.id)
          },
          { name: `approve-sidebar-pr-${owner}-${repo}-${pr.id}` }
        )

        applyApproveToTree(pr)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Failed to approve PR from sidebar:', error)
      } finally {
        setApprovingPrKey(null)
      }
    },
    [accounts, applyApproveToTree]
  )

  return (
    <div className="sidebar-panel">
      {prContextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setPrContextMenu(null)} />
          <div className="context-menu" style={{ top: prContextMenu.y, left: prContextMenu.x }}>
            <button
              onClick={() => {
                window.shell.openExternal(prContextMenu.pr.url)
                setPrContextMenu(null)
              }}
            >
              <ExternalLink size={14} />
              Open Pull Request
            </button>
            <button
              onClick={async () => {
                try {
                  await copyToClipboard(prContextMenu.pr.url)
                } catch (error) {
                  console.error('Failed to copy PR link:', error)
                }
                setPrContextMenu(null)
              }}
            >
              <Copy size={14} />
              Copy Link
            </button>
            <button
              onClick={() => {
                openPRReview(prContextMenu.pr)
                setPrContextMenu(null)
              }}
            >
              <Sparkles size={14} />
              Request AI Review
            </button>
            <button
              onClick={async () => {
                await handleApprovePR(prContextMenu.pr)
                setPrContextMenu(null)
              }}
              disabled={
                prContextMenu.pr.iApproved ||
                approvingPrKey ===
                  `${prContextMenu.pr.source}-${prContextMenu.pr.repository}-${prContextMenu.pr.id}`
              }
            >
              <ThumbsUp size={14} />
              {prContextMenu.pr.iApproved
                ? 'Already Approved'
                : approvingPrKey ===
                    `${prContextMenu.pr.source}-${prContextMenu.pr.repository}-${prContextMenu.pr.id}`
                  ? 'Approving…'
                  : 'Approve'}
            </button>
            <button
              onClick={async () => {
                const pr = prContextMenu.pr
                await toggleBookmarkRepoByValues(
                  pr.org || '',
                  pr.repository,
                  pr.url.replace(/\/pull\/\d+$/, '')
                )
                setPrContextMenu(null)
              }}
            >
              <Star
                size={14}
                fill={
                  bookmarkedRepoKeys.has(`${prContextMenu.pr.org || ''}/${prContextMenu.pr.repository}`)
                    ? 'currentColor'
                    : 'none'
                }
              />
              {bookmarkedRepoKeys.has(`${prContextMenu.pr.org || ''}/${prContextMenu.pr.repository}`)
                ? `Unbookmark ${prContextMenu.pr.repository}`
                : `Bookmark ${prContextMenu.pr.repository}`}
            </button>
          </div>
        </>
      )}
      <div className="sidebar-panel-header">
        <h2>GITHUB</h2>
      </div>
      <div className="sidebar-panel-content">
        {/* Pull Requests group */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => toggleSection('pull-requests')}>
            <div className="sidebar-section-title">
              {expandedSections.has('pull-requests') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <GitPullRequest size={16} />
              </span>
              <span>Pull Requests</span>
            </div>
          </div>
          {expandedSections.has('pull-requests') && (
            <div className="sidebar-section-items">
              {prItems.map(item => (
                <div key={item.id}>
                  <div
                    className={`sidebar-item ${selectedItem === item.id ? 'selected' : ''}`}
                    onClick={() => onItemSelect(item.id)}
                  >
                    <span
                      className="sidebar-item-chevron"
                      onClick={e => {
                        e.stopPropagation()
                        togglePRGroup(item.id)
                      }}
                    >
                      {expandedPrGroups.has(item.id) ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </span>
                    <span className="sidebar-item-icon">
                      <FileText size={14} />
                    </span>
                    <span className="sidebar-item-label">{item.label}</span>
                    {counts[item.id] !== undefined &&
                      (badgeProgress[item.id] ? (
                        <span
                          className="sidebar-item-count-ring"
                          style={
                            {
                              '--ring-progress': `${badgeProgress[item.id].progress}%`,
                              '--ring-color': badgeProgress[item.id].color,
                            } as React.CSSProperties
                          }
                          title={badgeProgress[item.id].tooltip}
                        >
                          <span className="sidebar-item-count">{counts[item.id]}</span>
                        </span>
                      ) : (
                        <span className="sidebar-item-count">{counts[item.id]}</span>
                      ))}
                  </div>

                  {expandedPrGroups.has(item.id) && (prTreeData[item.id] || []).length > 0 && (
                    <div className="sidebar-job-tree sidebar-pr-tree">
                      <div className="sidebar-job-items">
                        {(prTreeData[item.id] || []).map(pr => {
                          const prViewId = createPRDetailViewId(pr)
                          const isSelected = selectedItem === prViewId || selectedItem?.startsWith(`${prViewId}?section=`)
                          return (
                            <div key={`${item.id}-${pr.source}-${pr.repository}-${pr.id}`} className="sidebar-pr-group">
                              <div
                                className={`sidebar-item sidebar-pr-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => onItemSelect(prViewId)}
                                onContextMenu={e => openTreePRContextMenu(e, pr)}
                                title={pr.title}
                              >
                                <span
                                  className="sidebar-item-chevron"
                                  onClick={e => {
                                    e.stopPropagation()
                                    togglePRNode(prViewId)
                                  }}
                                >
                                  {expandedPRNodes.has(prViewId) ? (
                                    <ChevronDown size={12} />
                                  ) : (
                                    <ChevronRight size={12} />
                                  )}
                                </span>
                                <span className="sidebar-item-icon">
                                  <GitPullRequest size={12} />
                                </span>
                                <span className="sidebar-item-label">#{pr.id} {pr.title}</span>
                                <span className="sidebar-pr-meta">{pr.repository}</span>
                              </div>

                              {expandedPRNodes.has(prViewId) && (
                                <div className="sidebar-pr-children">
                                  {prSubNodes.map(node => {
                                    const childViewId = createPRDetailViewId(pr, node.key)
                                    return (
                                      <div
                                        key={childViewId}
                                        className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                        onClick={() => onItemSelect(childViewId)}
                                      >
                                        <span className="sidebar-item-icon">
                                          <FileText size={11} />
                                        </span>
                                        <span className="sidebar-item-label">{node.label}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Organizations group */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => toggleSection('organizations')}>
            <div className="sidebar-section-title">
              {expandedSections.has('organizations') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Building2 size={16} />
              </span>
              <span>Organizations</span>
            </div>
            <button
              className={`sidebar-filter-btn ${showBookmarkedOnly ? 'active' : ''}`}
              onClick={e => {
                e.stopPropagation()
                setShowBookmarkedOnly(prev => {
                  const next = !prev
                  window.ipcRenderer.invoke('config:set-show-bookmarked-only', next).catch(() => {})
                  return next
                })
              }}
              title={showBookmarkedOnly ? 'Showing bookmarked only' : 'Showing all repos'}
            >
              <Filter size={14} />
            </button>
          </div>
          {expandedSections.has('organizations') && (
            <div className="sidebar-section-items">
              {uniqueOrgs.length === 0 ? (
                <div className="sidebar-item sidebar-item-empty">
                  <span className="sidebar-item-label">No accounts configured</span>
                </div>
              ) : (
                uniqueOrgs.map(org => {
                  const isOrgExpanded = expandedOrgs.has(org)
                  const isLoading = loadingOrgs.has(org)
                  const repos = orgRepos[org] ?? []
                  const meta = orgMeta[org]
                  const filteredRepos = showBookmarkedOnly
                    ? repos.filter(r => bookmarkedRepoKeys.has(`${org}/${r.name}`))
                    : repos

                  return (
                    <div key={org} className="sidebar-org-group">
                      <div className="sidebar-item sidebar-org-item" onClick={() => toggleOrg(org)}>
                        <span className="sidebar-item-icon">
                          {isOrgExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">
                          {isOrgExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                        </span>
                        <span className="sidebar-item-label">{org}</span>
                        {meta?.isUserNamespace && (
                          <span
                            className="sidebar-namespace-badge"
                            title="User account (not an org)"
                          >
                            user
                          </span>
                        )}
                        {isLoading && <Loader2 size={12} className="spin" />}
                        {!isLoading && repos.length > 0 && (
                          <span className="sidebar-item-count">
                            {showBookmarkedOnly ? filteredRepos.length : repos.length}
                          </span>
                        )}
                      </div>
                      {meta && !isLoading && (
                        <div
                          className="sidebar-org-account"
                          title={`Authenticated via @${meta.authenticatedAs}`}
                        >
                          via @{meta.authenticatedAs}
                        </div>
                      )}
                      {isOrgExpanded && (
                        <div className="sidebar-org-repos">
                          {isLoading ? (
                            <div className="sidebar-item sidebar-item-empty">
                              <Loader2 size={12} className="spin" />
                              <span className="sidebar-item-label">Loading repos...</span>
                            </div>
                          ) : filteredRepos.length === 0 ? (
                            <div className="sidebar-item sidebar-item-empty">
                              <span className="sidebar-item-label">
                                {showBookmarkedOnly ? 'No bookmarked repos' : 'No repos found'}
                              </span>
                            </div>
                          ) : (
                            filteredRepos.map(repo => {
                              const isBookmarked = bookmarkedRepoKeys.has(`${org}/${repo.name}`)
                              const repoKey = `${org}/${repo.name}`
                              const isRepoExpanded = expandedRepos.has(repoKey)
                              const counts = repoCounts[repoKey]
                              const repoCountsEntry = dataCache.get<RepoCounts>(
                                `repo-counts:${repoKey}`
                              )
                              const repoCountsUpdatedLabel = repoCountsEntry?.fetchedAt
                                ? formatUpdatedAge(repoCountsEntry.fetchedAt)
                                : null
                              const isCountLoading = loadingRepoCounts.has(repoKey)
                              return (
                                <div key={repo.name} className="sidebar-repo-group">
                                  <div
                                    className="sidebar-item sidebar-repo-item"
                                    onClick={() => toggleRepo(org, repo.name)}
                                    title={repo.description || repo.fullName}
                                  >
                                    <span className="sidebar-item-icon">
                                      {isRepoExpanded ? (
                                        <ChevronDown size={10} />
                                      ) : (
                                        <ChevronRight size={10} />
                                      )}
                                    </span>
                                    <span className="sidebar-item-icon">
                                      {isRepoExpanded ? (
                                        <FolderOpen size={12} />
                                      ) : (
                                        <Folder size={12} />
                                      )}
                                    </span>
                                    <span className="sidebar-item-label">{repo.name}</span>
                                    {repo.language && (
                                      <span className="sidebar-repo-lang">{repo.language}</span>
                                    )}
                                    <button
                                      className={`sidebar-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                                      onClick={e =>
                                        handleBookmarkToggle(e, org, repo.name, repo.url)
                                      }
                                      title={
                                        isBookmarked ? 'Remove bookmark' : 'Bookmark this repo'
                                      }
                                    >
                                      <Star
                                        size={12}
                                        fill={isBookmarked ? 'currentColor' : 'none'}
                                      />
                                    </button>
                                  </div>
                                  {isRepoExpanded && (
                                    <div className="sidebar-repo-children">
                                      <div
                                        className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-detail:${repoKey}` ? 'selected' : ''}`}
                                        onClick={() =>
                                          onItemSelect(`repo-detail:${repoKey}`)
                                        }
                                      >
                                        <span className="sidebar-item-icon">
                                          <FileText size={12} />
                                        </span>
                                        <span className="sidebar-item-label">Overview</span>
                                      </div>
                                      <div
                                        className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-issues:${repoKey}` ? 'selected' : ''}`}
                                        onClick={() =>
                                          onItemSelect(`repo-issues:${repoKey}`)
                                        }
                                      >
                                        <span className="sidebar-item-icon">
                                          <CircleDot size={12} />
                                        </span>
                                        <span className="sidebar-item-label">Issues</span>
                                        {isCountLoading ? (
                                          <Loader2 size={10} className="spin" />
                                        ) : counts ? (
                                          <span className="sidebar-item-count">
                                            {counts.issues}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div
                                        className={`sidebar-item sidebar-repo-child sidebar-repo-pr-row ${selectedItem === `repo-prs:${repoKey}` ? 'selected' : ''}`}
                                        onClick={() => toggleRepoPRGroup(org, repo.name)}
                                      >
                                        <span
                                          className="sidebar-item-chevron"
                                          onClick={e => {
                                            e.stopPropagation()
                                            toggleRepoPRGroup(org, repo.name)
                                          }}
                                        >
                                          {expandedRepoPRGroups.has(repoKey) ? (
                                            <ChevronDown size={10} />
                                          ) : (
                                            <ChevronRight size={10} />
                                          )}
                                        </span>
                                        <span className="sidebar-item-icon">
                                          <GitPullRequest size={12} />
                                        </span>
                                        <span className="sidebar-item-label">Pull Requests</span>
                                        {isCountLoading ? (
                                          <Loader2 size={10} className="spin" />
                                        ) : counts ? (
                                          <span className="sidebar-item-count">
                                            {counts.prs}
                                          </span>
                                        ) : null}
                                        {!isCountLoading && repoCountsUpdatedLabel && (
                                          <span key={refreshTick} className="sidebar-item-updated-age">
                                            {repoCountsUpdatedLabel}
                                          </span>
                                        )}
                                      </div>
                                      {expandedRepoPRGroups.has(repoKey) &&
                                        (repoPrTreeData[repoKey] || []).length > 0 && (
                                          <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                            <div className="sidebar-job-items">
                                              {(repoPrTreeData[repoKey] || []).map(pr => {
                                                const prViewId = createPRDetailViewId(pr)
                                                const isSelected =
                                                  selectedItem === prViewId ||
                                                  selectedItem?.startsWith(`${prViewId}?section=`)

                                                return (
                                                  <div
                                                    key={`${repoKey}-${pr.source}-${pr.repository}-${pr.id}`}
                                                    className="sidebar-pr-group"
                                                  >
                                                    <div
                                                      className={`sidebar-item sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
                                                      onClick={() => onItemSelect(prViewId)}
                                                      onContextMenu={e => openTreePRContextMenu(e, pr)}
                                                      title={pr.title}
                                                    >
                                                      <span
                                                        className="sidebar-item-chevron"
                                                        onClick={e => {
                                                          e.stopPropagation()
                                                          togglePRNode(prViewId)
                                                        }}
                                                      >
                                                        {expandedPRNodes.has(prViewId) ? (
                                                          <ChevronDown size={12} />
                                                        ) : (
                                                          <ChevronRight size={12} />
                                                        )}
                                                      </span>
                                                      <span className="sidebar-item-icon">
                                                        <GitPullRequest size={12} />
                                                      </span>
                                                      <span className="sidebar-item-label">
                                                        #{pr.id} {pr.title}
                                                      </span>
                                                      <span className="sidebar-pr-meta">
                                                        {pr.repository}
                                                      </span>
                                                    </div>

                                                    {expandedPRNodes.has(prViewId) && (
                                                      <div className="sidebar-pr-children">
                                                        {prSubNodes.map(node => {
                                                          const childViewId = createPRDetailViewId(
                                                            pr,
                                                            node.key
                                                          )
                                                          return (
                                                            <div
                                                              key={childViewId}
                                                              className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                                              onClick={() =>
                                                                onItemSelect(childViewId)
                                                              }
                                                            >
                                                              <span className="sidebar-item-icon">
                                                                <FileText size={11} />
                                                              </span>
                                                              <span className="sidebar-item-label">
                                                                {node.label}
                                                              </span>
                                                            </div>
                                                          )
                                                        })}
                                                      </div>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
