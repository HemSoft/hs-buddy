import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Star,
  Filter,
  GitPullRequest,
  Building2,
  Loader2,
  Sparkles,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import {
  useRepoBookmarks,
  useRepoBookmarkMutations,
  useBuddyStatsMutations,
  useCopilotResultsRecent,
  useCopilotActiveCount,
} from '../hooks/useConvex'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type OrgRepo, type OrgRepoResult, type RepoCounts } from '../api/github'
import { dataCache } from '../services/dataCache'
import './SidebarPanel.css'

interface SidebarPanelProps {
  section: string
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts?: Record<string, number>
  badgeProgress?: Record<string, { progress: number; color: string; tooltip: string }>
  onCreateNew?: (type: 'schedule' | 'job') => void
}

interface SidebarItem {
  id: string
  label: string
}

const sectionData: Record<string, { title: string; items: SidebarItem[] }> = {
  github: {
    title: 'GitHub',
    items: [], // Rendered specially — see GitHubSidebar below
  },
  skills: {
    title: 'Skills',
    items: [
      { id: 'skills-browser', label: 'Browse Skills' },
      { id: 'skills-recent', label: 'Recently Used' },
      { id: 'skills-favorites', label: 'Favorites' },
    ],
  },
  tasks: {
    title: 'Tasks',
    items: [
      { id: 'tasks-today', label: 'Today' },
      { id: 'tasks-upcoming', label: 'Upcoming' },
      { id: 'tasks-projects', label: 'Projects' },
    ],
  },
  insights: {
    title: 'Insights',
    items: [
      { id: 'insights-productivity', label: 'Productivity' },
      { id: 'insights-activity', label: 'Activity' },
    ],
  },
  automation: {
    title: 'Automation',
    items: [
      { id: 'automation-jobs', label: 'Jobs' },
      { id: 'automation-schedules', label: 'Schedules' },
      { id: 'automation-runs', label: 'Runs' },
    ],
  },
  settings: {
    title: 'Settings',
    items: [
      { id: 'settings-accounts', label: 'Accounts' },
      { id: 'settings-appearance', label: 'Appearance' },
      { id: 'settings-pullrequests', label: 'Pull Requests' },
      { id: 'settings-advanced', label: 'Advanced' },
    ],
  },
  copilot: {
    title: 'Copilot',
    items: [], // Rendered specially — see CopilotSidebar below
  },
}

// ── Copilot Sidebar sub-component ─────────────────────────────────────────

interface CopilotSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

function CopilotSidebar({ onItemSelect, selectedItem }: CopilotSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['copilot-prompt', 'copilot-results'])
  )
  const recentResults = useCopilotResultsRecent(15)
  const activeCount = useCopilotActiveCount()

  const totalActive = (activeCount?.pending ?? 0) + (activeCount?.running ?? 0)

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={12} style={{ color: '#e89b3c' }} />
      case 'running': return <Loader2 size={12} className="spin" style={{ color: 'var(--accent-primary)' }} />
      case 'completed': return <CheckCircle2 size={12} style={{ color: '#4ec9b0' }} />
      case 'failed': return <XCircle size={12} style={{ color: '#e85d5d' }} />
      default: return null
    }
  }

  const formatRelativeTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>COPILOT</h2>
        {totalActive > 0 && (
          <span className="sidebar-item-count">{totalActive}</span>
        )}
      </div>
      <div className="sidebar-panel-content">
        {/* Prompt section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => toggleSection('copilot-prompt')}>
            <div className="sidebar-section-title">
              {expandedSections.has('copilot-prompt') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Send size={16} />
              </span>
              <span>Prompt</span>
            </div>
          </div>
          {expandedSections.has('copilot-prompt') && (
            <div className="sidebar-section-items">
              <div
                className={`sidebar-item ${selectedItem === 'copilot-prompt' ? 'selected' : ''}`}
                onClick={() => onItemSelect('copilot-prompt')}
              >
                <span className="sidebar-item-icon">
                  <Sparkles size={14} />
                </span>
                <span className="sidebar-item-label">New Prompt</span>
              </div>
              <div
                className={`sidebar-item ${selectedItem === 'copilot-all-results' ? 'selected' : ''}`}
                onClick={() => onItemSelect('copilot-all-results')}
              >
                <span className="sidebar-item-icon">
                  <FileText size={14} />
                </span>
                <span className="sidebar-item-label">All Results</span>
                {recentResults && recentResults.length > 0 && (
                  <span className="sidebar-item-count">{recentResults.length}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent results section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => toggleSection('copilot-results')}>
            <div className="sidebar-section-title">
              {expandedSections.has('copilot-results') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Clock size={16} />
              </span>
              <span>Recent Results</span>
            </div>
          </div>
          {expandedSections.has('copilot-results') && (
            <div className="sidebar-section-items">
              {!recentResults || recentResults.length === 0 ? (
                <div className="sidebar-item sidebar-item-empty">
                  <span className="sidebar-item-label">No results yet</span>
                </div>
              ) : (
                recentResults.map(r => {
                  const viewId = `copilot-result:${r._id}`
                  const label = r.category === 'pr-review'
                    ? `PR Review: ${((r.metadata as Record<string, unknown> | null)?.prTitle as string) || 'Untitled'}`
                    : r.prompt.length > 40
                      ? r.prompt.slice(0, 40) + '...'
                      : r.prompt
                  return (
                    <div
                      key={r._id}
                      className={`sidebar-item ${selectedItem === viewId ? 'selected' : ''}`}
                      onClick={() => onItemSelect(viewId)}
                      title={r.prompt}
                    >
                      <span className="sidebar-item-icon">
                        {statusIcon(r.status)}
                      </span>
                      <span className="sidebar-item-label">{label}</span>
                      <span className="sidebar-repo-lang">{formatRelativeTime(r.createdAt)}</span>
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

// ── GitHub Sidebar sub-component ──────────────────────────────────────────

interface GitHubSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
}

function GitHubSidebar({ onItemSelect, selectedItem, counts, badgeProgress }: GitHubSidebarProps) {
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

  // Get unique orgs from accounts
  const uniqueOrgs = Array.from(new Set(accounts.map(a => a.org))).sort()

  // Build a set of bookmarked repo keys for quick lookup: "org/repo"
  const bookmarkedRepoKeys = new Set((bookmarks ?? []).map(b => `${b.owner}/${b.repo}`))

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

  const handleBookmarkToggle = async (
    e: React.MouseEvent,
    org: string,
    repoName: string,
    repoUrl: string
  ) => {
    e.stopPropagation()
    const key = `${org}/${repoName}`
    if (bookmarkedRepoKeys.has(key)) {
      // Remove bookmark
      const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
      if (bookmark) {
        await removeBookmark({ id: bookmark._id })
      }
    } else {
      // Add bookmark
      await createBookmark({
        folder: org,
        owner: org,
        repo: repoName,
        url: repoUrl,
        description: '',
      })
      // Track stat: bookmarks created (fire-and-forget)
      incrementStat({ field: 'bookmarksCreated' }).catch(() => {})
    }
  }

  // Fetch issue/PR counts for a repo (used when expanding repos in sidebar)
  const fetchRepoCountsForRepo = useCallback(
    async (org: string, repoName: string) => {
      const key = `${org}/${repoName}`
      const cacheKey = `repo-counts:${key}`
      const cached = dataCache.get<RepoCounts>(cacheKey)
      if (cached?.data) {
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

  const prItems: SidebarItem[] = [
    { id: 'pr-my-prs', label: 'My PRs' },
    { id: 'pr-needs-review', label: 'Needs Review' },
    { id: 'pr-recently-merged', label: 'Recently Merged' },
  ]

  return (
    <div className="sidebar-panel">
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
                <div
                  key={item.id}
                  className={`sidebar-item ${selectedItem === item.id ? 'selected' : ''}`}
                  onClick={() => onItemSelect(item.id)}
                >
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
                                        className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-prs:${repoKey}` ? 'selected' : ''}`}
                                        onClick={() =>
                                          onItemSelect(`repo-prs:${repoKey}`)
                                        }
                                      >
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
                                      </div>
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

// ── Main SidebarPanel ─────────────────────────────────────────────────────

export function SidebarPanel({
  section,
  onItemSelect,
  selectedItem,
  counts = {},
  badgeProgress = {},
  onCreateNew,
}: SidebarPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([section]))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(
    null
  )
  const data = sectionData[section]

  // Auto-expand section when it changes
  useEffect(() => {
    setExpandedSections(prev => {
      if (prev.has(section)) return prev
      return new Set([...prev, section])
    })
  }, [section])

  if (!data) {
    return null
  }

  // Special rendering for the GitHub section
  if (section === 'github') {
    return (
      <GitHubSidebar
        onItemSelect={onItemSelect}
        selectedItem={selectedItem}
        counts={counts}
        badgeProgress={badgeProgress}
      />
    )
  }

  // Special rendering for the Copilot section
  if (section === 'copilot') {
    return (
      <CopilotSidebar
        onItemSelect={onItemSelect}
        selectedItem={selectedItem}
      />
    )
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const isExpanded = expandedSections.has(section)

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    // Only show context menu for items that support creation
    if (itemId === 'automation-schedules' || itemId === 'automation-jobs') {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, itemId })
    }
  }

  const handleCreateNew = () => {
    if (contextMenu) {
      if (contextMenu.itemId === 'automation-schedules') {
        onCreateNew?.('schedule')
      } else if (contextMenu.itemId === 'automation-jobs') {
        onCreateNew?.('job')
      }
      setContextMenu(null)
    }
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  return (
    <div className="sidebar-panel">
      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={closeContextMenu} />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={handleCreateNew}>
              <Plus size={14} />
              {contextMenu.itemId === 'automation-schedules' ? 'New Schedule' : 'New Job'}
            </button>
          </div>
        </>
      )}
      <div className="sidebar-panel-header">
        <h2>{data.title.toUpperCase()}</h2>
      </div>
      <div className="sidebar-panel-content">
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => toggleSection(section)}>
            <div className="sidebar-section-title">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="sidebar-section-icon">
                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <span>{data.title}</span>
            </div>
          </div>
          {isExpanded && data.items.length > 0 && (
            <div className="sidebar-section-items">
              {data.items.map(item => (
                <div
                  key={item.id}
                  className={`sidebar-item ${selectedItem === item.id ? 'selected' : ''}`}
                  onClick={() => onItemSelect(item.id)}
                  onContextMenu={e => handleContextMenu(e, item.id)}
                >
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
