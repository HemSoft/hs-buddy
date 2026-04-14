import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// --- Hoisted mocks (available inside vi.mock factories) ---

const { mockListPRReviews, mockRequestCopilotReview, mockEnqueueHolder } = vi.hoisted(() => ({
  mockListPRReviews: vi.fn().mockResolvedValue([]),
  mockRequestCopilotReview: vi.fn().mockResolvedValue(undefined),
  mockEnqueueHolder: { current: vi.fn() },
}))

vi.mock('../api/github', () => ({
  // Must use regular function (not arrow) since source calls `new GitHubClient(...)`
  GitHubClient: vi.fn().mockImplementation(function () {
    return { listPRReviews: mockListPRReviews, requestCopilotReview: mockRequestCopilotReview }
  }),
}))

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [{ username: 'testuser', org: 'testorg' }],
    loading: false,
  }),
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueueHolder.current }),
}))

vi.mock('../utils/notificationSound', () => ({
  createNotificationSoundBlob: vi.fn(),
}))

import { useCopilotReviewMonitor, clearPendingReview } from './useCopilotReviewMonitor'

const COPILOT_REVIEW_POLL_MS = 15_000
const MAX_COPILOT_REVIEW_POLLS = 40

const defaultOptions = {
  prId: 42,
  prUrl: 'https://github.com/org/repo/pull/42',
  ownerRepo: { owner: 'org', repo: 'repo' },
}

describe('useCopilotReviewMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()

    // Clear specific mocks instead of clearAllMocks (which resets constructor impls)
    mockListPRReviews.mockClear()
    mockListPRReviews.mockResolvedValue([])
    mockRequestCopilotReview.mockClear()
    mockRequestCopilotReview.mockResolvedValue(undefined)

    // Default enqueue: executes the callback immediately with a mock signal
    mockEnqueueHolder.current = vi
      .fn()
      .mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
        const controller = new AbortController()
        return fn(controller.signal)
      })

    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(false),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state with no banner', () => {
    const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))
    expect(result.current.copilotReviewState).toBe('idle')
    expect(result.current.copilotReviewBanner).toBeNull()
  })

  describe('polling uses task queue', () => {
    it('routes poll requests through enqueue', async () => {
      // Set up pending review in sessionStorage so monitoring starts on mount
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // The immediate poll on mount should have called enqueue
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockEnqueueHolder.current).toHaveBeenCalled()
      // The enqueue call should have included a task name
      const lastCall = mockEnqueueHolder.current.mock.calls[0]
      expect(lastCall[1]).toEqual(
        expect.objectContaining({ name: expect.stringContaining('copilot-review-poll') })
      )
    })

    it('routes subsequent polls through enqueue', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([])

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // First poll on mount
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const callCountAfterFirst = mockEnqueueHolder.current.mock.calls.length

      // Advance timer to trigger next poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COPILOT_REVIEW_POLL_MS)
      })

      expect(mockEnqueueHolder.current.mock.calls.length).toBeGreaterThan(callCountAfterFirst)
    })
  })

  describe('restore pending review on mount', () => {
    it('starts monitoring when sessionStorage has a pending review', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 50 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')
    })

    it('stays idle when no pending review in sessionStorage', () => {
      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))
      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  describe('stops polling after MAX_COPILOT_REVIEW_POLLS', () => {
    it('transitions to idle after max polls', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([])

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // First immediate poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Advance through all polls
      for (let i = 0; i < MAX_COPILOT_REVIEW_POLLS + 1; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(COPILOT_REVIEW_POLL_MS)
        })
      }

      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  describe('cancels stale sessions on PR change', () => {
    it('stops monitoring when PR changes', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([])

      const { result, rerender } = renderHook(props => useCopilotReviewMonitor(props), {
        initialProps: defaultOptions,
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')

      // Change PR
      const newOptions = {
        prId: 99,
        prUrl: 'https://github.com/org/repo/pull/99',
        ownerRepo: { owner: 'org', repo: 'repo' },
      }

      act(() => {
        rerender(newOptions)
      })

      // Should reset to idle (no pending review for new PR)
      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  describe('handleRequestCopilotReview', () => {
    it('transitions through requesting → monitoring states', async () => {
      mockListPRReviews.mockResolvedValue([
        {
          id: 10,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ])
      mockRequestCopilotReview.mockResolvedValue(undefined)

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      expect(result.current.copilotReviewState).toBe('idle')

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      // After the enqueued request completes, it saves to sessionStorage and starts monitoring
      expect(result.current.copilotReviewState).toBe('monitoring')

      // Should have saved to sessionStorage
      const stored = JSON.parse(sessionStorage.getItem('hs-buddy:pending-copilot-reviews') ?? '{}')
      expect(stored[defaultOptions.prUrl]).toBeDefined()
      expect(stored[defaultOptions.prUrl].baselineReviewId).toBe(10)
    })

    it('does nothing when ownerRepo is null', async () => {
      const { result } = renderHook(() =>
        useCopilotReviewMonitor({ ...defaultOptions, ownerRepo: null })
      )

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      expect(result.current.copilotReviewState).toBe('idle')
      expect(mockEnqueueHolder.current).not.toHaveBeenCalled()
    })

    it('does nothing when not in idle state', async () => {
      // Start with pending review to be in monitoring state
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')

      const callCountBefore = mockEnqueueHolder.current.mock.calls.length

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      // handleRequestCopilotReview should not enqueue additional request calls
      // (only poll calls continue)
      // The guard `copilotReviewState !== 'idle'` prevents re-requesting
      expect(mockEnqueueHolder.current.mock.calls.length).toBe(callCountBefore)
      expect(result.current.copilotReviewState).toBe('monitoring')
    })
  })

  describe('review completion', () => {
    it('detects a fresh Copilot review and transitions to done', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      // First poll returns no fresh review
      mockListPRReviews.mockResolvedValueOnce([])
      // Second poll finds a fresh review
      mockListPRReviews.mockResolvedValueOnce([
        {
          id: 200,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ])

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // First poll (immediate)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')

      // Second poll after timer — use advanceTimersByTimeAsync to flush async callbacks
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COPILOT_REVIEW_POLL_MS)
      })

      expect(result.current.copilotReviewState).toBe('done')
      expect(result.current.copilotReviewBanner).not.toBeNull()

      // Pending review should be cleared from sessionStorage
      const stored = JSON.parse(sessionStorage.getItem('hs-buddy:pending-copilot-reviews') ?? '{}')
      expect(stored[defaultOptions.prUrl]).toBeUndefined()
    })
  })

  describe('AbortError handling', () => {
    it('silently ignores AbortError during polling', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockEnqueueHolder.current.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Should not crash — state should still be monitoring (or idle if effect reset it)
      expect(['monitoring', 'idle']).toContain(result.current.copilotReviewState)
    })

    it('returns to idle on non-abort errors in handleRequestCopilotReview', async () => {
      mockEnqueueHolder.current.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  describe('notification side effect', () => {
    it('triggers IPC notification check on review completion', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValueOnce([
        {
          id: 200,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ])

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // Flush the async immediate poll + notification side effect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // The notification sound function calls ipcRenderer.invoke for sound config
      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'config:get-notification-sound-enabled'
      )
    })
  })

  describe('clearPendingReview', () => {
    it('removes a specific PR from sessionStorage', () => {
      const reviews = {
        'https://github.com/org/repo/pull/1': {
          prUrl: 'https://github.com/org/repo/pull/1',
          baselineReviewId: 10,
        },
        'https://github.com/org/repo/pull/2': {
          prUrl: 'https://github.com/org/repo/pull/2',
          baselineReviewId: 20,
        },
      }
      sessionStorage.setItem('hs-buddy:pending-copilot-reviews', JSON.stringify(reviews))

      clearPendingReview('https://github.com/org/repo/pull/1')

      const stored = JSON.parse(sessionStorage.getItem('hs-buddy:pending-copilot-reviews') ?? '{}')
      expect(stored['https://github.com/org/repo/pull/1']).toBeUndefined()
      expect(stored['https://github.com/org/repo/pull/2']).toBeDefined()
    })
  })
})
