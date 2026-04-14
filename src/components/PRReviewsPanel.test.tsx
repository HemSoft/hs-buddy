import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRReviewsPanel } from './PRReviewsPanel'
import type { PRDetailInfo } from '../utils/prDetailView'

const mockUsePRReviewRunsByPR = vi.fn()
const mockUseConvex = vi.fn()
const mockDispatchEvent = vi.fn()

vi.mock('convex/react', () => ({
  useConvex: () => mockUseConvex(),
}))

vi.mock('../../convex/_generated/api', () => ({
  api: { copilotResults: { get: 'copilotResults:get' } },
}))

vi.mock('../hooks/useConvex', () => ({
  usePRReviewRunsByPR: (...args: unknown[]) => mockUsePRReviewRunsByPR(...args),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [{ username: 'alice', org: 'test-org' }],
    loading: false,
  }),
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

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'run-1',
    status: 'completed',
    resultId: 'result-1',
    createdAt: Date.now() - 3600000,
    reviewedHeadSha: 'abc123def456',
    model: 'claude-sonnet',
    ...overrides,
  }
}

describe('PRReviewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseConvex.mockReturnValue({ query: vi.fn() })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
    window.dispatchEvent = mockDispatchEvent
  })

  it('shows loading state when runs is undefined', () => {
    mockUsePRReviewRunsByPR.mockReturnValue(undefined)
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.getByText('Loading AI reviews…')).toBeInTheDocument()
  })

  it('shows empty state when no runs exist', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([])
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.getByText('No AI reviews recorded for this PR yet.')).toBeInTheDocument()
    expect(screen.getByText('Start first review')).toBeInTheDocument()
  })

  it('renders AI Reviews header with Re-review button', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun()])
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.getByText('AI Reviews')).toBeInTheDocument()
    expect(screen.getByText('Re-review')).toBeInTheDocument()
  })

  it('shows latest run status and SHA', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun()])
    render(<PRReviewsPanel pr={defaultPr} />)
    // Status text appears in both the latest section and run list
    expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('abc123def456').length).toBeGreaterThanOrEqual(1)
  })

  it('renders run list items', () => {
    const runs = [
      makeRun({ _id: 'run-1', status: 'completed' }),
      makeRun({ _id: 'run-2', status: 'failed', reviewedHeadSha: null }),
    ]
    mockUsePRReviewRunsByPR.mockReturnValue(runs)
    render(<PRReviewsPanel pr={defaultPr} />)
    const pills = screen.getAllByText(/completed|failed/)
    expect(pills.length).toBeGreaterThanOrEqual(2)
  })

  it('dispatches pr-review:open event when Re-review is clicked', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun()])
    render(<PRReviewsPanel pr={defaultPr} />)
    fireEvent.click(screen.getByText('Re-review'))
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pr-review:open',
        detail: expect.objectContaining({
          prUrl: defaultPr.url,
          prNumber: 42,
          repo: 'hs-buddy',
        }),
      })
    )
  })

  it('dispatches copilot:open-result when open result button is clicked', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun()])
    render(<PRReviewsPanel pr={defaultPr} />)
    const openBtn = screen.getByTitle('Open review result')
    fireEvent.click(openBtn)
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'copilot:open-result',
        detail: { resultId: 'result-1' },
      })
    )
  })

  it('shows publish button for completed runs', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun({ status: 'completed' })])
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.getByTitle('Publish review as PR comment')).toBeInTheDocument()
  })

  it('does not show publish button for non-completed runs', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun({ status: 'running' })])
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.queryByTitle('Publish review as PR comment')).not.toBeInTheDocument()
  })

  it('shows unknown for latest SHA when reviewedHeadSha is null', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([makeRun({ reviewedHeadSha: null })])
    render(<PRReviewsPanel pr={defaultPr} />)
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })

  it('dispatches Start first review from empty state', () => {
    mockUsePRReviewRunsByPR.mockReturnValue([])
    render(<PRReviewsPanel pr={defaultPr} />)
    fireEvent.click(screen.getByText('Start first review'))
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pr-review:open' })
    )
  })

  it('shows different status icons for different statuses', () => {
    for (const status of ['completed', 'failed', 'running', 'pending']) {
      mockUsePRReviewRunsByPR.mockReturnValue([makeRun({ status })])
      const { unmount } = render(<PRReviewsPanel pr={defaultPr} />)
      // Each status text appears at least once (in the latest section and/or run list)
      expect(screen.getAllByText(status).length).toBeGreaterThanOrEqual(1)
      unmount()
    }
  })
})
