import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClient = { mutation: vi.fn(), query: vi.fn() }
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = mockClient.query
    mutation = mockClient.mutation
  },
}))
vi.mock('../../convex/_generated/api', () => ({
  api: {
    schedules: { listEnabled: 'schedules:listEnabled', recoverMissed: 'schedules:recoverMissed' },
  },
}))
vi.mock('../config', () => ({ CONVEX_URL: 'https://mock.convex.cloud' }))

import { runOfflineSync } from './offlineSync'

function schedule(id = 's1') {
  return { _id: id, name: id, nextRunAt: Date.now() - 60_000 }
}

describe('offlineSync', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns empty result without enabled schedules', async () => {
    mockClient.query.mockResolvedValue([])
    expect(await runOfflineSync()).toEqual({
      schedulesProcessed: 0,
      runsCreated: 0,
      skipped: 0,
      errors: [],
    })
    expect(mockClient.mutation).not.toHaveBeenCalled()
  })

  it('does not recover a future schedule', async () => {
    mockClient.query.mockResolvedValue([{ ...schedule(), nextRunAt: Date.now() + 60_000 }])
    expect((await runOfflineSync()).runsCreated).toBe(0)
    expect(mockClient.mutation).not.toHaveBeenCalled()
  })

  it.each([
    [0, 'skipped', 1],
    [0, 'not-missed', 1],
    [0, 'no missed runs', 0],
    [1, 'last (1 run)', 0],
    [2, 'catchup (2 runs)', 0],
  ])('reports the server result %s/%s', async (runsCreated, action, skipped) => {
    mockClient.query.mockResolvedValue([schedule()])
    mockClient.mutation.mockResolvedValue({ runsCreated, action })
    expect(await runOfflineSync('https://test.convex.cloud')).toEqual({
      schedulesProcessed: 1,
      runsCreated,
      skipped,
      errors: [],
    })
    expect(mockClient.mutation).toHaveBeenCalledExactlyOnceWith('schedules:recoverMissed', {
      id: 's1',
    })
  })

  it('retries only the atomic mutation after an ambiguous response', async () => {
    mockClient.query.mockResolvedValue([schedule()])
    mockClient.mutation
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce({ runsCreated: 0, action: 'not-missed' })
    const first = await runOfflineSync()
    expect(first.errors).toEqual(['Failed to process "s1": response lost after commit'])
    expect(first.runsCreated).toBe(0)
    const retry = await runOfflineSync()
    expect(retry.runsCreated).toBe(0)
    expect(retry.errors).toEqual([])
    expect(mockClient.mutation.mock.calls).toEqual([
      ['schedules:recoverMissed', { id: 's1' }],
      ['schedules:recoverMissed', { id: 's1' }],
    ])
  })

  it('continues after one schedule fails', async () => {
    mockClient.query.mockResolvedValue([schedule(), schedule('s2')])
    mockClient.mutation
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ runsCreated: 1, action: 'last (1 run)' })
    expect(await runOfflineSync()).toEqual({
      schedulesProcessed: 1,
      runsCreated: 1,
      skipped: 0,
      errors: ['Failed to process "s1": unavailable'],
    })
  })

  it('reports query failures without attempting mutations', async () => {
    mockClient.query.mockRejectedValue(new Error('offline'))
    expect((await runOfflineSync()).errors).toEqual(['Offline sync failed: offline'])
    expect(mockClient.mutation).not.toHaveBeenCalled()
  })
})
