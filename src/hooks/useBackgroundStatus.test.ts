import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getFriendlyTaskLabel, formatCountdown, formatAge, useBackgroundStatus } from './useBackgroundStatus'

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

describe('getFriendlyTaskLabel', () => {
  it('returns null for null input', () => {
    expect(getFriendlyTaskLabel(null)).toBeNull()
  })

  it('maps known task names', () => {
    expect(getFriendlyTaskLabel('my-prs')).toBe('My PRs')
    expect(getFriendlyTaskLabel('needs-review')).toBe('Needs Review')
    expect(getFriendlyTaskLabel('recently-merged')).toBe('Recently Merged')
    expect(getFriendlyTaskLabel('need-a-nudge')).toBe('Needs a nudge')
  })

  it('maps prefixed task names', () => {
    expect(getFriendlyTaskLabel('org-detail-overview-myorg')).toBe('Org Overview')
    expect(getFriendlyTaskLabel('org-detail-members-myorg')).toBe('Org Members')
    expect(getFriendlyTaskLabel('org-detail-copilot-myorg')).toBe('Org Copilot')
    expect(getFriendlyTaskLabel('refresh-org-myorg')).toBe('Organizations')
  })

  it('returns raw task name for unknown tasks', () => {
    expect(getFriendlyTaskLabel('some-custom-task')).toBe('some-custom-task')
  })
})

describe('formatCountdown', () => {
  it('returns "now" for zero', () => {
    expect(formatCountdown(0)).toBe('now')
  })

  it('returns "now" for negative', () => {
    expect(formatCountdown(-5)).toBe('now')
  })

  it('formats seconds only', () => {
    expect(formatCountdown(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatCountdown(125)).toBe('2m 05s')
  })

  it('pads seconds with leading zero', () => {
    expect(formatCountdown(63)).toBe('1m 03s')
  })

  it('formats exact minute boundary', () => {
    expect(formatCountdown(60)).toBe('1m 00s')
  })
})

describe('formatAge', () => {
  it('returns "just now" for under a minute', () => {
    expect(formatAge(30_000)).toBe('just now')
    expect(formatAge(0)).toBe('just now')
  })

  it('formats minutes', () => {
    expect(formatAge(120_000)).toBe('2m ago')
    expect(formatAge(3_540_000)).toBe('59m ago')
  })

  it('formats hours and minutes', () => {
    expect(formatAge(3_600_000)).toBe('1h 0m ago')
    expect(formatAge(5_400_000)).toBe('1h 30m ago')
    expect(formatAge(7_260_000)).toBe('2h 1m ago')
  })
})

describe('useBackgroundStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
    expect(result.current.activeLabel).toBeNull()
  })

  it('returns syncing phase when tasks are active', () => {
    mockQueue.runningCount = 1
    mockQueue.pendingCount = 2
    mockQueue.getRunningTaskName.mockReturnValue('my-prs')
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.phase).toBe('syncing')
    expect(result.current.activeTasks).toBe(3)
    expect(result.current.activeLabel).toBe('My PRs')
  })

  it('computes countdown from cache entries', () => {
    mockDataCacheGet.mockReturnValue({ fetchedAt: Date.now() - 120_000, data: [] })
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.nextRefreshSecs).toBeDefined()
    expect(result.current.lastRefreshedAt).toBeDefined()
    expect(result.current.lastRefreshedLabel).toBeDefined()
  })

  it('shows null countdown when syncing', () => {
    mockQueue.runningCount = 1
    mockQueue.getRunningTaskName.mockReturnValue('needs-review')
    const { result } = renderHook(() => useBackgroundStatus())
    expect(result.current.nextRefreshSecs).toBeNull()
    expect(result.current.nextRefreshLabel).toBeNull()
  })
})
