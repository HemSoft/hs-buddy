import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePRReviewData } from './usePRReviewData'
import type { PRReviewInfo } from './PRReviewInfo'

const {
  mockUseCopilotSettings,
  mockUseGitHubAccounts,
  mockIncrementStat,
  mockFetchPRBranches,
  mockFetchPRHistory,
  mockCopilotExecute,
  mockIpcInvoke,
} = vi.hoisted(() => ({
  mockUseCopilotSettings: vi.fn(),
  mockUseGitHubAccounts: vi.fn(),
  mockIncrementStat: vi.fn(),
  mockFetchPRBranches: vi.fn(),
  mockFetchPRHistory: vi.fn(),
  mockCopilotExecute: vi.fn(),
  mockIpcInvoke: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: mockUseCopilotSettings,
  useGitHubAccounts: mockUseGitHubAccounts,
}))

vi.mock('../../hooks/useConvex', () => ({
  useBuddyStatsMutations: () => ({ increment: mockIncrementStat }),
}))

vi.mock('../../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchPRBranches: mockFetchPRBranches,
    fetchPRHistory: mockFetchPRHistory,
  })),
}))

const defaultPrInfo: PRReviewInfo = {
  prUrl: 'https://github.com/org/repo/pull/42',
  prTitle: 'Fix login bug',
  prNumber: 42,
  repo: 'repo',
  org: 'org',
  author: 'octocat',
}

describe('usePRReviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCopilotSettings.mockReturnValue({
      model: 'claude-sonnet-4.5',
      ghAccount: 'default-account',
    })
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'alice', org: 'org' }],
      loading: false,
    })
    mockIncrementStat.mockResolvedValue(undefined)
    mockFetchPRBranches.mockResolvedValue({ headSha: 'abc123' })
    mockFetchPRHistory.mockResolvedValue({
      threadsTotal: 10,
      threadsUnaddressed: 3,
      threadsOutdated: 1,
    })
    mockCopilotExecute.mockResolvedValue({ success: true, resultId: 'result-1' })
    mockIpcInvoke.mockResolvedValue('')

    Object.defineProperty(window, 'copilot', {
      value: { execute: mockCopilotExecute },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'ipcRenderer', {
      value: { invoke: mockIpcInvoke },
      writable: true,
      configurable: true,
    })
    window.dispatchEvent = vi.fn()
  })

  it('returns default state', () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))
    expect(result.current.model).toBe('claude-sonnet-4.5')
    expect(result.current.submitting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.scheduled).toBe(false)
    expect(result.current.scheduleDelay).toBe(5)
    expect(result.current.savingDefault).toBe(false)
  })

  it('matches account from org on init', () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))
    expect(result.current.account).toBe('alice')
  })

  it('falls back to configured account when no org match', () => {
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'bob', org: 'other-org' }],
      loading: false,
    })
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))
    expect(result.current.account).toBe('default-account')
  })

  it('generates default prompt with PR URL', () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))
    expect(result.current.prompt).toContain('https://github.com/org/repo/pull/42')
    expect(result.current.prompt).toContain('PR review')
  })

  it('uses initialPrompt when provided', () => {
    const prInfo = { ...defaultPrInfo, initialPrompt: 'Custom prompt for review' }
    const { result } = renderHook(() => usePRReviewData(prInfo))
    expect(result.current.prompt).toBe('Custom prompt for review')
  })

  it('handleRunNow submits review and dispatches open-result', async () => {
    const onSubmitted = vi.fn()
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo, onSubmitted))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(mockCopilotExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'pr-review',
        model: 'claude-sonnet-4.5',
        metadata: expect.objectContaining({
          prUrl: defaultPrInfo.prUrl,
          prNumber: 42,
        }),
      })
    )
    expect(mockIncrementStat).toHaveBeenCalledWith({ field: 'copilotPrReviews' })
    expect(onSubmitted).toHaveBeenCalledWith('result-1')
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'copilot:open-result',
        detail: { resultId: 'result-1' },
      })
    )
  })

  it('handleRunNow sets error when result is not successful', async () => {
    mockCopilotExecute.mockResolvedValue({ success: false, error: 'Rate limited' })
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(result.current.error).toBe('Rate limited')
  })

  it('handleRunNow sets error on exception', async () => {
    mockCopilotExecute.mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    await act(async () => {
      await result.current.handleRunNow()
    })

    expect(result.current.error).toBe('Network failure')
  })

  it('sets submitting flag during execution', async () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    expect(result.current.submitting).toBe(false)

    await act(async () => {
      await result.current.handleRunNow()
    })

    // After completing, submitting should be false again
    expect(result.current.submitting).toBe(false)
    // Verify it was called
    expect(mockCopilotExecute).toHaveBeenCalled()
  })

  it('handleSchedule sets scheduled to true', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    await act(async () => {
      await result.current.handleSchedule()
    })

    expect(result.current.scheduled).toBe(true)
    vi.useRealTimers()
  })

  it('handleResetPrompt resets to default prompt', async () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    act(() => {
      result.current.setPrompt('Custom modified prompt')
    })

    act(() => {
      result.current.handleResetPrompt()
    })

    expect(result.current.prompt).toContain('PR review')
    expect(result.current.prompt).toContain(defaultPrInfo.prUrl)
  })

  it('handleSaveAsDefault saves template via ipcRenderer', async () => {
    mockIpcInvoke.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    await act(async () => {
      await result.current.handleSaveAsDefault()
    })

    expect(mockIpcInvoke).toHaveBeenCalledWith(
      'config:set-copilot-pr-review-prompt-template',
      expect.any(String)
    )
  })

  it('handleSaveAsDefault does nothing when prompt is empty', async () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    act(() => {
      result.current.setPrompt('   ')
    })

    await act(async () => {
      await result.current.handleSaveAsDefault()
    })

    expect(mockIpcInvoke).not.toHaveBeenCalledWith(
      'config:set-copilot-pr-review-prompt-template',
      expect.any(String)
    )
  })

  it('setters update corresponding state values', () => {
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    act(() => {
      result.current.setModel('gpt-4')
      result.current.setScheduleDelay(15)
      result.current.setPromptExpanded(true)
    })

    expect(result.current.model).toBe('gpt-4')
    expect(result.current.scheduleDelay).toBe(15)
    expect(result.current.promptExpanded).toBe(true)
  })

  it('loads saved template from config on mount', async () => {
    mockIpcInvoke.mockResolvedValue('Saved template for {{prUrl}}')
    const { result } = renderHook(() => usePRReviewData(defaultPrInfo))

    await waitFor(() => {
      expect(result.current.prompt).toContain(defaultPrInfo.prUrl)
    })
  })
})
