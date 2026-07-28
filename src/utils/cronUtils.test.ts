import { describe, it, expect } from 'vitest'
import { calculateNextRunAt } from '../../convex/lib/cronUtils'
import { enumerateCronOccurrences, validateCronExpression } from './cronUtils'

describe('enumerateCronOccurrences', () => {
  it('enumerates hourly occurrences within a 3-hour window (inclusive start)', () => {
    // Every hour: "0 * * * *"
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-01T03:00:00Z').getTime()
    const result = enumerateCronOccurrences('0 * * * *', 'UTC', from, to)
    expect(result.length).toBe(4)
    expect(result[0]).toBe(new Date('2025-01-01T00:00:00Z').getTime())
    expect(result[1]).toBe(new Date('2025-01-01T01:00:00Z').getTime())
    expect(result[2]).toBe(new Date('2025-01-01T02:00:00Z').getTime())
    expect(result[3]).toBe(new Date('2025-01-01T03:00:00Z').getTime())
  })

  it('excludes start boundary when includeStart is false', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-01T03:00:00Z').getTime()
    const result = enumerateCronOccurrences('0 * * * *', 'UTC', from, to, 100, false)
    expect(result.length).toBe(3)
    expect(result[0]).toBe(new Date('2025-01-01T01:00:00Z').getTime())
  })

  it('returns empty array when no occurrences in range', () => {
    const from = new Date('2025-01-01T00:01:00Z').getTime()
    const to = new Date('2025-01-01T00:30:00Z').getTime()
    // Every hour — no occurrence between 0:01 and 0:30
    const result = enumerateCronOccurrences('0 * * * *', 'UTC', from, to)
    expect(result).toEqual([])
  })

  it('includes occurrence exactly at fromTimestamp', () => {
    // from is exactly on a cron boundary — it should be included
    const from = new Date('2025-01-01T01:00:00Z').getTime()
    const to = new Date('2025-01-01T01:30:00Z').getTime()
    const result = enumerateCronOccurrences('0 * * * *', 'UTC', from, to)
    expect(result).toEqual([from])
  })

  it('respects maxRuns cap', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-02T00:00:00Z').getTime()
    // Every minute for 24h = 1440 occurrences, cap at 5
    const result = enumerateCronOccurrences('* * * * *', 'UTC', from, to, 5)
    expect(result.length).toBe(5)
  })

  it('defaults maxRuns to 100', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-02T00:00:00Z').getTime()
    const result = enumerateCronOccurrences('* * * * *', 'UTC', from, to)
    expect(result.length).toBe(100)
  })

  it('returns empty array for invalid cron expression', () => {
    const from = Date.now()
    const to = from + 3_600_000
    const result = enumerateCronOccurrences('INVALID', 'UTC', from, to)
    expect(result).toEqual([])
  })

  it('returns empty array when timezone parsing fails', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-01T01:00:00Z').getTime()
    const result = enumerateCronOccurrences('0 * * * *', 'Not/A_Timezone', from, to)
    expect(result).toEqual([])
  })

  it('supports common predefined expressions', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-01T03:00:00Z').getTime()
    const result = enumerateCronOccurrences('@hourly', 'UTC', from, to)

    expect(result).toEqual([
      new Date('2025-01-01T00:00:00Z').getTime(),
      new Date('2025-01-01T01:00:00Z').getTime(),
      new Date('2025-01-01T02:00:00Z').getTime(),
      new Date('2025-01-01T03:00:00Z').getTime(),
    ])
  })

  it('supports timezone parameter', () => {
    // Daily at midnight: "0 0 * * *"
    const from = new Date('2025-06-01T00:00:00-04:00').getTime()
    const to = new Date('2025-06-03T00:00:00-04:00').getTime()
    const result = enumerateCronOccurrences('0 0 * * *', 'America/New_York', from, to)
    expect(result.length).toBeGreaterThanOrEqual(1)
    for (const ts of result) {
      expect(ts).toBeGreaterThanOrEqual(from)
      expect(ts).toBeLessThanOrEqual(to)
    }
  })

  it('handles empty timezone by omitting tz option', () => {
    const from = new Date('2025-01-01T00:00:00Z').getTime()
    const to = new Date('2025-01-01T02:00:00Z').getTime()
    const result = enumerateCronOccurrences('0 * * * *', '', from, to)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty when from equals to', () => {
    const ts = new Date('2025-01-01T00:00:00Z').getTime()
    const result = enumerateCronOccurrences('* * * * *', 'UTC', ts, ts)
    expect(result).toEqual([])
  })

  it('returns empty when from is after to', () => {
    const from = new Date('2025-01-01T02:00:00Z').getTime()
    const to = new Date('2025-01-01T01:00:00Z').getTime()
    const result = enumerateCronOccurrences('* * * * *', 'UTC', from, to)
    expect(result).toEqual([])
  })

  it('normalizes day-of-week 7 to Sunday', () => {
    const from = new Date('2025-01-05T00:00:00Z').getTime()
    const to = new Date('2025-01-05T00:01:00Z').getTime()
    const result = enumerateCronOccurrences('0 0 * * 7', 'UTC', from, to)
    expect(result).toEqual([from])
  })

  it('matches either day field when both day fields are restricted', () => {
    const from = new Date('2025-01-15T00:00:00Z').getTime()
    const to = new Date('2025-01-15T00:01:00Z').getTime()
    const result = enumerateCronOccurrences('0 0 15 * 1', 'UTC', from, to)
    expect(result).toEqual([from])
  })

  it('enumerates cron expressions with month and weekday aliases', () => {
    const from = new Date('2025-01-06T00:00:00Z').getTime()
    const to = new Date('2025-01-06T00:01:00Z').getTime()
    const result = enumerateCronOccurrences('0 0 * jan mon', 'UTC', from, to)
    expect(result).toEqual([from])
  })

  it('does not match when both restricted day fields miss', () => {
    const from = new Date('2025-01-16T00:00:00Z').getTime()
    const to = new Date('2025-01-16T00:01:00Z').getTime()
    const result = enumerateCronOccurrences('0 0 15 * 1', 'UTC', from, to)
    expect(result).toEqual([])
  })

  it.each([
    {
      expression: '30 1 * * *',
      from: '2026-11-01T04:00:00Z',
      to: '2026-11-01T08:00:00Z',
      expected: '2026-11-01T05:30:00.000Z',
    },
    {
      expression: '30 2 * * *',
      from: '2027-03-14T05:00:00Z',
      to: '2027-03-14T09:00:00Z',
      expected: '2027-03-14T07:30:00.000Z',
    },
  ])(
    'agrees with calculateNextRunAt across the US DST transition for $expression',
    ({ expression, from, to, expected }) => {
      const timezone = 'America/New_York'
      const fromTimestamp = Date.parse(from)
      const occurrences = enumerateCronOccurrences(
        expression,
        timezone,
        fromTimestamp,
        Date.parse(to),
        100,
        false
      )

      expect(occurrences).toEqual([Date.parse(expected)])
      expect(calculateNextRunAt(expression, timezone, new Date(fromTimestamp))).toBe(occurrences[0])
    }
  )

  it('enumerates a monthly expression over 30 days in under 100 ms', () => {
    const from = Date.parse('2026-01-01T00:00:00Z')
    const start = performance.now()

    enumerateCronOccurrences(
      '0 3 1 * *',
      'America/New_York',
      from,
      from + 30 * 24 * 60 * 60 * 1000,
      500,
      false
    )

    expect(performance.now() - start).toBeLessThan(100)
  })

  it.each([
    '@yearly',
    '@annually',
    '@monthly',
    '@weekly',
    '@daily',
    '@hourly',
    '@minutely',
    '@weekdays',
    '@weekends',
  ])('keeps %s consistent with calculateNextRunAt', expression => {
    const from = Date.parse('2025-01-01T00:01:00Z')
    const occurrences = enumerateCronOccurrences(
      expression,
      'UTC',
      from,
      Date.parse('2026-01-02T00:00:00Z'),
      1,
      false
    )

    expect(occurrences).toHaveLength(1)
    expect(calculateNextRunAt(expression, 'UTC', new Date(from))).toBe(occurrences[0])
  })
})

describe('validateCronExpression', () => {
  it('does not throw for a valid cron expression', () => {
    expect(() => validateCronExpression('0 * * * *')).not.toThrow()
  })

  it('does not throw for a valid cron with timezone', () => {
    expect(() => validateCronExpression('0 0 * * *', 'America/New_York')).not.toThrow()
  })

  it('throws for an invalid timezone', () => {
    expect(() => validateCronExpression('0 0 * * *', 'Not/A_Timezone')).toThrow()
  })

  it('throws for an invalid cron expression', () => {
    expect(() => validateCronExpression('INVALID')).toThrow()
  })

  it('accepts cron without timezone parameter', () => {
    expect(() => validateCronExpression('*/5 * * * *')).not.toThrow()
  })

  it('accepts common predefined expressions', () => {
    expect(() => validateCronExpression('@daily')).not.toThrow()
  })

  it('accepts surrounding whitespace on a valid five-field expression', () => {
    expect(() => validateCronExpression(' 0 * * * * ')).not.toThrow()
  })

  it('rejects a four-field expression', () => {
    expect(() => validateCronExpression('* * * *')).toThrow()
  })

  it('accepts aliases, question wildcards, ranges, and stepped ranges', () => {
    expect(() => validateCronExpression('*/15 9-17 ? jan mon-fri')).not.toThrow()
  })

  it.each([
    '*/0 * * * *',
    '*/ * * * *',
    '*/*/2 * * * *',
    '5-3 * * * *',
    '1-2-3 * * * *',
    '1-nope * * * *',
    '0 0 0 * *',
    '0,,15 * * * *',
    ' * * * *',
    '61 * * * *',
    '0 0 * nope *',
  ])('throws for malformed parser segment %s', cronExpression => {
    expect(() => validateCronExpression(cronExpression)).toThrow()
  })
})
