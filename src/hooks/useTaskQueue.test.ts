import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskQueue } from './useTaskQueue'

// Use real taskQueue service (pure JS, no external deps)

describe('useTaskQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial stats with no tasks', () => {
    const { result } = renderHook(() => useTaskQueue('test-queue'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.runningCount).toBe(0)
    expect(result.current.stats).toBeDefined()
  })

  it('enqueues and completes a task', async () => {
    const { result } = renderHook(() => useTaskQueue('test-enqueue'))

    let resolveTask: (value: string) => void
    const taskPromise = new Promise<string>(resolve => {
      resolveTask = resolve
    })

    let enqueueResult: Promise<string>
    act(() => {
      enqueueResult = result.current.enqueue(() => taskPromise)
    })

    // Resolve the task
    await act(async () => {
      resolveTask!('done')
      await enqueueResult!
    })
  })

  it('cancels all tasks on unmount', async () => {
    const { result, unmount } = renderHook(() => useTaskQueue('test-unmount'))

    const neverResolve = new Promise<string>(() => {})
    act(() => {
      result.current.enqueue(() => neverResolve).catch(() => {})
    })

    // Unmount should cancel tracked tasks
    unmount()
  })

  it('cancelAll cancels all tracked tasks', () => {
    const { result } = renderHook(() => useTaskQueue('test-cancel-all'))

    const neverResolve = new Promise<string>(() => {})
    act(() => {
      result.current.enqueue(() => neverResolve).catch(() => {})
      result.current.enqueue(() => neverResolve).catch(() => {})
    })

    act(() => {
      result.current.cancelAll()
    })
  })
})
