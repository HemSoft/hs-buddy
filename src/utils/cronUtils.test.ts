import { describe, it, expect } from 'vitest'
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
})

describe('validateCronExpression', () => {
  it('does not throw for a valid cron expression', () => {
    expect(() => validateCronExpression('0 * * * *')).not.toThrow()
  })

  it('does not throw for a valid cron with timezone', () => {
    expect(() => validateCronExpression('0 0 * * *', 'America/New_York')).not.toThrow()
  })

  it('throws for an invalid cron expression', () => {
    expect(() => validateCronExpression('INVALID')).toThrow()
  })

  it('accepts cron without timezone parameter', () => {
    expect(() => validateCronExpression('*/5 * * * *')).not.toThrow()
  })
})
