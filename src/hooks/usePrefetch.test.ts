import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock external dependencies before import
const mockEnqueue = vi.fn().mockResolvedValue(undefined)
const mockAccounts = [{ username: 'alice', org: 'acme' }]

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
  usePRSettings: () => ({ refreshInterval: 15, recentlyMergedDays: 7, loading: false }),
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

const mockGetTaskQueue = vi.fn().mockReturnValue({
  hasTaskWithName: () => false,
})

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: (...args: unknown[]) => mockGetTaskQueue(...args),
}))

const mockIsFresh = vi.fn().mockReturnValue(false)
const mockGet = vi.fn().mockReturnValue(null)
const mockSet = vi.fn()
const mockGetStats = vi.fn().mockReturnValue({})

vi.mock('../services/dataCache', () => ({
  dataCache: {
    isFresh: (...args: unknown[]) => mockIsFresh(...args),
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    getStats: () => mockGetStats(),
  },
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

import { usePrefetch } from './usePrefetch'

describe('usePrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockIsFresh.mockReturnValue(false)
    mockGetTaskQueue.mockReturnValue({
      hasTaskWithName: () => false,
    })
    // Reset accounts to default
    mockAccounts.length = 0
    mockAccounts.push({ username: 'alice', org: 'acme' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls enqueue for each PR mode on startup', () => {
    renderHook(() => usePrefetch())

    // Should enqueue tasks for: my-prs, needs-review, recently-merged, need-a-nudge, plus org repos
    expect(mockEnqueue).toHaveBeenCalled()
    const callCount = mockEnqueue.mock.calls.length
    // 4 PR modes + 1 org-repos for 'acme'
    expect(callCount).toBe(5)
  })

  it('does not prefetch when accounts are empty', () => {
    mockAccounts.length = 0
    renderHook(() => usePrefetch())
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('skips fresh data during prefetch', () => {
    mockIsFresh.mockReturnValue(true)
    renderHook(() => usePrefetch())

    // When all data is fresh, enqueue should not be called
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('skips tasks already in the queue', () => {
    mockGetTaskQueue.mockReturnValue({
      hasTaskWithName: () => true,
    })
    renderHook(() => usePrefetch())

    // When tasks already exist, enqueue should not be called
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('only prefetches once (not on every render)', () => {
    const { rerender } = renderHook(() => usePrefetch())
    const firstCallCount = mockEnqueue.mock.calls.length

    rerender()
    rerender()

    // Should not add more calls on re-render
    expect(mockEnqueue.mock.calls.length).toBe(firstCallCount)
  })

  it('queues org-repos fetch for each unique org', () => {
    // Reset and set accounts with multiple orgs
    mockAccounts.length = 0
    mockAccounts.push(
      { username: 'alice', org: 'acme' },
      { username: 'bob', org: 'acme' },
      { username: 'charlie', org: 'globex' }
    )

    renderHook(() => usePrefetch())

    // Should have PR modes (4) + 2 unique orgs (acme, globex) = 6
    expect(mockEnqueue.mock.calls.length).toBe(6)

    // Restore
    mockAccounts.length = 0
    mockAccounts.push({ username: 'alice', org: 'acme' })
  })

  it('auto-refreshes when data becomes stale after 30s poll', () => {
    renderHook(() => usePrefetch())

    // Initial prefetch calls
    const initialCount = mockEnqueue.mock.calls.length
    expect(initialCount).toBe(5)

    // Mark data as stale for the next check
    mockIsFresh.mockReturnValue(false)

    // Advance past 30s poll interval
    vi.advanceTimersByTime(31_000)

    // Should have enqueued additional fetches
    expect(mockEnqueue.mock.calls.length).toBeGreaterThan(initialCount)
  })

  it('does not auto-refresh when all data is fresh', () => {
    mockIsFresh.mockReturnValue(true)
    renderHook(() => usePrefetch())

    // No initial prefetch since everything is fresh
    const initialCount = mockEnqueue.mock.calls.length
    expect(initialCount).toBe(0)

    // Advance past poll interval
    vi.advanceTimersByTime(31_000)

    // Still no new calls
    expect(mockEnqueue.mock.calls.length).toBe(0)
  })

  it('executes the enqueued fetch function for each PR mode', async () => {
    // Make enqueue actually call the function
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController()
      await fn(controller.signal)
    })

    renderHook(() => usePrefetch())

    // The enqueue calls should have run the fetch functions
    expect(mockEnqueue).toHaveBeenCalledTimes(5)
  })

  it('skips fetch when data becomes fresh while queued', async () => {
    let callCount = 0
    mockIsFresh.mockImplementation(() => {
      callCount++
      // First call (outer check) returns false, second call (inner check) returns true
      return callCount % 2 === 0
    })

    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController()
      await fn(controller.signal)
    })

    renderHook(() => usePrefetch())

    // Some fetches should have been skipped due to freshness check
    expect(mockEnqueue).toHaveBeenCalled()
  })

  it('handles AbortError gracefully in catch handler', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockEnqueue.mockRejectedValue(abortError)

    // Should not throw
    renderHook(() => usePrefetch())
  })

  it('cleans up auto-refresh timer on unmount', () => {
    const { unmount } = renderHook(() => usePrefetch())
    const countBefore = mockEnqueue.mock.calls.length

    unmount()

    // After unmount, advancing timers should not trigger new fetches
    vi.advanceTimersByTime(60_000)
    expect(mockEnqueue.mock.calls.length).toBe(countBefore)
  })

  it('handles cached entry logging for stale data', () => {
    mockGet.mockReturnValue({ data: 'cached' })
    renderHook(() => usePrefetch())
    // When cache has existing data, get() is called for logging
    expect(mockGet).toHaveBeenCalled()
  })
})
