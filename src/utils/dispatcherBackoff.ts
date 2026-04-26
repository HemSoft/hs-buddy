/**
 * Pure helpers for exponential backoff and error-logging policy.
 *
 * Extracted from electron/workers/dispatcher.ts so the math
 * and policy logic is testable without timers or I/O.
 */

/** Calculate backoff duration in ms for the given error count. */
export function calculateBackoffMs(
  consecutiveErrors: number,
  baseInterval: number,
  maxBackoff: number
): number {
  if (consecutiveErrors <= 0) return 0
  return Math.min(baseInterval * Math.pow(2, consecutiveErrors - 1), maxBackoff)
}

/** Returns true when the dispatcher should skip this poll cycle due to backoff. */
export function isInBackoffWindow(
  consecutiveErrors: number,
  lastErrorTime: number,
  baseInterval: number,
  maxBackoff: number,
  now: number
): boolean {
  if (consecutiveErrors <= 0) return false
  const backoff = calculateBackoffMs(consecutiveErrors, baseInterval, maxBackoff)
  return now < lastErrorTime + backoff
}

/**
 * Returns true when a dispatcher error should be logged.
 * Policy: log the first error and every 6th after (≈ once per minute at 10s interval).
 */
export function shouldLogDispatcherError(consecutiveErrors: number): boolean {
  return consecutiveErrors === 1 || consecutiveErrors % 6 === 0
}
