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

const basePR = makePR()
const mockHandleAddComment = mockPRThreadsData.handleAddComment
const mockSetShowResolved = mockPRThreadsData.setShowResolved
const mockSetFilter = mockPRThreadsData.setFilter

function mockHook(overrides: Partial<typeof mockPRThreadsData>) {
  Object.assign(mockPRThreadsData, overrides)
}

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

  it('submits comment on Ctrl+Enter', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      commentText: 'Test comment',
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    const textarea = screen.getByPlaceholderText('Add a comment…')
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(mockHandleAddComment).toHaveBeenCalled()
  })

  it('submits comment on Meta+Enter', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      commentText: 'Test comment',
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    const textarea = screen.getByPlaceholderText('Add a comment…')
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(mockHandleAddComment).toHaveBeenCalled()
  })

  it('does not submit on plain Enter', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      commentText: 'Test comment',
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    const textarea = screen.getByPlaceholderText('Add a comment…')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockHandleAddComment).not.toHaveBeenCalled()
  })

  it('disables textarea when sending', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      commentText: 'Sending...',
      sendingComment: true,
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    const textarea = screen.getByPlaceholderText('Add a comment…')
    expect(textarea).toBeDisabled()
  })

  it('disables submit when comment is empty', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      commentText: '',
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    const submitBtn = screen.getByRole('button', { name: /comment/i })
    expect(submitBtn).toBeDisabled()
  })

  it('renders latestReview with no sha as unknown sha', () => {
    mockHook({
      data: { threads: [], issueComments: [], reviews: [] },
      latestReview: { createdAt: '2026-01-10T10:00:00Z', reviewedHeadSha: null },
      needsRefresh: false,
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByText('unknown sha')).toBeTruthy()
    expect(screen.getByText('Up to date')).toBeTruthy()
  })

  it('renders resolved count when resolved threads exist', () => {
    const resolvedThread = {
      id: 99,
      isResolved: true,
      comments: [
        {
          id: 100,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'x',
          authorAvatarUrl: '',
          body: 'Done',
          path: 'x.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [resolvedThread], issueComments: [], reviews: [] },
      filteredThreads: [resolvedThread],
      activeThreads: [],
      resolvedThreads: [resolvedThread],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByText('1 resolved')).toBeTruthy()
  })

  it('hides "Show resolved" toggle when filter is not all', () => {
    const thread1 = {
      id: 1,
      isResolved: false,
      comments: [
        {
          id: 10,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'a',
          authorAvatarUrl: '',
          body: 'x',
          path: 'a.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    const thread2 = {
      id: 2,
      isResolved: true,
      comments: [
        {
          id: 20,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'b',
          authorAvatarUrl: '',
          body: 'y',
          path: 'b.ts',
          line: 2,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [thread1, thread2], issueComments: [], reviews: [] },
      filter: 'active',
      filteredThreads: [thread1],
      activeThreads: [thread1],
      resolvedThreads: [thread2],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.queryByText('Show resolved')).toBeNull()
  })

  it('shows "Hide resolved" button when showResolved is true', () => {
    const thread1 = {
      id: 1,
      isResolved: false,
      comments: [
        {
          id: 10,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'a',
          authorAvatarUrl: '',
          body: 'x',
          path: 'a.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    const thread2 = {
      id: 2,
      isResolved: true,
      comments: [
        {
          id: 20,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'b',
          authorAvatarUrl: '',
          body: 'y',
          path: 'b.ts',
          line: 2,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [thread1, thread2], issueComments: [], reviews: [] },
      filter: 'all',
      showResolved: true,
      filteredThreads: [thread1, thread2],
      activeThreads: [thread1],
      resolvedThreads: [thread2],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByText('Hide resolved')).toBeTruthy()
    fireEvent.click(screen.getByText('Hide resolved'))
    expect(mockSetShowResolved).toHaveBeenCalledWith(false)
  })

  it('renders fallback loading when not loading but no data', () => {
    mockHook({ loading: false, data: null, error: null })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByText('Loading conversations…')).toBeTruthy()
  })

  it('sets filter when active filter button clicked', () => {
    const thread = {
      id: 1,
      isResolved: false,
      comments: [
        {
          id: 10,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'a',
          authorAvatarUrl: '',
          body: 'x',
          path: 'a.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [thread], issueComments: [], reviews: [] },
      filteredThreads: [thread],
      activeThreads: [thread],
      resolvedThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    fireEvent.click(screen.getByText(/Active/))
    expect(mockSetFilter).toHaveBeenCalledWith('active')
    fireEvent.click(screen.getByText(/Resolved/))
    expect(mockSetFilter).toHaveBeenCalledWith('resolved')
  })

  it('renders comment with updatedAt > createdAt timestamp', () => {
    const comment = {
      id: 5,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-10T12:00:00Z',
      author: 'b',
      authorAvatarUrl: '',
      body: 'Updated comment',
      url: 'https://github.com',
      reactions: [],
    }
    mockHook({
      data: { threads: [], issueComments: [comment], reviews: [] },
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByTestId('comment-5')).toBeTruthy()
  })

  it('renders review with updatedAt > createdAt timestamp', () => {
    const review = {
      id: 7,
      author: 'c',
      authorAvatarUrl: '',
      state: 'CHANGES_REQUESTED',
      body: 'Needs changes',
      url: 'https://github.com',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-01-10T14:00:00Z',
    }
    mockHook({
      data: { threads: [], issueComments: [], reviews: [review] },
      filteredThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByTestId('review-7')).toBeTruthy()
  })

  it('sorts reviews before threads when timestamps are within 60s', () => {
    const review = {
      id: 3,
      author: 'c',
      authorAvatarUrl: '',
      state: 'COMMENTED',
      body: 'Reviewed',
      url: 'https://github.com',
      createdAt: '2026-01-10T10:00:30Z',
      updatedAt: '2026-01-10T10:00:30Z',
    }
    const thread = {
      id: 1,
      isResolved: false,
      comments: [
        {
          id: 10,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'a',
          authorAvatarUrl: '',
          body: 'review thread comment',
          path: 'a.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [thread], issueComments: [], reviews: [review] },
      filteredThreads: [thread],
      activeThreads: [thread],
      resolvedThreads: [],
    })
    const { container } = render(<PRThreadsPanel pr={basePR} />)
    const badges = container.querySelectorAll('.pr-timeline-type-badge')
    const badgeTexts = Array.from(badges).map(b => b.textContent)
    // Review should come before thread (typeOrder: review=0, thread=2)
    expect(badgeTexts[0]).toBe('review')
    expect(badgeTexts[1]).toBe('review thread')
  })

  it('filters to only threads when filter is active, hiding comments/reviews', () => {
    const thread = {
      id: 1,
      isResolved: false,
      comments: [
        {
          id: 10,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'a',
          authorAvatarUrl: '',
          body: 'x',
          path: 'a.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    const comment = {
      id: 2,
      createdAt: '2026-01-10T11:00:00Z',
      updatedAt: '2026-01-10T11:00:00Z',
      author: 'b',
      authorAvatarUrl: '',
      body: 'LGTM',
      url: 'https://github.com',
      reactions: [],
    }
    mockHook({
      data: { threads: [thread], issueComments: [comment], reviews: [] },
      filter: 'active',
      filteredThreads: [thread],
      activeThreads: [thread],
      resolvedThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    expect(screen.getByTestId('thread-1')).toBeTruthy()
    // Comment should NOT appear because filter is 'active'
    expect(screen.queryByTestId('comment-2')).toBeNull()
  })

  it('filters resolved threads by showResolved flag when filter is all', () => {
    const resolvedThread = {
      id: 2,
      isResolved: true,
      comments: [
        {
          id: 20,
          createdAt: '2026-01-10T10:00:00Z',
          updatedAt: '2026-01-10T10:00:00Z',
          author: 'b',
          authorAvatarUrl: '',
          body: 'y',
          path: 'b.ts',
          line: 2,
          reactions: [],
        },
      ],
    }
    // showResolved = false means resolved threads should be filtered out
    mockHook({
      data: { threads: [resolvedThread], issueComments: [], reviews: [] },
      filter: 'all',
      showResolved: false,
      filteredThreads: [resolvedThread],
      activeThreads: [],
      resolvedThreads: [resolvedThread],
    })
    render(<PRThreadsPanel pr={basePR} />)
    // The resolved thread should be filtered out by the timeline memo
    expect(screen.queryByTestId('thread-2')).toBeNull()
  })

  it('renders thread with empty first comment timestamp', () => {
    const thread = {
      id: 3,
      isResolved: false,
      comments: [
        {
          id: 30,
          createdAt: '',
          updatedAt: '',
          author: 'c',
          authorAvatarUrl: '',
          body: 'empty ts',
          path: 'c.ts',
          line: 1,
          reactions: [],
        },
      ],
    }
    mockHook({
      data: { threads: [thread], issueComments: [], reviews: [] },
      filteredThreads: [thread],
      activeThreads: [thread],
      resolvedThreads: [],
    })
    render(<PRThreadsPanel pr={basePR} />)
    // Thread with empty timestamp should not appear in timeline
    expect(screen.queryByTestId('thread-3')).toBeNull()
  })
})
