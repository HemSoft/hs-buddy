import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewSummaryCard } from './ReviewSummaryCard'
import type { PRReviewSummary } from '../../api/github'

// Mock MarkdownPreview to avoid WASM/heavy rendering
vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

beforeEach(() => {
  window.shell = { openExternal: vi.fn() } as never
})

function makeSummary(overrides: Partial<PRReviewSummary> = {}): PRReviewSummary {
  return {
    id: 'review-1',
    state: 'APPROVED',
    author: 'alice',
    authorAvatarUrl: 'https://avatars.example.com/alice.png',
    body: 'LGTM! Great work.',
    bodyHtml: '<p>LGTM! Great work.</p>',
    createdAt: '2024-06-20T10:00:00Z',
    updatedAt: '2024-06-20T10:00:00Z',
    url: 'https://github.com/org/repo/pull/1#pullrequestreview-1',
    ...overrides,
  }
}

describe('ReviewSummaryCard', () => {
  it('renders approved state badge', () => {
    render(<ReviewSummaryCard review={makeSummary()} />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('renders changes requested state', () => {
    render(<ReviewSummaryCard review={makeSummary({ state: 'CHANGES_REQUESTED' })} />)
    expect(screen.getByText('Changes requested')).toBeInTheDocument()
  })

  it('renders commented state', () => {
    render(<ReviewSummaryCard review={makeSummary({ state: 'COMMENTED' })} />)
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
  })

  it('renders unknown state with title case', () => {
    render(<ReviewSummaryCard review={makeSummary({ state: 'DISMISSED' })} />)
    expect(screen.getByText('Dismissed')).toBeInTheDocument()
  })

  it('renders avatar image when URL is present', () => {
    render(<ReviewSummaryCard review={makeSummary()} />)
    const img = screen.getByAltText('alice')
    expect(img).toHaveAttribute('src', 'https://avatars.example.com/alice.png')
  })

  it('renders avatar placeholder when no URL', () => {
    render(<ReviewSummaryCard review={makeSummary({ authorAvatarUrl: null })} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders the review body via markdown', () => {
    render(<ReviewSummaryCard review={makeSummary()} />)
    expect(screen.getByTestId('markdown')).toHaveTextContent('LGTM! Great work.')
  })

  it('opens GitHub link on click', () => {
    render(<ReviewSummaryCard review={makeSummary()} />)
    fireEvent.click(screen.getByText('View on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/org/repo/pull/1#pullrequestreview-1'
    )
  })

  it('shows updatedAt when newer than createdAt', () => {
    const review = makeSummary({
      createdAt: '2024-06-20T10:00:00Z',
      updatedAt: '2024-06-21T12:00:00Z',
    })
    render(<ReviewSummaryCard review={review} />)
    // The time element should have the updatedAt as title
    const timeSpan = screen.getByTitle(new Date('2024-06-21T12:00:00Z').toLocaleString())
    expect(timeSpan).toBeInTheDocument()
  })
})
