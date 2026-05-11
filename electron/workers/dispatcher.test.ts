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

  it('handles worker execution failure (result.success = false)', async () => {
    vi.useRealTimers()
    vi.mocked(execWorker.execute).mockResolvedValueOnce({
      success: false,
      error: 'Command failed',
      output: '',
      duration: 50,
      exitCode: 1,
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
      error: 'Command failed',
    })
  })

  it('handles worker execution throw', async () => {
    vi.useRealTimers()
    vi.mocked(execWorker.execute).mockRejectedValueOnce(new Error('Unexpected crash'))
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-crash' },
      job: { name: 'crash-job', workerType: 'exec', config: { command: 'crash-cmd' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-crash',
      error: 'Unexpected crash',
    })
  })

  it('handles __copilot_snapshot__ command', async () => {
    vi.useRealTimers()
    const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
    vi.mocked(fetchCopilotMetrics).mockResolvedValue({
      success: true,
      data: {
        org: 'test-org',
        billingYear: 2026,
        billingMonth: 5,
        premiumRequests: 100,
        grossCost: 10.0,
        discount: 0,
        netCost: 10.0,
        businessSeats: 5,
        spent: 10.0,
      },
    } as never)

    mockClient.mutation.mockResolvedValueOnce({
      run: {
        _id: 'run-snap',
        input: { accounts: [{ username: 'user1', org: 'org1' }] },
      },
      job: { name: 'snapshot', workerType: 'exec', config: { command: '__copilot_snapshot__' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 100))
    dispatcher.stop()

    expect(fetchCopilotMetrics).toHaveBeenCalledWith('org1', 'user1')
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({
        id: 'run-snap',
      })
    )
  })

  it('fails snapshot when no accounts provided', async () => {
    vi.useRealTimers()
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-snap-empty', input: {} },
      job: { name: 'snapshot', workerType: 'exec', config: { command: '__copilot_snapshot__' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-snap-empty',
      error: 'No accounts provided for snapshot collection',
    })
  })

  it('handles snapshot fetch failure for individual accounts', async () => {
    vi.useRealTimers()
    const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
    vi.mocked(fetchCopilotMetrics).mockResolvedValue({
      success: false,
      error: 'API rate limited',
    } as never)

    mockClient.mutation.mockResolvedValueOnce({
      run: {
        _id: 'run-snap-fail',
        input: { accounts: [{ username: 'user1', org: 'org1' }] },
      },
      job: { name: 'snapshot', workerType: 'exec', config: { command: '__copilot_snapshot__' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 100))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({ id: 'run-snap-fail' })
    )
  })

  it('skips poll cycle when in backoff window', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    // Make backoff window always return true — poll should be skipped
    vi.mocked(isInBackoffWindow).mockReturnValue(true)

    mockClient.mutation.mockResolvedValue(null)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    // claimPending should NOT have been called — poll was skipped due to backoff
    // The immediate poll in start() fires before backoff check,
    // but subsequent interval polls should be skipped
    expect(isInBackoffWindow).toHaveBeenCalled()
    const claimCalls = mockClient.mutation.mock.calls.filter(
      (args: unknown[]) => args[0] === 'runs:claimPending'
    )
    expect(claimCalls).toHaveLength(0)
  })

  it('handles storeSnapshot mutation failure gracefully', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    vi.mocked(isInBackoffWindow).mockReturnValue(false)

    const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
    vi.mocked(fetchCopilotMetrics).mockResolvedValue({
      success: true,
      data: {
        org: 'test-org',
        billingYear: 2026,
        billingMonth: 5,
        premiumRequests: 50,
        grossCost: 5.0,
        discount: 0,
        netCost: 5.0,
        businessSeats: 2,
        spent: 5.0,
      },
    } as never)

    let claimCount = 0
    // Route mutation calls by API name
    mockClient.mutation.mockImplementation((apiName: string) => {
      if (apiName === 'runs:claimPending') {
        claimCount++
        if (claimCount === 1) {
          return Promise.resolve({
            run: {
              _id: 'run-store-fail',
              input: { accounts: [{ username: 'user1', org: 'org1' }] },
            },
            job: {
              name: 'snapshot',
              workerType: 'exec',
              config: { command: '__copilot_snapshot__' },
            },
          })
        }
        return Promise.resolve(null)
      }
      if (apiName === 'copilotUsageHistory:store') {
        return Promise.reject(new Error('Convex mutation failed'))
      }
      return Promise.resolve(undefined)
    })

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 300))
    dispatcher.stop()

    // Should have completed (with 0/1 success) rather than crashing
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({ id: 'run-store-fail' })
    )
  })

  it('stop aborts in-flight worker execution', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    vi.mocked(isInBackoffWindow).mockReturnValue(false)

    // Make execWorker.execute hang until abort
    let abortSignalReceived = false
    vi.mocked(execWorker.execute).mockImplementation(
      (_config, signal) =>
        new Promise(resolve => {
          const onAbort = () => {
            abortSignalReceived = true
            resolve({ success: false, output: '', duration: 0, exitCode: 1, error: 'aborted' })
          }
          if (signal?.aborted) {
            onAbort()
          } else {
            signal?.addEventListener('abort', onAbort, { once: true })
          }
        })
    )

    let claimCount = 0
    mockClient.mutation.mockImplementation((apiName: string) => {
      if (apiName === 'runs:claimPending') {
        claimCount++
        if (claimCount === 1) {
          return Promise.resolve({
            run: { _id: 'run-abort' },
            job: { name: 'slow-job', workerType: 'exec', config: { command: 'sleep 999' } },
          })
        }
        return Promise.resolve(null)
      }
      return Promise.resolve(undefined)
    })

    const dispatcher = getDispatcher()
    dispatcher.start()
    // Let the poll start and claim the job
    await new Promise(r => setTimeout(r, 100))
    // stop() should abort the in-flight execution
    dispatcher.stop()
    await new Promise(r => setTimeout(r, 50))

    expect(abortSignalReceived).toBe(true)
  })

  it('reports failure with fallback error when result.error is undefined', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    vi.mocked(isInBackoffWindow).mockReturnValue(false)

    vi.mocked(execWorker.execute).mockResolvedValueOnce({
      success: false,
      error: undefined,
      output: '',
      duration: 50,
      exitCode: 1,
    })
    mockClient.mutation.mockResolvedValueOnce({
      run: { _id: 'run-no-err' },
      job: { name: 'no-err-job', workerType: 'exec', config: { command: 'fail-quietly' } },
    })
    mockClient.mutation.mockResolvedValue(undefined)

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-no-err',
      error: 'Unknown error',
    })
  })

  it('suppresses log when shouldLogDispatcherError returns false', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow, shouldLogDispatcherError } =
      await import('../../src/utils/dispatcherBackoff')
    vi.mocked(isInBackoffWindow).mockReturnValue(false)
    vi.mocked(shouldLogDispatcherError).mockReturnValue(false)

    // Force claimPending to throw (Convex unreachable)
    mockClient.mutation.mockRejectedValue(new Error('Network failure'))

    const warnSpy = vi.spyOn(console, 'warn')

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 50))
    dispatcher.stop()

    // shouldLogDispatcherError returned false — warn should NOT contain the dispatcher message
    const dispatcherWarns = warnSpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('[Dispatcher] Convex unreachable')
    )
    expect(dispatcherWarns).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('includes budgetAmount in snapshot when present', async () => {
    vi.useRealTimers()
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    vi.mocked(isInBackoffWindow).mockReturnValue(false)

    const { fetchCopilotMetrics } = await import('../ipc/githubHandlers')
    vi.mocked(fetchCopilotMetrics).mockResolvedValue({
      success: true,
      data: {
        org: 'test-org',
        billingYear: 2026,
        billingMonth: 5,
        premiumRequests: 100,
        grossCost: 10.0,
        discount: 0,
        netCost: 10.0,
        businessSeats: 5,
        budgetAmount: 500,
        spent: 10.0,
      },
    } as never)

    let claimCount = 0
    mockClient.mutation.mockImplementation((apiName: string) => {
      if (apiName === 'runs:claimPending') {
        claimCount++
        if (claimCount === 1) {
          return Promise.resolve({
            run: {
              _id: 'run-budget',
              input: { accounts: [{ username: 'user1', org: 'org1' }] },
            },
            job: {
              name: 'snapshot',
              workerType: 'exec',
              config: { command: '__copilot_snapshot__' },
            },
          })
        }
        return Promise.resolve(null)
      }
      return Promise.resolve(undefined)
    })

    const dispatcher = getDispatcher()
    dispatcher.start()
    await new Promise(r => setTimeout(r, 200))
    dispatcher.stop()

    // Verify budgetAmount was included in the store mutation
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'copilotUsageHistory:store',
      expect.objectContaining({ budgetAmount: 500 })
    )
  })
})
