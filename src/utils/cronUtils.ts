/**
 * Browser-safe cron enumeration helpers for schedule previews.
 */

const MS_PER_MINUTE = 60_000

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const PREDEFINED_EXPRESSIONS: Record<string, string> = {
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

interface CronField {
  values: Set<number>
  wildcard: boolean
}

interface ParsedCron {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

interface TimeParts {
  minute: number
  hour: number
  dayOfMonth: number
  month: number
  dayOfWeek: number
}

function numberRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function parseValue(
  rawValue: string,
  min: number,
  max: number,
  aliases?: Record<string, number>
): number | null {
  const normalized = rawValue.toLowerCase()
  const aliasValue = aliases?.[normalized.slice(0, 3)]
  if (aliasValue !== undefined) return aliasValue

  if (!/^\d+$/.test(rawValue)) return null

  const parsed = Number.parseInt(rawValue, 10)
  return parsed >= min && parsed <= max ? parsed : null
}

function parseSegment(
  segment: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  wildcardMax = max
): number[] | null {
  const [rangePart, stepPart, extraPart] = segment.split('/')
  if (extraPart !== undefined) return null

  const step = stepPart === undefined ? 1 : Number.parseInt(stepPart, 10)
  if (!Number.isInteger(step) || step < 1 || stepPart === '') return null

  const rangeValues =
    rangePart === '*' || rangePart === '?'
      ? numberRange(min, wildcardMax)
      : parseExplicitRange(rangePart, min, max, aliases)

  if (!rangeValues) return null

  return rangeValues.filter((_value, index) => index % step === 0)
}

function parseExplicitRange(
  rangePart: string,
  min: number,
  max: number,
  aliases?: Record<string, number>
): number[] | null {
  const [startRaw, endRaw, extraPart] = rangePart.split('-')
  if (extraPart !== undefined) return null

  const start = parseValue(startRaw, min, max, aliases)
  if (start === null) return null

  if (endRaw === undefined) return [start]

  const end = parseValue(endRaw, min, max, aliases)
  if (end === null || start > end) return null

  return numberRange(start, end)
}

function parseField(
  rawField: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  normalizeValue: (value: number) => number = value => value,
  wildcardMax = max
): CronField | null {
  if (!rawField) return null

  const values = new Set<number>()
  const wildcard = rawField === '*' || rawField === '?'

  for (const segment of rawField.split(',')) {
    if (segment === '') return null

    const segmentValues = parseSegment(segment, min, max, aliases, wildcardMax)
    if (!segmentValues) return null

    for (const value of segmentValues) values.add(normalizeValue(value))
  }

  return values.size > 0 ? { values, wildcard } : null
}

function parseCronExpression(cronExpression: string): ParsedCron | null {
  const expression = PREDEFINED_EXPRESSIONS[cronExpression.trim().toLowerCase()] ?? cronExpression
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const parsed = {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dayOfMonth: parseField(dayOfMonth, 1, 31),
    month: parseField(month, 1, 12, MONTH_ALIASES),
    dayOfWeek: parseField(dayOfWeek, 0, 7, WEEKDAY_ALIASES, value => (value === 7 ? 0 : value), 6),
  }

  if (!parsed.minute || !parsed.hour || !parsed.dayOfMonth || !parsed.month || !parsed.dayOfWeek) {
    return null
  }

  return parsed as ParsedCron
}

function getTimezoneFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  })
}

function getTimezoneParts(date: Date, timezone: string): TimeParts {
  const formatter = getTimezoneFormatter(timezone)
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(part => [part.type, part.value])
  )
  const weekday = WEEKDAY_ALIASES[parts.weekday.toLowerCase().slice(0, 3)]

  return {
    minute: Number.parseInt(parts.minute, 10),
    hour: Number.parseInt(parts.hour, 10) % 24,
    dayOfMonth: Number.parseInt(parts.day, 10),
    month: Number.parseInt(parts.month, 10),
    dayOfWeek: weekday,
  }
}

function getLocalParts(date: Date): TimeParts {
  return {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dayOfMonth: date.getDate(),
    month: date.getMonth() + 1,
    dayOfWeek: date.getDay(),
  }
}

function getTimeParts(date: Date, timezone: string): TimeParts {
  return timezone ? getTimezoneParts(date, timezone) : getLocalParts(date)
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.values.has(value)
}

function dayMatches(parsed: ParsedCron, parts: TimeParts): boolean {
  const dayOfMonthMatches = fieldMatches(parsed.dayOfMonth, parts.dayOfMonth)
  const dayOfWeekMatches = fieldMatches(parsed.dayOfWeek, parts.dayOfWeek)

  if (!parsed.dayOfMonth.wildcard && !parsed.dayOfWeek.wildcard) {
    return dayOfMonthMatches || dayOfWeekMatches
  }

  return dayOfMonthMatches && dayOfWeekMatches
}

function matchesCron(parsed: ParsedCron, date: Date, timezone: string): boolean {
  const parts = getTimeParts(date, timezone)

  return (
    fieldMatches(parsed.minute, parts.minute) &&
    fieldMatches(parsed.hour, parts.hour) &&
    fieldMatches(parsed.month, parts.month) &&
    dayMatches(parsed, parts)
  )
}

function firstCandidateTimestamp(fromTimestamp: number, includeStart: boolean): number {
  if (includeStart) {
    return Math.ceil(fromTimestamp / MS_PER_MINUTE) * MS_PER_MINUTE
  }

  return Math.floor(fromTimestamp / MS_PER_MINUTE) * MS_PER_MINUTE + MS_PER_MINUTE
}

/**
 * Validate a cron expression and optional timezone.
 * Throws when the expression or timezone cannot be parsed.
 */
export function validateCronExpression(cronExpression: string, timezone?: string): void {
  if (!parseCronExpression(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`)
  }

  if (timezone) {
    getTimezoneFormatter(timezone)
  }
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
    const parsed = parseCronExpression(cronExpression)
    if (!parsed) return []

    const results: number[] = []
    for (
      let timestamp = firstCandidateTimestamp(fromTimestamp, includeStart);
      timestamp <= toTimestamp && results.length < maxRuns;
      timestamp += MS_PER_MINUTE
    ) {
      if (matchesCron(parsed, new Date(timestamp), timezone)) {
        results.push(timestamp)
      }
    }

    return results
  } catch (_: unknown) {
    return []
  }
}
