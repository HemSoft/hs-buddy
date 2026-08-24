import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBackgroundStatus } from './useBackgroundStatus'
import { getFriendlyGitHubTaskLabel } from '../utils/githubTaskNames'

// Mock dependencies for hook tests
const mockQueue = {
  runningCount: 0,
  pendingCount: 0,
  getRunningTaskName: vi.fn((): string | null => null),
  getStats: vi.fn(() => ({ pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 })),
}

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: vi.fn(() => mockQueue),
}))

vi.mock('./useConfig', () => ({
  usePRSettings: vi.fn(() => ({ refreshInterval: 5, loading: false })),
}))

const mockDataCacheGet = vi.fn()
vi.mock('../services/dataCache', () => ({
  dataCache: { get: (...args: unknown[]) => mockDataCacheGet(...args) },
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

describe('useBackgroundStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
    vi.clearAllMocks()
    mockQueue.runningCount = 0
    mockQueue.pendingCount = 0
    mockQueue.getRunningTaskName.mockReturnValue(null)
    mockDataCacheGet.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
    expect(result.current.nextRefreshSecs).toBe(180)
    expect(result.current.nextRefreshLabel).toBe('3m 00s')
    expect(result.current.lastRefreshedAt).toBe(Date.now() - 120_000)
    expect(result.current.lastRefreshedLabel).toBe('2 minutes ago')
  })

  it('falls back to "GitHub data" when running task name is null', () => {
    mockQueue.runningCount = 0
    mockQueue.pendingCount = 1
    mockQueue.getRunningTaskName.mockReturnValue(null)
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.activeTasks).toBe(1)
    expect(result.current.activeLabel).toBe('GitHub data')
  })

  it('shows null countdown when syncing', () => {
    mockQueue.runningCount = 1
    mockQueue.getRunningTaskName.mockReturnValue('needs-review')
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.nextRefreshSecs).toBeNull()
    expect(result.current.nextRefreshLabel).toBeNull()
  })
})
