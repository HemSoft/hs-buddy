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
    execute: vi.fn(),
  },
}))

vi.mock('./aiWorker', () => ({
  aiWorker: {
    execute: vi.fn(),
  },
}))

vi.mock('./skillWorker', () => ({
  skillWorker: {
    execute: vi.fn(),
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
import { skillWorker } from './skillWorker'
import { fetchCopilotMetrics } from '../ipc/githubHandlers'
import { buildSnapshotCollectionOutput } from '../../src/utils/billingParsers'

interface PrivateDispatcher {
  start: () => void
  stop: () => void
  poll: () => Promise<void>
  claimAndExecute: () => Promise<void>
}

const getPrivateDispatcher = () => getDispatcher() as unknown as PrivateDispatcher

const claimOnce = (
  claimed: unknown,
  handler?: (mutation: string, args: unknown) => Promise<unknown> | unknown
) => {
  let seenClaim = false
  mockClient.mutation.mockImplementation(async (mutation, args) => {
    if (mutation === 'runs:claimPending') {
      if (seenClaim) return null
      seenClaim = true
      return claimed
    }
    return handler ? await handler(mutation as string, args) : undefined
  })
}

const claimAndExecuteOnce = async () => {
  const dispatcher = getPrivateDispatcher()
  vi.spyOn(dispatcher, 'poll').mockResolvedValue(undefined)
  await dispatcher.claimAndExecute()
}

describe('dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClient.mutation.mockReset()
    mockClient.query.mockReset()
    vi.mocked(execWorker.execute).mockReset().mockResolvedValue({
      success: true,
      output: 'done',
      duration: 100,
      exitCode: 0,
    })
    vi.mocked(aiWorker.execute).mockReset().mockResolvedValue({
      success: true,
      output: 'ai done',
      duration: 50,
      exitCode: 0,
    })
    vi.mocked(skillWorker.execute).mockReset().mockResolvedValue({
      success: true,
      output: 'skill done',
      duration: 75,
      exitCode: 0,
    })
    vi.mocked(fetchCopilotMetrics).mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    getDispatcher().stop()
  })

  it('getDispatcher returns a singleton', () => {
    const d1 = getDispatcher()
    const d2 = getDispatcher()
    expect(d1).toBe(d2)
  })

  it('start begins polling and stop clears interval', () => {
    const dispatcher = getPrivateDispatcher()
    const pollSpy = vi.spyOn(dispatcher, 'poll').mockResolvedValue(undefined)

    dispatcher.start()
    dispatcher.stop()

    expect(pollSpy).toHaveBeenCalledTimes(1)
  })

  it('start is idempotent — calling twice does not create two timers', () => {
    const dispatcher = getPrivateDispatcher()
    const pollSpy = vi.spyOn(dispatcher, 'poll').mockResolvedValue(undefined)

    dispatcher.start()
    dispatcher.start()
    dispatcher.stop()

    expect(pollSpy).toHaveBeenCalledTimes(1)
  })

  it('dispatches exec worker when workerType is exec', async () => {
    claimOnce({
      run: { _id: 'run1' },
      job: { name: 'test-job', workerType: 'exec', config: { command: 'echo hi' } },
    })

    await claimAndExecuteOnce()

    expect(execWorker.execute).toHaveBeenCalledWith({ command: 'echo hi' }, expect.any(AbortSignal))
    expect(mockClient.mutation).toHaveBeenCalledWith('runs:complete', {
      id: 'run1',
      output: { stdout: 'done', exitCode: 0, duration: 100 },
    })
  })

  it('dispatches snapshot collection when exec command requests a Copilot snapshot', async () => {
    vi.mocked(fetchCopilotMetrics).mockResolvedValueOnce({
      success: true,
      data: {
        org: 'github',
        billingYear: 2026,
        billingMonth: 5,
        premiumRequests: 12,
        grossCost: 30,
        discount: 5,
        netCost: 25,
        businessSeats: 20,
        budgetAmount: 100,
        spent: 25,
        fetchedAt: 1715000000000,
      },
    })

    claimOnce(
      {
        run: {
          _id: 'run-snapshot',
          input: { accounts: [{ username: 'alice', org: 'github' }] },
        },
        job: {
          name: 'snapshot-job',
          workerType: 'exec',
          config: { command: '__copilot_snapshot__' },
        },
      },
      async () => undefined
    )

    await claimAndExecuteOnce()

    expect(execWorker.execute).not.toHaveBeenCalled()
    expect(fetchCopilotMetrics).toHaveBeenCalledWith('github', 'alice')
    expect(mockClient.mutation).toHaveBeenCalledWith('copilotUsageHistory:store', {
      accountUsername: 'alice',
      org: 'github',
      billingYear: 2026,
      billingMonth: 5,
      premiumRequests: 12,
      grossCost: 30,
      discount: 5,
      netCost: 25,
      businessSeats: 20,
      budgetAmount: 100,
      spent: 25,
    })
    expect(buildSnapshotCollectionOutput).toHaveBeenCalledWith(1, 0)
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({
        id: 'run-snapshot',
        output: expect.objectContaining({
          stdout: 'Collected 1 snapshots, 0 failed',
          exitCode: 0,
          duration: expect.any(Number),
        }),
      })
    )
  })

  it('reports failure for snapshot collection when no accounts are provided', async () => {
    claimOnce({
      run: { _id: 'run-empty', input: { accounts: [] } },
      job: {
        name: 'snapshot-job',
        workerType: 'exec',
        config: { command: '__copilot_snapshot__' },
      },
    })

    await claimAndExecuteOnce()

    expect(fetchCopilotMetrics).not.toHaveBeenCalled()
    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-empty',
      error: 'No accounts provided for snapshot collection',
    })
  })

  it('reports failure for unknown worker type', async () => {
    claimOnce({
      run: { _id: 'run2' },
      job: { name: 'bad-job', workerType: 'unknown', config: {} },
    })

    await claimAndExecuteOnce()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run2',
      error: 'Unknown worker type: unknown',
    })
  })

  it('handles ai worker dispatch', async () => {
    claimOnce({
      run: { _id: 'run3' },
      job: { name: 'ai-job', workerType: 'ai', config: { prompt: 'hello' } },
    })

    await claimAndExecuteOnce()

    expect(aiWorker.execute).toHaveBeenCalledWith({ prompt: 'hello' }, expect.any(AbortSignal))
  })

  it('records a worker execution failure result', async () => {
    vi.mocked(execWorker.execute).mockResolvedValueOnce({
      success: false,
      error: 'worker failed',
      duration: 12,
      exitCode: 1,
      output: '',
    })

    claimOnce({
      run: { _id: 'run-failed-result' },
      job: { name: 'exec-job', workerType: 'exec', config: { command: 'echo nope' } },
    })

    await claimAndExecuteOnce()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-failed-result',
      error: 'worker failed',
    })
  })

  it('records a worker execution thrown error', async () => {
    vi.mocked(execWorker.execute).mockRejectedValueOnce(new Error('kaboom'))

    claimOnce({
      run: { _id: 'run-thrown' },
      job: { name: 'exec-job', workerType: 'exec', config: { command: 'echo nope' } },
    })

    await claimAndExecuteOnce()

    expect(mockClient.mutation).toHaveBeenCalledWith('runs:fail', {
      id: 'run-thrown',
      error: 'kaboom',
    })
  })

  it('marks snapshot collection as failed when metrics fetch fails', async () => {
    vi.mocked(fetchCopilotMetrics).mockResolvedValueOnce({
      success: false,
      error: 'metrics unavailable',
    })

    claimOnce({
      run: {
        _id: 'run-fetch-fail',
        input: { accounts: [{ username: 'alice', org: 'github' }] },
      },
      job: {
        name: 'snapshot-job',
        workerType: 'exec',
        config: { command: '__copilot_snapshot__' },
      },
    })

    await claimAndExecuteOnce()

    expect(mockClient.mutation).not.toHaveBeenCalledWith(
      'copilotUsageHistory:store',
      expect.anything()
    )
    expect(buildSnapshotCollectionOutput).toHaveBeenCalledWith(0, 1)
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({
        id: 'run-fetch-fail',
        output: expect.objectContaining({
          stdout: 'Collected 0 snapshots, 1 failed',
          exitCode: 1,
          duration: expect.any(Number),
        }),
      })
    )
  })

  it('marks snapshot collection as failed when storing metrics throws', async () => {
    vi.mocked(fetchCopilotMetrics).mockResolvedValueOnce({
      success: true,
      data: {
        org: 'github',
        billingYear: 2026,
        billingMonth: 5,
        premiumRequests: 12,
        grossCost: 30,
        discount: 5,
        netCost: 25,
        businessSeats: 20,
        budgetAmount: 100,
        spent: 25,
        fetchedAt: 1715000000000,
      },
    })

    claimOnce(
      {
        run: {
          _id: 'run-store-fail',
          input: { accounts: [{ username: 'alice', org: 'github' }] },
        },
        job: {
          name: 'snapshot-job',
          workerType: 'exec',
          config: { command: '__copilot_snapshot__' },
        },
      },
      async mutation => {
        if (mutation === 'copilotUsageHistory:store') {
          throw new Error('store failed')
        }
        return undefined
      }
    )

    await claimAndExecuteOnce()

    expect(buildSnapshotCollectionOutput).toHaveBeenCalledWith(0, 1)
    expect(mockClient.mutation).toHaveBeenCalledWith(
      'runs:complete',
      expect.objectContaining({
        id: 'run-store-fail',
        output: expect.objectContaining({
          stdout: 'Collected 0 snapshots, 1 failed',
          exitCode: 1,
          duration: expect.any(Number),
        }),
      })
    )
  })

  it('processing guard prevents concurrent poll execution', async () => {
    let resolveClaim: (value: unknown) => void
    const slowClaim = new Promise(resolve => {
      resolveClaim = resolve
    })
    mockClient.mutation.mockReturnValue(slowClaim as never)

    const dispatcher = getPrivateDispatcher()
    const firstPoll = dispatcher.poll()
    await dispatcher.poll()

    expect(mockClient.mutation).toHaveBeenCalledTimes(1)

    resolveClaim!(null)
    await firstPoll
  })

  it('backs off on consecutive errors and stops polling', async () => {
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    mockClient.mutation.mockRejectedValue(new Error('Network error'))

    await getPrivateDispatcher().poll()

    expect(isInBackoffWindow).toHaveBeenCalled()
  })

  it('resets consecutiveErrors on successful poll', async () => {
    const { isInBackoffWindow } = await import('../../src/utils/dispatcherBackoff')
    mockClient.mutation.mockRejectedValueOnce(new Error('Transient error')).mockResolvedValue(null)
    const dispatcher = getPrivateDispatcher()

    await dispatcher.poll()
    await dispatcher.poll()

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
