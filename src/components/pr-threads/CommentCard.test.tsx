import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentCard } from './CommentCard'
import type { PRReviewComment, PRCommentReactionContent } from '../../api/github'

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown-preview">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({
  default: () => {},
}))

function makeComment(overrides: Partial<PRReviewComment> = {}): PRReviewComment {
  return {
    id: 'comment-1',
    author: 'octocat',
    authorAvatarUrl: 'https://avatars.example.com/octocat.png',
    body: 'Great work on this PR!',
    bodyHtml: '<p>Great work on this PR!</p>',
    createdAt: '2025-06-10T10:00:00Z',
    updatedAt: '2025-06-10T10:00:00Z',
    path: null,
    line: null,
    diffHunk: null,
    outdated: false,
    subjectType: 'LINE',
    reactions: [],
    ...overrides,
  }
}

describe('CommentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders author name', () => {
    render(<CommentCard comment={makeComment()} />)
    expect(screen.getByText('octocat')).toBeInTheDocument()
  })

  it('renders avatar image when authorAvatarUrl is provided', () => {
    render(<CommentCard comment={makeComment()} />)
    const img = screen.getByAltText('octocat')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://avatars.example.com/octocat.png')
  })

  it('renders avatar placeholder when authorAvatarUrl is null', () => {
    render(<CommentCard comment={makeComment({ authorAvatarUrl: null })} />)
    expect(screen.getByText('O')).toBeInTheDocument()
  })

  it('renders comment body with markdown', () => {
    render(<CommentCard comment={makeComment()} />)
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Great work on this PR!')
  })

  it('renders suggestion blocks when body contains suggestion syntax', () => {
    const body = 'Before suggestion\n```suggestion\nconst x = 1;\n```\nAfter suggestion'
    render(<CommentCard comment={makeComment({ body, bodyHtml: null })} />)
    expect(screen.getByText('Suggested change')).toBeInTheDocument()
  })

  it('applies first-comment class when isFirst is true', () => {
    const { container } = render(<CommentCard comment={makeComment()} isFirst />)
    expect(container.querySelector('.thread-comment-first')).toBeInTheDocument()
  })

  it('does not apply first-comment class when isFirst is false', () => {
    const { container } = render(<CommentCard comment={makeComment()} />)
    expect(container.querySelector('.thread-comment-first')).not.toBeInTheDocument()
  })

  it('renders reaction buttons when onReact is provided', () => {
    const onReact = vi.fn().mockResolvedValue(undefined)
    render(<CommentCard comment={makeComment()} onReact={onReact} />)
    expect(screen.getByTitle('Thumbs up')).toBeInTheDocument()
    expect(screen.getByTitle('Heart')).toBeInTheDocument()
    expect(screen.getByTitle('Rocket')).toBeInTheDocument()
  })

  it('does not render reaction buttons when onReact is not provided', () => {
    render(<CommentCard comment={makeComment()} />)
    expect(screen.queryByTitle('Thumbs up')).not.toBeInTheDocument()
  })

  it('calls onReact with comment id and reaction content when reaction is clicked', async () => {
    const onReact = vi.fn().mockResolvedValue(undefined)
    render(<CommentCard comment={makeComment()} onReact={onReact} />)
    fireEvent.click(screen.getByTitle('Thumbs up'))
    await waitFor(() => {
      expect(onReact).toHaveBeenCalledWith('comment-1', 'THUMBS_UP')
    })
  })

  it('shows reaction count when count > 0', () => {
    const comment = makeComment({
      reactions: [
        { content: 'THUMBS_UP' as PRCommentReactionContent, count: 3, viewerHasReacted: false },
      ],
    })
    const onReact = vi.fn().mockResolvedValue(undefined)
    render(<CommentCard comment={comment} onReact={onReact} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('highlights active reactions when viewerHasReacted is true', () => {
    const comment = makeComment({
      reactions: [
        { content: 'HEART' as PRCommentReactionContent, count: 1, viewerHasReacted: true },
      ],
    })
    const onReact = vi.fn().mockResolvedValue(undefined)
    render(<CommentCard comment={comment} onReact={onReact} />)
    const heartBtn = screen.getByTitle('Heart')
    expect(heartBtn).toHaveClass('active')
  })

  it('uses updatedAt when it is later than createdAt', () => {
    const comment = makeComment({
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
    })
    render(<CommentCard comment={comment} />)
    const timeEl = document.querySelector('.thread-comment-time')
    expect(timeEl).toBeInTheDocument()
    expect(timeEl?.getAttribute('title')).toContain('6/15/2025')
  })

  it('disables reaction buttons while a reaction is in flight', async () => {
    let resolveReaction: () => void
    const onReact = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveReaction = resolve
        })
    )
    render(<CommentCard comment={makeComment()} onReact={onReact} />)

    fireEvent.click(screen.getByTitle('Thumbs up'))

    // All reaction buttons should be disabled while waiting
    const heartBtn = screen.getByTitle('Heart')
    expect(heartBtn).toBeDisabled()

    // Resolve the promise
    resolveReaction!()
    await waitFor(() => {
      expect(heartBtn).not.toBeDisabled()
    })
  })
})
