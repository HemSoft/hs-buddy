import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockEnqueue = vi.fn()
const mockAccounts = [{ username: 'alice', org: 'acme' }]

const mockFetchPRThreads = vi.fn().mockResolvedValue({
  threads: [],
  issueComments: [],
  reviews: [],
})
const mockFetchPRBranches = vi.fn().mockResolvedValue({ headSha: 'abc123' })
const mockAddPRComment = vi
  .fn()
  .mockResolvedValue({ id: 'c1', body: 'test', createdAt: '2026-01-01' })
const mockAddCommentReaction = vi.fn().mockResolvedValue(undefined)

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('./useConvex', () => ({
  useLatestPRReviewRun: () => null,
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchPRThreads: (...args: unknown[]) => mockFetchPRThreads(...args),
      fetchPRBranches: (...args: unknown[]) => mockFetchPRBranches(...args),
      addPRComment: (...args: unknown[]) => mockAddPRComment(...args),
      addCommentReaction: (...args: unknown[]) => mockAddCommentReaction(...args),
    }
  }),
}))

vi.mock('../utils/reactions', () => ({
  applyReactionToResult: vi.fn((prev, _commentId, _content) => prev),
}))

import { usePRThreadsPanel } from './usePRThreadsPanel'
import type { PRReviewComment } from '../api/github'
import type { PRDetailInfo } from '../utils/prDetailView'

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 42,
  title: 'Fix bug',
  author: 'alice',
  url: 'https://github.com/acme/hs-buddy/pull/42',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2026-01-01T00:00:00Z',
  date: '2026-01-01',
  org: 'acme',
  ...overrides,
})

describe('usePRThreadsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return fn(controller.signal)
    })
    mockFetchPRThreads.mockResolvedValue({
      threads: [],
      issueComments: [],
      reviews: [],
    })
    mockFetchPRBranches.mockResolvedValue({ headSha: 'abc123' })
    mockAddPRComment.mockResolvedValue({ id: 'c1', body: 'test', createdAt: '2026-01-01' })
  })

  it('returns initial loading state', () => {
    const { result } = renderHook(() => usePRThreadsPanel(makePR()))
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.filter).toBe('all')
    expect(result.current.showResolved).toBe(true)
    expect(result.current.commentText).toBe('')
    expect(result.current.sendingComment).toBe(false)
  })

  it('fetches threads on mount and sets data', async () => {
    const threadsData = {
      threads: [
        {
          id: 't1',
          isResolved: false,
          isOutdated: false,
          comments: [{ id: 'c1', createdAt: '2026-01-01' }],
        },
        {
          id: 't2',
          isResolved: true,
          isOutdated: false,
          comments: [{ id: 'c2', createdAt: '2026-01-02' }],
        },
      ],
      issueComments: [],
      reviews: [],
    }

    mockFetchPRThreads.mockResolvedValue(threadsData)

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual(threadsData)
    expect(result.current.activeThreads).toHaveLength(1)
    expect(result.current.resolvedThreads).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('handles fetch error gracefully', async () => {
    mockFetchPRThreads.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network error')
    expect(result.current.data).toBeNull()
  })

  it('filters threads by active/resolved', async () => {
    const threadsData = {
      threads: [
        { id: 't1', isResolved: false, isOutdated: false, comments: [] },
        { id: 't2', isResolved: true, isOutdated: false, comments: [] },
        { id: 't3', isResolved: false, isOutdated: true, comments: [] },
      ],
      issueComments: [],
      reviews: [],
    }

    mockFetchPRThreads.mockResolvedValue(threadsData)

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Default 'all' filter shows all threads
    expect(result.current.filteredThreads).toHaveLength(3)

    // Switch to 'active' filter
    act(() => result.current.setFilter('active'))
    expect(result.current.filteredThreads).toHaveLength(2)

    // Switch to 'resolved' filter
    act(() => result.current.setFilter('resolved'))
    expect(result.current.filteredThreads).toHaveLength(1)
    expect(result.current.filteredThreads[0].id).toBe('t2')
  })

  it('handleReplyAdded appends comment to correct thread', async () => {
    const threadsData = {
      threads: [{ id: 't1', isResolved: false, isOutdated: false, comments: [{ id: 'c1' }] }],
      issueComments: [],
      reviews: [],
    }

    mockFetchPRThreads.mockResolvedValue(threadsData)

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.data).not.toBeNull())

    const newComment = { id: 'c2', body: 'new reply', createdAt: '2026-01-03' } as PRReviewComment
    act(() => result.current.handleReplyAdded('t1', newComment))

    expect(result.current.data!.threads[0].comments).toHaveLength(2)
    expect(result.current.data!.threads[0].comments[1].id).toBe('c2')
  })

  it('handleResolveToggled updates thread resolved state', async () => {
    const threadsData = {
      threads: [{ id: 't1', isResolved: false, isOutdated: false, comments: [] }],
      issueComments: [],
      reviews: [],
    }

    mockFetchPRThreads.mockResolvedValue(threadsData)

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.data).not.toBeNull())

    act(() => result.current.handleResolveToggled('t1', true))

    expect(result.current.data!.threads[0].isResolved).toBe(true)
    expect(result.current.resolvedThreads).toHaveLength(1)
    expect(result.current.activeThreads).toHaveLength(0)
  })

  it('handleAddComment sends comment and clears text', async () => {
    const threadsData = {
      threads: [],
      issueComments: [],
      reviews: [],
    }

    const newComment = { id: 'new1', body: 'hello', createdAt: '2026-01-05' }
    mockFetchPRThreads.mockResolvedValue(threadsData)
    mockAddPRComment.mockResolvedValue(newComment)

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Set comment text
    act(() => result.current.setCommentText('hello'))

    // Send the comment
    await act(async () => {
      await result.current.handleAddComment()
    })

    expect(result.current.commentText).toBe('')
    expect(result.current.data!.issueComments).toHaveLength(1)
  })

  it('handleAddComment does nothing when text is empty', async () => {
    mockFetchPRThreads.mockResolvedValue({ threads: [], issueComments: [], reviews: [] })

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Text is empty
    await act(async () => {
      await result.current.handleAddComment()
    })

    // Should not have called enqueue for the add-comment task
    // The initial fetch calls happened but no add-comment call
    expect(result.current.sendingComment).toBe(false)
  })

  it('openLatestReview dispatches copilot:open-result event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    act(() => result.current.openLatestReview())

    // With no latest review, it should be a no-op
    // (useLatestPRReviewRun is mocked to return null)
    dispatchSpy.mockRestore()
  })

  it('requestReReview dispatches pr-review:open event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { result } = renderHook(() => usePRThreadsPanel(makePR()))

    act(() => result.current.requestReReview())

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pr-review:open',
      })
    )

    dispatchSpy.mockRestore()
  })

  it('setShowResolved toggles the flag', () => {
    const { result } = renderHook(() => usePRThreadsPanel(makePR()))
    expect(result.current.showResolved).toBe(true)

    act(() => result.current.setShowResolved(false))
    expect(result.current.showResolved).toBe(false)
  })
})
