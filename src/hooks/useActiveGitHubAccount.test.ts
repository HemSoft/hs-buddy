import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
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
})
