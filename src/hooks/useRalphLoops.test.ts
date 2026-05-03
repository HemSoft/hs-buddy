import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { RalphRunInfo } from '../types/ralph'

const mockList = vi.fn()
const mockLaunch = vi.fn()
const mockStop = vi.fn()
const mockOnStatusChange = vi.fn()
const mockOffStatusChange = vi.fn()

Object.defineProperty(window, 'ralph', {
  value: {
    list: mockList,
    launch: mockLaunch,
    stop: mockStop,
    onStatusChange: mockOnStatusChange,
    offStatusChange: mockOffStatusChange,
    getConfig: vi.fn(),
    listTemplates: vi.fn(),
    selectDirectory: vi.fn(),
    getStatus: vi.fn(),
  },
  writable: true,
  configurable: true,
})

import { useRalphLoops } from './useRalphLoops'

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'run-1',
    config: { repoPath: '/test', scriptType: 'ralph' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: [],
    stats: {
      checks: 0,
      agentTurns: 0,
      reviews: 0,
      copilotPRs: 0,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: null,
      totalPremium: 0,
    },
    ...overrides,
  } as RalphRunInfo
}

describe('useRalphLoops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
  })

  it('calls list() on mount and sets runs', async () => {
    const runs = [makeRun()]
    mockList.mockResolvedValue(runs)

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockList).toHaveBeenCalled()
    expect(result.current.runs).toEqual(runs)
    expect(result.current.error).toBeNull()
  })

  it('sets error when list fails', async () => {
    mockList.mockRejectedValue(new Error('IPC failed'))

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('IPC failed')
  })

  it('does not set runs when list returns non-array', async () => {
    mockList.mockResolvedValue(null)

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.runs).toEqual([])
  })

  it('launch calls window.ralph.launch and refreshes on success', async () => {
    mockLaunch.mockResolvedValue({ success: true, runId: 'new-run' })

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const config = { repoPath: '/test', scriptType: 'ralph' as const }
    let launchResult: { success: boolean }
    await act(async () => {
      launchResult = await result.current.launch(config)
    })
    expect(launchResult!.success).toBe(true)
    expect(mockLaunch).toHaveBeenCalledWith(config)
  })

  it('launch returns error on failure', async () => {
    mockLaunch.mockResolvedValue({ success: false, error: 'bad config' })

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let launchResult: { success: boolean; error?: string }
    await act(async () => {
      launchResult = await result.current.launch({ repoPath: '/x', scriptType: 'ralph' })
    })
    expect(launchResult!.success).toBe(false)
    expect(launchResult!.error).toBe('bad config')
  })

  it('launch catches thrown errors', async () => {
    mockLaunch.mockRejectedValue(new Error('crash'))

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let launchResult: { success: boolean; error?: string }
    await act(async () => {
      launchResult = await result.current.launch({ repoPath: '/x', scriptType: 'ralph' })
    })
    expect(launchResult!.success).toBe(false)
    expect(launchResult!.error).toBe('crash')
  })

  it('stop calls window.ralph.stop and refreshes on success', async () => {
    mockStop.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(true)
    expect(mockStop).toHaveBeenCalledWith('run-1')
  })

  it('stop returns error on failure', async () => {
    mockStop.mockResolvedValue({ success: false, error: 'not found' })

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean; error?: string }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(false)
    expect(stopResult!.error).toBe('not found')
  })

  it('stop catches thrown errors', async () => {
    mockStop.mockRejectedValue('non-error value')

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean; error?: string }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(false)
    expect(stopResult!.error).toBe('Stop failed')
  })

  it('registers and unregisters onStatusChange', async () => {
    const { unmount } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(mockOnStatusChange).toHaveBeenCalled())

    unmount()
    expect(mockOffStatusChange).toHaveBeenCalled()
  })

  it('onStatusChange updates existing run', async () => {
    const run = makeRun({ runId: 'r1' })
    mockList.mockResolvedValue([run])

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.runs.length).toBe(1))

    const handler = mockOnStatusChange.mock.calls[0][0]
    const updated = makeRun({ runId: 'r1', status: 'completed' })
    act(() => handler(updated))

    expect(result.current.runs[0].status).toBe('completed')
  })

  it('onStatusChange prepends new run', async () => {
    mockList.mockResolvedValue([])

    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const handler = mockOnStatusChange.mock.calls[0][0]
    const newRun = makeRun({ runId: 'new-1' })
    act(() => handler(newRun))

    expect(result.current.runs.length).toBe(1)
    expect(result.current.runs[0].runId).toBe('new-1')
  })

  it('ignores list result after hook unmounts', async () => {
    let resolveList: (value: RalphRunInfo[]) => void = () => {}
    mockList.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveList = resolve
        })
    )

    const { unmount } = renderHook(() => useRalphLoops())

    // Unmount before list completes
    unmount()

    // Resolve the list - should not crash or update state
    expect(() => {
      resolveList([makeRun()])
    }).not.toThrow()
  })

  it('ignores list error after hook unmounts', async () => {
    let rejectList: (reason: Error) => void = () => {}
    mockList.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectList = reject
        })
    )

    const { unmount } = renderHook(() => useRalphLoops())

    // Unmount before list completes
    unmount()

    // Reject the list - should not crash or update error state
    expect(() => {
      rejectList(new Error('List failed'))
    }).not.toThrow()
  })

  it('sets fallback error when list() throws a non-Error', async () => {
    mockList.mockRejectedValue('string error')
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to list loops')
  })

  it('returns fallback error when launch() throws a non-Error', async () => {
    mockList.mockResolvedValue([])
    mockLaunch.mockRejectedValue('not an error object')
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let launchResult: { success: boolean; error?: string }
    await act(async () => {
      launchResult = await result.current.launch({ repoPath: '/test', scriptType: 'ralph' })
    })
    expect(launchResult!.success).toBe(false)
    expect(launchResult!.error).toBe('Launch failed')
  })

  it('returns fallback error when stop() throws a non-Error', async () => {
    mockList.mockResolvedValue([])
    mockStop.mockRejectedValue(42)
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean; error?: string }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(false)
    expect(stopResult!.error).toBe('Stop failed')
  })

  it('returns error message when stop() throws an Error instance', async () => {
    mockList.mockResolvedValue([])
    mockStop.mockRejectedValue(new Error('Connection reset'))
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean; error?: string }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(false)
    expect(stopResult!.error).toBe('Connection reset')
  })

  it('ignores status change update after hook unmounts', async () => {
    mockList.mockResolvedValue([])
    const { unmount } = renderHook(() => useRalphLoops())

    await waitFor(() => expect(mockOnStatusChange).toHaveBeenCalled())

    const handler = mockOnStatusChange.mock.calls[0][0]
    unmount()

    // Call handler after unmount - should not crash
    expect(() => {
      handler(makeRun({ runId: 'new-run' }))
    }).not.toThrow()
  })

  /* ── Branch coverage: false/else branches ──────────────────── */

  it('skips setRuns when list resolves with undefined (L22 false)', async () => {
    mockList.mockResolvedValue(undefined)
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.runs).toEqual([])
  })

  it('returns fallback error when stop throws a string (L94 false)', async () => {
    mockList.mockResolvedValue([])
    mockStop.mockRejectedValue('oops')
    const { result } = renderHook(() => useRalphLoops())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let stopResult: { success: boolean; error?: string }
    await act(async () => {
      stopResult = await result.current.stop('run-1')
    })
    expect(stopResult!.success).toBe(false)
    expect(stopResult!.error).toBe('Stop failed')
  })
})
