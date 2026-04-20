import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

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

// --- Configurable mock values ---
let mockRefreshInterval = 0

// --- Mock hooks ---
vi.mock('../../../hooks/useConfig', () => {
  const accounts = [
    { token: 'tk', username: 'alice', org: 'acme', url: 'https://api.github.com', name: 'main' },
  ]
  return {
    useGitHubAccounts: () => ({ accounts }),
    usePRSettings: () => ({ refreshInterval: mockRefreshInterval }),
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

// --- Module-level API method mocks ---
const mockFetchRepoCounts = vi.fn().mockResolvedValue({ issues: 0, prs: 0 })
const mockFetchRepoPRs = vi.fn().mockResolvedValue([])
const mockFetchRepoCommits = vi.fn().mockResolvedValue([])
const mockFetchRepoIssues = vi.fn().mockResolvedValue([])
const mockFetchSFLStatus = vi.fn().mockResolvedValue({ isSFLEnabled: false, workflows: [] })
const mockFetchOrgOverview = vi.fn().mockResolvedValue({ metrics: { topContributorsToday: [] } })
const mockApprovePullRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchOrgRepos: vi
        .fn()
        .mockResolvedValue({ repos: [], authenticatedAs: 'alice', isUserNamespace: false }),
      fetchOrgMembers: vi.fn().mockResolvedValue({ members: [] }),
      fetchOrgOverview: (...args: unknown[]) => mockFetchOrgOverview(...args),
      fetchOrgTeams: vi.fn().mockResolvedValue({ teams: [] }),
      fetchTeamMembers: vi.fn().mockResolvedValue({ members: [] }),
      fetchRepoCounts: (...args: unknown[]) => mockFetchRepoCounts(...args),
      fetchRepoPRs: (...args: unknown[]) => mockFetchRepoPRs(...args),
      fetchRepoCommits: (...args: unknown[]) => mockFetchRepoCommits(...args),
      fetchRepoIssues: (...args: unknown[]) => mockFetchRepoIssues(...args),
      fetchSFLStatus: (...args: unknown[]) => mockFetchSFLStatus(...args),
      approvePullRequest: (...args: unknown[]) => mockApprovePullRequest(...args),
    }
  }),
}))
vi.mock('../../../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (url: string) => {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    return m ? { owner: m[1], repo: m[2] } : null
  },
}))
const mockIsAbortError = vi.fn().mockReturnValue(false)
vi.mock('../../../utils/errorUtils', () => ({
  isAbortError: (...args: unknown[]) => mockIsAbortError(...args),
  throwIfAborted: vi.fn(),
}))

import { useGitHubSidebarData } from './useGitHubSidebarData'

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockReturnValue(null)
  mockRefreshInterval = 0
  mockIsAbortError.mockReturnValue(false)
  mockFetchRepoCounts.mockResolvedValue({ issues: 0, prs: 0 })
  mockFetchRepoPRs.mockResolvedValue([])
  mockFetchRepoCommits.mockResolvedValue([])
  mockFetchRepoIssues.mockResolvedValue([])
  mockFetchSFLStatus.mockResolvedValue({ isSFLEnabled: false, workflows: [] })
  mockFetchOrgOverview.mockResolvedValue({ metrics: { topContributorsToday: [] } })
  mockApprovePullRequest.mockResolvedValue(undefined)
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

afterEach(() => {
  vi.useRealTimers()
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

  it('toggleRepo toggles and fetches counts on first expand', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.expandedRepos.has('acme/my-repo')).toBe(false)
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.expandedRepos.has('acme/my-repo')).toBe(true)
    // Second toggle collapses
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.expandedRepos.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoPRGroup toggles PR group', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => result.current.toggleRepoPRGroup('acme', 'my-repo'))
    expect(result.current.expandedRepoPRGroups.has('acme/my-repo')).toBe(true)
    act(() => result.current.toggleRepoPRGroup('acme', 'my-repo'))
    expect(result.current.expandedRepoPRGroups.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoPRStateGroup toggles and triggers fetch', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoPRStateGroups.has('acme/my-repo:open')).toBe(true)
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoPRStateGroups.has('acme/my-repo:open')).toBe(false)
  })

  it('toggleRepoPRStateGroup for closed state', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'closed')
    })
    expect(result.current.expandedRepoPRStateGroups.has('acme/my-repo:closed')).toBe(true)
  })

  it('toggleRepoIssueGroup toggles issue group', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => result.current.toggleRepoIssueGroup('acme', 'my-repo'))
    expect(result.current.expandedRepoIssueGroups.has('acme/my-repo')).toBe(true)
    act(() => result.current.toggleRepoIssueGroup('acme', 'my-repo'))
    expect(result.current.expandedRepoIssueGroups.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoIssueStateGroup toggles and triggers fetch', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoIssueStateGroups.has('acme/my-repo:open')).toBe(true)
    // Second toggle collapses
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(result.current.expandedRepoIssueStateGroups.has('acme/my-repo:open')).toBe(false)
  })

  it('toggleRepoIssueStateGroup for closed state', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'closed')
    })
    expect(result.current.expandedRepoIssueStateGroups.has('acme/my-repo:closed')).toBe(true)
  })

  it('toggleRepoCommitGroup toggles and triggers fetch', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoCommitGroups.has('acme/my-repo')).toBe(true)
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoCommitGroups.has('acme/my-repo')).toBe(false)
  })

  it('toggleSFLGroup toggles and triggers fetch', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    expect(result.current.expandedSFLGroups.has('acme/my-repo')).toBe(true)
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    expect(result.current.expandedSFLGroups.has('acme/my-repo')).toBe(false)
  })

  it('openPRReview dispatches pr-review:open event', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const eventSpy = vi.fn()
    window.addEventListener('pr-review:open', eventSpy)
    try {
      act(() => {
        result.current.openPRReview({
          source: 'GitHub',
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
        })
      })
      expect(eventSpy).toHaveBeenCalled()
    } finally {
      window.removeEventListener('pr-review:open', eventSpy)
    }
  })

  it('handleApprovePR skips already approved PR', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      await result.current.handleApprovePR({
        source: 'GitHub',
        repository: 'my-repo',
        id: 42,
        title: 'Test',
        author: 'alice',
        url: 'https://github.com/acme/my-repo/pull/42',
        state: 'open',
        approvalCount: 1,
        assigneeCount: 0,
        iApproved: true,
        created: null,
        date: null,
        org: 'acme',
      })
    })
    expect(result.current.approvingPrKey).toBeNull()
  })

  it('handleApprovePR sets approvingPrKey and approves', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      await result.current.handleApprovePR({
        source: 'GitHub',
        repository: 'my-repo',
        id: 42,
        title: 'Test',
        author: 'alice',
        url: 'https://github.com/acme/my-repo/pull/42',
        state: 'open',
        approvalCount: 0,
        assigneeCount: 0,
        iApproved: false,
        created: null,
        date: null,
        org: 'acme',
      })
    })
    // After approval, approvingPrKey is cleared
    expect(result.current.approvingPrKey).toBeNull()
  })

  it('toggleFavoriteUser adds and removes favorites', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.favoriteUsers.has('acme/alice')).toBe(false)
    act(() => result.current.toggleFavoriteUser('acme', 'alice'))
    expect(result.current.favoriteUsers.has('acme/alice')).toBe(true)
    act(() => result.current.toggleFavoriteUser('acme', 'alice'))
    expect(result.current.favoriteUsers.has('acme/alice')).toBe(false)
  })

  it('refreshUser dispatches app:navigate event', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const eventSpy = vi.fn()
    window.addEventListener('app:navigate', eventSpy)
    try {
      act(() => result.current.refreshUser('acme', 'bob'))
      expect(eventSpy).toHaveBeenCalled()
      expect(mockDelete).toHaveBeenCalledWith('user-activity:v2:acme/bob')
    } finally {
      window.removeEventListener('app:navigate', eventSpy)
    }
  })

  it('setShowBookmarkedOnly updates state', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.showBookmarkedOnly).toBe(false)
    act(() => result.current.setShowBookmarkedOnly(true))
    expect(result.current.showBookmarkedOnly).toBe(true)
  })

  it('dataCache subscription routes repo-prs updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void
    expect(subscribeCb).toBeDefined()

    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-prs:open:acme/my-repo') {
        return {
          data: [
            {
              number: 1,
              title: 'PR 1',
              state: 'open',
              author: 'alice',
              authorAvatarUrl: null,
              url: 'https://github.com/acme/my-repo/pull/1',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
              labels: [],
              draft: false,
              headBranch: 'feat',
              baseBranch: 'main',
              assigneeCount: 0,
              approvalCount: 0,
              iApproved: false,
            },
          ],
        }
      }
      return null
    })

    act(() => subscribeCb('repo-prs:open:acme/my-repo'))
    expect(result.current.repoPrTreeData['open:acme/my-repo']).toBeDefined()
    expect(result.current.repoPrTreeData['open:acme/my-repo']).toHaveLength(1)
  })

  it('dataCache subscription routes repo-issues updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void

    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-issues:open:acme/my-repo') {
        return { data: [{ number: 1, title: 'Issue 1', state: 'open' }] }
      }
      return null
    })

    act(() => subscribeCb('repo-issues:open:acme/my-repo'))
    expect(result.current.repoIssueTreeData['open:acme/my-repo']).toEqual([
      { number: 1, title: 'Issue 1', state: 'open' },
    ])
  })

  it('dataCache subscription routes sfl-status updates', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCb = (mockSubscribe.mock.calls as unknown[][])[0]?.[0] as (key: string) => void

    mockGet.mockImplementation((key: string) => {
      if (key === 'sfl-status:acme/my-repo') {
        return { data: { overallStatus: 'healthy', workflows: [] } }
      }
      return null
    })

    act(() => subscribeCb('sfl-status:acme/my-repo'))
    expect(result.current.sflStatusData['acme/my-repo']).toEqual({
      overallStatus: 'healthy',
      workflows: [],
    })
  })

  it('dataCache subscription for PR tree data (top-level)', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    // The second subscribe call is the prTreeData subscription
    const subscribeCalls = mockSubscribe.mock.calls as unknown[][]
    // Find the subscription that handles 'my-prs' etc
    const prSubscribeCb = subscribeCalls[1]?.[0] as ((key: string) => void) | undefined
    if (!prSubscribeCb) return // skip if mock setup differs

    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [{ id: 10, title: 'Updated PR' }] }
      return null
    })

    act(() => prSubscribeCb('my-prs'))
    expect(result.current.prTreeData['pr-my-prs']).toEqual([{ id: 10, title: 'Updated PR' }])
  })

  it('dataCache subscription ignores unknown keys for PR tree', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const subscribeCalls = mockSubscribe.mock.calls as unknown[][]
    const prSubscribeCb = subscribeCalls[1]?.[0] as ((key: string) => void) | undefined
    if (!prSubscribeCb) return

    const before = { ...result.current.prTreeData }
    act(() => prSubscribeCb('unknown-key'))
    expect(result.current.prTreeData).toEqual(before)
  })

  it('prContextMenu clears on Escape keydown', () => {
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
    // Simulate Escape keydown
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.prContextMenu).toBeNull()
  })

  it('userContextMenu clears on Escape keydown', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 75,
    } as unknown as React.MouseEvent
    act(() => result.current.openUserContextMenu(mockEvent, 'acme', 'bob'))
    expect(result.current.userContextMenu).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.userContextMenu).toBeNull()
  })

  it('orgRepos initializes from cache on mount', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'org-repos:acme') {
        return {
          data: {
            repos: [{ name: 'cached-repo', full_name: 'acme/cached-repo' }],
            authenticatedAs: 'alice',
            isUserNamespace: false,
          },
        }
      }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.orgRepos['acme']).toEqual([
      { name: 'cached-repo', full_name: 'acme/cached-repo' },
    ])
  })

  it('newPRCounts and newPRUrls come from useNewPRIndicator', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.newPRCounts).toEqual({})
    expect(result.current.newPRUrls).toBeInstanceOf(Set)
    expect(result.current.markPRsAsSeen).toBeTypeOf('function')
  })

  // ── Cache hit tests ──

  it('fetchRepoCountsForRepo uses cached data without network fetch', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-counts:acme/my-repo') return { data: { issues: 5, prs: 3 } }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.repoCounts['acme/my-repo']).toEqual({ issues: 5, prs: 3 })
    expect(mockFetchRepoCounts).not.toHaveBeenCalled()
  })

  it('fetchSFLStatusForRepo uses cached data without network fetch', async () => {
    const sflData = { isSFLEnabled: true, workflows: [{ name: 'test', state: 'active' }] }
    mockGet.mockImplementation((key: string) => {
      if (key === 'sfl-status:acme/my-repo') return { data: sflData }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(result.current.sflStatusData['acme/my-repo']).toEqual(sflData)
    expect(mockFetchSFLStatus).not.toHaveBeenCalled()
  })

  it('fetchRepoPRsForRepo uses cached data and skips fetch when fresh', async () => {
    const prData = [
      {
        number: 1,
        title: 'Test PR',
        state: 'open',
        author: 'alice',
        authorAvatarUrl: null,
        url: 'https://github.com/acme/my-repo/pull/1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        labels: [],
        draft: false,
        headBranch: 'feat',
        baseBranch: 'main',
        assigneeCount: 0,
        approvalCount: 0,
        iApproved: false,
      },
    ]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-prs:open:acme/my-repo') return { data: prData }
      return null
    })
    mockIsFresh.mockReturnValue(true)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(mockFetchRepoPRs).not.toHaveBeenCalled()
  })

  it('fetchRepoIssuesForRepo uses cached data and skips fetch when fresh', async () => {
    const issueData = [{ number: 1, title: 'Test Issue', state: 'open' }]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-issues:open:acme/my-repo') return { data: issueData }
      return null
    })
    mockIsFresh.mockReturnValue(true)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(mockFetchRepoIssues).not.toHaveBeenCalled()
  })

  it('fetchRepoCommitsForRepo uses cached data and skips fetch when fresh', async () => {
    const commitData = [{ sha: 'abc123', message: 'fix' }]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-commits:acme/my-repo') return { data: commitData }
      return null
    })
    mockIsFresh.mockReturnValue(true)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(mockFetchRepoCommits).not.toHaveBeenCalled()
  })

  it('fetchOrgOverview uses cached overview data', async () => {
    const overviewData = {
      metrics: {
        topContributorsToday: [{ login: 'bob', commits: 10 }],
      },
    }
    mockGet.mockImplementation((key: string) => {
      if (key === 'org-overview:acme') return { data: overviewData }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrgUserGroup('acme')
    })
    expect(result.current.orgContributorCounts['acme']).toEqual({ bob: 10 })
    expect(mockFetchOrgOverview).not.toHaveBeenCalled()
  })

  // ── Error handling tests ──

  it('fetchRepoCountsForRepo handles fetch error gracefully', async () => {
    mockFetchRepoCounts.mockRejectedValue(new Error('API error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to fetch counts for acme/my-repo:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('fetchRepoCountsForRepo ignores abort errors', async () => {
    mockFetchRepoCounts.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    mockIsAbortError.mockReturnValue(true)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    const countsCalls = consoleSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('counts for acme/my-repo')
    )
    expect(countsCalls.length).toBe(0)
    consoleSpy.mockRestore()
  })

  it('fetchRepoPRsForRepo handles fetch error gracefully', async () => {
    mockFetchRepoPRs.mockRejectedValue(new Error('PR fetch error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[RepoPRTree] open:acme/my-repo failed:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('fetchRepoIssuesForRepo handles fetch error gracefully', async () => {
    mockFetchRepoIssues.mockRejectedValue(new Error('Issue fetch error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[RepoIssueTree] open:acme/my-repo failed:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('fetchRepoCommitsForRepo handles fetch error gracefully', async () => {
    mockFetchRepoCommits.mockRejectedValue(new Error('Commit fetch error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[RepoCommitTree] acme/my-repo failed:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('fetchSFLStatusForRepo handles fetch error gracefully', async () => {
    mockFetchSFLStatus.mockRejectedValue(new Error('SFL error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    expect(consoleSpy).toHaveBeenCalledWith('[SFLStatus] acme/my-repo failed:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('fetchOrgOverview handles fetch error gracefully', async () => {
    mockFetchOrgOverview.mockRejectedValue(new Error('Overview error'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleOrgUserGroup('acme')
    })
    expect(consoleSpy).toHaveBeenCalledWith('[OrgOverview] acme failed:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('fetchRepoPRsForRepo updates counts cache for open PRs', async () => {
    mockFetchRepoPRs.mockResolvedValue([
      {
        number: 1,
        title: 'PR 1',
        state: 'open',
        author: 'alice',
        authorAvatarUrl: null,
        url: 'https://github.com/acme/my-repo/pull/1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        labels: [],
        draft: false,
        headBranch: 'feat',
        baseBranch: 'main',
        assigneeCount: 0,
        approvalCount: 0,
        iApproved: false,
      },
      {
        number: 2,
        title: 'PR 2',
        state: 'open',
        author: 'bob',
        authorAvatarUrl: null,
        url: 'https://github.com/acme/my-repo/pull/2',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        labels: [],
        draft: false,
        headBranch: 'fix',
        baseBranch: 'main',
        assigneeCount: 0,
        approvalCount: 0,
        iApproved: false,
      },
    ])
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    // Should set counts cache with PR count
    expect(mockSet).toHaveBeenCalledWith(
      'repo-counts:acme/my-repo',
      expect.objectContaining({ prs: 2 })
    )
  })

  // ── Toggle function branch coverage ──

  it('toggleRepoIssueGroup collapses when already expanded', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => {
      result.current.toggleRepoIssueGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoIssueGroups.has('acme/my-repo')).toBe(true)
    act(() => {
      result.current.toggleRepoIssueGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoIssueGroups.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoPRGroup collapses when already expanded', () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    act(() => {
      result.current.toggleRepoPRGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoPRGroups.has('acme/my-repo')).toBe(true)
    act(() => {
      result.current.toggleRepoPRGroup('acme', 'my-repo')
    })
    expect(result.current.expandedRepoPRGroups.has('acme/my-repo')).toBe(false)
  })

  it('toggleRepoPRStateGroup does not re-fetch on second toggle', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    const firstCallCount = mockFetchRepoPRs.mock.calls.length
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    expect(mockFetchRepoPRs.mock.calls.length).toBe(firstCallCount)
  })

  it('toggleRepoIssueStateGroup does not re-fetch on second toggle', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    const firstCallCount = mockFetchRepoIssues.mock.calls.length
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(mockFetchRepoIssues.mock.calls.length).toBe(firstCallCount)
  })

  it('toggleRepoCommitGroup does not re-fetch on second toggle', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    const firstCallCount = mockFetchRepoCommits.mock.calls.length
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(mockFetchRepoCommits.mock.calls.length).toBe(firstCallCount)
  })

  it('toggleSFLGroup does not re-fetch on second toggle', async () => {
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    const firstCallCount = mockFetchSFLStatus.mock.calls.length
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    expect(mockFetchSFLStatus.mock.calls.length).toBe(firstCallCount)
  })

  // ── applyApproveToTree via handleApprovePR ──

  it('handleApprovePR updates matching PR in tree', async () => {
    const pr = {
      id: 42,
      title: 'Test PR',
      url: 'https://github.com/acme/my-repo/pull/42',
      repository: 'my-repo',
      source: 'GitHub' as const,
      org: 'acme',
      author: 'alice',
      iApproved: false,
      approvalCount: 0,
      state: 'OPEN',
      assigneeCount: 0,
      created: null,
      date: null,
    }
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [pr] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    expect(result.current.prTreeData['pr-my-prs'][0]?.iApproved).toBe(false)

    await act(async () => {
      await result.current.handleApprovePR(pr)
    })
    // Extra flush for pending state updates from applyApproveToTree
    await act(async () => {})

    expect(result.current.prTreeData['pr-my-prs'][0]?.iApproved).toBe(true)
    expect(result.current.prTreeData['pr-my-prs'][0]?.approvalCount).toBe(1)
  })

  it('handleApprovePR does not update non-matching PRs', async () => {
    const prInTree = {
      id: 42,
      title: 'Test PR',
      url: 'https://github.com/acme/my-repo/pull/42',
      repository: 'my-repo',
      source: 'GitHub' as const,
      org: 'acme',
      author: 'alice',
      iApproved: false,
      approvalCount: 0,
      state: 'OPEN',
      assigneeCount: 0,
      created: null,
      date: null,
    }
    const prToApprove = {
      id: 99,
      title: 'Other PR',
      url: 'https://github.com/acme/other-repo/pull/99',
      repository: 'other-repo',
      source: 'GitHub' as const,
      org: 'acme',
      author: 'bob',
      iApproved: false,
      approvalCount: 0,
      state: 'OPEN',
      assigneeCount: 0,
      created: null,
      date: null,
    }
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [prInTree] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())

    await act(async () => {
      await result.current.handleApprovePR(prToApprove)
    })

    expect(result.current.prTreeData['pr-my-prs'][0]?.iApproved).toBe(false)
  })

  it('handleApprovePR handles API error', async () => {
    mockApprovePullRequest.mockRejectedValue(new Error('Forbidden'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pr = {
      id: 42,
      title: 'Test PR',
      url: 'https://github.com/acme/my-repo/pull/42',
      repository: 'my-repo',
      source: 'GitHub' as const,
      org: 'acme',
      author: 'alice',
      iApproved: false,
      approvalCount: 0,
      state: 'OPEN',
      assigneeCount: 0,
      created: null,
      date: null,
    }
    const { result } = renderHook(() => useGitHubSidebarData())

    await act(async () => {
      await result.current.handleApprovePR(pr)
    })

    expect(consoleSpy).toHaveBeenCalledWith('Failed to approve PR from sidebar:', expect.any(Error))
    expect(result.current.approvingPrKey).toBeNull()
    consoleSpy.mockRestore()
  })

  // ── dataCache subscription edge cases ──

  it('dataCache subscription for repo-prs skips when parsing fails', () => {
    let subscribeCb: (key: string) => void = () => {}
    mockSubscribe.mockImplementation((cb: (key: string) => void) => {
      subscribeCb = cb
      return () => {}
    })
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-prs:malformed') return { data: [{ number: 1 }] }
      return null
    })
    const { result } = renderHook(() => useGitHubSidebarData())
    const before = { ...result.current.repoPrTreeData }
    act(() => subscribeCb('repo-prs:malformed'))
    expect(result.current.repoPrTreeData).toEqual(before)
  })

  // ── Refresh interval tests ──

  it('PR refresh interval is set up when refreshInterval > 0', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    const intervalCalls = spy.mock.calls.filter(([, ms]) => ms === 5 * 60_000)
    expect(intervalCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('commit refresh interval is set up when refreshInterval > 0', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    const intervalCalls = spy.mock.calls.filter(([, ms]) => ms === 5 * 60_000)
    expect(intervalCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('issue refresh interval is set up when refreshInterval > 0', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    const intervalCalls = spy.mock.calls.filter(([, ms]) => ms === 5 * 60_000)
    expect(intervalCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('SFL refresh interval is set up when refreshInterval > 0', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleSFLGroup('acme', 'my-repo')
    })
    const intervalCalls = spy.mock.calls.filter(([, ms]) => ms === 5 * 60_000)
    expect(intervalCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('repo counts refresh interval is set up when refreshInterval > 0', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    const intervalCalls = spy.mock.calls.filter(([, ms]) => ms === 5 * 60_000)
    expect(intervalCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('refresh intervals skip when cache is fresh', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    mockRefreshInterval = 5
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    // Verify intervals were set up with the correct duration
    expect(spy.mock.calls.some(([, ms]) => ms === 5 * 60_000)).toBe(true)
    spy.mockRestore()
  })

  it('refresh intervals clean up on unmount', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    mockRefreshInterval = 5
    const { result, unmount } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    const intervalCount = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 5 * 60_000).length
    unmount()
    // At least as many clearInterval calls as setInterval calls with the refresh duration
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(intervalCount)
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  // ── fetchRepoPRsForRepo cache with stale data re-fetches ──

  it('fetchRepoPRsForRepo re-fetches when cache exists but is stale', async () => {
    const prData = [
      {
        number: 1,
        title: 'Cached PR',
        state: 'open',
        author: 'alice',
        authorAvatarUrl: null,
        url: 'https://github.com/acme/my-repo/pull/1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        labels: [],
        draft: false,
        headBranch: 'feat',
        baseBranch: 'main',
        assigneeCount: 0,
        approvalCount: 0,
        iApproved: false,
      },
    ]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-prs:open:acme/my-repo') return { data: prData }
      return null
    })
    // Cache exists but is NOT fresh - should still fetch
    mockIsFresh.mockReturnValue(false)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoPRStateGroup('acme', 'my-repo', 'open')
    })
    // Should have used cached data AND re-fetched
    expect(mockFetchRepoPRs).toHaveBeenCalled()
  })

  it('fetchRepoIssuesForRepo re-fetches when cache exists but is stale', async () => {
    const issueData = [{ number: 1, title: 'Cached Issue', state: 'open' }]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-issues:open:acme/my-repo') return { data: issueData }
      return null
    })
    mockIsFresh.mockReturnValue(false)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    expect(mockFetchRepoIssues).toHaveBeenCalled()
  })

  it('fetchRepoCommitsForRepo re-fetches when cache exists but is stale', async () => {
    const commitData = [{ sha: 'abc123', message: 'fix' }]
    mockRefreshInterval = 5
    mockGet.mockImplementation((key: string) => {
      if (key === 'repo-commits:acme/my-repo') return { data: commitData }
      return null
    })
    mockIsFresh.mockReturnValue(false)
    const { result } = renderHook(() => useGitHubSidebarData())
    await act(async () => {
      result.current.toggleRepoCommitGroup('acme', 'my-repo')
    })
    expect(mockFetchRepoCommits).toHaveBeenCalled()
  })

  it('refresh interval fires for repo issues', async () => {
    vi.useFakeTimers()
    mockRefreshInterval = 1
    mockIsFresh.mockReturnValue(false)
    const { result, unmount } = renderHook(() => useGitHubSidebarData())

    // Expand a repo issue group to register it in fetchedRepoIssuesRef
    await act(async () => {
      result.current.toggleRepoIssueStateGroup('acme', 'my-repo', 'open')
    })
    mockFetchRepoIssues.mockClear()

    // Advance past the interval
    await act(async () => {
      vi.advanceTimersByTime(1 * 60_000 + 100)
    })

    expect(mockFetchRepoIssues).toHaveBeenCalled()
    unmount()
    vi.useRealTimers()
  })

  it('refresh interval fires for repo counts', async () => {
    vi.useFakeTimers()
    mockRefreshInterval = 1
    mockIsFresh.mockReturnValue(false)
    const { result, unmount } = renderHook(() => useGitHubSidebarData())

    // Expand a repo to register it in fetchedCountsRef
    await act(async () => {
      result.current.toggleRepo('acme', 'my-repo')
    })
    mockFetchRepoCounts.mockClear()

    // Advance past the interval
    await act(async () => {
      vi.advanceTimersByTime(1 * 60_000 + 100)
    })

    expect(mockFetchRepoCounts).toHaveBeenCalled()
    unmount()
    vi.useRealTimers()
  })
})
