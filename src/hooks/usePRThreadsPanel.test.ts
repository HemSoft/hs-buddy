import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePRThreadsPanel } from './usePRThreadsPanel'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRThreadsResult } from '../api/github'

const {
  mockEnqueue,
  mockUseGitHubAccounts,
  mockUseLatestPRReviewRun,
  mockFetchPRThreads,
  mockFetchPRBranches,
  mockAddPRComment,
  mockAddCommentReaction,
  stableAccounts,
} = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockUseGitHubAccounts: vi.fn(),
  mockUseLatestPRReviewRun: vi.fn(),
  mockFetchPRThreads: vi.fn(),
  mockFetchPRBranches: vi.fn(),
  mockAddPRComment: vi.fn(),
  mockAddCommentReaction: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('./useConfig', () => ({
  useGitHubAccounts: mockUseGitHubAccounts,
}))

vi.mock('./useConvex', () => ({
  useLatestPRReviewRun: mockUseLatestPRReviewRun,
}))

vi.mock('./useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchPRThreads: mockFetchPRThreads,
    fetchPRBranches: mockFetchPRBranches,
    addPRComment: mockAddPRComment,
    addCommentReaction: mockAddCommentReaction,
  })),
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (url: string) => {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    return m ? { owner: m[1], repo: m[2] } : null
  },
}))

vi.mock('../utils/reactions', () => ({
  applyReactionToResult: vi.fn((prev, _commentId, _content) => prev),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: (e: unknown) =>
    e instanceof DOMException && (e as DOMException).name === 'AbortError',
  throwIfAborted: (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  },
}))

const basePR: PRDetailInfo = {
  source: 'GitHub',
  repository: 'acme/webapp',
  id: 42,
  title: 'Fix something',
  author: 'alice',
  url: 'https://github.com/acme/webapp/pull/42',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2025-01-01',
  date: '2025-01-01',
  org: 'acme',
}

function makeThreadsResult(overrides: Partial<PRThreadsResult> = {}): PRThreadsResult {
  return {
    threads: [
      {
        id: 't1',
        isResolved: false,
        isOutdated: false,
        path: 'src/app.ts',
        line: 10,
        startLine: null,
        diffSide: null,
        comments: [
          {
            id: 'c1',
            body: 'Fix this',
            bodyHtml: '<p>Fix this</p>',
            author: 'bob',
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
            authorAvatarUrl: '',
            url: 'https://github.com/acme/webapp/pull/42#comment-c1',
            diffHunk: null,
            reactions: [],
          },
        ],
      },
      {
        id: 't2',
        isResolved: true,
        isOutdated: false,
        path: 'src/app.ts',
        line: 20,
        startLine: null,
        diffSide: null,
        comments: [
          {
            id: 'c2',
            body: 'Done',
            bodyHtml: '<p>Done</p>',
            author: 'alice',
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
            authorAvatarUrl: '',
            url: 'https://github.com/acme/webapp/pull/42#comment-c2',
            diffHunk: null,
            reactions: [],
          },
        ],
      },
      {
        id: 't3',
        isResolved: false,
        isOutdated: true,
        path: 'src/old.ts',
        line: 5,
        startLine: null,
        diffSide: null,
        comments: [
          {
            id: 'c3',
            body: 'Old comment',
            bodyHtml: '<p>Old comment</p>',
            author: 'charlie',
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
            authorAvatarUrl: '',
            url: 'https://github.com/acme/webapp/pull/42#comment-c3',
            diffHunk: null,
            reactions: [],
          },
        ],
      },
    ],
    issueComments: [],
    reviews: [],
    ...overrides,
  }
}

describe('usePRThreadsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGitHubAccounts.mockReturnValue({ accounts: stableAccounts })
    mockUseLatestPRReviewRun.mockReturnValue(null)
    // Two enqueue calls on mount: 1st = fetchPRBranches, 2nd = fetchThreads
    mockEnqueue
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())
    mockFetchPRBranches.mockResolvedValue({ headSha: 'abc123' })
    mockFetchPRThreads.mockResolvedValue(makeThreadsResult())
    mockAddPRComment.mockResolvedValue({
      id: 'new-c',
      body: 'New comment',
      author: 'alice',
      createdAt: '2025-01-02',
      updatedAt: '2025-01-02',
      authorAvatarUrl: '',
      reactions: [],
    })
    mockAddCommentReaction.mockResolvedValue(undefined)
  })

  it('starts in loading state', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePRThreadsPanel(basePR))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('loads threads data', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).not.toBeNull()
    expect(result.current.data!.threads).toHaveLength(3)
  })

  it('sets error on fetch failure', async () => {
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
  })

  it('computes activeThreads from unresolved threads', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // t1 (unresolved) and t3 (unresolved+outdated)
    expect(result.current.activeThreads).toHaveLength(2)
  })

  it('computes resolvedThreads from resolved threads', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // t2 is resolved
    expect(result.current.resolvedThreads).toHaveLength(1)
  })

  it('filters threads by "active" filter', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.setFilter('active')
    })

    expect(result.current.filteredThreads).toHaveLength(2)
    expect(result.current.filteredThreads.every(t => !t.isResolved)).toBe(true)
  })

  it('filters threads by "resolved" filter', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.setFilter('resolved')
    })

    expect(result.current.filteredThreads).toHaveLength(1)
    expect(result.current.filteredThreads[0].isResolved).toBe(true)
  })

  it('shows all threads with "all" filter (default)', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.filter).toBe('all')
    expect(result.current.filteredThreads).toHaveLength(3)
  })

  it('handleReplyAdded adds comment to thread', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
    })

    const newComment = {
      id: 'c-new',
      body: 'Reply text',
      bodyHtml: '<p>Reply text</p>',
      author: 'alice',
      createdAt: '2025-01-02',
      updatedAt: '2025-01-02',
      authorAvatarUrl: '',
      url: 'https://github.com/acme/webapp/pull/42#comment-c-new',
      diffHunk: null,
      reactions: [],
    }

    act(() => {
      result.current.handleReplyAdded('t1', newComment)
    })

    const thread = result.current.data!.threads.find(t => t.id === 't1')
    expect(thread!.comments).toHaveLength(2)
    expect(thread!.comments[1].id).toBe('c-new')
  })

  it('handleResolveToggled toggles thread resolved state', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
    })

    act(() => {
      result.current.handleResolveToggled('t1', true)
    })

    const thread = result.current.data!.threads.find(t => t.id === 't1')
    expect(thread!.isResolved).toBe(true)
  })

  it('manages commentText state', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    expect(result.current.commentText).toBe('')

    act(() => {
      result.current.setCommentText('Hello world')
    })

    expect(result.current.commentText).toBe('Hello world')
  })

  it('manages showResolved state', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    expect(result.current.showResolved).toBe(true)

    act(() => {
      result.current.setShowResolved(false)
    })

    expect(result.current.showResolved).toBe(false)
  })

  it('handleAddComment does nothing for empty text', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.handleAddComment()
    })

    // enqueue was called for initial fetch, not for comment
    expect(result.current.sendingComment).toBe(false)
  })

  it('handleAddComment sends comment and clears text', async () => {
    const newComment = {
      id: 'new-c',
      body: 'New comment',
      author: 'alice',
      createdAt: '2025-01-02',
      updatedAt: '2025-01-02',
      authorAvatarUrl: '',
      reactions: [],
    }

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Mock enqueue for the add-comment call (3rd call)
    mockEnqueue.mockResolvedValueOnce(newComment)

    act(() => {
      result.current.setCommentText('New comment')
    })

    await act(async () => {
      await result.current.handleAddComment()
    })

    expect(result.current.commentText).toBe('')
    expect(result.current.sendingComment).toBe(false)
  })

  it('needsRefresh is false when no latestReview', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.needsRefresh).toBe(false)
  })

  it('needsRefresh is true when head SHA differs from review SHA', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'old-sha',
      reviewedThreadStats: { unresolved: 2, outdated: 1 },
      resultId: 'r1',
    })
    // branches returns headSha='abc123', threads returns normal
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // currentHeadSha='abc123' != reviewedHeadSha='old-sha' → needsRefresh
    expect(result.current.needsRefresh).toBe(true)
  })

  it('openLatestReview dispatches copilot:open-result event', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'abc123',
      reviewedThreadStats: { unresolved: 2, outdated: 1 },
      resultId: 'review-42',
    })
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.openLatestReview()
    })

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'copilot:open-result',
        detail: { resultId: 'review-42' },
      })
    )
    dispatchSpy.mockRestore()
  })

  it('requestReReview dispatches pr-review:open event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.requestReReview()
    })

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pr-review:open',
        detail: expect.objectContaining({
          prUrl: basePR.url,
          prTitle: basePR.title,
          prNumber: basePR.id,
          repo: basePR.repository,
        }),
      })
    )
    dispatchSpy.mockRestore()
  })

  it('fetchThreads can be called to refresh data', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updatedResult = makeThreadsResult({ threads: [] })
    mockEnqueue.mockResolvedValueOnce(updatedResult)

    await act(async () => {
      await result.current.fetchThreads()
    })

    expect(result.current.data!.threads).toHaveLength(0)
  })

  it('handleReactToComment invokes enqueue with reaction', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    mockEnqueue.mockResolvedValueOnce(undefined)

    await act(async () => {
      await result.current.handleReactToComment('c1', 'THUMBS_UP')
    })

    // Should have enqueued the reaction (3rd call: branches, threads, reaction)
    expect(mockEnqueue).toHaveBeenCalledTimes(3)
  })

  it('needsRefresh is true when outdated threads count differs from review stats', async () => {
    // reviewedThreadStats.outdated (99) != actual outdated (1)
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'abc123', // same head SHA so only snapshot change triggers
      reviewedThreadStats: { unresolved: 2, outdated: 99 },
      resultId: 'r1',
    })

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
    })

    expect(result.current.needsRefresh).toBe(true)
  })

  it('needsRefresh is true when thread snapshot changes', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'abc123',
      reviewedThreadStats: { unresolved: 99, outdated: 99 },
      resultId: 'r1',
    })

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // reviewedThreadStats.unresolved (99) != activeThreads.length (2)
    expect(result.current.needsRefresh).toBe(true)
  })

  it('requestReReview includes reviewed SHA in prompt when available', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'sha-123',
      reviewedThreadStats: { unresolved: 2, outdated: 1 },
      resultId: 'r1',
    })
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'sha-456' })
      .mockResolvedValueOnce(makeThreadsResult())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.requestReReview()
    })

    const call = dispatchSpy.mock.calls.find(c => (c[0] as CustomEvent).type === 'pr-review:open')
    expect(call).toBeDefined()
    const detail = (call![0] as CustomEvent).detail
    expect(detail.initialPrompt).toContain('sha-123')
    dispatchSpy.mockRestore()
  })

  it('handleAddComment error does not crash', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    mockEnqueue.mockRejectedValueOnce(new Error('Comment failed'))

    act(() => {
      result.current.setCommentText('Some comment')
    })

    await act(async () => {
      await result.current.handleAddComment()
    })

    expect(result.current.sendingComment).toBe(false)
  })

  it('sets error when ownerRepo cannot be parsed', async () => {
    const badPR: PRDetailInfo = {
      ...basePR,
      url: 'not-a-github-url',
      org: undefined,
    }

    // parseOwnerRepoFromUrl mock returns null for bad URLs
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce(null) // branches call returns null headSha
      .mockRejectedValueOnce(new Error('Could not parse owner/repo from PR URL'))

    const { result } = renderHook(() => usePRThreadsPanel(badPR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('openLatestReview does nothing when no latestReview', async () => {
    mockUseLatestPRReviewRun.mockReturnValue(null)
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.openLatestReview()
    })

    const calls = dispatchSpy.mock.calls.filter(c => (c[0] as Event).type === 'copilot:open-result')
    expect(calls).toHaveLength(0)
    dispatchSpy.mockRestore()
  })

  it('sets currentHeadSha to null when branches fetch fails with non-abort error', async () => {
    mockEnqueue
      .mockReset()
      .mockRejectedValueOnce(new Error('Network error')) // branches fetch fails
      .mockResolvedValueOnce(makeThreadsResult()) // threads still works

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // needsRefresh should be false since currentHeadSha is null
    expect(result.current.needsRefresh).toBe(false)
  })

  it('silently ignores abort error from branches fetch', async () => {
    mockEnqueue
      .mockReset()
      .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError')) // branches aborted
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should not error — abort is silently handled
    expect(result.current.error).toBeNull()
  })

  it('sets currentHeadSha to null when PR has no owner', async () => {
    const noOwnerPR: PRDetailInfo = {
      ...basePR,
      url: 'not-a-github-url',
      org: undefined,
    }

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce(null) // branches
      .mockRejectedValueOnce(new Error('Could not parse owner/repo from PR URL'))

    const { result } = renderHook(() => usePRThreadsPanel(noOwnerPR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.needsRefresh).toBe(false)
  })

  it('handleReactToComment does nothing when ownerRepo is null', async () => {
    const badPR: PRDetailInfo = {
      ...basePR,
      url: 'not-a-github-url',
      org: undefined,
    }

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce(null) // branches
      .mockRejectedValueOnce(new Error('Could not parse'))

    const { result } = renderHook(() => usePRThreadsPanel(badPR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const callsBefore = mockEnqueue.mock.calls.length

    await act(async () => {
      await result.current.handleReactToComment('c1', 'THUMBS_UP')
    })

    // Should not have enqueued anything new
    expect(mockEnqueue.mock.calls.length).toBe(callsBefore)
  })

  it('handleReactToComment silently ignores abort error', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    mockEnqueue.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      await result.current.handleReactToComment('c1', 'THUMBS_UP')
    })

    // Abort errors should NOT be logged
    const errorCalls = consoleSpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('Failed to add reaction')
    )
    expect(errorCalls).toHaveLength(0)
    consoleSpy.mockRestore()
  })

  it('handleAddComment does nothing when ownerRepo is null', async () => {
    const badPR: PRDetailInfo = {
      ...basePR,
      url: 'not-a-github-url',
      org: undefined,
    }

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('parse error'))

    const { result } = renderHook(() => usePRThreadsPanel(badPR))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.setCommentText('Some text')
    })

    const callsBefore = mockEnqueue.mock.calls.length

    await act(async () => {
      await result.current.handleAddComment()
    })

    // No new enqueue calls since ownerRepo is null
    expect(mockEnqueue.mock.calls.length).toBe(callsBefore)
    expect(result.current.sendingComment).toBe(false)
  })

  it('handleReplyAdded is a no-op when data is null', async () => {
    // Keep enqueue pending so data stays null
    let resolveThreads!: (v: PRThreadsResult) => void
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockReturnValueOnce(new Promise<PRThreadsResult>(r => (resolveThreads = r)))

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    // data is still null while threads are loading
    expect(result.current.data).toBeNull()

    act(() => {
      result.current.handleReplyAdded('t1', {
        id: 'c-x',
        body: 'reply',
        bodyHtml: '<p>reply</p>',
        author: 'alice',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
        authorAvatarUrl: '',
        url: '',
        diffHunk: null,
        reactions: [],
      })
    })

    // data should remain null (the !prev guard returns prev unchanged)
    expect(result.current.data).toBeNull()

    // Clean up: resolve so hook settles
    resolveThreads(makeThreadsResult())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('handleResolveToggled is a no-op when data is null', async () => {
    let resolveThreads!: (v: PRThreadsResult) => void
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockReturnValueOnce(new Promise<PRThreadsResult>(r => (resolveThreads = r)))

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    expect(result.current.data).toBeNull()

    act(() => {
      result.current.handleResolveToggled('t1', true)
    })

    expect(result.current.data).toBeNull()

    resolveThreads(makeThreadsResult())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('handleAddComment does nothing when sendingComment is already true', async () => {
    // Use a never-resolving promise to keep sendingComment=true
    let resolveComment!: (v: unknown) => void
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    mockEnqueue.mockReturnValueOnce(new Promise(r => (resolveComment = r)))

    act(() => {
      result.current.setCommentText('First comment')
    })

    // Start the first comment — sendingComment becomes true
    let firstPromise: Promise<void>
    act(() => {
      firstPromise = result.current.handleAddComment()
    })

    // While first is in-flight, calling again should be a no-op
    const callsBefore = mockEnqueue.mock.calls.length
    await act(async () => {
      await result.current.handleAddComment()
    })
    expect(mockEnqueue.mock.calls.length).toBe(callsBefore)

    // Clean up
    resolveComment({
      id: 'c-ok',
      body: 'First comment',
      author: 'alice',
      createdAt: '2025-01-02',
      updatedAt: '2025-01-02',
      authorAvatarUrl: '',
      reactions: [],
    })
    await act(async () => {
      await firstPromise!
    })
  })

  it('owner falls back to ownerRepo.owner when pr.org is undefined', async () => {
    const prNoOrg: PRDetailInfo = {
      ...basePR,
      org: undefined,
      // URL still valid so parseOwnerRepoFromUrl returns { owner: 'acme', repo: 'webapp' }
    }

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(prNoOrg))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Data loaded successfully — owner was derived from ownerRepo
    expect(result.current.data).not.toBeNull()
  })

  it('branches effect sets currentHeadSha to null when headSha is falsy', async () => {
    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: '' }) // falsy headSha
      .mockResolvedValueOnce(makeThreadsResult())

    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'some-sha',
      reviewedThreadStats: { unresolved: 2, outdated: 1 },
      resultId: 'r1',
    })

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // currentHeadSha is null (empty string → null via || null), reviewedHeadSha exists
    // needsRefresh requires both to be truthy, so it falls to threadSnapshotChanged
    expect(result.current.data).not.toBeNull()
  })

  it('branches effect early returns when pr.id is falsy', async () => {
    const prNoId: PRDetailInfo = {
      ...basePR,
      id: 0,
    }

    mockEnqueue.mockReset().mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(prNoId))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Only 1 enqueue call (fetchThreads), no branches fetch
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it('handleReactToComment logs non-abort errors', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    mockEnqueue.mockRejectedValueOnce(new Error('API error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      await result.current.handleReactToComment('c1', 'THUMBS_UP')
    })

    const errorCalls = consoleSpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('Failed to add reaction')
    )
    expect(errorCalls).toHaveLength(1)
    consoleSpy.mockRestore()
  })

  it('activeThreads/resolvedThreads/filteredThreads return empty arrays when data is null', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    // Data hasn't loaded yet
    expect(result.current.data).toBeNull()
    expect(result.current.activeThreads).toEqual([])
    expect(result.current.resolvedThreads).toEqual([])
    expect(result.current.filteredThreads).toEqual([])
  })

  it('threadSnapshotChanged is false when reviewedThreadStats is absent', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'abc123',
      reviewedThreadStats: null,
      resultId: 'r1',
    })

    mockEnqueue
      .mockReset()
      .mockResolvedValueOnce({ headSha: 'abc123' })
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Same head SHA + no thread stats = no refresh needed
    expect(result.current.needsRefresh).toBe(false)
  })

  it('needsRefresh false when currentHeadSha is null even if reviewedHeadSha exists', async () => {
    mockUseLatestPRReviewRun.mockReturnValue({
      reviewedHeadSha: 'sha-abc',
      reviewedThreadStats: { unresolved: 2, outdated: 1 }, // matches actual counts
      resultId: 'r1',
    })

    // Branches fetch fails → currentHeadSha stays null
    mockEnqueue
      .mockReset()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(makeThreadsResult())

    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // SHA comparison requires both truthy → false; thread stats match → false
    expect(result.current.needsRefresh).toBe(false)
  })

  it('stale fetchThreads result is discarded', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Set up two concurrent fetchThreads calls
    let resolveFirst!: (v: PRThreadsResult) => void
    const staleResult = makeThreadsResult({ threads: [] })
    const freshResult = makeThreadsResult()

    mockEnqueue
      .mockReturnValueOnce(new Promise<PRThreadsResult>(r => (resolveFirst = r)))
      .mockResolvedValueOnce(freshResult)

    // Fire first fetch (will be stale)
    let firstPromise: Promise<void>
    act(() => {
      firstPromise = result.current.fetchThreads()
    })

    // Fire second fetch immediately (this one wins)
    await act(async () => {
      await result.current.fetchThreads()
    })

    // Now resolve the first (stale) — its requestId is outdated
    resolveFirst(staleResult)
    await act(async () => {
      await firstPromise!
    })

    // Data should be from the fresh call, not the stale one
    expect(result.current.data!.threads).toHaveLength(3)
  })

  it('stale fetchThreads error is discarded', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    let rejectFirst!: (e: Error) => void
    mockEnqueue
      .mockReturnValueOnce(new Promise<PRThreadsResult>((_, rej) => (rejectFirst = rej)))
      .mockResolvedValueOnce(makeThreadsResult())

    let firstPromise: Promise<void>
    act(() => {
      firstPromise = result.current.fetchThreads()
    })

    // Second call supersedes the first
    await act(async () => {
      await result.current.fetchThreads()
    })

    // Reject the stale first call
    rejectFirst(new Error('Old error'))
    await act(async () => {
      await firstPromise!
    })

    // Error should not be set because the request was stale
    expect(result.current.error).toBeNull()
    expect(result.current.data).not.toBeNull()
  })

  it('fetchThreads ignores abort errors', async () => {
    const { result } = renderHook(() => usePRThreadsPanel(basePR))

    await waitFor(() => expect(result.current.loading).toBe(false))

    mockEnqueue.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

    await act(async () => {
      await result.current.fetchThreads()
    })

    // Abort error should not set the error state
    expect(result.current.error).toBeNull()
  })
})
