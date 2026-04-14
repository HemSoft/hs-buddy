import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRThreadsPanel } from './PRThreadsPanel'
import type { PRDetailInfo } from '../utils/prDetailView'

const mockUsePRThreadsPanel = vi.fn()

vi.mock('../hooks/usePRThreadsPanel', () => ({
  usePRThreadsPanel: (...args: unknown[]) => mockUsePRThreadsPanel(...args),
}))

vi.mock('./pr-threads/ReviewThreadCard', () => ({
  ReviewThreadCard: ({ thread }: { thread: { id: string } }) => (
    <div data-testid={`thread-${thread.id}`}>Thread {thread.id}</div>
  ),
}))

vi.mock('./pr-threads/ReviewSummaryCard', () => ({
  ReviewSummaryCard: ({ review }: { review: { id: string } }) => (
    <div data-testid={`review-${review.id}`}>Review {review.id}</div>
  ),
}))

vi.mock('./pr-threads/CommentCard', () => ({
  CommentCard: ({ comment }: { comment: { id: string } }) => (
    <div data-testid={`comment-${comment.id}`}>Comment {comment.id}</div>
  ),
}))

const defaultPr: PRDetailInfo = {
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 42,
  title: 'Fix login bug',
  author: 'octocat',
  url: 'https://github.com/test-org/hs-buddy/pull/42',
  state: 'OPEN',
  approvalCount: 1,
  assigneeCount: 0,
  iApproved: false,
  created: '2025-06-01T10:00:00Z',
  date: null,
  org: 'test-org',
}

function makeThread(id: string, overrides = {}) {
  return {
    id,
    path: `src/file-${id}.ts`,
    line: 10,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    isCollapsed: false,
    comments: [
      {
        id: `c-${id}`,
        body: 'Review comment',
        author: 'reviewer',
        authorAvatarUrl: null,
        createdAt: '2025-06-10T10:00:00Z',
        updatedAt: '2025-06-10T10:00:00Z',
        diffHunk: null,
        path: `src/file-${id}.ts`,
        url: '',
        reactionGroups: [],
      },
    ],
    ...overrides,
  }
}

function makeComment(id: string, overrides = {}) {
  return {
    id,
    body: 'Issue comment',
    author: 'reviewer',
    authorAvatarUrl: null,
    createdAt: '2025-06-10T11:00:00Z',
    updatedAt: '2025-06-10T11:00:00Z',
    url: '',
    reactionGroups: [],
    ...overrides,
  }
}

function makeReview(id: string, overrides = {}) {
  return {
    id,
    author: 'reviewer',
    body: 'Looks good',
    state: 'APPROVED',
    createdAt: '2025-06-10T09:00:00Z',
    updatedAt: '2025-06-10T09:00:00Z',
    ...overrides,
  }
}

function makeHookReturn(overrides = {}) {
  return {
    loading: false,
    error: null,
    data: {
      threads: [makeThread('t1')],
      issueComments: [makeComment('ic1')],
      reviews: [makeReview('r1')],
    },
    filter: 'all' as const,
    setFilter: vi.fn(),
    showResolved: false,
    setShowResolved: vi.fn(),
    commentText: '',
    setCommentText: vi.fn(),
    sendingComment: false,
    latestReview: null,
    needsRefresh: false,
    activeThreads: [makeThread('t1')],
    resolvedThreads: [],
    filteredThreads: [makeThread('t1')],
    fetchThreads: vi.fn(),
    handleReplyAdded: vi.fn(),
    handleResolveToggled: vi.fn(),
    handleAddComment: vi.fn(),
    handleReactToComment: vi.fn(),
    openLatestReview: vi.fn(),
    requestReReview: vi.fn(),
    ...overrides,
  }
}

describe('PRThreadsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state when loading with no data', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn({ loading: true, data: null }))
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('Loading conversations…')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn({ error: 'API error', data: null }))
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument()
    expect(screen.getByText('API error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('calls fetchThreads on retry click', () => {
    const fetchThreads = vi.fn()
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({ error: 'API error', data: null, fetchThreads })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    fireEvent.click(screen.getByText('Retry'))
    expect(fetchThreads).toHaveBeenCalled()
  })

  it('renders timeline with threads, comments, and reviews', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn())
    render(<PRThreadsPanel pr={defaultPr} />)

    expect(screen.getByTestId('thread-t1')).toBeInTheDocument()
    expect(screen.getByTestId('comment-ic1')).toBeInTheDocument()
    expect(screen.getByTestId('review-r1')).toBeInTheDocument()
  })

  it('shows empty state when no conversations', () => {
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        data: { threads: [], issueComments: [], reviews: [] },
        activeThreads: [],
        resolvedThreads: [],
        filteredThreads: [],
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('shows filter buttons when threads exist', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn())
    render(<PRThreadsPanel pr={defaultPr} />)

    expect(screen.getByText(/All \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Active \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Resolved \(0\)/)).toBeInTheDocument()
  })

  it('calls setFilter when filter buttons clicked', () => {
    const setFilter = vi.fn()
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn({ setFilter }))
    render(<PRThreadsPanel pr={defaultPr} />)

    fireEvent.click(screen.getByText(/Active \(1\)/))
    expect(setFilter).toHaveBeenCalledWith('active')
  })

  it('shows unresolved count in summary', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn())
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('1 unresolved')).toBeInTheDocument()
  })

  it('shows resolved count in summary', () => {
    const resolvedThread = makeThread('rt1', { isResolved: true })
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        resolvedThreads: [resolvedThread],
        data: {
          threads: [makeThread('t1'), resolvedThread],
          issueComments: [],
          reviews: [],
        },
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('1 resolved')).toBeInTheDocument()
  })

  it('shows show/hide resolved toggle when resolved threads exist in all filter', () => {
    const resolvedThread = makeThread('rt1', { isResolved: true })
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        resolvedThreads: [resolvedThread],
        data: {
          threads: [makeThread('t1'), resolvedThread],
          issueComments: [],
          reviews: [],
        },
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('Show resolved')).toBeInTheDocument()
  })

  it('toggles resolved visibility', () => {
    const setShowResolved = vi.fn()
    const resolvedThread = makeThread('rt1', { isResolved: true })
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        resolvedThreads: [resolvedThread],
        setShowResolved,
        data: {
          threads: [makeThread('t1'), resolvedThread],
          issueComments: [],
          reviews: [],
        },
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    fireEvent.click(screen.getByText('Show resolved'))
    expect(setShowResolved).toHaveBeenCalledWith(true)
  })

  it('shows comment text area', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn())
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
  })

  it('calls handleAddComment on submit click', () => {
    const handleAddComment = vi.fn()
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({ commentText: 'My comment', handleAddComment })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    fireEvent.click(screen.getByText('Comment'))
    expect(handleAddComment).toHaveBeenCalled()
  })

  it('disables comment button when text is empty', () => {
    mockUsePRThreadsPanel.mockReturnValue(makeHookReturn({ commentText: '' }))
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('Comment').closest('button')).toBeDisabled()
  })

  it('sends comment via Ctrl+Enter', () => {
    const handleAddComment = vi.fn()
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({ commentText: 'My comment', handleAddComment })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    const textarea = screen.getByPlaceholderText('Add a comment…')
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(handleAddComment).toHaveBeenCalled()
  })

  it('shows latest AI review context when present', () => {
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        latestReview: {
          createdAt: '2025-06-10T12:00:00Z',
          reviewedHeadSha: 'abc123def456',
        },
        needsRefresh: false,
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('abc123def456')).toBeInTheDocument()
    expect(screen.getByText('Up to date')).toBeInTheDocument()
  })

  it('shows refresh needed badge when review is stale', () => {
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        latestReview: {
          createdAt: '2025-06-10T12:00:00Z',
          reviewedHeadSha: 'abc123',
        },
        needsRefresh: true,
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('Refresh needed')).toBeInTheDocument()
  })

  it('calls openLatestReview and requestReReview buttons', () => {
    const openLatestReview = vi.fn()
    const requestReReview = vi.fn()
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        latestReview: { createdAt: '2025-06-10T12:00:00Z', reviewedHeadSha: 'abc' },
        openLatestReview,
        requestReReview,
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)

    fireEvent.click(screen.getByText('Open review'))
    expect(openLatestReview).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Re-review'))
    expect(requestReReview).toHaveBeenCalled()
  })

  it('shows unknown sha when reviewedHeadSha is missing', () => {
    mockUsePRThreadsPanel.mockReturnValue(
      makeHookReturn({
        latestReview: { createdAt: '2025-06-10T12:00:00Z', reviewedHeadSha: null },
      })
    )
    render(<PRThreadsPanel pr={defaultPr} />)
    expect(screen.getByText('unknown sha')).toBeInTheDocument()
  })
})
