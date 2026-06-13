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

const CRON_FIELD_KEYS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const

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

type ParsedCronFields = {
  [Field in keyof ParsedCron]: CronField | null
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
  const aliasValue = resolveAliasValue(rawValue, aliases)
  if (aliasValue !== null) return aliasValue

  const parsed = parseNumericValue(rawValue)
  if (parsed === null) return null

  return isInRange(parsed, min, max) ? parsed : null
}

function resolveAliasValue(rawValue: string, aliases?: Record<string, number>): number | null {
  if (!aliases) return null

  return aliases[rawValue.toLowerCase().slice(0, 3)] ?? null
}

function parseNumericValue(rawValue: string): number | null {
  if (!/^\d+$/.test(rawValue)) return null

  return Number.parseInt(rawValue, 10)
}

function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

function identityValue(value: number): number {
  return value
}

function parseSegment(
  segment: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  wildcardMax = max
): number[] | null {
  const parts = segment.split('/')
  if (parts.length > 2) return null

  const [rangePart, stepPart] = parts
  const step = parseStep(stepPart)
  if (step === null) return null

  const rangeValues = parseSegmentRange(rangePart, min, max, aliases, wildcardMax)
  if (rangeValues === null) return null

  return rangeValues.filter((_value, index) => index % step === 0)
}

function parseStep(rawStep?: string): number | null {
  if (rawStep === undefined) return 1
  if (rawStep === '') return null

  const step = Number.parseInt(rawStep, 10)
  return Number.isInteger(step) && step >= 1 ? step : null
}

function parseSegmentRange(
  rangePart: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  wildcardMax = max
): number[] | null {
  if (rangePart === '*' || rangePart === '?') {
    return numberRange(min, wildcardMax)
  }

  return parseExplicitRange(rangePart, min, max, aliases)
}

function parseExplicitRange(
  rangePart: string,
  min: number,
  max: number,
  aliases?: Record<string, number>
): number[] | null {
  const parts = rangePart.split('-')
  if (parts.length > 2) return null

  const [startRaw, endRaw] = parts
  const start = parseValue(startRaw, min, max, aliases)
  if (start === null) return null

  const end = parseRangeEnd(endRaw, start, min, max, aliases)
  if (end === null) return null

  return numberRange(start, end)
}

function parseRangeEnd(
  endRaw: string | undefined,
  start: number,
  min: number,
  max: number,
  aliases?: Record<string, number>
): number | null {
  if (endRaw === undefined) return start

  const end = parseValue(endRaw, min, max, aliases)
  if (end === null) return null

  return start <= end ? end : null
}

function parseField(
  rawField: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  normalizeValue: (value: number) => number = identityValue,
  wildcardMax = max
): CronField | null {
  if (!rawField) return null

  const values = parseFieldValues(rawField, min, max, aliases, normalizeValue, wildcardMax)
  if (!values) return null

  return { values, wildcard: isWildcardField(rawField) }
}

function parseFieldValues(
  rawField: string,
  min: number,
  max: number,
  aliases: Record<string, number> | undefined,
  normalizeValue: (value: number) => number,
  wildcardMax = max
): Set<number> | null {
  const values = new Set<number>()
  for (const segment of rawField.split(',')) {
    if (!addSegmentValues(values, segment, min, max, aliases, normalizeValue, wildcardMax))
      return null
  }

  return hasValues(values) ? values : null
}

function isWildcardField(rawField: string): boolean {
  return rawField === '*' || rawField === '?'
}

function addSegmentValues(
  values: Set<number>,
  segment: string,
  min: number,
  max: number,
  aliases: Record<string, number> | undefined,
  normalizeValue: (value: number) => number,
  wildcardMax = max
): boolean {
  if (segment === '') return false

  const segmentValues = parseSegment(segment, min, max, aliases, wildcardMax)
  if (!segmentValues) return false

  for (const value of segmentValues) values.add(normalizeValue(value))
  return true
}

function hasValues(values: Set<number>): boolean {
  return values.size > 0
}

function parseCronExpression(cronExpression: string): ParsedCron | null {
  const expression = PREDEFINED_EXPRESSIONS[cronExpression.trim().toLowerCase()] ?? cronExpression
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  return parseCronParts(parts)
}

function parseCronParts(parts: string[]): ParsedCron | null {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const parsed: ParsedCronFields = {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dayOfMonth: parseField(dayOfMonth, 1, 31),
    month: parseField(month, 1, 12, MONTH_ALIASES),
    dayOfWeek: parseField(dayOfWeek, 0, 7, WEEKDAY_ALIASES, normalizeDayOfWeek, 6),
  }

  return hasAllCronFields(parsed) ? parsed : null
}

function normalizeDayOfWeek(value: number): number {
  return value === 7 ? 0 : value
}

function hasAllCronFields(parsed: ParsedCronFields): parsed is ParsedCron {
  return CRON_FIELD_KEYS.every(field => parsed[field])
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
  if (!canEnumerateCron(fromTimestamp, toTimestamp, maxRuns)) return []

  return safelyEnumerateCron(
    cronExpression,
    timezone,
    fromTimestamp,
    toTimestamp,
    maxRuns,
    includeStart
  )
}

function safelyEnumerateCron(
  cronExpression: string,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns: number,
  includeStart: boolean
): number[] {
  try {
    return enumerateParsedCron(
      cronExpression,
      timezone,
      fromTimestamp,
      toTimestamp,
      maxRuns,
      includeStart
    )
  } catch (_: unknown) {
    return []
  }
}

function enumerateParsedCron(
  cronExpression: string,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns: number,
  includeStart: boolean
): number[] {
  const parsed = parseCronExpression(cronExpression)
  if (!parsed) return []

  return collectCronOccurrences(parsed, timezone, fromTimestamp, toTimestamp, maxRuns, includeStart)
}

function canEnumerateCron(fromTimestamp: number, toTimestamp: number, maxRuns: number): boolean {
  return fromTimestamp < toTimestamp && maxRuns > 0
}

function collectCronOccurrences(
  parsed: ParsedCron,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns: number,
  includeStart: boolean
): number[] {
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
}
