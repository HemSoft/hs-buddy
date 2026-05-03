import { describe, it, expect, vi } from 'vitest'

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    query = vi.fn()
    mutation = vi.fn()
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    runs: { claimPending: 'runs:claimPending', complete: 'runs:complete', fail: 'runs:fail' },
    schedules: { advanceNextRun: 'schedules:advanceNextRun' },
    copilotUsageHistory: { store: 'copilotUsageHistory:store' },
  },
}))

vi.mock('./execWorker', () => ({
  execWorker: { execute: vi.fn() },
}))

vi.mock('./aiWorker', () => ({
  aiWorker: { execute: vi.fn() },
}))

vi.mock('./skillWorker', () => ({
  skillWorker: { execute: vi.fn() },
}))

vi.mock('./offlineSync', () => ({
  runOfflineSync: vi
    .fn()
    .mockResolvedValue({ schedulesProcessed: 0, totalRunsCreated: 0, actions: [] }),
}))

vi.mock('../config', () => ({
  CONVEX_URL: 'https://mock.convex.cloud',
}))

import { getDispatcher, runOfflineSync } from './index'

describe('workers/index', () => {
  it('exports getDispatcher', () => {
    expect(typeof getDispatcher).toBe('function')
  })

  it('exports runOfflineSync', () => {
    expect(typeof runOfflineSync).toBe('function')
  })
})
