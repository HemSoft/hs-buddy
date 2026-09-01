import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { getTaskQueue } from '../services/taskQueue'
import { useTaskQueue, useTaskQueueSelector } from './useTaskQueue'

describe('useTaskQueue', () => {
  it('returns stable queue actions without subscribing to queue state', () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      const { result, rerender } = renderHook(() => useTaskQueue('actions-only'))
      const initialResult = result.current

      rerender()

      expect(result.current).toBe(initialResult)
      expect(result.current).toEqual({
        enqueue: expect.any(Function),
        cancel: expect.any(Function),
        cancelAll: expect.any(Function),
      })
      expect(intervalSpy).not.toHaveBeenCalled()
    } finally {
      intervalSpy.mockRestore()
    }
  })

  it('enqueues and completes a task', async () => {
    const { result } = renderHook(() => useTaskQueue('action-enqueue'))

    await expect(result.current.enqueue(async () => 'done')).resolves.toBe('done')
  })

  it('cancels tracked tasks on unmount', async () => {
    const { result, unmount } = renderHook(() => useTaskQueue('action-unmount'))
    const taskPromise = result.current.enqueue(
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError'))
          )
        })
    )

    unmount()

    await expect(taskPromise).rejects.toThrow('cancelled')
  })

  it('cancelAll cancels every tracked task', async () => {
    const { result } = renderHook(() => useTaskQueue('action-cancel-all', { concurrency: 0 }))
    const first = result.current.enqueue(async () => 'first')
    const second = result.current.enqueue(async () => 'second')

    act(() => result.current.cancelAll())

    await expect(first).rejects.toThrow('Task cancelled')
    await expect(second).rejects.toThrow('Task cancelled')
  })

  it('cancels one task by ID', async () => {
    const queue = getTaskQueue('action-cancel-one', { concurrency: 0 })
    const { result } = renderHook(() => useTaskQueue('action-cancel-one'))
    const { taskId, promise } = queue.enqueue(async () => 'unused')

    expect(result.current.cancel(taskId)).toBe(true)

    await expect(promise).rejects.toThrow('Task cancelled')
  })

  it('does not rerender its caller as queue state changes', async () => {
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useTaskQueue('action-render-count')
    })
    let finishTask: () => void
    const blocker = new Promise<void>(resolve => {
      finishTask = resolve
    })
    let taskPromise: Promise<void>

    act(() => {
      taskPromise = result.current.enqueue(async () => blocker)
    })
    expect(renderCount).toBe(1)

    await act(async () => {
      finishTask!()
      await taskPromise!
    })
    expect(renderCount).toBe(1)
  })
})

describe('useTaskQueueSelector', () => {
  it('rerenders only when the selected field changes', async () => {
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useTaskQueueSelector('selector-count', snapshot => snapshot.runningCount)
    })
    const queue = getTaskQueue('selector-count')
    let finishTask: () => void
    const blocker = new Promise<void>(resolve => {
      finishTask = resolve
    })
    let taskPromise: Promise<void>

    act(() => {
      taskPromise = queue.enqueue(async () => blocker).promise
    })

    expect(result.current).toBe(1)
    expect(renderCount).toBe(2)

    await act(async () => {
      finishTask!()
      await taskPromise!
    })

    expect(result.current).toBe(0)
    expect(renderCount).toBe(3)
  })

  it('preserves selection identity when unrelated queue fields change', () => {
    const queue = getTaskQueue('selector-identity', { concurrency: 0 })
    const equalRunning = (left: { running: number }, right: { running: number }) =>
      left.running === right.running
    const { result } = renderHook(() =>
      useTaskQueueSelector(
        'selector-identity',
        snapshot => ({ running: snapshot.runningCount }),
        equalRunning
      )
    )
    const initial = result.current
    let taskPromise: Promise<unknown>

    act(() => {
      taskPromise = queue.enqueue(async () => 'unused').promise
    })

    expect(result.current).toBe(initial)
    act(() => queue.cancelAll())
    void taskPromise!.catch(() => {})
  })

  it('preserves selection identity when an inline selector is recreated', () => {
    const equalRunning = (left: { running: number }, right: { running: number }) =>
      left.running === right.running
    const { result, rerender } = renderHook(() =>
      useTaskQueueSelector(
        'selector-inline-identity',
        snapshot => ({ running: snapshot.runningCount }),
        equalRunning
      )
    )
    const initial = result.current

    rerender()

    expect(result.current).toBe(initial)
  })
})
