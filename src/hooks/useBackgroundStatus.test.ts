import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBackgroundStatus } from './useBackgroundStatus'
import { getFriendlyGitHubTaskLabel } from '../utils/githubTaskNames'
import type { QueueSnapshot } from '../services/taskQueue'

// Mock dependencies for hook tests
const queueListeners = new Set<() => void>()
let queueSnapshot: QueueSnapshot
const mockQueue = {
  runningCount: 0,
  pendingCount: 0,
  getRunningTaskName: vi.fn((): string | null => null),
  getStats: vi.fn(() => ({ pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 })),
  getSnapshot: () => queueSnapshot,
  subscribe: (listener: () => void) => {
    queueListeners.add(listener)
    return () => queueListeners.delete(listener)
  },
}

function makeQueueSnapshot(): QueueSnapshot {
  const runningTaskName = mockQueue.getRunningTaskName()
  const runningTaskNames = runningTaskName ? [runningTaskName] : []
  return {
    stats: {
      pending: mockQueue.pendingCount,
      running: mockQueue.runningCount,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    pendingCount: mockQueue.pendingCount,
    runningCount: mockQueue.runningCount,
    isEmpty: mockQueue.pendingCount === 0 && mockQueue.runningCount === 0,
    runningTaskName,
    runningTaskNames,
    pendingTaskNames: [],
  }
}

function refreshQueueSnapshot(): void {
  queueSnapshot = makeQueueSnapshot()
}

function emitQueueChange(): void {
  refreshQueueSnapshot()
  act(() => {
    for (const listener of queueListeners) listener()
  })
}

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: vi.fn(() => mockQueue),
}))

const { mockUseGitHubAccounts } = vi.hoisted(() => ({ mockUseGitHubAccounts: vi.fn() }))
vi.mock('./useConfig', () => ({
  usePRSettings: vi.fn(() => ({ refreshInterval: 5, loading: false })),
  useGitHubAccounts: mockUseGitHubAccounts,
}))

const mockDataCacheGet = vi.fn()
const cacheListeners = new Set<(key: string) => void>()
vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockDataCacheGet(...args),
    subscribe: (listener: (key: string) => void) => {
      cacheListeners.add(listener)
      return () => cacheListeners.delete(listener)
    },
  },
}))

describe('getFriendlyGitHubTaskLabel', () => {
  it('returns null for null input', () => {
    expect(getFriendlyGitHubTaskLabel(null)).toBeNull()
  })

  it('maps known task names', () => {
    expect(getFriendlyGitHubTaskLabel('my-prs')).toBe('My PRs')
    expect(getFriendlyGitHubTaskLabel('needs-review')).toBe('Needs Review')
    expect(getFriendlyGitHubTaskLabel('recently-merged')).toBe('Recently Merged')
    expect(getFriendlyGitHubTaskLabel('need-a-nudge')).toBe('Needs a nudge')
  })

  it('maps prefixed task names', () => {
    expect(getFriendlyGitHubTaskLabel('org-detail-overview-myorg')).toBe('Org Overview')
    expect(getFriendlyGitHubTaskLabel('org-detail-members-myorg')).toBe('Org Members')
    expect(getFriendlyGitHubTaskLabel('org-detail-copilot-myorg')).toBe('Org Copilot')
    expect(getFriendlyGitHubTaskLabel('refresh-org-myorg')).toBe('Organizations')
  })

  it('normalizes an encoded account-scoped PR task name', () => {
    const encodedScope =
      '%5B%22%5B%5C%22fhemmerrelias%5C%22%2C%5C%22relias-engineering%5C%22%5D%22%5D'
    expect(getFriendlyGitHubTaskLabel(`autorefresh-recently-merged:${encodedScope}`)).toBe(
      'Recently Merged'
    )
  })

  it('maps an interactive PR fetch to its mode label', () => {
    expect(getFriendlyGitHubTaskLabel('fetch-needs-review')).toBe('Needs Review')
  })

  it('uses a safe generic label for unknown tasks', () => {
    expect(getFriendlyGitHubTaskLabel('internal-task:%5Bsecret-payload%5D')).toBe('GitHub data')
  })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
  vi.clearAllMocks()
  mockQueue.runningCount = 0
  mockQueue.pendingCount = 0
  mockQueue.getRunningTaskName.mockReturnValue(null)
  queueListeners.clear()
  cacheListeners.clear()
  refreshQueueSnapshot()
  mockDataCacheGet.mockReturnValue(null)
  mockUseGitHubAccounts.mockReturnValue({
    accounts: [{ username: 'alice', org: 'hemsoft' }],
    loading: false,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBackgroundStatus derivation', () => {
  it('returns idle phase when no tasks running', () => {
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.phase).toBe('idle')
    expect(result.current.activeTasks).toBe(0)
    expect(result.current.runningTasks).toBe(0)
    expect(result.current.queuedTasks).toBe(0)
    expect(result.current.activeLabel).toBeNull()
  })

  it('returns syncing phase when tasks are active', () => {
    mockQueue.runningCount = 1
    mockQueue.pendingCount = 2
    mockQueue.getRunningTaskName.mockReturnValue('my-prs')
    refreshQueueSnapshot()
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.phase).toBe('syncing')
    expect(result.current.activeTasks).toBe(3)
    expect(result.current.runningTasks).toBe(1)
    expect(result.current.queuedTasks).toBe(2)
    expect(result.current.activeLabel).toBe('My PRs')
  })

  it('computes countdown from cache entries', () => {
    mockDataCacheGet.mockReturnValue({ fetchedAt: Date.now() - 120_000, data: [] })
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.nextRefreshAt).toBe(Date.now() + 180_000)
    expect(result.current.lastRefreshedAt).toBe(Date.now() - 120_000)
  })

  it('falls back to "GitHub data" when running task name is null', () => {
    mockQueue.runningCount = 0
    mockQueue.pendingCount = 1
    mockQueue.getRunningTaskName.mockReturnValue(null)
    refreshQueueSnapshot()
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.activeTasks).toBe(1)
    expect(result.current.activeLabel).toBe('GitHub data')
  })

  it('shows null countdown when syncing', () => {
    mockQueue.runningCount = 1
    mockQueue.getRunningTaskName.mockReturnValue('needs-review')
    refreshQueueSnapshot()
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.nextRefreshAt).toBeNull()
  })
})

describe('useBackgroundStatus subscriptions', () => {
  it('preserves stable status identity while only wall-clock time advances', () => {
    mockDataCacheGet.mockReturnValue({ fetchedAt: Date.now() - 120_000, data: [] })
    const { result } = renderHook(() => useBackgroundStatus())
    const initialStatus = result.current

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current).toBe(initialStatus)
  })

  it('updates immediately when queue facts change', () => {
    const { result } = renderHook(() => useBackgroundStatus())

    mockQueue.runningCount = 1
    mockQueue.getRunningTaskName.mockReturnValue('my-prs')
    emitQueueChange()

    expect(result.current).toMatchObject({
      phase: 'syncing',
      activeLabel: 'My PRs',
      activeTasks: 1,
      runningTasks: 1,
    })
  })

  it('updates cache timestamps only for displayed PR cache keys', () => {
    let fetchedAt = Date.now() - 120_000
    mockDataCacheGet.mockImplementation(() => ({ fetchedAt, data: [] }))
    const { result } = renderHook(() => useBackgroundStatus())
    const initialStatus = result.current

    fetchedAt = Date.now() - 60_000
    act(() => {
      for (const listener of cacheListeners) listener('unrelated-key')
    })
    expect(result.current).toBe(initialStatus)

    act(() => {
      for (const listener of cacheListeners) listener('my-prs')
    })
    expect(result.current.lastRefreshedAt).toBe(fetchedAt)
  })

  it('preserves status identity when a cache event does not change displayed facts', () => {
    mockDataCacheGet.mockReturnValue({ fetchedAt: Date.now() - 120_000, data: [] })
    const { result } = renderHook(() => useBackgroundStatus())
    const initialStatus = result.current

    act(() => {
      for (const listener of cacheListeners) listener('my-prs')
    })

    expect(result.current).toBe(initialStatus)
  })

  it('does not create a polling interval', () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() => useBackgroundStatus())

    expect(intervalSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
  })
})
