import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewThreadCard } from './ReviewThreadCard'
import type { PRDetailInfo } from '../../utils/prDetailView'
import type { PRReviewThread, PRReviewComment } from '../../api/github'

const mockEnqueue = vi.fn()

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [{ username: 'alice', org: 'test-org' }],
    loading: false,
  }),
}))

vi.mock('../../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('./DiffHunk', () => ({
  DiffHunk: ({ hunk }: { hunk: string }) => <div data-testid="diff-hunk">{hunk}</div>,
}))

vi.mock('./CommentCard', () => ({
  CommentCard: ({ comment }: { comment: { id: string; body: string } }) => (
    <div data-testid={`comment-${comment.id}`}>{comment.body}</div>
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

function makeComment(overrides: Partial<PRReviewComment> = {}): PRReviewComment {
  return {
    id: 'comment-1',
    body: 'Looks good to me',
    author: 'reviewer',
    authorAvatarUrl: 'https://example.com/avatar.png',
    createdAt: '2025-06-01T12:00:00Z',
    updatedAt: '2025-06-01T12:00:00Z',
    diffHunk: '@@ -1,3 +1,4 @@\n hello\n+world',
    path: 'src/app.ts',
    url: 'https://github.com/test-org/hs-buddy/pull/42#comment-1',
    reactionGroups: [],
    ...overrides,
  }
}

function makeThread(overrides: Partial<PRReviewThread> = {}): PRReviewThread {
  return {
    id: 'thread-1',
    path: 'src/app.ts',
    line: 10,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    isCollapsed: false,
    comments: [makeComment()],
    ...overrides,
  }
}

describe('ReviewThreadCard', () => {
  const onReplyAdded = vi.fn()
  const onResolveToggled = vi.fn()
  const onReactToComment = vi.fn()

  function renderCard(thread?: PRReviewThread) {
    return render(
      <ReviewThreadCard
        thread={thread ?? makeThread()}
        pr={defaultPr}
        onReplyAdded={onReplyAdded}
        onResolveToggled={onResolveToggled}
        onReactToComment={onReactToComment}
      />
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders file path and comment count', () => {
    renderCard()
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows line label for single line comment', () => {
    renderCard(makeThread({ line: 10, startLine: null }))
    expect(screen.getByText('Comment on line 10')).toBeInTheDocument()
  })

  it('shows line range label for multi-line comment', () => {
    renderCard(makeThread({ line: 20, startLine: 15 }))
    expect(screen.getByText('Comment on lines 15 to 20')).toBeInTheDocument()
  })

  it('shows "General review comment" when path is empty', () => {
    renderCard(makeThread({ path: '' }))
    expect(screen.getByText('General review comment')).toBeInTheDocument()
  })

  it('shows resolved badge for resolved threads', () => {
    renderCard(makeThread({ isResolved: true }))
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('shows outdated badge for outdated threads', () => {
    renderCard(makeThread({ isOutdated: true }))
    expect(screen.getByText('Outdated')).toBeInTheDocument()
  })

  it('starts expanded for active threads', () => {
    renderCard(makeThread({ isResolved: false, isOutdated: false }))
    expect(screen.getByText('Reply')).toBeInTheDocument()
  })

  it('starts collapsed for resolved threads', () => {
    renderCard(makeThread({ isResolved: true }))
    expect(screen.queryByText('Reply')).not.toBeInTheDocument()
  })

  it('toggles expansion on header click', () => {
    renderCard(makeThread({ isResolved: true }))
    expect(screen.queryByText('Reply')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /src\/app.ts/i }))
    expect(screen.getByText('Reply')).toBeInTheDocument()
  })

  it('toggles expansion on Enter key', () => {
    renderCard(makeThread({ isResolved: true }))
    fireEvent.keyDown(screen.getByRole('button', { name: /src\/app.ts/i }), { key: 'Enter' })
    expect(screen.getByText('Reply')).toBeInTheDocument()
  })

  it('toggles expansion on Space key', () => {
    renderCard(makeThread({ isResolved: true }))
    fireEvent.keyDown(screen.getByRole('button', { name: /src\/app.ts/i }), { key: ' ' })
    expect(screen.getByText('Reply')).toBeInTheDocument()
  })

  it('renders diff hunk when present', () => {
    renderCard()
    expect(screen.getByTestId('diff-hunk')).toBeInTheDocument()
  })

  it('renders first comment and remaining comments', () => {
    const comments = [
      makeComment({ id: 'c1', body: 'First comment' }),
      makeComment({ id: 'c2', body: 'Second comment' }),
      makeComment({ id: 'c3', body: 'Third comment' }),
    ]
    renderCard(makeThread({ comments }))
    expect(screen.getByTestId('comment-c1')).toBeInTheDocument()
    expect(screen.getByTestId('comment-c2')).toBeInTheDocument()
    expect(screen.getByTestId('comment-c3')).toBeInTheDocument()
  })

  it('shows reply form when Reply button is clicked', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()
  })

  it('cancels reply form via Cancel button', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument()
  })

  it('cancels reply via Escape key', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument()
  })

  it('updates reply text in textarea', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')

    fireEvent.change(textarea, { target: { value: 'My reply' } })
    expect(textarea).toHaveValue('My reply')
  })

  it('disables send button when reply text is empty', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    const sendBtn = screen.getByRole('button', { name: /Reply/i })
    expect(sendBtn).toBeDisabled()
  })

  it('enables send button when reply text is non-empty', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })

    const sendButtons = screen.getAllByRole('button', { name: /Reply/i })
    const sendBtn = sendButtons.find(btn => !btn.classList.contains('thread-reply-btn'))
    expect(sendBtn).not.toBeDisabled()
  })

  it('shows resolve button for unresolved threads', () => {
    renderCard(makeThread({ isResolved: false }))
    expect(screen.getByText('Resolve conversation')).toBeInTheDocument()
  })

  it('shows unresolve button for resolved threads', () => {
    renderCard(makeThread({ isResolved: true }))
    // Need to expand first
    fireEvent.click(screen.getByRole('button', { name: /src\/app.ts/i }))
    expect(screen.getByText('Unresolve')).toBeInTheDocument()
  })

  it('calls enqueue when resolve button is clicked', async () => {
    mockEnqueue.mockResolvedValue(undefined)
    renderCard()
    fireEvent.click(screen.getByText('Resolve conversation'))
    expect(mockEnqueue).toHaveBeenCalled()
  })

  it('calls enqueue when sending a reply via Ctrl+Enter', async () => {
    mockEnqueue.mockResolvedValue(makeComment({ id: 'new', body: 'reply' }))
    renderCard()
    fireEvent.click(screen.getByText('Reply'))

    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(mockEnqueue).toHaveBeenCalled()
  })

  it('shows comment count for multiple comments', () => {
    const comments = [makeComment({ id: 'c1' }), makeComment({ id: 'c2' })]
    renderCard(makeThread({ comments }))
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
