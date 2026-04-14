import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefreshIndicators } from './useRefreshIndicators'

let runningTasks: string[] = []
let pendingTasks: string[] = []

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: () => ({
    getRunningTaskNames: () => runningTasks,
    getPendingTaskNames: () => pendingTasks,
  }),
}))

describe('useRefreshIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    runningTasks = []
    pendingTasks = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty indicators', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current).toEqual({})
  })

  it('returns same empty object reference when queue stays empty', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    const first = result.current

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe(first)
  })

  it('reports active state for running tasks', () => {
    runningTasks = ['prefetch-my-prs']

    const { result } = renderHook(() => useRefreshIndicators())

    // Initial compute runs immediately
    expect(result.current).toEqual({ 'my-prs': 'active' })
  })

  it('reports pending state for pending tasks', () => {
    pendingTasks = ['autorefresh-needs-review']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({ 'needs-review': 'pending' })
  })

  it('strips prefetch- prefix from task names', () => {
    runningTasks = ['prefetch-recently-merged']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['recently-merged']).toBe('active')
  })

  it('strips autorefresh- prefix from task names', () => {
    runningTasks = ['autorefresh-need-a-nudge']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['need-a-nudge']).toBe('active')
  })

  it('passes through task names without known prefix', () => {
    runningTasks = ['custom-task-name']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['custom-task-name']).toBe('active')
  })

  it('handles org-repos: keys with prefix stripping', () => {
    runningTasks = ['prefetch-org-repos:acme-corp']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['org-repos:acme-corp']).toBe('active')
  })

  it('active takes priority over pending for the same key', () => {
    runningTasks = ['prefetch-my-prs']
    pendingTasks = ['autorefresh-my-prs']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['my-prs']).toBe('active')
  })

  it('reports mixed active and pending states', () => {
    runningTasks = ['prefetch-my-prs']
    pendingTasks = ['prefetch-needs-review']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({
      'my-prs': 'active',
      'needs-review': 'pending',
    })
  })

  it('updates on poll interval when tasks change', () => {
    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({})

    runningTasks = ['prefetch-my-prs']

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toEqual({ 'my-prs': 'active' })
  })

  it('clears indicators when tasks finish', () => {
    runningTasks = ['prefetch-my-prs']

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({ 'my-prs': 'active' })

    runningTasks = []

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toEqual({})
  })
})
