import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClient = {
  mutation: vi.fn(),
  query: vi.fn(),
}

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = mockClient.query
    mutation = mockClient.mutation
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    runs: { create: 'runs:create' },
    schedules: { listEnabled: 'schedules:listEnabled', advanceNextRun: 'schedules:advanceNextRun' },
  },
}))

vi.mock('../config', () => ({
  CONVEX_URL: 'https://mock.convex.cloud',
}))

vi.mock('../../convex/lib/cronUtils', () => ({
  calculateNextRunAt: vi.fn(() => Date.now() + 60_000),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}))

vi.mock('../../src/utils/cronUtils', () => ({
  enumerateCronOccurrences: vi.fn(() => [Date.now() - 10_000, Date.now() - 5_000]),
  validateCronExpression: vi.fn(),
}))

vi.mock('../../src/utils/scheduleUtils', () => ({
  createOfflineSyncResult: vi.fn(() => ({
    schedulesProcessed: 0,
    runsCreated: 0,
    skipped: 0,
    errors: [] as string[],
  })),
  isMissedSchedule: vi.fn((s: { nextRunAt?: number }, now: number) =>
    s.nextRunAt ? s.nextRunAt < now : false
  ),
  accumulateScheduleResult: vi.fn((result, runsCreated, action) => {
    result.schedulesProcessed++
    result.runsCreated += runsCreated
    if (action === 'skipped' || action === 'not-missed') {
      result.skipped++
    }
  }),
  buildOfflineSyncSummary: vi.fn(
    result => `${result.schedulesProcessed} schedules, ${result.runsCreated} runs`
  ),
}))

import { runOfflineSync } from './offlineSync'
import { enumerateCronOccurrences } from '../../src/utils/cronUtils'

describe('offlineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty result when no enabled schedules', async () => {
    mockClient.query.mockResolvedValue([])
    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.runsCreated).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('returns empty result when no missed schedules', async () => {
    mockClient.query.mockResolvedValue([
      {
        _id: 's1',
        jobId: 'j1',
        name: 'future-job',
        cron: '0 * * * *',
        enabled: true,
        missedPolicy: 'skip',
        nextRunAt: Date.now() + 100_000, // in the future
      },
    ])
    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.runsCreated).toBe(0)
  })

  it('handles skip policy — advances schedule without creating runs', async () => {
    const pastTime = Date.now() - 60_000
    mockClient.query.mockResolvedValue([
      {
        _id: 's2',
        jobId: 'j2',
        name: 'skip-job',
        cron: '*/5 * * * *',
        enabled: true,
        missedPolicy: 'skip',
        nextRunAt: pastTime,
      },
    ])
    mockClient.mutation.mockResolvedValue(undefined)

    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.schedulesProcessed).toBe(1)
    expect(result.runsCreated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockClient.mutation).toHaveBeenCalledWith('schedules:advanceNextRun', expect.any(Object))
  })

  it('handles catchup policy — creates runs for missed occurrences', async () => {
    const pastTime = Date.now() - 60_000
    mockClient.query.mockResolvedValue([
      {
        _id: 's3',
        jobId: 'j3',
        name: 'catchup-job',
        cron: '*/5 * * * *',
        enabled: true,
        missedPolicy: 'catchup',
        nextRunAt: pastTime,
      },
    ])
    vi.mocked(enumerateCronOccurrences).mockReturnValue([pastTime + 10_000, pastTime + 20_000])
    mockClient.mutation.mockResolvedValue(undefined)

    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.schedulesProcessed).toBe(1)
    expect(result.runsCreated).toBe(2)
    // Should create 2 runs
    expect(mockClient.mutation).toHaveBeenCalledWith('runs:create', expect.any(Object))
  })

  it('handles last policy — creates at most 1 run', async () => {
    const pastTime = Date.now() - 60_000
    mockClient.query.mockResolvedValue([
      {
        _id: 's4',
        jobId: 'j4',
        name: 'last-job',
        cron: '*/5 * * * *',
        enabled: true,
        missedPolicy: 'last',
        nextRunAt: pastTime,
      },
    ])
    vi.mocked(enumerateCronOccurrences).mockReturnValue([pastTime + 10_000])
    mockClient.mutation.mockResolvedValue(undefined)

    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.schedulesProcessed).toBe(1)
    expect(result.runsCreated).toBe(1)
  })

  it('handles errors per-schedule without failing the entire sync', async () => {
    const pastTime = Date.now() - 60_000
    mockClient.query.mockResolvedValue([
      {
        _id: 's5',
        jobId: 'j5',
        name: 'failing-job',
        cron: '*/5 * * * *',
        enabled: true,
        missedPolicy: 'skip',
        nextRunAt: pastTime,
      },
    ])
    mockClient.mutation.mockRejectedValue(new Error('Convex down'))

    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('failing-job')
  })

  it('handles query failure gracefully', async () => {
    mockClient.query.mockRejectedValue(new Error('Network error'))
    const result = await runOfflineSync('https://test.convex.cloud')
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('Offline sync failed')
  })
})
