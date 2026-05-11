import { describe, test, expect, vi } from 'vitest'
import { calculateNextRunAt, DEFAULT_TIMEZONE } from '../lib/cronUtils'

describe('lib/cronUtils', () => {
  test('DEFAULT_TIMEZONE is America/New_York', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/New_York')
  })

  test('calculates next run time for a valid cron expression', () => {
    const from = new Date('2025-01-15T10:00:00Z')
    const next = calculateNextRunAt('0 12 * * *', 'UTC', from)

    expect(next).toBeGreaterThan(from.getTime())
  })

  test('uses timezone when provided', () => {
    const from = new Date('2025-01-15T10:00:00Z')
    const next = calculateNextRunAt('0 9 * * *', 'America/New_York', from)

    expect(next).toBeGreaterThan(from.getTime())
  })

  test('works without optional parameters', () => {
    const next = calculateNextRunAt('* * * * *')

    expect(next).toBeGreaterThan(Date.now() - 1000)
  })

  test('returns fallback value for invalid cron expression', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = Date.now()

    const next = calculateNextRunAt('INVALID CRON')

    // Fallback should be approximately 1 hour from now
    expect(next).toBeGreaterThanOrEqual(before + 59 * 60 * 1000)
    expect(next).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse cron'),
      expect.anything()
    )

    consoleSpy.mockRestore()
  })
})
