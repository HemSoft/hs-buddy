/**
 * React hook for task queue integration.
 *
 * Provides easy access to task queues with automatic cleanup on unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTaskQueue,
  type TaskId,
  type TaskOptions,
  type QueueOptions,
  type QueueStats,
} from '../services/taskQueue'

interface UseTaskQueueResult {
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

  /**
   * Current queue statistics.
   */
  stats: QueueStats

  /**
   * Whether any tasks are currently running or pending in this hook's tracked tasks.
   */
  isLoading: boolean

  /**
   * Number of pending tasks in the queue.
   */
  pendingCount: number

  /**
   * Number of running tasks in the queue.
   */
  runningCount: number
}

/**
 * Hook for interacting with a named task queue.
 *
 * @param queueName The name of the queue (e.g., 'github')
 * @param options Optional queue configuration (only used if queue doesn't exist)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { enqueue, isLoading, cancelAll } = useTaskQueue('github');
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
  const trackedTaskIds = useMemo(() => new Set<TaskId>(), [])
  const [stats, setStats] = useState<QueueStats>(() => queue.getStats())
  const mountedRef = useRef(true)

  // Update stats periodically while there are tracked tasks
  useEffect(() => {
    const updateStats = () => {
      setStats(queue.getStats())
    }

    // Update stats on an interval when there are pending/running tasks
    const interval = setInterval(() => {
      if (trackedTaskIds.size > 0) {
        updateStats()
      }
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [queue, trackedTaskIds])

  // Cancel all tracked tasks on unmount
  useEffect(() => {
    const trackedTasks = trackedTaskIds
    const mounted = mountedRef
    return () => {
      mounted.current = false
      for (const taskId of trackedTasks) {
        queue.cancel(taskId)
      }
      trackedTasks.clear()
    }
  }, [queue, trackedTaskIds])

  const enqueue = useCallback(
    <T>(execute: (signal: AbortSignal) => Promise<T>, taskOptions?: TaskOptions): Promise<T> => {
      const { taskId, promise } = queue.enqueue(execute, taskOptions)
      trackedTaskIds.add(taskId)

      // Update stats immediately
      setStats(queue.getStats())

      // Clean up tracking when task completes
      return promise.finally(() => {
        trackedTaskIds.delete(taskId)
        if (mountedRef.current) {
          setStats(queue.getStats())
        }
      })
    },
    [queue, trackedTaskIds]
  )

  const cancel = useCallback(
    (taskId: TaskId): boolean => {
      const result = queue.cancel(taskId)
      trackedTaskIds.delete(taskId)
      setStats(queue.getStats())
      return result
    },
    [queue, trackedTaskIds]
  )

  const cancelAll = useCallback(() => {
    for (const taskId of trackedTaskIds) {
      queue.cancel(taskId)
    }
    trackedTaskIds.clear()
    setStats(queue.getStats())
  }, [queue, trackedTaskIds])

  return {
    enqueue,
    cancel,
    cancelAll,
    stats,
    isLoading: queue.runningCount > 0,
    pendingCount: queue.pendingCount,
    runningCount: queue.runningCount,
  }
}
