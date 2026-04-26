import { describe, it, expect } from 'vitest'
import {
  hasScheduleTimingChanged,
  resolveNextRunAt,
  copyDefinedFields,
  buildScheduleUpdateFields,
  createOfflineSyncResult,
  isMissedSchedule,
  accumulateScheduleResult,
  buildOfflineSyncSummary,
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

// --- Offline Sync helpers ---

describe('createOfflineSyncResult', () => {
  it('returns zeroed-out result', () => {
    const result = createOfflineSyncResult()
    expect(result).toEqual({ schedulesProcessed: 0, runsCreated: 0, skipped: 0, errors: [] })
  })
})

describe('isMissedSchedule', () => {
  it('returns true when nextRunAt is null', () => {
    expect(isMissedSchedule({ nextRunAt: null }, 1000)).toBe(true)
  })

  it('returns true when nextRunAt is undefined', () => {
    expect(isMissedSchedule({}, 1000)).toBe(true)
  })

  it('returns true when nextRunAt is in the past', () => {
    expect(isMissedSchedule({ nextRunAt: 500 }, 1000)).toBe(true)
  })

  it('returns true when nextRunAt equals now', () => {
    expect(isMissedSchedule({ nextRunAt: 1000 }, 1000)).toBe(true)
  })

  it('returns false when nextRunAt is in the future', () => {
    expect(isMissedSchedule({ nextRunAt: 2000 }, 1000)).toBe(false)
  })
})

describe('accumulateScheduleResult', () => {
  it('increments schedulesProcessed and runsCreated', () => {
    const result = createOfflineSyncResult()
    accumulateScheduleResult(result, 3, 'catchup')
    expect(result.schedulesProcessed).toBe(1)
    expect(result.runsCreated).toBe(3)
    expect(result.skipped).toBe(0)
  })

  it('increments skipped for "skipped" action', () => {
    const result = createOfflineSyncResult()
    accumulateScheduleResult(result, 0, 'skipped')
    expect(result.skipped).toBe(1)
  })

  it('increments skipped for "not-missed" action', () => {
    const result = createOfflineSyncResult()
    accumulateScheduleResult(result, 0, 'not-missed')
    expect(result.skipped).toBe(1)
  })

  it('does not increment skipped for other actions', () => {
    const result = createOfflineSyncResult()
    accumulateScheduleResult(result, 1, 'last (1 run)')
    expect(result.skipped).toBe(0)
  })

  it('accumulates across multiple calls', () => {
    const result = createOfflineSyncResult()
    accumulateScheduleResult(result, 2, 'catchup')
    accumulateScheduleResult(result, 0, 'skipped')
    accumulateScheduleResult(result, 1, 'last (1 run)')
    expect(result.schedulesProcessed).toBe(3)
    expect(result.runsCreated).toBe(3)
    expect(result.skipped).toBe(1)
  })
})

describe('buildOfflineSyncSummary', () => {
  it('builds summary without errors', () => {
    const result = { schedulesProcessed: 3, runsCreated: 5, skipped: 1, errors: [] }
    expect(buildOfflineSyncSummary(result)).toBe('3 processed, 5 runs created, 1 skipped')
  })

  it('includes error count in summary', () => {
    const result = { schedulesProcessed: 2, runsCreated: 1, skipped: 0, errors: ['err1', 'err2'] }
    expect(buildOfflineSyncSummary(result)).toBe('2 processed, 1 runs created, 0 skipped, 2 errors')
  })

  it('builds summary for empty result', () => {
    const result = createOfflineSyncResult()
    expect(buildOfflineSyncSummary(result)).toBe('0 processed, 0 runs created, 0 skipped')
  })
})
