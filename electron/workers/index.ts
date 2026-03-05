/**
 * Workers module — task execution engine for Buddy.
 *
 * Exports the dispatcher (start/stop polling), individual workers,
 * and offline sync for missed schedule catch-up.
 */

export { getDispatcher } from './dispatcher'
export { runOfflineSync } from './offlineSync'
export type { Worker, WorkerResult, JobConfig } from './types'
