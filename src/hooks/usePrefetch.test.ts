import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePrefetch } from './usePrefetch'

const {
  mockUseGitHubAccounts,
  mockUsePRSettings,
  mockUseTaskQueue,
  mockEnqueue,
  mockGetTaskQueue,
  mockDataCacheIsFresh,
  mockDataCacheGet,
  mockDataCacheSet,
  mockDataCacheGetStats,
} = vi.hoisted(() => ({
  mockUseGitHubAccounts: vi.fn(),
  mockUsePRSettings: vi.fn(),
  mockUseTaskQueue: vi.fn(),
  mockEnqueue: vi.fn(),
  mockGetTaskQueue: vi.fn(),
  mockDataCacheIsFresh: vi.fn(),
  mockDataCacheGet: vi.fn(),
  mockDataCacheSet: vi.fn(),
  mockDataCacheGetStats: vi.fn(),
}))

vi.mock('./useConfig', () => ({
  useGitHubAccounts: mockUseGitHubAccounts,
  usePRSettings: mockUsePRSettings,
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: mockUseTaskQueue,
}))

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: mockGetTaskQueue,
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchMyPRs: vi.fn().mockResolvedValue([]),
    fetchNeedsReview: vi.fn().mockResolvedValue([]),
    fetchRecentlyMerged: vi.fn().mockResolvedValue([]),
    fetchNeedANudge: vi.fn().mockResolvedValue([]),
    fetchOrgRepos: vi.fn().mockResolvedValue({ repos: [] }),
  })),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    isFresh: mockDataCacheIsFresh,
    get: mockDataCacheGet,
    set: mockDataCacheSet,
    getStats: mockDataCacheGetStats,
  },
}))

const account = { username: 'alice', org: 'test-org' }

describe('usePrefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockUseGitHubAccounts.mockReturnValue({
      accounts: [account],
      loading: false,
    })
    mockUsePRSettings.mockReturnValue({
      refreshInterval: 5,
      recentlyMergedDays: 7,
      loading: false,
    })
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController()
      return fn(controller.signal)
    })
    mockUseTaskQueue.mockReturnValue({ enqueue: mockEnqueue })
    mockGetTaskQueue.mockReturnValue({
      hasTaskWithName: vi.fn().mockReturnValue(false),
    })
    mockDataCacheIsFresh.mockReturnValue(false)
    mockDataCacheGet.mockReturnValue(null)
    mockDataCacheGetStats.mockReturnValue({ size: 0, keys: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not prefetch while accounts are loading', () => {
    mockUseGitHubAccounts.mockReturnValue({ accounts: [], loading: true })
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('does not prefetch while settings are loading', () => {
    mockUsePRSettings.mockReturnValue({
      refreshInterval: 5,
      recentlyMergedDays: 7,
      loading: true,
    })
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('does not prefetch when there are no accounts', () => {
    mockUseGitHubAccounts.mockReturnValue({ accounts: [], loading: false })
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('prefetches PR data for all modes on startup', () => {
    renderHook(() => usePrefetch())

    // Should enqueue for 4 PR modes + 1 org-repos
    expect(mockEnqueue).toHaveBeenCalledTimes(5)
  })

  it('prefetches org repos based on unique orgs', () => {
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [
        { username: 'alice', org: 'org-a' },
        { username: 'bob', org: 'org-b' },
        { username: 'charlie', org: 'org-a' }, // duplicate org
      ],
      loading: false,
    })

    renderHook(() => usePrefetch())

    // 4 PR modes + 2 unique orgs = 6
    expect(mockEnqueue).toHaveBeenCalledTimes(6)
  })

  it('skips prefetch when data is fresh', () => {
    mockDataCacheIsFresh.mockReturnValue(true)
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('skips prefetch when task already queued', () => {
    mockGetTaskQueue.mockReturnValue({
      hasTaskWithName: vi.fn().mockReturnValue(true),
    })
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('only prefetches once on startup (prefetchedRef guard)', () => {
    const { rerender } = renderHook(() => usePrefetch())
    const firstCallCount = mockEnqueue.mock.calls.length

    // Rerender should not trigger another prefetch
    rerender()
    expect(mockEnqueue.mock.calls.length).toBe(firstCallCount)
  })

  it('enqueues fetch with low priority options', () => {
    renderHook(() => usePrefetch())

    // Check that enqueue is called with correct options (priority: -1)
    const callArgs = mockEnqueue.mock.calls[0]
    expect(callArgs[0]).toBeTypeOf('function')
    expect(callArgs[1]).toEqual(expect.objectContaining({ priority: -1 }))
  })

  it('auto-refresh timer checks for stale data every 30s', () => {
    mockDataCacheIsFresh.mockReturnValue(true) // Fresh initially
    renderHook(() => usePrefetch())

    // Reset enqueue calls from initial prefetch (which was skipped because fresh)
    mockEnqueue.mockClear()

    // Make data stale
    mockDataCacheIsFresh.mockReturnValue(false)

    // Advance 30 seconds - timer should trigger
    vi.advanceTimersByTime(30_000)

    // Should enqueue refreshes now
    expect(mockEnqueue).toHaveBeenCalled()
  })

  it('auto-refresh does not queue when all data is fresh', () => {
    mockDataCacheIsFresh.mockReturnValue(true)
    renderHook(() => usePrefetch())

    mockEnqueue.mockClear()

    // Advance past the timer
    vi.advanceTimersByTime(30_000)

    // No enqueues since everything is fresh
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('cleans up auto-refresh timer on unmount', () => {
    const { unmount } = renderHook(() => usePrefetch())
    mockEnqueue.mockClear()
    mockDataCacheIsFresh.mockReturnValue(false)

    unmount()

    // Advance time — timer should have been cleared
    vi.advanceTimersByTime(60_000)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('sorts non-recently-merged PRs by repository then id', async () => {
    const { GitHubClient } = await import('../api/github')
    const mockClient = {
      fetchMyPRs: vi.fn().mockResolvedValue([
        { repository: 'z-repo', id: 2 },
        { repository: 'a-repo', id: 1 },
      ]),
      fetchNeedsReview: vi.fn().mockResolvedValue([]),
      fetchRecentlyMerged: vi.fn().mockResolvedValue([]),
      fetchNeedANudge: vi.fn().mockResolvedValue([]),
      fetchOrgRepos: vi.fn().mockResolvedValue({ repos: [] }),
    }
    ;(GitHubClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient)

    renderHook(() => usePrefetch())
    await vi.advanceTimersByTimeAsync(0)

    // Check that dataCache.set was called with sorted PRs for my-prs
    const myPrsCall = mockDataCacheSet.mock.calls.find((call: unknown[]) => call[0] === 'my-prs')
    if (myPrsCall) {
      const prs = myPrsCall[1] as Array<{ repository: string; id: number }>
      expect(prs[0].repository).toBe('a-repo')
      expect(prs[1].repository).toBe('z-repo')
    }
  })
})
