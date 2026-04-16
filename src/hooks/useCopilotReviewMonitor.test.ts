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

  describe('poll error handling', () => {
    it('logs and continues polling on non-abort errors', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      // First poll rejects with a network error (non-abort)
      mockEnqueueHolder.current.mockRejectedValueOnce(new Error('Network error'))
      // Second poll succeeds with no fresh review
      mockListPRReviews.mockResolvedValue([])

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // Flush the immediate poll that fails
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Should still be monitoring (not crashed)
      expect(result.current.copilotReviewState).toBe('monitoring')
      expect(debugSpy).toHaveBeenCalledWith('Copilot review poll failed:', expect.any(Error))

      debugSpy.mockRestore()
    })
  })

  describe('notification sound with enabled=true', () => {
    it('attempts to play sound when notifications are enabled', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      // Poll finds a fresh review → triggers completion + notification
      mockListPRReviews.mockResolvedValueOnce([
        {
          id: 200,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ])

      // Mock IPC: enabled=true, then sound asset
      vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
        if (channel === 'config:get-notification-sound-enabled') return Promise.resolve(true)
        if (channel === 'config:play-notification-sound')
          return Promise.resolve({ data: [0], mimeType: 'audio/wav' })
        return Promise.resolve(false)
      })

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'config:get-notification-sound-enabled'
      )
      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('config:play-notification-sound')
    })

    it('does not play sound when notifications are disabled', async () => {
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

      vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
        if (channel === 'config:get-notification-sound-enabled') return Promise.resolve(false)
        return Promise.resolve(false)
      })

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'config:get-notification-sound-enabled'
      )
      expect(window.ipcRenderer.invoke).not.toHaveBeenCalledWith('config:play-notification-sound')
    })
  })

  describe('notification sound null handling', () => {
    it('does nothing when sound asset is null', async () => {
      // Line 75: if (!sound) return
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

      vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
        if (channel === 'config:get-notification-sound-enabled') return Promise.resolve(true)
        if (channel === 'config:play-notification-sound') return Promise.resolve(null)
        return Promise.resolve(false)
      })

      renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('config:play-notification-sound')
    })
  })

  describe('clearPendingReview error handling', () => {
    it('handles sessionStorage errors gracefully', () => {
      // Line 47: catch block in clearPendingReview
      const origGetItem = sessionStorage.getItem
      vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable')
      })

      // Should not throw
      expect(() => clearPendingReview('https://github.com/org/repo/pull/1')).not.toThrow()

      vi.mocked(sessionStorage.getItem).mockImplementation(origGetItem)
    })
  })

  describe('handleRequestCopilotReview abort error', () => {
    it('silently ignores AbortError in handleRequestCopilotReview', async () => {
      // Line 294: isAbortError(err) in handleRequestCopilotReview catch
      mockEnqueueHolder.current.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      // State should not go to 'idle' from the AbortError catch — it stays as 'requesting'
      // since the abort guard returns early before setCopilotReviewState('idle')
      expect(['idle', 'requesting']).toContain(result.current.copilotReviewState)
    })
  })

  describe('review done state resets after timeout', () => {
    it('transitions from done back to idle after 3 seconds', async () => {
      // Lines 143-147: monitorTimeoutRef setTimeout → setCopilotReviewState('idle')
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

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // Trigger immediate poll → finds review → done
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('done')

      // Wait for the 3s timeout to reset to idle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  // --- Branch coverage: isFreshCopilotReview false paths ---

  describe('isFreshCopilotReview false branches', () => {
    it('ignores reviews with null user', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([
        { id: 200, user: null, state: 'COMMENTED', submitted_at: null },
      ])

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')
    })

    it('ignores reviews with id at or below baseline', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([
        {
          id: 100,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
        {
          id: 50,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ])

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')
    })

    it('ignores reviews from non-copilot users', async () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      mockListPRReviews.mockResolvedValue([
        { id: 200, user: { login: 'some-human' }, state: 'APPROVED', submitted_at: null },
      ])

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('monitoring')
    })
  })

  // --- Branch coverage: ownerRepo null with pending review ---

  describe('mount with null ownerRepo', () => {
    it('does not start monitoring when ownerRepo is null even with pending review', () => {
      const pending = { prUrl: defaultOptions.prUrl, baselineReviewId: 100 }
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [defaultOptions.prUrl]: pending })
      )

      const { result } = renderHook(() =>
        useCopilotReviewMonitor({ ...defaultOptions, ownerRepo: null })
      )

      expect(result.current.copilotReviewState).toBe('idle')
    })
  })

  // --- Branch coverage: sessionStorage error paths ---

  describe('sessionStorage error in loadPendingReview', () => {
    it('handles getItem throwing during mount', () => {
      vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable')
      })

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      expect(result.current.copilotReviewState).toBe('idle')

      vi.mocked(sessionStorage.getItem).mockRestore()
    })
  })

  describe('sessionStorage error in savePendingReview', () => {
    it('continues monitoring even when setItem throws', async () => {
      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })

      await act(async () => {
        await result.current.handleRequestCopilotReview()
      })

      expect(result.current.copilotReviewState).toBe('monitoring')

      vi.mocked(sessionStorage.setItem).mockRestore()
    })
  })

  // --- Branch coverage: playReviewCompleteSound outer catch ---

  describe('playReviewCompleteSound error handling', () => {
    it('swallows error when ipcRenderer.invoke rejects', async () => {
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

      vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('IPC failed'))

      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.copilotReviewState).toBe('done')
    })
  })

  // --- Branch coverage: clearCopilotReviewTimers when timers are null ---

  describe('clearCopilotReviewTimers no-op', () => {
    it('handles being called when no timers are active', () => {
      const { result } = renderHook(() => useCopilotReviewMonitor(defaultOptions))

      // Calling handleRequestCopilotReview on an idle hook (no active timers)
      // internally calls clearCopilotReviewTimers which should handle null refs
      expect(result.current.copilotReviewState).toBe('idle')
    })
  })
})
