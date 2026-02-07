/**
 * Workers module — task execution engine for Buddy.
 *
 * Exports the dispatcher (start/stop polling), individual workers,
 * and offline sync for missed schedule catch-up.
 */

export { Dispatcher, getDispatcher } from './dispatcher'
export { execWorker } from './execWorker'
export { aiWorker } from './aiWorker'
export { skillWorker } from './skillWorker'
export { runOfflineSync } from './offlineSync'
export type { Worker, WorkerResult, JobConfig } from './types'
