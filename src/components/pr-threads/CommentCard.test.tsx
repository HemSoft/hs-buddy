import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentCard } from './CommentCard'
import type { PRReviewComment } from '../../api/github'

// Mock MarkdownPreview
vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

function makeComment(overrides: Partial<PRReviewComment> = {}): PRReviewComment {
  return {
    id: 'comment-1',
    author: 'bob',
    authorAvatarUrl: 'https://avatars.example.com/bob.png',
    body: 'This looks good.',
    bodyHtml: '<p>This looks good.</p>',
    createdAt: '2024-06-20T10:00:00Z',
    updatedAt: '2024-06-20T10:00:00Z',
    url: 'https://github.com/org/repo/pull/1#discussion_r1',
    diffHunk: null,
    reactions: [],
    ...overrides,
  }
}

describe('CommentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders comment author and body', () => {
    render(<CommentCard comment={makeComment()} />)
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toHaveTextContent('This looks good.')
  })

  it('renders avatar image when URL is present', () => {
    render(<CommentCard comment={makeComment()} />)
    const img = screen.getByAltText('bob')
    expect(img).toHaveAttribute('src', 'https://avatars.example.com/bob.png')
  })

  it('renders avatar placeholder when no URL', () => {
    render(<CommentCard comment={makeComment({ authorAvatarUrl: null })} />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('adds isFirst class when isFirst is true', () => {
    const { container } = render(<CommentCard comment={makeComment()} isFirst />)
    const details = container.querySelector('details')
    expect(details?.className).toContain('thread-comment-first')
  })

  it('does not show reactions bar when onReact is not provided', () => {
    const { container } = render(<CommentCard comment={makeComment()} />)
    expect(container.querySelector('.thread-comment-reactions')).not.toBeInTheDocument()
  })

  it('shows reaction buttons when onReact is provided', () => {
    const onReact = vi.fn()
    render(<CommentCard comment={makeComment()} onReact={onReact} />)

    expect(screen.getByTitle('Thumbs up')).toBeInTheDocument()
    expect(screen.getByTitle('Heart')).toBeInTheDocument()
    expect(screen.getByTitle('Rocket')).toBeInTheDocument()
  })

  it('shows reaction count for active reactions', () => {
    const comment = makeComment({
      reactions: [{ content: 'THUMBS_UP', count: 3, viewerHasReacted: true }],
    })
    render(<CommentCard comment={comment} onReact={vi.fn()} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('marks active reactions with active class', () => {
    const comment = makeComment({
      reactions: [{ content: 'HEART', count: 1, viewerHasReacted: true }],
    })
    const { container } = render(<CommentCard comment={comment} onReact={vi.fn()} />)
    const heartBtn = container.querySelector('.thread-comment-reaction.active')
    expect(heartBtn).toBeInTheDocument()
  })

  it('calls onReact when a reaction button is clicked', async () => {
    const onReact = vi.fn().mockResolvedValue(undefined)
    render(<CommentCard comment={makeComment()} onReact={onReact} />)

    fireEvent.click(screen.getByTitle('Thumbs up'))

    await waitFor(() => {
      expect(onReact).toHaveBeenCalledWith('comment-1', 'THUMBS_UP')
    })
  })

  it('disables reaction buttons while reacting', async () => {
    let resolveReact: () => void
    const onReact = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveReact = resolve
        })
    )

    const { container } = render(<CommentCard comment={makeComment()} onReact={onReact} />)

    fireEvent.click(screen.getByTitle('Thumbs up'))

    // All buttons should be disabled during reaction
    const buttons = container.querySelectorAll('.thread-comment-reaction')
    buttons.forEach(btn => {
      expect(btn).toBeDisabled()
    })

    // Resolve and re-enable
    await waitFor(() => {
      resolveReact!()
    })
  })

  it('renders suggestion blocks from comment body', () => {
    const comment = makeComment({
      body: 'Consider this change:\n```suggestion\nconst x = 42\n```',
      bodyHtml: null,
    })
    render(<CommentCard comment={comment} />)
    expect(screen.getByText('Suggested change')).toBeInTheDocument()
  })

  it('renders markdown when no suggestion blocks and bodyHtml is present', () => {
    const comment = makeComment({
      body: 'Just a regular comment',
      bodyHtml: '<p>Just a regular comment</p>',
    })
    render(<CommentCard comment={comment} />)
    expect(screen.getByTestId('markdown')).toHaveTextContent('Just a regular comment')
  })
})
