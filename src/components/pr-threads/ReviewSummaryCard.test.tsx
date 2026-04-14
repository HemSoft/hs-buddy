import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewSummaryCard } from './ReviewSummaryCard'
import type { PRReviewSummary } from '../../api/github'

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown-preview">{source}</div>,
}))

vi.mock('remark-gemoji', () => ({
  default: () => {},
}))

const mockOpenExternal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'shell', {
    value: { openExternal: mockOpenExternal },
    writable: true,
    configurable: true,
  })
})

function makeReview(overrides: Partial<PRReviewSummary> = {}): PRReviewSummary {
  return {
    id: 'rev-1',
    state: 'APPROVED',
    author: 'octocat',
    authorAvatarUrl: 'https://avatars.example.com/octocat.png',
    body: 'Looks great!',
    bodyHtml: null,
    createdAt: '2025-01-10T10:00:00Z',
    updatedAt: '2025-01-10T12:00:00Z',
    url: 'https://github.com/org/repo/pull/1#pullrequestreview-1',
    ...overrides,
  }
}

describe('ReviewSummaryCard', () => {
  it('renders the reviewer username', () => {
    render(<ReviewSummaryCard review={makeReview()} />)
    expect(screen.getByText('octocat')).toBeInTheDocument()
  })

  it('renders APPROVED state badge', () => {
    render(<ReviewSummaryCard review={makeReview({ state: 'APPROVED' })} />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('renders CHANGES_REQUESTED state badge', () => {
    render(<ReviewSummaryCard review={makeReview({ state: 'CHANGES_REQUESTED' })} />)
    expect(screen.getByText('Changes requested')).toBeInTheDocument()
  })

  it('renders COMMENTED state badge', () => {
    render(<ReviewSummaryCard review={makeReview({ state: 'COMMENTED' })} />)
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
  })

  it('renders default state badge for unknown states', () => {
    render(<ReviewSummaryCard review={makeReview({ state: 'DISMISSED' })} />)
    expect(screen.getByText('Dismissed')).toBeInTheDocument()
  })

  it('renders avatar image when authorAvatarUrl is provided', () => {
    render(<ReviewSummaryCard review={makeReview()} />)
    const img = screen.getByAltText('octocat')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://avatars.example.com/octocat.png')
  })

  it('renders avatar placeholder when authorAvatarUrl is null', () => {
    render(<ReviewSummaryCard review={makeReview({ authorAvatarUrl: null })} />)
    expect(screen.getByText('O')).toBeInTheDocument()
  })

  it('renders the review body in markdown', () => {
    render(<ReviewSummaryCard review={makeReview({ body: 'LGTM :+1:' })} />)
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('LGTM :+1:')
  })

  it('opens GitHub URL when View on GitHub is clicked', () => {
    render(<ReviewSummaryCard review={makeReview()} />)
    fireEvent.click(screen.getByText('View on GitHub'))
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'https://github.com/org/repo/pull/1#pullrequestreview-1'
    )
  })

  it('uses updatedAt when it is later than createdAt', () => {
    const createdAt = '2025-01-10T10:00:00Z'
    const updatedAt = '2025-06-15T10:00:00Z'

    render(
      <ReviewSummaryCard
        review={makeReview({ createdAt, updatedAt })}
      />
    )
    const timeEl = document.querySelector('.thread-comment-time')
    expect(timeEl).toBeInTheDocument()
    // The title should contain the updatedAt date (June 15), not createdAt (January 10)
    expect(timeEl?.getAttribute('title')).toContain('6/15/2025')
  })
})
