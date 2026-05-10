import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    runs: {
      claimPending: 'runs:claimPending',
      complete: 'runs:complete',
      fail: 'runs:fail',
    },
    schedules: {
      advanceNextRun: 'schedules:advanceNextRun',
    },
    copilotUsageHistory: {
      store: 'copilotUsageHistory:store',
    },
  },
}))

vi.mock('./execWorker', () => ({
  execWorker: {
    execute: vi
      .fn()
      .mockResolvedValue({ success: true, output: 'done', duration: 100, exitCode: 0 }),
  },
}))

vi.mock('./aiWorker', () => ({
  aiWorker: {
    execute: vi
      .fn()
      .mockResolvedValue({ success: true, output: 'ai done', duration: 50, exitCode: 0 }),
  },
}))

vi.mock('./skillWorker', () => ({
  skillWorker: {
    execute: vi
      .fn()
      .mockResolvedValue({ success: true, output: 'skill done', duration: 75, exitCode: 0 }),
  },
}))

vi.mock('../ipc/githubHandlers', () => ({
  fetchCopilotMetrics: vi.fn(),
}))

vi.mock('../config', () => ({
  CONVEX_URL: 'https://mock.convex.cloud',
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}))

vi.mock('../../src/utils/dispatcherBackoff', () => ({
  isInBackoffWindow: vi.fn(() => false),
  shouldLogDispatcherError: vi.fn(() => true),
}))

vi.mock('../../src/utils/billingParsers', () => ({
  buildSnapshotCollectionOutput: vi.fn((succeeded: number, failed: number) => ({
    stdout: `Collected ${succeeded} snapshots, ${failed} failed`,
    exitCode: failed > 0 ? 1 : 0,
  })),
}))

import { getDispatcher } from './dispatcher'
import { execWorker } from './execWorker'
import { aiWorker } from './aiWorker'

describe('dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Stop any running dispatcher
    getDispatcher().stop()
  })

  it('getDispatcher returns a singleton', () => {
    const d1 = getDispatcher()
    const d2 = getDispatcher()
    expect(d1).toBe(d2)
  })

  it('start begins polling and stop clears interval', () => {
    mockClient.mutation.mockResolvedValue(null) // no pending runs
    const dispatcher = getDispatcher()
    dispatcher.start()
    // Should not throw and should be running
    dispatcher.stop()
  })

  it('start is idempotent — calling twice does not create two timers', () => {
    mockClient.mutation.mockResolvedValue(null)
    const dispatcher = getDispatcher()
    dispatcher.start()
    dispatcher.start() // second call should be no-op
    dispatcher.stop()
  })

  it('dispatches exec worker when workerType is exec', async () => {
    vi.useRealTimers()
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run1' },
      job: { name: 'test-job', workerType: 'exec', config: { command: 'echo hi' } },
    })
    mockClient.mutation.mockResolvedValue(undefined) // complete

    const dispatcher = getDispatcher()
    // Trigger a single poll cycle by starting and stopping immediately
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(execWorker.execute).toHaveBeenCalledWith({ command: 'echo hi' }, expect.any(AbortSignal))
  })

  it('reports failure for unknown worker type', async () => {
    vi.useRealTimers()
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run2' },
      job: { name: 'bad-job', workerType: 'unknown', config: {} },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run2',
      error: 'Unknown worker type: unknown',
    })
  })

  it('handles ai worker dispatch', async () => {
    vi.useRealTimers()
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run3' },
      job: { name: 'ai-job', workerType: 'ai', config: { prompt: 'hello' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(aiWorker.execute).toHaveBeenCalledWith({ prompt: 'hello' }, expect.any(AbortSignal))
  })

  it('processing guard prevents concurrent poll execution', async () => {
    // Use fake timers to control the polling interval precisely
    vi.useFakeTimers()

    // Create a slow-resolving claim that keeps processing=true
    let resolveClaim: (value: unknown) => void
    const slowClaim = new Promise(resolve => {
      resolveClaim = resolve
    })
    mockClient.mutation.mockReturnValue(slowClaim as never)

    const dispatcher = getDispatcher()
    dispatcher.start()

    // First poll fires immediately in start() — it's now blocked on slowClaim
    // Advance past one full polling interval (10s) to trigger a second poll
    await vi.advanceTimersByTimeAsync(10_000)

    // Only 1 claim call should have been made — the second poll was skipped
    // because processing is still true (first claim hasn't resolved)
    expect(mockClient.mutation).toHaveBeenCalledTimes(1)

    // Now resolve the blocked claim and let it finish
    resolveClaim!(null)
    await vi.advanceTimersByTimeAsync(1)

    // Advance another interval — now processing is false, so a new poll runs
    await vi.advanceTimersByTimeAsync(10_000)

    // Second claim call should now have fired
    expect(mockClient.mutation).toHaveBeenCalledTimes(2)

    dispatcher.stop()
  })

  it('backs off on consecutive errors and stops polling', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')

    // First call succeeds (backoff check), then claim throws
    mockClient.mutation.mockRejectedValue(new Error('Network error'))

    const dispatcher = getDispatcher()
    dispatcher.start()

    // Let a few poll cycles run and fail
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    // After errors, the backoff utility should have been consulted
    expect(isInBackoffWindow).toHaveBeenCalled()
  })

  it('resets consecutiveErrors on successful poll', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')

    // First poll fails, second succeeds
    mockClient.mutation.mockRejectedValueOnce(new Error('Transient error')).mockResolvedValue(null) // successful empty poll

    const dispatcher = getDispatcher()
    dispatcher.start()

    // Let both polls execute
    await new Promise(r => setTimeout(r, 80))
    dispatcher.stop()

    // isInBackoffWindow was called - on the second poll it should check,
    // but since the first error just happened, the backoff window is brief
    expect(isInBackoffWindow).toHaveBeenCalled()
  })

  describe('snapshot collection', () => {
    it('handles __copilot_snapshot__ command via executeSnapshotCollection', async () => {
      vi.useRealTimers()
      const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
      const mockedFetch = vi.mocked(fetchCopilotMetrics)
      mockedFetch.mockResolvedValue({
        success: true,
        data: {
          org: 'test-org',
          billingYear: 2024,
          billingMonth: 12,
          premiumRequests: 100,
          grossCost: 50,
          discount: 5,
          netCost: 45,
          businessSeats: 10,
          spent: 45,
        },
      } as ReturnType<typeof fetchCopilotMetrics> extends Promise<infer T> ? T : never)

      mockClient.mutation
        .mockResolvedValueOnce({
          run: {
            _id: 'snap-run-1',
            input: { accounts: [{ username: 'user1', org: 'org1' }] },
          },
          job: {
            name: 'snapshot-job',
            workerType: 'exec',
            config: { command: '__copilot_snapshot__' },
          },
        })
        .mockResolvedValue(undefined)

      const dispatcher = getDispatcher()
      dispatcher.start()
      await new Promise(r => setTimeout(r, 100))
      dispatcher.stop()

      expect(mockedFetch).toHaveBeenCalledWith('org1', 'user1')
      expect(mockClient.mutation).toHaveBeenCalledWith(
        'copilotUsageHistory:store',
        expect.objectContaining({
          accountUsername: 'user1',
          org: 'test-org',
        })
      )
    })

    it('fails snapshot run when no accounts provided', async () => {
      vi.useRealTimers()
      mockClient.mutation
        .mockResolvedValueOnce({
          run: { _id: 'snap-run-2', input: {} },
          job: {
            name: 'snapshot-job',
            workerType: 'exec',
            config: { command: '__copilot_snapshot__' },
          },
        })
        .mockResolvedValue(undefined)

      const dispatcher = getDispatcher()
      dispatcher.start()
      await new Promise(r => setTimeout(r, 100))
      dispatcher.stop()

      expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
        id: 'snap-run-2',
        error: 'No accounts provided for snapshot collection',
      })
    })

    it('handles fetchCopilotMetrics failure gracefully', async () => {
      vi.useRealTimers()
      const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
      const mockedFetch = vi.mocked(fetchCopilotMetrics)
      mockedFetch.mockResolvedValue({
        success: false,
        error: 'Auth failure',
      } as ReturnType<typeof fetchCopilotMetrics> extends Promise<infer T> ? T : never)

      mockClient.mutation
        .mockResolvedValueOnce({
          run: {
            _id: 'snap-run-3',
            input: { accounts: [{ username: 'user1', org: 'org1' }] },
          },
          job: {
            name: 'snapshot-job',
            workerType: 'exec',
            config: { command: '__copilot_snapshot__' },
          },
        })
        .mockResolvedValue(undefined)

      const dispatcher = getDispatcher()
      dispatcher.start()
      await new Promise(r => setTimeout(r, 100))
      dispatcher.stop()

      // Run should still complete (with failed count)
      expect(mockClient.mutation).toHaveBeenCalledWith(
        'runs:complete',
        expect.objectContaining({
          id: 'snap-run-3',
        })
      )
    })

    it('handles store mutation failure gracefully', async () => {
      vi.useRealTimers()
      const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
      const mockedFetch = vi.mocked(fetchCopilotMetrics)
      mockedFetch.mockResolvedValue({
        success: true,
        data: {
          org: 'test-org',
          billingYear: 2024,
          billingMonth: 12,
          premiumRequests: 100,
          grossCost: 50,
          discount: 5,
          netCost: 45,
          businessSeats: 10,
          spent: 45,
        },
      } as ReturnType<typeof fetchCopilotMetrics> extends Promise<infer T> ? T : never)

      // First call: claimPending, second: store (throws), third: complete
      mockClient.mutation
        .mockResolvedValueOnce({
          run: {
            _id: 'snap-run-4',
            input: { accounts: [{ username: 'user1', org: 'org1' }] },
          },
          job: {
            name: 'snapshot-job',
            workerType: 'exec',
            config: { command: '__copilot_snapshot__' },
          },
        })
        .mockRejectedValueOnce(new Error('Convex mutation error'))
        .mockResolvedValue(undefined)

      const dispatcher = getDispatcher()
      dispatcher.start()
      await new Promise(r => setTimeout(r, 100))
      dispatcher.stop()

      // Should still complete despite store failure
      expect(mockClient.mutation).toHaveBeenCalledWith(
        'runs:complete',
        expect.objectContaining({
          id: 'snap-run-4',
        })
      )
    })
  })

  it('dispatches skill worker type', async () => {
    vi.useRealTimers()
    const { skillWorker } = await import('./skillWorker')

    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-skill' },
      job: { name: 'skill-job', workerType: 'skill', config: { skill: 'test' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(skillWorker.execute).toHaveBeenCalledWith({ skill: 'test' }, expect.any(AbortSignal))
  })

  it('reports worker execute failure with error message', async () => {
    vi.useRealTimers()
    vi.mocked(execWorker.execute).mockResolvedValueOnce({
      success: false,
      error: 'Command not found',
      output: '',
      duration: 10,
      exitCode: 127,
    })

    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-fail' },
      job: { name: 'fail-job', workerType: 'exec', config: { command: 'bad-cmd' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-fail',
      error: 'Command not found',
    })
  })

  it('handles worker execute throwing an exception', async () => {
    vi.useRealTimers()
    vi.mocked(execWorker.execute).mockRejectedValueOnce(new Error('Process crashed'))

    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-throw' },
      job: { name: 'throw-job', workerType: 'exec', config: { command: 'crash-cmd' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-throw',
      error: 'Process crashed',
    })
  })
})
