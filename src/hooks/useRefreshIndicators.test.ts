import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueSnapshot } from '../services/taskQueue'

const queueStore = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  snapshot: null as QueueSnapshot | null,
}))

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: () => ({
    getSnapshot: () => queueStore.snapshot,
    subscribe: (listener: () => void) => {
      queueStore.listeners.add(listener)
      return () => queueStore.listeners.delete(listener)
    },
  }),
}))

import { useRefreshIndicators } from './useRefreshIndicators'

function makeSnapshot(
  runningTaskNames: readonly string[] = [],
  pendingTaskNames: readonly string[] = []
): QueueSnapshot {
  return {
    stats: {
      pending: pendingTaskNames.length,
      running: runningTaskNames.length,
      completed: 0,
      cancelled: 0,
      failed: 0,
    },
    pendingCount: pendingTaskNames.length,
    runningCount: runningTaskNames.length,
    isEmpty: runningTaskNames.length === 0 && pendingTaskNames.length === 0,
    runningTaskName: runningTaskNames[0] ?? null,
    runningTaskNames,
    pendingTaskNames,
  }
}

function emitQueueSnapshot(
  runningTaskNames: readonly string[] = [],
  pendingTaskNames: readonly string[] = []
): void {
  queueStore.snapshot = makeSnapshot(runningTaskNames, pendingTaskNames)
  act(() => {
    for (const listener of queueStore.listeners) listener()
  })
}

beforeEach(() => {
  queueStore.listeners.clear()
  queueStore.snapshot = makeSnapshot()
})

describe('useRefreshIndicators', () => {
  it('starts with empty indicators', () => {
    const { result } = renderHook(() => useRefreshIndicators())
    expect(result.current).toEqual({})
  })

  it('marks running tasks as active and pending tasks as pending', () => {
    queueStore.snapshot = makeSnapshot(['prefetch-my-prs'], ['autorefresh-needs-review'])

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({ 'my-prs': 'active', 'needs-review': 'pending' })
  })

  it('lets active tasks override pending tasks for the same key', () => {
    queueStore.snapshot = makeSnapshot(['prefetch-my-prs'], ['autorefresh-my-prs'])

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['my-prs']).toBe('active')
  })

  it('normalizes account scopes and known task prefixes', () => {
    queueStore.snapshot = makeSnapshot(
      ['prefetch-my-prs:%5Bscope%5D', 'fetch-needs-review'],
      ['autorefresh-org-repos:relias-engineering']
    )

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current).toEqual({
      'my-prs': 'active',
      'needs-review': 'active',
      'org-repos:relias-engineering': 'pending',
    })
  })

  it('passes through task names without a known prefix', () => {
    queueStore.snapshot = makeSnapshot(['unknown-task'])

    const { result } = renderHook(() => useRefreshIndicators())

    expect(result.current['unknown-task']).toBe('active')
  })

  it('updates immediately on semantic queue transitions', () => {
    const { result } = renderHook(() => useRefreshIndicators())

    emitQueueSnapshot(['prefetch-my-prs'])
    expect(result.current).toEqual({ 'my-prs': 'active' })

    emitQueueSnapshot([], ['prefetch-my-prs'])
    expect(result.current).toEqual({ 'my-prs': 'pending' })

    emitQueueSnapshot()
    expect(result.current).toEqual({})
  })

  it('preserves state identity when displayed indicators are unchanged', () => {
    queueStore.snapshot = makeSnapshot(['prefetch-my-prs'])
    const { result } = renderHook(() => useRefreshIndicators())
    const initialIndicators = result.current

    emitQueueSnapshot(['prefetch-my-prs'])

    expect(result.current).toBe(initialIndicators)
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useRefreshIndicators())
    expect(queueStore.listeners.size).toBe(1)

    unmount()

    expect(queueStore.listeners.size).toBe(0)
  })
})
