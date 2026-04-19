import { describe, expect, it } from 'vitest'
import { parseCronValue, buildCronExpression } from './cronUtils'

describe('parseCronValue', () => {
  it('parses every-minute cron', () => {
    const result = parseCronValue('* * * * *')
    expect(result.frequency).toBe('minute')
  })

  it('parses hourly cron', () => {
    const result = parseCronValue('15 * * * *')
    expect(result.frequency).toBe('hourly')
    expect(result.minute).toBe(15)
  })

  it('parses daily cron', () => {
    const result = parseCronValue('30 14 * * *')
    expect(result.frequency).toBe('daily')
    expect(result.minute).toBe(30)
    expect(result.hour).toBe(14)
  })

  it('parses weekly cron', () => {
    const result = parseCronValue('0 9 * * 1,3,5')
    expect(result.frequency).toBe('weekly')
    expect(result.minute).toBe(0)
    expect(result.hour).toBe(9)
    expect(result.selectedDays).toEqual([1, 3, 5])
  })

  it('parses monthly cron', () => {
    const result = parseCronValue('0 9 15 * *')
    expect(result.frequency).toBe('monthly')
    expect(result.dayOfMonth).toBe(15)
  })

  it('returns custom for non-5-part cron', () => {
    expect(parseCronValue('invalid').frequency).toBe('custom')
    expect(parseCronValue('1 2 3').frequency).toBe('custom')
  })

  it('returns custom for unrecognized signature', () => {
    // dom and dow both have values → signature 'vvvv'
    expect(parseCronValue('0 9 15 * 1').frequency).toBe('custom')
  })

  it('returns custom when all 5 fields have non-star values', () => {
    expect(parseCronValue('0 9 15 6 1').frequency).toBe('custom')
  })

  it('handles weekly with invalid day numbers', () => {
    const result = parseCronValue('0 9 * * abc')
    expect(result.frequency).toBe('weekly')
    expect(result.selectedDays).toEqual([1]) // fallback
  })

  it('handles non-numeric minute/hour', () => {
    const result = parseCronValue('abc def * * *')
    expect(result.frequency).toBe('daily')
    expect(result.minute).toBe(0) // parseInt('abc') || 0
    expect(result.hour).toBe(9) // parseInt('def') || 9
  })
})

describe('buildCronExpression', () => {
  it('builds minute expression', () => {
    expect(
      buildCronExpression(
        { frequency: 'minute', minute: 0, hour: 9, dayOfMonth: 1, selectedDays: [1] },
        ''
      )
    ).toBe('* * * * *')
  })

  it('builds hourly expression', () => {
    expect(
      buildCronExpression(
        { frequency: 'hourly', minute: 15, hour: 9, dayOfMonth: 1, selectedDays: [1] },
        ''
      )
    ).toBe('15 * * * *')
  })

  it('builds daily expression', () => {
    expect(
      buildCronExpression(
        { frequency: 'daily', minute: 30, hour: 14, dayOfMonth: 1, selectedDays: [1] },
        ''
      )
    ).toBe('30 14 * * *')
  })

  it('builds weekly expression with sorted days', () => {
    expect(
      buildCronExpression(
        { frequency: 'weekly', minute: 0, hour: 9, dayOfMonth: 1, selectedDays: [5, 1, 3] },
        ''
      )
    ).toBe('0 9 * * 1,3,5')
  })

  it('builds monthly expression', () => {
    expect(
      buildCronExpression(
        { frequency: 'monthly', minute: 0, hour: 9, dayOfMonth: 15, selectedDays: [1] },
        ''
      )
    ).toBe('0 9 15 * *')
  })

  it('returns rawValue for custom frequency', () => {
    expect(
      buildCronExpression(
        { frequency: 'custom', minute: 0, hour: 9, dayOfMonth: 1, selectedDays: [1] },
        '*/5 * * * 1-5'
      )
    ).toBe('*/5 * * * 1-5')
  })

  it('returns default expression for unknown frequency', () => {
    expect(
      buildCronExpression(
        { frequency: 'unknown' as never, minute: 0, hour: 9, dayOfMonth: 1, selectedDays: [1] },
        ''
      )
    ).toBe('0 * * * *')
  })
})

describe('parseCronValue + buildCronExpression roundtrip', () => {
  it.each(['* * * * *', '15 * * * *', '30 14 * * *', '0 9 * * 1,3,5', '0 9 15 * *'])(
    'roundtrips %s',
    cron => {
      const parsed = parseCronValue(cron)
      expect(buildCronExpression(parsed, cron)).toBe(cron)
    }
  )
})
