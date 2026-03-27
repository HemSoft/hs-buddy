import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysUntilReset, formatCopilotPlan, formatResetDate } from './copilotFormatUtils'

describe('formatCopilotPlan', () => {
  it('returns friendly labels for known plans', () => {
    expect(formatCopilotPlan('business')).toBe('Business')
    expect(formatCopilotPlan('enterprise')).toBe('Enterprise')
    expect(formatCopilotPlan('individual')).toBe('Pro')
    expect(formatCopilotPlan('individual_pro')).toBe('Pro+')
    expect(formatCopilotPlan('free')).toBe('Free')
  })

  it('returns the raw string for an unknown plan', () => {
    expect(formatCopilotPlan('team')).toBe('team')
  })

  it('returns "Unknown" for nullish or empty values', () => {
    expect(formatCopilotPlan(null)).toBe('Unknown')
    expect(formatCopilotPlan('')).toBe('Unknown')
  })
})

describe('formatResetDate', () => {
  it('formats a date without the year by default', () => {
    expect(formatResetDate('2026-04-15')).toBe(
      new Date('2026-04-15').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    )
  })

  it('includes the year when includeYear is true', () => {
    expect(formatResetDate('2026-04-15', true)).toBe(
      new Date('2026-04-15').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    )
  })

  it('formats dates at calendar boundaries and ISO datetime inputs', () => {
    expect(formatResetDate('2026-01-01')).toBe(
      new Date('2026-01-01').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    )

    expect(formatResetDate('2026-12-31')).toBe(
      new Date('2026-12-31').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    )

    expect(formatResetDate('2026-06-15T12:00:00Z')).toBe(
      new Date('2026-06-15T12:00:00Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    )
  })
})

describe('daysUntilReset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 for past or current dates', () => {
    expect(daysUntilReset('2026-06-14T00:00:00.000Z')).toBe(0)
    expect(daysUntilReset('2026-06-15T12:00:00.000Z')).toBe(0)
    expect(daysUntilReset('2020-01-01T00:00:00.000Z')).toBe(0)
  })

  it('rounds up partial days and handles longer ranges', () => {
    expect(daysUntilReset('2026-06-16T00:00:00.000Z')).toBe(1)
    expect(daysUntilReset('2026-06-22T12:00:00.000Z')).toBe(7)
    expect(daysUntilReset('2026-07-15T12:00:00.000Z')).toBe(30)
  })
})
