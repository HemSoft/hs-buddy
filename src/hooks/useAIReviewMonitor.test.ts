import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockEnqueueHolder } = vi.hoisted(() => ({
  mockEnqueueHolder: { current: vi.fn() },
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

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {}
  }),
}))

import { useAIReviewMonitor, clearPendingAIReview } from './useAIReviewMonitor'
import type { AIReviewProvider } from '../reviewProviders/types'

const POLL_MS = 15_000

function makeProvider(overrides: Partial<AIReviewProvider> = {}): AIReviewProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    botLogin: 'test-bot[bot]',
    iconName: 'Sparkles',
    capabilities: { canTrigger: true, canMonitor: true },
    detect: vi.fn().mockResolvedValue(true),
    trigger: vi.fn().mockResolvedValue(undefined),
    getCheckpoint: vi.fn().mockResolvedValue({ baseline: 0 }),
    poll: vi.fn().mockResolvedValue({ status: 'pending' }),
    ...overrides,
  }
}

const defaultOptions = {
  prId: 42,
  prUrl: 'https://github.com/org/repo/pull/42',
  ownerRepo: { owner: 'org', repo: 'repo' },
}

describe('useAIReviewMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()

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
    const provider = makeProvider()
    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))
    expect(result.current.reviewState).toBe('idle')
    expect(result.current.reviewBanner).toBeNull()
  })

  it('transitions through requesting → monitoring → done on successful review', async () => {
    const provider = makeProvider({
      getCheckpoint: vi.fn().mockResolvedValue({ baseline: 10 }),
      trigger: vi.fn().mockResolvedValue(undefined),
      poll: vi.fn().mockResolvedValue({ status: 'completed' }),
    })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    // Request the review
    await act(async () => {
      await result.current.handleRequestReview()
    })

    // Should now be monitoring (trigger completed, polls scheduled)
    expect(result.current.reviewState).toBe('monitoring')

    // Advance timer to trigger first poll
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    // Poll returns completed → should be done
    expect(result.current.reviewState).toBe('done')
    expect(result.current.reviewBanner).not.toBeNull()
  })

  it('does not request if state is not idle', async () => {
    const triggerFn = vi.fn().mockResolvedValue(undefined)
    const provider = makeProvider({
      trigger: triggerFn,
      poll: vi.fn().mockResolvedValue({ status: 'pending' }),
    })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    // First request succeeds
    await act(async () => {
      await result.current.handleRequestReview()
    })
    expect(triggerFn).toHaveBeenCalledTimes(1)

    // Second request is a no-op (state is monitoring)
    await act(async () => {
      await result.current.handleRequestReview()
    })
    expect(triggerFn).toHaveBeenCalledTimes(1)
  })

  it('does not request without ownerRepo', async () => {
    const triggerFn = vi.fn().mockResolvedValue(undefined)
    const provider = makeProvider({ trigger: triggerFn })

    const { result } = renderHook(() =>
      useAIReviewMonitor({ provider, prId: 42, prUrl: 'url', ownerRepo: null })
    )

    await act(async () => {
      await result.current.handleRequestReview()
    })
    expect(triggerFn).not.toHaveBeenCalled()
  })

  it('resets to idle after max polls exceeded', async () => {
    const provider = makeProvider({
      poll: vi.fn().mockResolvedValue({ status: 'pending' }),
    })

    const { result } = renderHook(() =>
      useAIReviewMonitor({ provider, ...defaultOptions, maxPolls: 2 })
    )

    await act(async () => {
      await result.current.handleRequestReview()
    })

    // Advance past max polls
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('idle')
  })

  it('resets to idle on poll failure status', async () => {
    const provider = makeProvider({
      poll: vi.fn().mockResolvedValue({ status: 'failed' }),
    })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await result.current.handleRequestReview()
    })

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('idle')
  })

  it('clearPendingAIReview removes from sessionStorage', () => {
    const key = 'hs-buddy:pending-ai-reviews'
    const data = {
      'test-provider:https://url': {
        providerId: 'test-provider',
        prUrl: 'https://url',
        checkpoint: {},
      },
    }
    sessionStorage.setItem(key, JSON.stringify(data))
    clearPendingAIReview('test-provider', 'https://url')
    const stored = JSON.parse(sessionStorage.getItem(key) ?? '{}')
    expect(stored['test-provider:https://url']).toBeUndefined()
  })

  it('clearPendingAIReview is safe when storage key does not exist', () => {
    sessionStorage.removeItem('hs-buddy:pending-ai-reviews')
    expect(() => clearPendingAIReview('test-provider', 'https://url')).not.toThrow()
  })

  it('recovers pending review from sessionStorage on mount', async () => {
    const key = 'hs-buddy:pending-ai-reviews'
    const prUrl = 'https://github.com/org/repo/pull/42'
    const data = {
      [`test-provider:${prUrl}`]: {
        providerId: 'test-provider',
        prUrl,
        checkpoint: { baseline: 5 },
      },
    }
    sessionStorage.setItem(key, JSON.stringify(data))

    const pollFn = vi.fn().mockResolvedValue({ status: 'completed' })
    const provider = makeProvider({ poll: pollFn })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    // Should immediately start monitoring from persisted state
    // The effect runs immediately with runImmediately=true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.reviewState).toBe('done')
  })

  it('transitions from done back to idle after 3 seconds', async () => {
    const provider = makeProvider({
      poll: vi.fn().mockResolvedValue({ status: 'completed' }),
    })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await result.current.handleRequestReview()
    })

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('done')

    // After 3s timeout, goes back to idle
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.reviewState).toBe('idle')
  })

  it('continues polling when poll throws a non-abort error', async () => {
    const pollFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ status: 'completed' })
    const provider = makeProvider({ poll: pollFn })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await result.current.handleRequestReview()
    })

    // First poll throws — should schedule next poll
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('monitoring')

    // Second poll succeeds
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('done')
  })

  it('resets to idle when request trigger throws an error', async () => {
    const provider = makeProvider({
      trigger: vi.fn().mockRejectedValue(new Error('forbidden')),
    })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await result.current.handleRequestReview()
    })

    expect(result.current.reviewState).toBe('idle')
  })

  it('continues polling from runImmediately path when poll throws', async () => {
    const key = 'hs-buddy:pending-ai-reviews'
    const prUrl = 'https://github.com/org/repo/pull/42'
    const data = {
      [`test-provider:${prUrl}`]: {
        providerId: 'test-provider',
        prUrl,
        checkpoint: { baseline: 5 },
      },
    }
    sessionStorage.setItem(key, JSON.stringify(data))

    const pollFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ status: 'completed' })
    const provider = makeProvider({ poll: pollFn })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    // runImmediately poll fails — should still schedule next
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.reviewState).toBe('monitoring')

    // Next scheduled poll succeeds
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('done')
  })

  it('schedules next poll from runImmediately when result is pending', async () => {
    const key = 'hs-buddy:pending-ai-reviews'
    const prUrl = 'https://github.com/org/repo/pull/42'
    const data = {
      [`test-provider:${prUrl}`]: {
        providerId: 'test-provider',
        prUrl,
        checkpoint: { baseline: 5 },
      },
    }
    sessionStorage.setItem(key, JSON.stringify(data))

    const pollFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'completed' })
    const provider = makeProvider({ poll: pollFn })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    // runImmediately poll returns pending — schedules next poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.reviewState).toBe('monitoring')

    // Next scheduled poll completes
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(result.current.reviewState).toBe('done')
  })

  it('clearPendingAIReview swallows sessionStorage errors', () => {
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearPendingAIReview('test-provider', 'https://url')).not.toThrow()
    vi.restoreAllMocks()
  })

  it('stays idle when sessionStorage contains corrupted JSON for pending review', () => {
    sessionStorage.setItem('hs-buddy:pending-ai-reviews', '%%%invalid-json%%%')
    const provider = makeProvider()
    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))
    expect(result.current.reviewState).toBe('idle')
  })

  it('stays idle and does not poll when pending JSON is corrupted', async () => {
    sessionStorage.setItem('hs-buddy:pending-ai-reviews', '%%%invalid-json%%%')
    const provider = makeProvider()
    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.reviewState).toBe('idle')
    expect(provider.poll).not.toHaveBeenCalled()
  })

  it('stops polling when poll throws an abort error', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const pollFn = vi.fn().mockRejectedValue(abortError)
    const provider = makeProvider({ poll: pollFn })

    const { result } = renderHook(() => useAIReviewMonitor({ provider, ...defaultOptions }))

    await act(async () => {
      await result.current.handleRequestReview()
    })

    // First poll throws abort error — should stop scheduling more polls
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(pollFn).toHaveBeenCalledTimes(1)

    // Advance time again — no second poll scheduled because abort stopped the loop
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(pollFn).toHaveBeenCalledTimes(1)
  })
})
