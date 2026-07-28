import { CronExpressionParser, type CronExpressionOptions } from 'cron-parser'

export const DEFAULT_TIMEZONE = 'America/New_York'

const PREDEFINED_EXPRESSIONS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@minutely': '* * * * *',
  '@weekdays': '0 0 * * 1-5',
  '@weekends': '0 0 * * 0,6',
}

function normalizeCronExpression(cronExpression: string): string {
  return PREDEFINED_EXPRESSIONS[cronExpression.trim().toLowerCase()] ?? cronExpression
}

function parserOptions(timezone?: string): CronExpressionOptions {
  return timezone ? { tz: timezone } : {}
}

function parseCronExpression(cronExpression: string, options: CronExpressionOptions) {
  const normalizedExpression = normalizeCronExpression(cronExpression).trim()
  if (
    normalizedExpression.split(/\s+/).length !== 5 ||
    /(?:^|\s|,)[^,\s]*-[^,\s]*-/.test(normalizedExpression)
  ) {
    throw new Error(`Invalid cron expression: ${cronExpression}`)
  }

  return CronExpressionParser.parse(normalizedExpression, options)
}

/**
 * Calculate the next run time for a cron expression.
 */
export function calculateNextRunAt(
  cronExpression: string,
  timezone?: string,
  fromDate?: Date
): number {
  try {
    const options = parserOptions(timezone)
    if (fromDate) options.currentDate = fromDate

    const expression = parseCronExpression(cronExpression, options)
    return expression.next().getTime()
  } catch (error: unknown) {
    console.error(`Failed to parse cron "${cronExpression}":`, error)
    return Date.now() + 60 * 60 * 1000
  }
}

/**
 * Validate a cron expression and optional timezone.
 * Throws when the expression or timezone cannot be parsed.
 */
export function validateCronExpression(cronExpression: string, timezone?: string): void {
  if (timezone) new Intl.DateTimeFormat(undefined, { timeZone: timezone })
  parseCronExpression(cronExpression, parserOptions(timezone))
}

/**
 * Enumerate cron occurrences between two timestamps.
 * Returns timestamps for each occurrence, capped at maxRuns.
 */
export function enumerateCronOccurrences(
  cronExpression: string,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns = 100,
  includeStart = true
): number[] {
  if (fromTimestamp >= toTimestamp || maxRuns <= 0) return []

  try {
    const options = parserOptions(timezone)
    options.currentDate = new Date(includeStart ? fromTimestamp - 1 : fromTimestamp)
    options.endDate = new Date(toTimestamp)
    const expression = parseCronExpression(cronExpression, options)
    const results: number[] = []

    while (results.length < maxRuns) {
      try {
        results.push(expression.next().getTime())
      } catch (_error: unknown) {
        break
      }
    }

    return results
  } catch (_error: unknown) {
    return []
  }
}
