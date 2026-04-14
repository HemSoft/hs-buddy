import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockPRThreadsData = {
  loading: false,
  error: null as string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: null as any,
  filter: 'all' as 'all' | 'active' | 'resolved',
  setFilter: vi.fn(),
  showResolved: true,
  setShowResolved: vi.fn(),
  commentText: '',
  setCommentText: vi.fn(),
  sendingComment: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  latestReview: null as any,
  needsRefresh: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeThreads: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvedThreads: [] as any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filteredThreads: [] as any[],
  fetchThreads: vi.fn(),
  handleReplyAdded: vi.fn(),
  handleResolveToggled: vi.fn(),
  handleAddComment: vi.fn(),
  handleReactToComment: vi.fn(),
  openLatestReview: vi.fn(),
  requestReReview: vi.fn(),
}

vi.mock('../hooks/usePRThreadsPanel', () => ({
  usePRThreadsPanel: () => mockPRThreadsData,
}))

vi.mock('./pr-threads/ReviewThreadCard', () => ({
  ReviewThreadCard: ({ thread }: { thread: { id: string } }) => (
    <div data-testid={`thread-${thread.id}`}>Thread: {thread.id}</div>
  ),
}))

vi.mock('./pr-threads/ReviewSummaryCard', () => ({
  ReviewSummaryCard: ({ review }: { review: { id: string } }) => (
    <div data-testid={`review-${review.id}`}>Review: {review.id}</div>
  ),
}))

vi.mock('./pr-threads/CommentCard', () => ({
  CommentCard: ({ comment }: { comment: { id: string } }) => (
    <div data-testid={`comment-${comment.id}`}>Comment: {comment.id}</div>
  ),
}))

import { PRThreadsPanel } from './PRThreadsPanel'
import type { PRDetailInfo } from '../utils/prDetailView'

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'repo',
  id: 1,
  title: 'Fix',
  author: 'alice',
  url: 'https://github.com/acme/repo/pull/1',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2026-01-01',
  date: '2026-01-01',
  org: 'acme',
  ...overrides,
})

describe('PRThreadsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to defaults
    mockPRThreadsData.loading = false
    mockPRThreadsData.error = null
    mockPRThreadsData.data = null
    mockPRThreadsData.filter = 'all'
    mockPRThreadsData.showResolved = true
    mockPRThreadsData.commentText = ''
    mockPRThreadsData.sendingComment = false
    mockPRThreadsData.latestReview = null
    mockPRThreadsData.needsRefresh = false
    mockPRThreadsData.activeThreads = []
    mockPRThreadsData.resolvedThreads = []
    mockPRThreadsData.filteredThreads = []
  })

  it('renders loading state', () => {
    mockPRThreadsData.loading = true
    mockPRThreadsData.data = null

    render(<PRThreadsPanel pr={makePR()} />)
    expect(screen.getByText('Loading conversations…')).toBeInTheDocument()
  })

  it('renders error state with retry button', () => {
    mockPRThreadsData.error = 'Something went wrong'

    render(<PRThreadsPanel pr={makePR()} />)
    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry'))
    expect(mockPRThreadsData.fetchThreads).toHaveBeenCalled()
  })

  it('renders empty state when no conversations', () => {
    mockPRThreadsData.data = {
      threads: [],
      issueComments: [],
      reviews: [],
    }

    render(<PRThreadsPanel pr={makePR()} />)
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('renders timeline with threads, comments, and reviews', () => {
    mockPRThreadsData.data = {
      threads: [
        {
          id: 't1',
          isResolved: false,
          isOutdated: false,
          comments: [{ id: 'tc1', createdAt: '2026-01-01T10:00:00Z' }],
        },
      ],
      issueComments: [
        {
          id: 'ic1',
          body: 'comment',
          createdAt: '2026-01-01T11:00:00Z',
          updatedAt: '2026-01-01T11:00:00Z',
        },
      ],
      reviews: [
        {
          id: 'r1',
          body: 'LGTM',
          createdAt: '2026-01-01T09:00:00Z',
          updatedAt: '2026-01-01T09:00:00Z',
        },
      ],
    }
    mockPRThreadsData.filteredThreads = mockPRThreadsData.data.threads

    render(<PRThreadsPanel pr={makePR()} />)

    expect(screen.getByText('Timeline')).toBeInTheDocument()
    expect(screen.getByTestId('thread-t1')).toBeInTheDocument()
    expect(screen.getByTestId('comment-ic1')).toBeInTheDocument()
    expect(screen.getByTestId('review-r1')).toBeInTheDocument()
  })

  it('renders filter buttons with counts', () => {
    mockPRThreadsData.data = {
      threads: [
        {
          id: 't1',
          isResolved: false,
          comments: [{ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }],
        },
        { id: 't2', isResolved: true, comments: [{ id: 'c2', createdAt: '2026-01-02T10:00:00Z' }] },
      ],
      issueComments: [],
      reviews: [],
    }
    mockPRThreadsData.activeThreads = [{ id: 't1' }]
    mockPRThreadsData.resolvedThreads = [{ id: 't2' }]
    mockPRThreadsData.filteredThreads = mockPRThreadsData.data.threads

    render(<PRThreadsPanel pr={makePR()} />)

    expect(screen.getByText('All (2)')).toBeInTheDocument()
    expect(screen.getByText(/Active \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Resolved \(1\)/)).toBeInTheDocument()
  })

  it('calls setFilter when filter button clicked', () => {
    mockPRThreadsData.data = {
      threads: [
        {
          id: 't1',
          isResolved: false,
          comments: [{ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }],
        },
      ],
      issueComments: [],
      reviews: [],
    }
    mockPRThreadsData.activeThreads = [{ id: 't1' }]
    mockPRThreadsData.filteredThreads = mockPRThreadsData.data.threads

    render(<PRThreadsPanel pr={makePR()} />)

    fireEvent.click(screen.getByText(/Active/))
    expect(mockPRThreadsData.setFilter).toHaveBeenCalledWith('active')
  })

  it('renders latest review context when available', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }
    mockPRThreadsData.latestReview = {
      createdAt: '2026-01-01T10:00:00Z',
      reviewedHeadSha: 'abc123def456',
      resultId: 'res1',
    }
    mockPRThreadsData.needsRefresh = false

    render(<PRThreadsPanel pr={makePR()} />)

    expect(screen.getByText('Last AI review', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('abc123def456')).toBeInTheDocument()
    expect(screen.getByText('Up to date')).toBeInTheDocument()
  })

  it('shows refresh needed badge', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }
    mockPRThreadsData.latestReview = {
      createdAt: '2026-01-01T10:00:00Z',
      reviewedHeadSha: 'abc123',
      resultId: 'res1',
    }
    mockPRThreadsData.needsRefresh = true

    render(<PRThreadsPanel pr={makePR()} />)

    expect(screen.getByText('Refresh needed')).toBeInTheDocument()
  })

  it('calls openLatestReview and requestReReview', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }
    mockPRThreadsData.latestReview = {
      createdAt: '2026-01-01T10:00:00Z',
      reviewedHeadSha: 'abc',
      resultId: 'res1',
    }

    render(<PRThreadsPanel pr={makePR()} />)

    fireEvent.click(screen.getByText('Open review'))
    expect(mockPRThreadsData.openLatestReview).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Re-review'))
    expect(mockPRThreadsData.requestReReview).toHaveBeenCalled()
  })

  it('renders comment input and submit button', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }

    render(<PRThreadsPanel pr={makePR()} />)

    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
    expect(screen.getByText('Comment')).toBeInTheDocument()
  })

  it('submit button is disabled when text is empty', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }
    mockPRThreadsData.commentText = ''

    render(<PRThreadsPanel pr={makePR()} />)

    const submitButton = screen.getByText('Comment').closest('button')
    expect(submitButton).toBeDisabled()
  })

  it('calls handleAddComment on submit click', () => {
    mockPRThreadsData.data = { threads: [], issueComments: [], reviews: [] }
    mockPRThreadsData.commentText = 'test comment'

    render(<PRThreadsPanel pr={makePR()} />)

    const submitButton = screen.getByText('Comment').closest('button')
    expect(submitButton).not.toBeDisabled()

    fireEvent.click(submitButton!)
    expect(mockPRThreadsData.handleAddComment).toHaveBeenCalled()
  })

  it('shows resolved toggle button when resolved threads exist', () => {
    mockPRThreadsData.data = {
      threads: [
        { id: 't1', isResolved: true, comments: [{ id: 'c1', createdAt: '2026-01-01T10:00:00Z' }] },
      ],
      issueComments: [],
      reviews: [],
    }
    mockPRThreadsData.resolvedThreads = [{ id: 't1' }]
    mockPRThreadsData.filteredThreads = mockPRThreadsData.data.threads
    mockPRThreadsData.filter = 'all'

    render(<PRThreadsPanel pr={makePR()} />)

    fireEvent.click(screen.getByText('Hide resolved'))
    expect(mockPRThreadsData.setShowResolved).toHaveBeenCalledWith(false)
  })
})
