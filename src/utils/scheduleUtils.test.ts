import { describe, it, expect } from 'vitest'
import {
  hasScheduleTimingChanged,
  resolveNextRunAt,
  copyDefinedFields,
  buildScheduleUpdateFields,
} from './scheduleUtils'

const existing = { cron: '0 9 * * *', timezone: 'America/New_York', enabled: true }

describe('hasScheduleTimingChanged', () => {
  it('returns false when no timing fields changed', () => {
    expect(hasScheduleTimingChanged({ name: 'renamed' }, existing)).toBe(false)
  })

  it('detects cron change', () => {
    expect(hasScheduleTimingChanged({ cron: '0 10 * * *' }, existing)).toBe(true)
  })

  it('detects timezone change', () => {
    expect(hasScheduleTimingChanged({ timezone: 'UTC' }, existing)).toBe(true)
  })

  it('detects enabled change', () => {
    expect(hasScheduleTimingChanged({ enabled: false }, existing)).toBe(true)
  })

  it('ignores same-value cron update', () => {
    expect(hasScheduleTimingChanged({ cron: '0 9 * * *' }, existing)).toBe(false)
  })

  it('ignores same-value timezone update', () => {
    expect(hasScheduleTimingChanged({ timezone: 'America/New_York' }, existing)).toBe(false)
  })
})

describe('resolveNextRunAt', () => {
  const calcNextRun = (cron: string, tz: string) => {
    // Stub: return a hash of inputs for deterministic testing
    return cron.length * 1000 + tz.length
  }

  it('returns undefined when disabled', () => {
    expect(
      resolveNextRunAt({ enabled: false }, existing, 'America/New_York', calcNextRun)
    ).toBeUndefined()
  })

  it('returns undefined when timing unchanged', () => {
    expect(
      resolveNextRunAt({ name: 'x' }, existing, 'America/New_York', calcNextRun)
    ).toBeUndefined()
  })

  it('computes next run when cron changes', () => {
    const result = resolveNextRunAt(
      { cron: '0 12 * * *' },
      existing,
      'America/New_York',
      calcNextRun
    )
    expect(result).toBe('0 12 * * *'.length * 1000 + 'America/New_York'.length)
  })

  it('uses default timezone when existing has none', () => {
    const noTz = { cron: '0 9 * * *', enabled: true }
    const result = resolveNextRunAt({ cron: '0 12 * * *' }, noTz, 'UTC', calcNextRun)
    expect(result).toBe('0 12 * * *'.length * 1000 + 'UTC'.length)
  })

  it('uses updated timezone over existing', () => {
    const result = resolveNextRunAt(
      { timezone: 'Europe/London' },
      existing,
      'America/New_York',
      calcNextRun
    )
    expect(result).toBe('0 9 * * *'.length * 1000 + 'Europe/London'.length)
  })
})

describe('copyDefinedFields', () => {
  it('copies defined fields and adds updatedAt', () => {
    const result = copyDefinedFields({ name: 'Test', cron: '0 * * * *' }, 5000)
    expect(result).toEqual({ updatedAt: 5000, name: 'Test', cron: '0 * * * *' })
  })

  it('skips undefined fields', () => {
    const result = copyDefinedFields({ name: 'Test', cron: undefined }, 5000)
    expect(result).toEqual({ updatedAt: 5000, name: 'Test' })
  })

  it('returns only updatedAt for empty updates', () => {
    const result = copyDefinedFields({}, 5000)
    expect(result).toEqual({ updatedAt: 5000 })
  })
})

describe('buildScheduleUpdateFields', () => {
  const calcNextRun = () => 99999

  it('sets nextRunAt to undefined when disabling', () => {
    const result = buildScheduleUpdateFields(
      { enabled: false },
      existing,
      1000,
      'America/New_York',
      calcNextRun
    )
    expect(result.nextRunAt).toBeUndefined()
    expect(result.enabled).toBe(false)
  })

  it('computes nextRunAt when cron changes', () => {
    const result = buildScheduleUpdateFields(
      { cron: '0 12 * * *' },
      existing,
      1000,
      'America/New_York',
      calcNextRun
    )
    expect(result.nextRunAt).toBe(99999)
  })

  it('does not set nextRunAt when timing unchanged', () => {
    const result = buildScheduleUpdateFields(
      { name: 'new name' },
      existing,
      1000,
      'America/New_York',
      calcNextRun
    )
    expect(result).not.toHaveProperty('nextRunAt')
    expect(result.name).toBe('new name')
  })
})
