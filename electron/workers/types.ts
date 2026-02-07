/**
 * Shared types for the worker dispatch system.
 */

/** Result returned by any worker after execution */
export interface WorkerResult {
  success: boolean
  output?: string
  error?: string
  exitCode?: number
  duration: number // milliseconds
}

/** Job config shape (mirrors Convex schema) */
export interface JobConfig {
  // exec-worker
  command?: string
  cwd?: string
  timeout?: number
  shell?: 'powershell' | 'bash' | 'cmd'
  // ai-worker
  prompt?: string
  model?: string
  maxTokens?: number
  temperature?: number
  // skill-worker
  skillName?: string
  action?: string
  params?: unknown
}

/** Worker interface — every worker type must implement this */
export interface Worker {
  execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult>
}
