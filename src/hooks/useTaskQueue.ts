/**
 * React hook for task queue integration.
 * 
 * Provides easy access to task queues with automatic cleanup on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTaskQueue,
  type TaskId,
  type TaskOptions,
  type QueueOptions,
  type QueueStats,
} from '../services/taskQueue';

export interface UseTaskQueueResult {
  /**
   * Enqueue a task for execution.
   * The task will be automatically cancelled on component unmount.
   */
  enqueue: <T>(
    execute: (signal: AbortSignal) => Promise<T>,
    options?: TaskOptions
  ) => Promise<T>;

  /**
   * Cancel a specific task by ID.
   */
  cancel: (taskId: TaskId) => boolean;

  /**
   * Cancel all tasks enqueued by this hook instance.
   */
  cancelAll: () => void;

  /**
   * Current queue statistics.
   */
  stats: QueueStats;

  /**
   * Whether any tasks are currently running or pending in this hook's tracked tasks.
   */
  isLoading: boolean;

  /**
   * Number of pending tasks in the queue.
   */
  pendingCount: number;

  /**
   * Number of running tasks in the queue.
   */
  runningCount: number;
}

/**
 * Hook for interacting with a named task queue.
 * 
 * @param queueName The name of the queue (e.g., 'github', 'bitbucket')
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
export function useTaskQueue(
  queueName: string,
  options?: QueueOptions
): UseTaskQueueResult {
  const queue = getTaskQueue(queueName, options);
  const trackedTaskIds = useRef<Set<TaskId>>(new Set());
  const [stats, setStats] = useState<QueueStats>(queue.getStats());
  const mountedRef = useRef(true);

  // Update stats periodically while there are tracked tasks
  useEffect(() => {
    const updateStats = () => {
      if (mountedRef.current) {
        setStats(queue.getStats());
      }
    };

    // Update stats on an interval when there are pending/running tasks
    const interval = setInterval(() => {
      if (trackedTaskIds.current.size > 0) {
        updateStats();
      }
    }, 100);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [queue]);

  // Cancel all tracked tasks on unmount
  useEffect(() => {
    // Capture ref value at effect start per React rules
    const trackedTasks = trackedTaskIds.current;
    return () => {
      for (const taskId of trackedTasks) {
        queue.cancel(taskId);
      }
      trackedTasks.clear();
    };
  }, [queue]);

  const enqueue = useCallback(
    <T,>(
      execute: (signal: AbortSignal) => Promise<T>,
      taskOptions?: TaskOptions
    ): Promise<T> => {
      const { taskId, promise } = queue.enqueue(execute, taskOptions);
      trackedTaskIds.current.add(taskId);

      // Update stats immediately
      setStats(queue.getStats());

      // Clean up tracking when task completes
      return promise.finally(() => {
        trackedTaskIds.current.delete(taskId);
        if (mountedRef.current) {
          setStats(queue.getStats());
        }
      });
    },
    [queue]
  );

  const cancel = useCallback(
    (taskId: TaskId): boolean => {
      const result = queue.cancel(taskId);
      trackedTaskIds.current.delete(taskId);
      setStats(queue.getStats());
      return result;
    },
    [queue]
  );

  const cancelAll = useCallback(() => {
    for (const taskId of trackedTaskIds.current) {
      queue.cancel(taskId);
    }
    trackedTaskIds.current.clear();
    setStats(queue.getStats());
  }, [queue]);

  return {
    enqueue,
    cancel,
    cancelAll,
    stats,
    isLoading: queue.runningCount > 0,
    pendingCount: queue.pendingCount,
    runningCount: queue.runningCount,
  };
}

/**
 * Hook that tracks loading state for a specific task.
 * Useful when you need to track loading for a single operation.
 */
export function useQueuedTask<T>(
  queueName: string,
  execute: (signal: AbortSignal) => Promise<T>,
  options?: TaskOptions & { enabled?: boolean }
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const { enqueue, cancelAll } = useTaskQueue(queueName);
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const enabled = options?.enabled ?? true;

  const fetchData = useCallback(() => {
    if (!enabled) return;

    setIsLoading(true);
    setError(undefined);

    enqueue(execute, options)
      .then((result) => {
        setData(result);
        setError(undefined);
      })
      .catch((err) => {
        // Don't set error for cancellations
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [enqueue, execute, enabled, options]);

  useEffect(() => {
    fetchData();
    return () => cancelAll();
  }, [fetchData, cancelAll]);

  return {
    data,
    error,
    isLoading,
    refetch: fetchData,
  };
}

export default useTaskQueue;
