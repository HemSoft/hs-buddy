import { v } from 'convex/values'

/** Key used for singleton documents (settings, buddyStats). */
export const SINGLETON_KEY = 'default' as const

/** Returns true when a run or result is still in progress. */
export function isPendingOrRunning(status: string): boolean {
  return status === 'pending' || status === 'running'
}

/** Throw a consistent "not found" error for any Convex table lookup. */
export function notFoundError(table: string, id: string): Error {
  return new Error(`${table} ${id} not found`)
}

// ── Shared Convex validators ──

export const shellValidator = v.union(v.literal('powershell'), v.literal('bash'), v.literal('cmd'))

export const runStatusValidator = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('cancelled')
)

export const copilotResultStatusValidator = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed')
)
