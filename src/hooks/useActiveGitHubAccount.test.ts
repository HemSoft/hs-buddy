import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useActiveGitHubAccount } from './useActiveGitHubAccount'

vi.mock('../api/github', () => ({
  GitHubClient: {
    getActiveCliAccount: vi.fn(),
  },
}))

import { GitHubClient } from '../api/github'

describe('useActiveGitHubAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initially returns null', () => {
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValue('testuser')
    const { result } = renderHook(() => useActiveGitHubAccount())
    expect(result.current).toBeNull()
  })

  it('fetches active account on mount', async () => {
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValue('myuser')
    const { result } = renderHook(() => useActiveGitHubAccount())

    await waitFor(() => {
      expect(result.current).toBe('myuser')
    })
  })

  it('continues returning null on error', async () => {
    vi.mocked(GitHubClient.getActiveCliAccount).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useActiveGitHubAccount())

    // Wait for the rejected promise to settle
    await waitFor(() => {
      expect(GitHubClient.getActiveCliAccount).toHaveBeenCalled()
    })
    expect(result.current).toBeNull()
  })

  it('polls on interval and updates account', async () => {
    vi.useFakeTimers()
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValue('first-user')
    const { result } = renderHook(() => useActiveGitHubAccount())

    // Flush initial mount promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current).toBe('first-user')

    // Change the return value for the next poll
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValue('second-user')

    // Advance past the 30s interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(result.current).toBe('second-user')
    vi.useRealTimers()
  })

  it('clears interval on unmount', async () => {
    vi.useFakeTimers()
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValue('alice')
    const { result, unmount } = renderHook(() => useActiveGitHubAccount())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current).toBe('alice')

    const callCount = vi.mocked(GitHubClient.getActiveCliAccount).mock.calls.length
    unmount()

    // Advancing timer after unmount should not cause additional calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(vi.mocked(GitHubClient.getActiveCliAccount).mock.calls.length).toBe(callCount)

    vi.useRealTimers()
  })

  it('handles error on interval poll gracefully', async () => {
    vi.useFakeTimers()
    vi.mocked(GitHubClient.getActiveCliAccount).mockResolvedValueOnce('ok-user')
    const { result } = renderHook(() => useActiveGitHubAccount())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current).toBe('ok-user')

    // Make next poll fail
    vi.mocked(GitHubClient.getActiveCliAccount).mockRejectedValueOnce(new Error('timeout'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    // Should still have the old value (error caught silently)
    expect(result.current).toBe('ok-user')

    vi.useRealTimers()
  })
})
