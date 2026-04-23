import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePRPanelData } from './usePRPanelData'
import type { PRDetailInfo } from '../utils/prDetailView'

const { mockEnqueue, mockUseGitHubAccounts, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockUseGitHubAccounts: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('./useConfig', () => ({
  useGitHubAccounts: mockUseGitHubAccounts,
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (url: string) => {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    return m ? { owner: m[1], repo: m[2] } : null
  },
  PR_URL_PARSE_ERROR: 'Could not parse owner/repo from PR URL',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: () => null, set: vi.fn() },
}))

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 42,
  url: 'https://github.com/test-org/hs-buddy/pull/42',
  title: 'test PR',
  state: 'open',
  author: 'alice',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2026-01-01T00:00:00Z',
  date: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('usePRPanelData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGitHubAccounts.mockReturnValue(stableAccounts)
    mockEnqueue.mockImplementation((fn: (signal: AbortSignal) => unknown) =>
      fn(new AbortController().signal)
    )
  })

  it('parses owner/repo and builds cache key', () => {
    const fetchFn = vi.fn().mockResolvedValue({ items: [] })
    const { result } = renderHook(() => usePRPanelData(makePR(), 'checks', fetchFn))

    expect(result.current.owner).toBe('test-org')
    expect(result.current.repo).toBe('hs-buddy')
    expect(result.current.cacheKey).toBe('checks:test-org/hs-buddy/42')
    expect(result.current.error).toBeNull()
  })

  it('returns error when URL cannot be parsed', () => {
    const fetchFn = vi.fn().mockResolvedValue(null)
    const { result } = renderHook(() =>
      usePRPanelData(makePR({ url: 'invalid://url' }), 'checks', fetchFn)
    )

    expect(result.current.owner).toBeNull()
    expect(result.current.repo).toBeNull()
    expect(result.current.cacheKey).toBeNull()
    expect(result.current.error).toBe('Could not parse owner/repo from PR URL')
  })

  it('fetches data via useGitHubData when URL is valid', () => {
    const fetchFn = vi.fn().mockResolvedValue({ total: 5 })

    const { result } = renderHook(() => usePRPanelData(makePR(), 'checks', fetchFn))

    // Hook returns loading state initially; the key assertion is that
    // cacheKey is set so useGitHubData will attempt the fetch.
    expect(result.current.cacheKey).toBe('checks:test-org/hs-buddy/42')
    expect(result.current.loading).toBe(true)
  })

  it('does not fetch when URL is invalid', () => {
    const fetchFn = vi.fn().mockResolvedValue(null)

    renderHook(() => usePRPanelData(makePR({ url: 'invalid://url' }), 'checks', fetchFn))

    // fetchFn should never be called when cacheKey is null
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})
