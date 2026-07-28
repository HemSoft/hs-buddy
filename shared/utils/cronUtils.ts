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

function normalizeStandardCronExpression(cronExpression: string): string {
  const normalizedExpression = normalizeCronExpression(cronExpression).trim()
  const fields = normalizedExpression.split(/\s+/)
  if (
    fields.length !== 5 ||
    /(?:^|\s|,)[^,\s]*-[^,\s]*-/.test(normalizedExpression) ||
    hasUnsupportedExtension(fields)
  ) {
    throw new Error(`Invalid cron expression: ${cronExpression}`)
  }

  return normalizedExpression
}

function hasUnsupportedExtension(fields: string[]): boolean {
  const fieldsWithoutWeekdayAliases = fields.map((field, index) =>
    index === 4 ? field.replaceAll(/THU/gi, '') : field
  )
  return (
    fields.some(field => field.includes('#')) ||
    fieldsWithoutWeekdayAliases.some(field => /H/i.test(field)) ||
    fields[2].includes('L') ||
    fields[4].includes('L')
  )
}

function parseCronExpression(cronExpression: string, options: CronExpressionOptions) {
  return CronExpressionParser.parse(normalizeStandardCronExpression(cronExpression), options)
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
