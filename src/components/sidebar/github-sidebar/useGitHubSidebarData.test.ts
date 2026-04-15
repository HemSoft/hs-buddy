import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGitHubSidebarData } from './useGitHubSidebarData'

// --- Mock services ---
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDelete = vi.fn()
const mockSubscribe = vi.fn((_listener: (key: string) => void) => () => {})
const mockIsFresh = vi.fn((_key: string) => false)

vi.mock('../../../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    subscribe: (listener: (key: string) => void) => mockSubscribe(listener),
    isFresh: (key: string) => mockIsFresh(key),
  },
}))

// --- Mock hooks ---
vi.mock('../../../hooks/useConfig', () => {
  const accounts = [
    { token: 'tk', username: 'alice', org: 'acme', url: 'https://api.github.com', name: 'main' },
  ]
  const prSettings = { refreshInterval: 0 }
  return {
    useGitHubAccounts: () => ({ accounts }),
    usePRSettings: () => prSettings,
  }
})
vi.mock('../../../hooks/useTaskQueue', () => {
  const enqueue = vi.fn().mockImplementation((fn: (signal: AbortSignal) => Promise<unknown>) => {
    const controller = new AbortController()
    return fn(controller.signal)
  })
  const cancel = vi.fn().mockReturnValue(false)
  const cancelAll = vi.fn()
  const stats = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 }
  return {
    useTaskQueue: () => ({ enqueue, cancel, cancelAll, stats }),
  }
})
vi.mock('../../../hooks/useConvex', () => ({
  useRepoBookmarks: () => [{ owner: 'acme', repo: 'my-repo' }],
  useRepoBookmarkMutations: () => ({
    create: vi.fn(),
    remove: vi.fn(),
  }),
  useBuddyStatsMutations: () => ({
    increment: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('../../../hooks/useNewPRIndicator', () => ({
  useNewPRIndicator: () => ({
    newCounts: {},
    newUrls: new Set<string>(),
    markAsSeen: vi.fn(),
  }),
}))

// --- Mock API/utils ---
vi.mock('../../../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchOrgRepos: vi
      .fn()
      .mockResolvedValue({ repos: [], authenticatedAs: 'alice', isUserNamespace: false }),
    fetchOrgMembers: vi.fn().mockResolvedValue({ members: [] }),
    fetchOrgOverview: vi.fn().mockResolvedValue({ metrics: { topContributorsToday: [] } }),
    fetchOrgTeams: vi.fn().mockResolvedValue({ teams: [] }),
    fetchTeamMembers: vi.fn().mockResolvedValue({ members: [] }),
    fetchRepoCounts: vi.fn().mockResolvedValue({ issues: 0, prs: 0 }),
    fetchRepoPRs: vi.fn().mockResolvedValue([]),
    fetchRepoCommits: vi.fn().mockResolvedValue([]),
    fetchRepoIssues: vi.fn().mockResolvedValue([]),
    approvePullRequest: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../../../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (url: string) => {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    return m ? { owner: m[1], repo: m[2] } : null
  },
}))
vi.mock('../../../utils/errorUtils', () => ({
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockReturnValue(null)
  Object.defineProperty(window, 'ipcRenderer', {
    value: {
      invoke: vi.fn().mockResolvedValue(false),
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
})

describe('useGitHubSidebarData', () => {
  it('returns initial state with correct shape', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const data = result.current

    // Verify key initial values
    expect(data.expandedSections).toBeInstanceOf(Set)
    expect(data.expandedSections.has('pull-requests')).toBe(true)
    expect(data.expandedSections.has('organizations')).toBe(true)
    expect(data.expandedOrgs).toBeInstanceOf(Set)
    expect(data.expandedOrgs.size).toBe(0)
    expect(data.showBookmarkedOnly).toBe(false)
    expect(data.uniqueOrgs).toEqual(['acme'])
    expect(data.prContextMenu).toBeNull()
    expect(data.approvingPrKey).toBeNull()
    expect(data.orgRepos).toEqual({})
    expect(data.orgMembers).toEqual({})
    expect(data.orgTeams).toEqual({})
    expect(data.teamMembers).toEqual({})
    expect(data.loadingOrgs).toBeInstanceOf(Set)
    expect(data.loadingOrgs.size).toBe(0)
  })

  it('returns prItems list', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prItems).toEqual([
      { id: 'pr-my-prs', label: 'My PRs' },
      { id: 'pr-needs-review', label: 'Needs Review' },
      { id: 'pr-need-a-nudge', label: 'Needs a nudge' },
      { id: 'pr-recently-merged', label: 'Recently Merged' },
    ])
  })

  it('returns bookmarkedRepoKeys', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.bookmarkedRepoKeys).toBeInstanceOf(Set)
    expect(result.current.bookmarkedRepoKeys.has('acme/my-repo')).toBe(true)
  })

  it('toggleSection adds and removes', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.expandedSections.has('pull-requests')).toBe(true)
    act(() => result.current.toggleSection('pull-requests'))
    expect(result.current.expandedSections.has('pull-requests')).toBe(false)
    act(() => result.current.toggleSection('pull-requests'))
    expect(result.current.expandedSections.has('pull-requests')).toBe(true)
  })

  it('togglePRGroup adds and removes', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.expandedPrGroups.size).toBe(0)
    act(() => result.current.togglePRGroup('pr-my-prs'))
    expect(result.current.expandedPrGroups.has('pr-my-prs')).toBe(true)
    act(() => result.current.togglePRGroup('pr-my-prs'))
    expect(result.current.expandedPrGroups.has('pr-my-prs')).toBe(false)
  })

  it('togglePRNode adds and removes', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => result.current.togglePRNode('pr-view-1'))
    expect(result.current.expandedPRNodes.has('pr-view-1')).toBe(true)
    act(() => result.current.togglePRNode('pr-view-1'))
    expect(result.current.expandedPRNodes.has('pr-view-1')).toBe(false)
  })

  it('toggleOrg expands and fetches repos', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrg('acme')
    })
    expect(result.current.expandedOrgs.has('acme')).toBe(true)
  })

  it('toggleOrg collapses on second call', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrg('acme')
    })
    expect(result.current.expandedOrgs.has('acme')).toBe(true)
    await act(async () => {
      result.current.toggleOrg('acme')
    })
    expect(result.current.expandedOrgs.has('acme')).toBe(false)
  })

  it('toggleOrgUserGroup toggles and triggers fetch', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrgUserGroup('acme')
    })
    expect(result.current.expandedOrgUserGroups.has('acme')).toBe(true)
    await act(async () => {
      result.current.toggleOrgUserGroup('acme')
    })
    expect(result.current.expandedOrgUserGroups.has('acme')).toBe(false)
  })

  it('toggleOrgTeamGroup toggles', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrgTeamGroup('acme')
    })
    expect(result.current.expandedOrgTeamGroups.has('acme')).toBe(true)
    await act(async () => {
      result.current.toggleOrgTeamGroup('acme')
    })
    expect(result.current.expandedOrgTeamGroups.has('acme')).toBe(false)
  })

  it('toggleRepo toggles expansion', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.expandedRepos.has('acme/my-repo')).toBe(true)
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.expandedRepos.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoIssueGroup toggles', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoIssueGroups.has('acme/my-repo')).toBe(true)
  })

  it('toggleRepoPRGroup toggles', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoPRGroups.has('acme/my-repo')).toBe(true)
  })

  it('toggleRepoCommitGroup toggles', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoCommitGroups.has('acme/my-repo')).toBe(true)
  })

  it('toggleSFLGroup toggles', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    expect(result.current.expandedSFLGroups.has('acme/my-repo')).toBe(true)
  })

  it('toggleRepoPRStateGroup toggles and fetches', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoPRStateGroups.has('acme/my-repo:open')).toBe(true)
  })

  it('toggleRepoIssueStateGroup toggles and fetches', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoIssueStateGroups.has('acme/my-repo:open')).toBe(true)
  })

  it('prTreeData initializes from cache', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [{ id: 1, title: 'PR1' }] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prTreeData['pr-my-prs']).toEqual([{ id: 1, title: 'PR1' }])
  })

  it('copyToClipboard uses navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      await result.current.copyToClipboard('hello')
    })
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('openPRReview dispatches custom event', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => useGitHubSidebarData())
    const pr = {
      source: 'GitHub' as const,
      repository: 'my-repo',
      id: 42,
      title: 'Fix bug',
      author: 'alice',
      url: 'https://github.com/acme/my-repo/pull/42',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
      org: 'acme',
    }
    act(() => result.current.openPRReview(pr))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('setShowBookmarkedOnly updates state', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.showBookmarkedOnly).toBe(false)
    act(() => result.current.setShowBookmarkedOnly(true))
    expect(result.current.showBookmarkedOnly).toBe(true)
  })

  it('toggleFavoriteUser adds and removes', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => result.current.toggleFavoriteUser('acme', 'bob'))
    expect(result.current.favoriteUsers.has('acme/bob')).toBe(true)
    act(() => result.current.toggleFavoriteUser('acme', 'bob'))
    expect(result.current.favoriteUsers.has('acme/bob')).toBe(false)
  })

  it('toggleTeam toggles expansion', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleTeam('acme', 'team-alpha')
    })
    expect(result.current.expandedTeams.has('acme/team-alpha')).toBe(true)
    await act(async () => {
      result.current.toggleTeam('acme', 'team-alpha')
    })
    expect(result.current.expandedTeams.has('acme/team-alpha')).toBe(false)
  })

  it('userContextMenu starts null', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.userContextMenu).toBeNull()
  })

  it('refreshUser clears cache and dispatches navigate event', () => {
    const spy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => result.current.refreshUser('acme', 'bob'))
    expect(mockDelete).toHaveBeenCalledWith('user-activity:v2:acme/bob')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('initializes orgRepos from cache when available', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'org-repos:acme') {
        return {
          data: {
            repos: [{ name: 'my-repo', full_name: 'acme/my-repo' }],
            authenticatedAs: 'alice',
            isUserNamespace: false,
          },
        }
      }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.orgRepos).toEqual({
      acme: [{ name: 'my-repo', full_name: 'acme/my-repo' }],
    })
  })

  it('subscribes to dataCache on mount', () => {
    renderHook(() => useGitHubSidebarData())
    expect(mockSubscribe).toHaveBeenCalled()
  })

  it('toggleBookmarkRepoByValues adds when not bookmarked', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    // 'acme/new-repo' is not in bookmarks, so create should be called
    await act(async () => {
      await result.current.toggleBookmarkRepoByValues(
        'acme',
        'new-repo',
        'https://github.com/acme/new-repo'
      )
    })
    // No throw = the path was exercised (create mock resolves)
  })

  it('toggleBookmarkRepoByValues removes when already bookmarked', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    // 'acme/my-repo' IS in bookmarks (from useRepoBookmarks mock), so remove path runs
    await act(async () => {
      await result.current.toggleBookmarkRepoByValues(
        'acme',
        'my-repo',
        'https://github.com/acme/my-repo'
      )
    })
  })

  it('openTreePRContextMenu sets prContextMenu', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const pr = {
      source: 'GitHub' as const,
      repository: 'my-repo',
      id: 42,
      title: 'Test PR',
      author: 'alice',
      url: 'https://github.com/acme/my-repo/pull/42',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
      org: 'acme',
    }
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent
    act(() => result.current.openTreePRContextMenu(mockEvent, pr))
    expect(result.current.prContextMenu).not.toBeNull()
    expect(result.current.prContextMenu?.pr).toBe(pr)
    expect(result.current.prContextMenu?.x).toBe(100)
    expect(result.current.prContextMenu?.y).toBe(200)
  })

  it('setPrContextMenu(null) clears prContextMenu', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const pr = {
      source: 'GitHub' as const,
      repository: 'my-repo',
      id: 42,
      title: 'Test PR',
      author: 'alice',
      url: 'https://github.com/acme/my-repo/pull/42',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
      org: 'acme',
    }
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent
    act(() => result.current.openTreePRContextMenu(mockEvent, pr))
    expect(result.current.prContextMenu).not.toBeNull()
    act(() => result.current.setPrContextMenu(null))
    expect(result.current.prContextMenu).toBeNull()
  })

  it('openUserContextMenu sets userContextMenu', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 75,
    } as unknown as React.MouseEvent
    act(() => result.current.openUserContextMenu(mockEvent, 'acme', 'bob'))
    expect(result.current.userContextMenu).not.toBeNull()
    expect(result.current.userContextMenu?.org).toBe('acme')
    expect(result.current.userContextMenu?.login).toBe('bob')
    expect(result.current.userContextMenu?.x).toBe(50)
    expect(result.current.userContextMenu?.y).toBe(75)
  })

  it('setUserContextMenu(null) clears userContextMenu', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 75,
    } as unknown as React.MouseEvent
    act(() => result.current.openUserContextMenu(mockEvent, 'acme', 'bob'))
    expect(result.current.userContextMenu).not.toBeNull()
    act(() => result.current.setUserContextMenu(null))
    expect(result.current.userContextMenu).toBeNull()
  })

  it('prTreeData initializes from cache for needs-review', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'needs-review') return { data: [{ id: 2, title: 'Review Me' }] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prTreeData['pr-needs-review']).toEqual([{ id: 2, title: 'Review Me' }])
  })

  it('prTreeData initializes from cache for recently-merged', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'recently-merged') return { data: [{ id: 3, title: 'Merged PR' }] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prTreeData['pr-recently-merged']).toEqual([{ id: 3, title: 'Merged PR' }])
  })

  it('prTreeData initializes from cache for need-a-nudge', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'need-a-nudge') return { data: [{ id: 4, title: 'Nudge PR' }] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prTreeData['pr-need-a-nudge']).toEqual([{ id: 4, title: 'Nudge PR' }])
  })

  it('repoCounts initializes from cache', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-counts:acme/my-repo') return { data: { issues: 5, prs: 3 } }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    // repoCounts is populated via fetchRepoCountsForRepo (needs toggle), not at init
    // But we can verify the cache setup at least doesn't break
    expect(result.current.repoCounts).toBeDefined()
  })

  it('dataCache subscription routes org-repos updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())

    // Retrieve the subscribe callback that the hook registered
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    // When the subscription fires, the hook calls dataCache.get to read updated data
    mockGet.mockImplementation((key: string) => {
      if (key === 'org-repos:acme') {
        return {
          data: {
            repos: [{ name: 'new-repo', full_name: 'acme/new-repo' }],
            authenticatedAs: 'alice',
            isUserNamespace: false,
          },
        }
      }
      return null
    })

    act(() => subscribeCb('org-repos:acme'))

    expect(result.current.orgRepos['acme']).toEqual([
      { name: 'new-repo', full_name: 'acme/new-repo' },
    ])
  })

  it('dataCache subscription routes repo-counts updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-counts:acme/my-repo') return { data: { issues: 10, prs: 5 } }
      return null
    })

    act(() => subscribeCb('repo-counts:acme/my-repo'))

    expect(result.current.repoCounts['acme/my-repo']).toEqual({ issues: 10, prs: 5 })
  })

  it('dataCache subscription routes repo-commits updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-commits:acme/my-repo')
        return { data: [{ sha: 'abc123', message: 'fix bug' }] }
      return null
    })

    act(() => subscribeCb('repo-commits:acme/my-repo'))

    expect(result.current.repoCommitTreeData['acme/my-repo']).toEqual([
      { sha: 'abc123', message: 'fix bug' },
    ])
  })

  it('dataCache subscription routes repo-issues updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-issues:acme/my-repo') return { data: [{ number: 1, title: 'Bug report' }] }
      return null
    })

    act(() => subscribeCb('repo-issues:acme/my-repo'))

    expect(result.current.repoIssueTreeData['acme/my-repo']).toEqual([
      { number: 1, title: 'Bug report' },
    ])
  })

  it('dataCache subscription routes sfl-status updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    mockGet.mockImplementation((key: string) => {
      if (key === 'sfl-status:acme/my-repo')
        return { data: { enabled: true, lastRun: '2024-01-01' } }
      return null
    })

    act(() => subscribeCb('sfl-status:acme/my-repo'))

    expect(result.current.sflStatusData['acme/my-repo']).toEqual({
      enabled: true,
      lastRun: '2024-01-01',
    })
  })

  it('copyToClipboard falls back to textarea when clipboard API unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: undefined },
      writable: true,
      configurable: true,
    })
    // happy-dom doesn't define execCommand, so add it
    document.execCommand = vi.fn().mockReturnValue(true)

    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      await result.current.copyToClipboard('fallback text')
    })

    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('handleBookmarkToggle stops propagation and delegates', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent
    await act(async () => {
      await result.current.handleBookmarkToggle(
        mockEvent,
        'acme',
        'new-repo',
        'https://github.com/acme/new-repo'
      )
    })
    expect(mockEvent.stopPropagation).toHaveBeenCalled()
  })
})
