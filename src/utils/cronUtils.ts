/**
 * Cron enumeration helpers — pure functions extracted from electron/workers/offlineSync.ts.
 */

import { CronExpressionParser, type CronExpressionOptions } from 'cron-parser'

/**
 * Validate a cron expression (and optional timezone).
 * Throws if the expression cannot be parsed — use this when callers need to
 * distinguish "invalid input" from "no occurrences in range".
 */
export function validateCronExpression(cronExpression: string, timezone?: string): void {
  const options: CronExpressionOptions = {}
  if (timezone) options.tz = timezone
  CronExpressionParser.parse(cronExpression, options)
}

/**
 * Enumerate cron occurrences between two timestamps.
 * Returns timestamps for each occurrence, capped at maxRuns.
 *
 * By default, the start boundary is inclusive: if an occurrence lands exactly
 * on fromTimestamp, it is included in the result set. Pass includeStart = false
 * to preserve strict "after fromTimestamp" semantics.
 */
export function enumerateCronOccurrences(
  cronExpression: string,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns = 100,
  includeStart = true
): number[] {
  if (fromTimestamp >= toTimestamp) return []

  const missed: number[] = []

  try {
    const options: CronExpressionOptions = {
      currentDate: new Date(includeStart ? fromTimestamp - 1 : fromTimestamp),
      endDate: new Date(toTimestamp),
    }
    if (timezone) options.tz = timezone

    const expression = CronExpressionParser.parse(cronExpression, options)

    while (missed.length < maxRuns) {
      try {
        const next = expression.next()
        /* v8 ignore start — endDate prevents this; belt-and-suspenders guard */
        if (next.getTime() > toTimestamp) break
        /* v8 ignore stop */
        missed.push(next.getTime())
      } catch {
        break
      }
    }
  } catch {
    // Invalid cron expressions or options produce no occurrences.
  }

  return missed
}
