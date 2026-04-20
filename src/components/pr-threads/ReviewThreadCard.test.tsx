import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

vi.mock('../../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: () => ({ owner: 'test-org', repo: 'hs-buddy' }),
}))

vi.mock('../../utils/errorUtils', () => ({
  throwIfAborted: () => {},
}))

const mockReplyToReviewThread = vi.fn()
const mockResolveReviewThread = vi.fn()
const mockUnresolveReviewThread = vi.fn()

vi.mock('../../api/github', () => ({
  GitHubClient: class {
    replyToReviewThread(...args: unknown[]) {
      return mockReplyToReviewThread(...args)
    }
    resolveReviewThread(...args: unknown[]) {
      return mockResolveReviewThread(...args)
    }
    unresolveReviewThread(...args: unknown[]) {
      return mockUnresolveReviewThread(...args)
    }
  },
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
    bodyHtml: '<p>Looks good to me</p>',
    url: 'https://github.com/test-org/hs-buddy/pull/42#comment-1',
    reactions: [],
    ...overrides,
  }
}

function makeThread(overrides: Partial<PRReviewThread> = {}): PRReviewThread {
  return {
    id: 'thread-1',
    path: 'src/app.ts',
    line: 10,
    startLine: null,
    diffSide: null,
    isResolved: false,
    isOutdated: false,
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

  describe('reply success and error flows', () => {
    it('calls onReplyAdded on successful reply send', async () => {
      const newComment = makeComment({ id: 'new-reply', body: 'reply text' })
      mockEnqueue.mockResolvedValue(newComment)
      renderCard()

      // Open reply form
      fireEvent.click(screen.getByText('Reply'))
      const textarea = screen.getByPlaceholderText('Write a reply...')
      fireEvent.change(textarea, { target: { value: 'My reply text' } })

      // Click send
      const sendButtons = screen.getAllByRole('button', { name: /Reply/i })
      const sendBtn = sendButtons.find(btn => btn.classList.contains('thread-reply-send'))!
      fireEvent.click(sendBtn)

      await waitFor(() => {
        expect(onReplyAdded).toHaveBeenCalledWith('thread-1', newComment)
      })
    })

    it('preserves reply text and keeps form open on send error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockEnqueue.mockRejectedValue(new Error('Send failed'))
      renderCard()

      fireEvent.click(screen.getByText('Reply'))
      const textarea = screen.getByPlaceholderText('Write a reply...')
      fireEvent.change(textarea, { target: { value: 'My reply text' } })

      const sendButtons = screen.getAllByRole('button', { name: /Reply/i })
      const sendBtn = sendButtons.find(btn => btn.classList.contains('thread-reply-send'))!
      fireEvent.click(sendBtn)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to reply:', expect.any(Error))
      })

      // Form should still be open with text preserved
      expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('My reply text')
      // onReplyAdded should NOT be called on error
      expect(onReplyAdded).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('resolve success and error flows', () => {
    it('calls onResolveToggled on successful resolve', async () => {
      mockEnqueue.mockResolvedValue(undefined)
      renderCard(makeThread({ isResolved: false }))

      fireEvent.click(screen.getByText('Resolve conversation'))

      await waitFor(() => {
        expect(onResolveToggled).toHaveBeenCalledWith('thread-1', true)
      })
    })

    it('calls onResolveToggled with false for unresolve', async () => {
      mockEnqueue.mockResolvedValue(undefined)
      renderCard(makeThread({ isResolved: true }))

      // Expand the resolved thread first
      fireEvent.click(screen.getByRole('button', { name: /src\/app.ts/i }))
      fireEvent.click(screen.getByText('Unresolve'))

      await waitFor(() => {
        expect(onResolveToggled).toHaveBeenCalledWith('thread-1', false)
      })
    })

    it('re-enables resolve button after error and does not call onResolveToggled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockEnqueue.mockRejectedValue(new Error('Resolve failed'))
      renderCard(makeThread({ isResolved: false }))

      fireEvent.click(screen.getByText('Resolve conversation'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to toggle resolve:', expect.any(Error))
      })

      // Button should be re-enabled after error (done_resolving in finally)
      await waitFor(() => {
        const resolveBtn = screen.getByText('Resolve conversation').closest('button')
        expect(resolveBtn).not.toBeDisabled()
      })

      expect(onResolveToggled).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  it('sends reply via Ctrl+Enter shortcut and triggers onReplyAdded', async () => {
    const newComment = makeComment({ id: 'ctrl-reply', body: 'ctrl+enter reply' })
    mockEnqueue.mockResolvedValue(newComment)
    renderCard()

    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'ctrl+enter reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(onReplyAdded).toHaveBeenCalledWith('thread-1', newComment)
    })
  })

  it('sends reply via Meta+Enter shortcut', async () => {
    const newComment = makeComment({ id: 'meta-reply', body: 'meta reply' })
    mockEnqueue.mockResolvedValue(newComment)
    renderCard()

    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'meta reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => {
      expect(onReplyAdded).toHaveBeenCalledWith('thread-1', newComment)
    })
  })

  it('does not show line label when thread.line is null', () => {
    renderCard(makeThread({ line: null }))
    expect(screen.queryByText(/Comment on line/)).not.toBeInTheDocument()
  })

  it('does not render DiffHunk when first comment has no diffHunk', () => {
    const comment = makeComment({ diffHunk: null })
    renderCard(makeThread({ comments: [comment] }))
    expect(screen.queryByTestId('diff-hunk')).not.toBeInTheDocument()
  })

  it('does not send reply when text is whitespace only via Ctrl+Enter', () => {
    renderCard()
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: '   ' } })

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('prevents duplicate send via Ctrl+Enter while already sending', async () => {
    let resolveEnqueue!: (value: PRReviewComment) => void
    mockEnqueue.mockImplementation(
      () =>
        new Promise<PRReviewComment>(resolve => {
          resolveEnqueue = resolve
        })
    )
    renderCard()

    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })

    // Click send button — starts sending
    const sendButtons = screen.getAllByRole('button', { name: /Reply/i })
    const sendBtn = sendButtons.find(btn => btn.classList.contains('thread-reply-send'))!
    fireEvent.click(sendBtn)

    // Try to send again via Ctrl+Enter while already sending
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(mockEnqueue).toHaveBeenCalledTimes(1)

    // Clean up pending promise
    const newComment = makeComment({ id: 'dup-reply', body: 'reply' })
    resolveEnqueue(newComment)
    await waitFor(() => {
      expect(onReplyAdded).toHaveBeenCalledWith('thread-1', newComment)
    })
  })

  it('shows singular line label when startLine equals line', () => {
    renderCard(makeThread({ line: 15, startLine: 15 }))
    expect(screen.getByText('Comment on line 15')).toBeInTheDocument()
    expect(screen.queryByText(/Comment on lines/)).not.toBeInTheDocument()
  })

  it('disables resolve button and re-enables after resolve completes', async () => {
    let resolveEnqueue!: () => void
    mockEnqueue.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveEnqueue = resolve
        })
    )
    renderCard(makeThread({ isResolved: false }))

    fireEvent.click(screen.getByText('Resolve conversation'))

    await waitFor(() => {
      const resolveBtn = screen.getByText('Resolve conversation').closest('button')
      expect(resolveBtn).toBeDisabled()
    })

    resolveEnqueue()
    await waitFor(() => {
      expect(onResolveToggled).toHaveBeenCalledWith('thread-1', true)
    })
    await waitFor(() => {
      const resolveBtn = screen.getByText('Resolve conversation').closest('button')
      expect(resolveBtn).not.toBeDisabled()
    })
  })

  it('invokes throwIfAborted and GitHubClient in reply callback', async () => {
    mockReplyToReviewThread.mockResolvedValue(
      makeComment({ id: 'cb-reply', body: 'callback reply' })
    )
    mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return cb(controller.signal)
    })
    renderCard()

    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'Test reply' } })

    const sendButtons = screen.getAllByRole('button', { name: /Reply/i })
    const sendBtn = sendButtons.find(btn => btn.classList.contains('thread-reply-send'))!
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(mockReplyToReviewThread).toHaveBeenCalled()
      expect(onReplyAdded).toHaveBeenCalled()
    })
  })

  it('invokes throwIfAborted and GitHubClient in resolve callback', async () => {
    mockResolveReviewThread.mockResolvedValue(undefined)
    mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return cb(controller.signal)
    })
    renderCard(makeThread({ isResolved: false }))

    fireEvent.click(screen.getByText('Resolve conversation'))

    await waitFor(() => {
      expect(mockResolveReviewThread).toHaveBeenCalled()
      expect(onResolveToggled).toHaveBeenCalledWith('thread-1', true)
    })
  })

  it('invokes throwIfAborted and GitHubClient in unresolve callback', async () => {
    mockUnresolveReviewThread.mockResolvedValue(undefined)
    mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return cb(controller.signal)
    })
    renderCard(makeThread({ isResolved: true }))

    fireEvent.click(screen.getByRole('button', { name: /src\/app.ts/i }))
    fireEvent.click(screen.getByText('Unresolve'))

    await waitFor(() => {
      expect(mockUnresolveReviewThread).toHaveBeenCalled()
      expect(onResolveToggled).toHaveBeenCalledWith('thread-1', false)
    })
  })
})
