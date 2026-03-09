/**
 * Services index - exports singleton service instances
 */

export {
  TaskQueue,
  getTaskQueue,
  type TaskId,
  type TaskStatus,
  type TaskOptions,
  type QueueOptions,
  type QueueStats,
} from './taskQueue'

export { dataCache, type CacheEntry } from './dataCache'

import { getTaskQueue } from './taskQueue'

/**
 * Pre-configured queue instances for common use cases.
 * Using concurrency of 1 ensures serial execution to prevent rate limiting.
 */

/** Queue for GitHub API operations */
export const githubQueue = getTaskQueue('github', { concurrency: 1 })
