import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockCopilotSettings = { model: 'claude-sonnet-4.5', ghAccount: 'alice' }
const mockAccounts = [{ username: 'alice', org: 'acme' }]
const mockIncrementStat = vi.fn().mockResolvedValue(undefined)

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: () => mockCopilotSettings,
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

vi.mock('../../hooks/useConvex', () => ({
  useBuddyStatsMutations: () => ({ increment: mockIncrementStat }),
}))

vi.mock('../../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchPRBranches: vi.fn().mockResolvedValue({ headSha: 'sha123' }),
      fetchPRHistory: vi.fn().mockResolvedValue({
        threadsTotal: 5,
        threadsUnaddressed: 2,
        threadsOutdated: 1,
      }),
    }
  }),
}))

const mockInvoke = vi.fn()
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

const mockExecute = vi.fn()
Object.defineProperty(window, 'copilot', {
  value: { execute: mockExecute },
  writable: true,
  configurable: true,
})

import { usePRReviewData } from './usePRReviewData'
import type { PRReviewInfo } from './PRReviewInfo'

const makePRInfo = (overrides: Partial<PRReviewInfo> = {}): PRReviewInfo => ({
  prUrl: 'https://github.com/acme/repo/pull/1',
  prTitle: 'Fix bug',
  prNumber: 1,
  repo: 'repo',
  org: 'acme',
  author: 'bob',
  ...overrides,
})

describe('usePRReviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
    mockExecute.mockResolvedValue({ success: true, resultId: 'r1' })
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    expect(result.current.model).toBe('claude-sonnet-4.5')
    expect(result.current.submitting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.scheduled).toBe(false)
    expect(result.current.savingDefault).toBe(false)
    expect(result.current.scheduleDelay).toBe(5)
  })

  it('sets account from matching org in github accounts', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo({ org: 'acme' })))

    expect(result.current.account).toBe('alice')
  })

  it('generates default prompt with PR URL', () => {
    const prInfo = makePRInfo({ prUrl: 'https://github.com/acme/repo/pull/99' })
    const { result } = renderHook(() => usePRReviewData(prInfo))

    expect(result.current.prompt).toContain('https://github.com/acme/repo/pull/99')
    expect(result.current.prompt).toContain('PR review')
  })

  it('uses initialPrompt if provided', () => {
    const prInfo = makePRInfo({ initialPrompt: 'Custom review instructions' })
    const { result } = renderHook(() => usePRReviewData(prInfo))

    expect(result.current.prompt).toBe('Custom review instructions')
  })

  it('allows setting account and model', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    act(() => result.current.setAccount('bob'))
    expect(result.current.account).toBe('bob')

    act(() => result.current.setModel('gpt-4'))
    expect(result.current.model).toBe('gpt-4')
  })

  it('handleRunNow executes copilot and dispatches event on success', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const onSubmitted = vi.fn()

    const { result } = renderHook(() => usePRReviewData(makePRInfo(), onSubmitted))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'pr-review',
        model: 'claude-sonnet-4.5',
      })
    )
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copilot:open-result' })
    )
    expect(onSubmitted).toHaveBeenCalledWith('r1')
    expect(result.current.submitting).toBe(false)

    dispatchSpy.mockRestore()
  })

  it('handleRunNow sets error on failure', async () => {
    mockExecute.mockResolvedValueOnce({ success: false, error: 'Rate limited' })

    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(result.current.error).toBe('Rate limited')
    expect(result.current.submitting).toBe(false)
  })

  it('handleRunNow catches exceptions', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Network down'))

    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(result.current.error).toBe('Network down')
    expect(result.current.submitting).toBe(false)
  })

  it('handleRunNow does nothing while already submitting', async () => {
    let resolveExecute: (v: unknown) => void
    mockExecute.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveExecute = resolve
        })
    )

    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    // Start first submission (don't await)
    act(() => {
      result.current.handleRunNow()
    })
    expect(result.current.submitting).toBe(true)

    // Try second submission while first is in progress
    await act(async () => {
      await result.current.handleRunNow()
    })

    // Resolve first
    await act(async () => {
      resolveExecute!({ success: true, resultId: 'r1' })
    })

    // Should have only been called once
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('handleSchedule sets scheduled flag', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    await act(async () => {
      await result.current.handleSchedule()
    })

    expect(result.current.scheduled).toBe(true)
    expect(result.current.submitting).toBe(false)

    vi.useRealTimers()
  })

  it('handleResetPrompt resets to default', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    const original = result.current.prompt
    act(() => result.current.setPrompt('modified'))
    expect(result.current.prompt).toBe('modified')

    act(() => result.current.handleResetPrompt())
    expect(result.current.prompt).toBe(original)
  })

  it('handleSaveAsDefault saves template via IPC', async () => {
    mockInvoke.mockResolvedValue(undefined)

    const prInfo = makePRInfo({ prUrl: 'https://github.com/acme/repo/pull/1' })
    const { result } = renderHook(() => usePRReviewData(prInfo))

    await act(async () => {
      await result.current.handleSaveAsDefault()
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'config:set-copilot-pr-review-prompt-template',
      expect.stringContaining('{{prUrl}}')
    )
    expect(result.current.savingDefault).toBe(false)
  })

  it('handleSaveAsDefault does nothing when prompt is empty', async () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    act(() => result.current.setPrompt('   '))

    await act(async () => {
      await result.current.handleSaveAsDefault()
    })

    expect(mockInvoke).not.toHaveBeenCalledWith(
      'config:set-copilot-pr-review-prompt-template',
      expect.anything()
    )
  })

  it('promptExpanded state toggles correctly', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    expect(result.current.promptExpanded).toBe(false)
    act(() => result.current.setPromptExpanded(true))
    expect(result.current.promptExpanded).toBe(true)
  })

  it('scheduleDelay can be set', () => {
    const { result } = renderHook(() => usePRReviewData(makePRInfo()))

    act(() => result.current.setScheduleDelay(10))
    expect(result.current.scheduleDelay).toBe(10)
  })

  it('loads saved template from IPC on mount', async () => {
    mockInvoke.mockResolvedValueOnce('Review {{prUrl}} with extra care')

    const { result } = renderHook(() =>
      usePRReviewData(makePRInfo({ prUrl: 'https://github.com/acme/repo/pull/5' }))
    )

    await waitFor(() => {
      expect(result.current.prompt).toContain('https://github.com/acme/repo/pull/5')
    })
  })
})
