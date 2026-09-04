/**
 * React hook for task queue integration.
 *
 * Provides easy access to task queues with automatic cleanup on unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  getTaskQueue,
  type TaskId,
  type TaskOptions,
  type QueueOptions,
  type QueueSnapshot,
} from '../services/taskQueue'

export interface UseTaskQueueResult {
  /**
   * Enqueue a task for execution.
   * The task will be automatically cancelled on component unmount.
   */
  enqueue: <T>(execute: (signal: AbortSignal) => Promise<T>, options?: TaskOptions) => Promise<T>

  /**
   * Cancel a specific task by ID.
   */
  cancel: (taskId: TaskId) => boolean

  /**
   * Cancel all tasks enqueued by this hook instance.
   */
  cancelAll: () => void
}

type EqualityFn<T> = (left: T, right: T) => boolean

interface SelectionInstance<T> {
  hasSelection: boolean
  selection: T | undefined
}

const objectIs: EqualityFn<unknown> = Object.is

/**
 * Hook for interacting with a named task queue.
 *
 * @param queueName The name of the queue (e.g., 'github')
 * @param options Optional queue configuration (only used if queue doesn't exist)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { enqueue, cancelAll } = useTaskQueue('github');
 *
 *   useEffect(() => {
 *     enqueue(async (signal) => {
 *       const response = await fetch('/api/data', { signal });
 *       return response.json();
 *     }).then(setData).catch(console.error);
 *   }, []);
 *
 *   if (isLoading) return <Loading />;
 *   return <DataView data={data} />;
 * }
 * ```
 */
export function useTaskQueue(queueName: string, options?: QueueOptions): UseTaskQueueResult {
  const queue = getTaskQueue(queueName, options)
  const trackedReleases = useMemo(() => new Map<TaskId, Set<() => boolean>>(), [])

  // Cancel all tracked tasks on unmount
  useEffect(() => {
    const trackedTasks = trackedReleases
    return () => {
      for (const releases of trackedTasks.values()) {
        for (const release of releases) release()
      }
      trackedTasks.clear()
    }
  }, [trackedReleases])

  const enqueue = useCallback(
    <T>(execute: (signal: AbortSignal) => Promise<T>, taskOptions?: TaskOptions): Promise<T> => {
      const { taskId, promise, release } = queue.enqueue(execute, taskOptions)
      const releases = trackedReleases.get(taskId) ?? new Set<() => boolean>()
      releases.add(release)
      trackedReleases.set(taskId, releases)

      // Clean up tracking when task completes
      return promise.finally(() => {
        releases.delete(release)
        if (releases.size === 0) trackedReleases.delete(taskId)
      })
    },
    [queue, trackedReleases]
  )

  const cancel = useCallback(
    (taskId: TaskId): boolean => {
      const releases = trackedReleases.get(taskId)
      if (!releases) return queue.cancel(taskId)
      let released = false
      for (const release of releases) released = release() || released
      trackedReleases.delete(taskId)
      return released
    },
    [queue, trackedReleases]
  )

  const cancelAll = useCallback(() => {
    for (const releases of trackedReleases.values()) {
      for (const release of releases) release()
    }
    trackedReleases.clear()
  }, [trackedReleases])

  return useMemo(() => ({ enqueue, cancel, cancelAll }), [cancel, cancelAll, enqueue])
}

/**
 * Subscribe to only the queue fields a component renders. Equal selections
 * retain their previous identity and do not rerender the consumer.
 */
export function useTaskQueueSelector<T>(
  queueName: string,
  selector: (snapshot: QueueSnapshot) => T,
  isEqual: EqualityFn<T> = objectIs as EqualityFn<T>
): T {
  const queue = getTaskQueue(queueName)
  const selectionInstance = useRef<SelectionInstance<T>>({
    hasSelection: false,
    selection: undefined,
  }).current
  const subscribe = useCallback((listener: () => void) => queue.subscribe(listener), [queue])
  const getSelection = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot: QueueSnapshot
    let memoizedSelection: T

    return () => {
      const snapshot = queue.getSnapshot()
      if (hasMemo && Object.is(memoizedSnapshot, snapshot)) {
        return memoizedSelection
      }

      const nextSelection = selector(snapshot)
      if (!hasMemo && selectionInstance.hasSelection) {
        const currentSelection = selectionInstance.selection as T
        if (isEqual(currentSelection, nextSelection)) {
          hasMemo = true
          memoizedSnapshot = snapshot
          memoizedSelection = currentSelection
          return currentSelection
        }
      } else if (hasMemo && isEqual(memoizedSelection, nextSelection)) {
        memoizedSnapshot = snapshot
        return memoizedSelection
      }

      hasMemo = true
      memoizedSnapshot = snapshot
      memoizedSelection = nextSelection
      return nextSelection
    }
  }, [isEqual, queue, selectionInstance, selector])
  const selection = useSyncExternalStore(subscribe, getSelection, getSelection)

  useEffect(() => {
    selectionInstance.hasSelection = true
    selectionInstance.selection = selection
  }, [selection, selectionInstance])

  return selection
}
