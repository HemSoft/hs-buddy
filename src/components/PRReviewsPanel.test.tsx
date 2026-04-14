import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let mockRuns: unknown[] | undefined = undefined

vi.mock('../hooks/useConvex', () => ({
  usePRReviewRunsByPR: () => mockRuns,
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: [{ username: 'alice', org: 'acme' }], loading: false }),
}))

vi.mock('convex/react', () => ({
  useConvex: () => ({
    query: vi.fn().mockResolvedValue({ result: 'Review looks good', model: 'claude' }),
  }),
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    copilotResults: {
      get: 'copilotResults:get',
    },
  },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      addPRComment: vi.fn().mockResolvedValue(undefined),
    }
  }),
}))

import { PRReviewsPanel } from './PRReviewsPanel'
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

describe('PRReviewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRuns = undefined
  })

  it('renders loading state when runs undefined', () => {
    mockRuns = undefined

    render(<PRReviewsPanel pr={makePR()} />)
    expect(screen.getByText('Loading AI reviews…')).toBeInTheDocument()
  })

  it('renders empty state when no runs', () => {
    mockRuns = []

    render(<PRReviewsPanel pr={makePR()} />)
    expect(screen.getByText('No AI reviews recorded for this PR yet.')).toBeInTheDocument()
    expect(screen.getByText('Start first review')).toBeInTheDocument()
  })

  it('renders review runs list', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123def456',
        createdAt: '2026-01-01T10:00:00Z',
      },
      {
        _id: 'run2',
        status: 'running',
        resultId: 'res2',
        model: 'gpt-4',
        reviewedHeadSha: null,
        createdAt: '2026-01-02T10:00:00Z',
      },
    ]

    render(<PRReviewsPanel pr={makePR()} />)

    expect(screen.getByText('AI Reviews')).toBeInTheDocument()
    expect(screen.getByText('Re-review')).toBeInTheDocument()
    expect(screen.getAllByText('completed')).toHaveLength(2) // pill + latest status
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('displays latest review info', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123def456',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    render(<PRReviewsPanel pr={makePR()} />)

    expect(screen.getByText('Latest')).toBeInTheDocument()
    expect(screen.getByText('Reviewed SHA')).toBeInTheDocument()
    expect(screen.getAllByText('abc123def456').length).toBeGreaterThanOrEqual(1)
  })

  it('dispatches pr-review:open event on Re-review click', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        reviewedHeadSha: 'sha1',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PRReviewsPanel pr={makePR()} />)

    fireEvent.click(screen.getByText('Re-review'))

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'pr-review:open' }))

    dispatchSpy.mockRestore()
  })

  it('dispatches copilot:open-result on result open click', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'result-id-1',
        reviewedHeadSha: 'sha1',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PRReviewsPanel pr={makePR()} />)

    // Click the "Open review result" button (ExternalLink icon)
    const openButtons = screen.getAllByTitle('Open review result')
    fireEvent.click(openButtons[0])

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copilot:open-result' })
    )

    dispatchSpy.mockRestore()
  })

  it('shows unknown sha when reviewedHeadSha is null', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        reviewedHeadSha: null,
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    render(<PRReviewsPanel pr={makePR()} />)
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })

  it('Start first review dispatches event in empty state', () => {
    mockRuns = []

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PRReviewsPanel pr={makePR()} />)

    fireEvent.click(screen.getByText('Start first review'))

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'pr-review:open' }))

    dispatchSpy.mockRestore()
  })

  it('shows failed status icon for failed latest run', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'failed',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]
    const { container } = render(<PRReviewsPanel pr={makePR()} />)
    expect(container.querySelector('.pr-reviews-status.failed')).toBeInTheDocument()
  })

  it('shows running spinner for running latest run', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'running',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]
    const { container } = render(<PRReviewsPanel pr={makePR()} />)
    expect(container.querySelector('.spin.pr-reviews-status')).toBeInTheDocument()
  })

  it('shows pending clock for pending latest run', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'pending',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]
    const { container } = render(<PRReviewsPanel pr={makePR()} />)
    expect(container.querySelector('.pr-reviews-status.pending')).toBeInTheDocument()
  })

  it('publishes review as PR comment', async () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]
    render(<PRReviewsPanel pr={makePR()} />)

    fireEvent.click(screen.getByTitle('Publish review as PR comment'))

    await waitFor(() => {
      expect(screen.getByTitle('Published to PR')).toBeInTheDocument()
    })
  })

  it('dispatches re-review with SHA-specific prompt when SHA available', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        reviewedHeadSha: 'abc123def456',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<PRReviewsPanel pr={makePR()} />)
    fireEvent.click(screen.getByText('Re-review'))

    const event = dispatchSpy.mock.calls.find(
      call => (call[0] as Event).type === 'pr-review:open'
    )?.[0] as CustomEvent
    expect(event.detail.initialPrompt).toContain('abc123def456')
    expect(event.detail.initialPrompt).toContain('commit')

    dispatchSpy.mockRestore()
  })

  it('dispatches re-review with generic prompt when no SHA', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'completed',
        resultId: 'res1',
        reviewedHeadSha: null,
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<PRReviewsPanel pr={makePR()} />)
    fireEvent.click(screen.getByText('Re-review'))

    const event = dispatchSpy.mock.calls.find(
      call => (call[0] as Event).type === 'pr-review:open'
    )?.[0] as CustomEvent
    expect(event.detail.initialPrompt).not.toContain('after commit')

    dispatchSpy.mockRestore()
  })

  it('does not show publish button for non-completed runs', () => {
    mockRuns = [
      {
        _id: 'run1',
        status: 'running',
        resultId: 'res1',
        model: 'claude',
        reviewedHeadSha: 'abc123',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ]
    render(<PRReviewsPanel pr={makePR()} />)
    expect(screen.queryByTitle('Publish review as PR comment')).not.toBeInTheDocument()
  })
})
