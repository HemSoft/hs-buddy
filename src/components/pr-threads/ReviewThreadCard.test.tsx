import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewThreadCard } from './ReviewThreadCard'
import type { PRReviewThread, PRReviewComment } from '../../api/github'
import type { PRDetailInfo } from '../../utils/prDetailView'

/* ── mocks ── */
const mockEnqueue = vi.fn()
const mockAccounts = [{ username: 'user', token: 'tok', org: 'org' }]

vi.mock('../../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    replyToReviewThread: vi.fn().mockResolvedValue({}),
    resolveReviewThread: vi.fn().mockResolvedValue(undefined),
    unresolveReviewThread: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('../../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: () => ({ owner: 'org', repo: 'repo' }),
}))

vi.mock('../../utils/errorUtils', () => ({
  throwIfAborted: vi.fn(),
}))

vi.mock('./DiffHunk', () => ({
  DiffHunk: ({ hunk }: { hunk: string }) => <div data-testid="diff-hunk">{hunk.slice(0, 40)}</div>,
}))

vi.mock('./CommentCard', () => ({
  CommentCard: ({ comment }: { comment: PRReviewComment }) => (
    <div data-testid="comment-card">{comment.body}</div>
  ),
}))

/* ── helpers ── */
function makeComment(overrides: Partial<PRReviewComment> = {}): PRReviewComment {
  return {
    id: 'comment-1',
    author: 'alice',
    authorAvatarUrl: 'https://avatars.example.com/alice.png',
    body: 'Looks good to me.',
    bodyHtml: '<p>Looks good to me.</p>',
    createdAt: '2024-06-20T10:00:00Z',
    updatedAt: '2024-06-20T10:00:00Z',
    url: 'https://github.com/org/repo/pull/1#discussion_r1',
    diffHunk: '@@ -1,3 +1,4 @@\n context\n-old\n+new',
    reactions: [],
    ...overrides,
  }
}

function makeThread(overrides: Partial<PRReviewThread> = {}): PRReviewThread {
  return {
    id: 'thread-1',
    isResolved: false,
    isOutdated: false,
    path: 'src/utils/helper.ts',
    line: 42,
    startLine: null,
    diffSide: 'RIGHT',
    comments: [makeComment()],
    ...overrides,
  }
}

const mockPr: PRDetailInfo = {
  source: 'GitHub',
  repository: 'org/repo',
  id: 1,
  title: 'Fix helper utility',
  author: 'alice',
  url: 'https://github.com/org/repo/pull/1',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2024-06-20T10:00:00Z',
  date: '2024-06-20T10:00:00Z',
}

/* ── tests ── */
describe('ReviewThreadCard', () => {
  const defaultProps = () => ({
    thread: makeThread(),
    pr: mockPr,
    onReplyAdded: vi.fn(),
    onResolveToggled: vi.fn(),
    onReactToComment: vi.fn().mockResolvedValue(undefined),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('renders thread header with file path', () => {
    render(<ReviewThreadCard {...defaultProps()} />)
    expect(screen.getByText('src/utils/helper.ts')).toBeInTheDocument()
  })

  it('shows collapsed body by default for resolved threads', () => {
    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    const { container } = render(<ReviewThreadCard {...props} />)
    expect(container.querySelector('.review-thread-body')).not.toBeInTheDocument()
  })

  it('expands thread when header is clicked', () => {
    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    const { container } = render(<ReviewThreadCard {...props} />)

    // Initially collapsed for resolved threads
    expect(container.querySelector('.review-thread-body')).not.toBeInTheDocument()

    // Click header to expand
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('.review-thread-body')).toBeInTheDocument()
  })

  it('shows resolved status indicator for resolved threads', () => {
    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    render(<ReviewThreadCard {...props} />)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('shows outdated badge for outdated threads', () => {
    const props = defaultProps()
    props.thread = makeThread({ isOutdated: true })
    render(<ReviewThreadCard {...props} />)
    expect(screen.getByText('Outdated')).toBeInTheDocument()
  })

  it('reply button opens reply form', () => {
    render(<ReviewThreadCard {...defaultProps()} />)

    // Active thread is expanded by default — find the Reply button
    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()
  })

  it('cancel button in reply form hides it', () => {
    render(<ReviewThreadCard {...defaultProps()} />)

    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument()
  })

  it('shows comment cards for thread comments', () => {
    const props = defaultProps()
    props.thread = makeThread({
      comments: [
        makeComment({ id: 'c1', body: 'First comment' }),
        makeComment({ id: 'c2', body: 'Second reply' }),
      ],
    })
    render(<ReviewThreadCard {...props} />)

    const cards = screen.getAllByTestId('comment-card')
    expect(cards).toHaveLength(2)
    expect(screen.getByText('First comment')).toBeInTheDocument()
    expect(screen.getByText('Second reply')).toBeInTheDocument()
  })

  it('renders DiffHunk when first comment has a diffHunk', () => {
    render(<ReviewThreadCard {...defaultProps()} />)
    expect(screen.getByTestId('diff-hunk')).toBeInTheDocument()
  })

  it('shows line number in header', () => {
    render(<ReviewThreadCard {...defaultProps()} />)
    expect(screen.getByText('Comment on line 42')).toBeInTheDocument()
  })

  it('shows line range when startLine differs from line', () => {
    const props = defaultProps()
    props.thread = makeThread({ line: 50, startLine: 45 })
    render(<ReviewThreadCard {...props} />)
    expect(screen.getByText('Comment on lines 45 to 50')).toBeInTheDocument()
  })

  it('shows "General review comment" when path is null', () => {
    const props = defaultProps()
    props.thread = makeThread({ path: null })
    render(<ReviewThreadCard {...props} />)
    expect(screen.getByText('General review comment')).toBeInTheDocument()
  })

  it('sends reply on Ctrl+Enter', async () => {
    const mockComment = { id: 'new-reply' }
    mockEnqueue.mockResolvedValueOnce(mockComment)

    const props = defaultProps()
    render(<ReviewThreadCard {...props} />)

    fireEvent.click(screen.getByText('Reply'))
    fireEvent.change(screen.getByPlaceholderText('Write a reply...'), {
      target: { value: 'LGTM!' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Write a reply...'), {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(props.onReplyAdded).toHaveBeenCalledWith('thread-1', mockComment)
    })
  })

  it('cancels reply on Escape key', () => {
    render(<ReviewThreadCard {...defaultProps()} />)

    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByPlaceholderText('Write a reply...'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument()
  })

  it('handles send failure gracefully', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('network error'))

    const props = defaultProps()
    render(<ReviewThreadCard {...props} />)

    fireEvent.click(screen.getByText('Reply'))
    fireEvent.change(screen.getByPlaceholderText('Write a reply...'), {
      target: { value: 'LGTM!' },
    })
    fireEvent.click(screen.getByText('Reply'))

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
    // Form stays open after failure (send_failed keeps replying=true)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a reply...')).not.toBeDisabled()
    })
  })

  it('calls resolve handler when clicking Resolve', async () => {
    mockEnqueue.mockResolvedValueOnce(undefined)

    const props = defaultProps()
    render(<ReviewThreadCard {...props} />)

    fireEvent.click(screen.getByText('Resolve conversation'))

    await waitFor(() => {
      expect(props.onResolveToggled).toHaveBeenCalledWith('thread-1', true)
    })
  })

  it('calls unresolve handler when clicking Unresolve', async () => {
    mockEnqueue.mockResolvedValueOnce(undefined)

    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    const { container } = render(<ReviewThreadCard {...props} />)

    // Expand the collapsed resolved thread
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('.review-thread-body')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Unresolve'))

    await waitFor(() => {
      expect(props.onResolveToggled).toHaveBeenCalledWith('thread-1', false)
    })
  })

  it('toggles expand on Space key on header', () => {
    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    const { container } = render(<ReviewThreadCard {...props} />)

    expect(container.querySelector('.review-thread-body')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(container.querySelector('.review-thread-body')).toBeInTheDocument()
  })

  it('toggles expand on Enter key on header', () => {
    const props = defaultProps()
    props.thread = makeThread({ isResolved: true })
    const { container } = render(<ReviewThreadCard {...props} />)

    expect(container.querySelector('.review-thread-body')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(container.querySelector('.review-thread-body')).toBeInTheDocument()
  })

  it('does not render DiffHunk when comment has no diffHunk', () => {
    const props = defaultProps()
    props.thread = makeThread({
      comments: [makeComment({ diffHunk: undefined })],
    })
    render(<ReviewThreadCard {...props} />)
    expect(screen.queryByTestId('diff-hunk')).not.toBeInTheDocument()
  })
})
