import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockGetRunning = vi.fn<() => string[]>().mockReturnValue([])
const mockGetPending = vi.fn<() => string[]>().mockReturnValue([])

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: () => ({
    getRunningTaskNames: mockGetRunning,
    getPendingTaskNames: mockGetPending,
  }),
}))

import { useRefreshIndicators } from './useRefreshIndicators'

describe('useRefreshIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGetRunning.mockReturnValue([])
    mockGetPending.mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty indicators', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current).toEqual({})
  })

  it('returns object type', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(typeof result.current).toBe('object')
  })

  it('marks running tasks as active', () => {
    mockGetRunning.mockReturnValue(['prefetch-my-prs'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['my-prs']).toBe('active')
  })

  it('marks pending tasks as pending', () => {
    mockGetPending.mockReturnValue(['autorefresh-needs-review'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['needs-review']).toBe('pending')
  })

  it('active overrides pending for the same key', () => {
    mockGetRunning.mockReturnValue(['prefetch-my-prs'])
    mockGetPending.mockReturnValue(['autorefresh-my-prs'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['my-prs']).toBe('active')
  })

  it('strips prefetch- prefix from task names', () => {
    mockGetRunning.mockReturnValue(['prefetch-org-repos:hemsoft'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['org-repos:hemsoft']).toBe('active')
  })

  it('strips autorefresh- prefix from task names', () => {
    mockGetPending.mockReturnValue(['autorefresh-org-repos:relias-engineering'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['org-repos:relias-engineering']).toBe('pending')
  })

  it('passes through task names without known prefix', () => {
    mockGetRunning.mockReturnValue(['unknown-task'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['unknown-task']).toBe('active')
  })

  it('updates indicators on timer tick', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current).toEqual({})

    mockGetRunning.mockReturnValue(['prefetch-my-prs'])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current['my-prs']).toBe('active')
  })

  it('clears indicators when queue becomes empty', () => {
    mockGetRunning.mockReturnValue(['prefetch-my-prs'])
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current['my-prs']).toBe('active')

    mockGetRunning.mockReturnValue([])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toEqual({})
  })

  it('cleans up interval on unmount', () => {
    const { unmount } = renderHook(() => useRefreshIndicators())
    unmount()
    // No error after unmount + timer tick
    act(() => {
      vi.advanceTimersByTime(200)
    })
  })
})
