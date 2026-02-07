/**
 * Workers module — task execution engine for Buddy.
 *
 * Exports the dispatcher (start/stop polling) and individual workers.
 */

export { Dispatcher, getDispatcher } from './dispatcher'
export { execWorker } from './execWorker'
export { aiWorker } from './aiWorker'
export { skillWorker } from './skillWorker'
export type { Worker, WorkerResult, JobConfig } from './types'
