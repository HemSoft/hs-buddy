import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/* ── mock fns ── */
const mockEnqueue = vi.fn()
const mockFetchPRHistory = vi.fn()
const mockAccounts = [{ username: 'alice', org: 'acme' }]

vi.mock('./PullRequestHistoryPanel.css', () => ({}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
  useCopilotSettings: () => ({ premiumModel: 'gpt-4' }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchPRHistory: (...args: unknown[]) => mockFetchPRHistory(...args),
      requestCopilotReview: vi.fn().mockResolvedValue(undefined),
    }
  }),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '2 days ago',
  formatDateFull: (d: string | null) => d ?? 'N/A',
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: () => ({ owner: 'acme', repo: 'repo' }),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

vi.mock('../utils/assistantPrompts', () => ({
  buildAddressCommentsPrompt: vi.fn().mockReturnValue('address prompt'),
}))

import { PullRequestHistoryPanel } from './PullRequestHistoryPanel'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRHistorySummary } from '../api/github'

/* ── helpers ── */
const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'repo',
  id: 1,
  title: 'Fix bug',
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

const makeHistory = (overrides: Partial<PRHistorySummary> = {}): PRHistorySummary => ({
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  mergedAt: null,
  commitCount: 3,
  issueCommentCount: 2,
  reviewCommentCount: 5,
  totalComments: 7,
  threadsTotal: 4,
  threadsOutdated: 1,
  threadsAddressed: 2,
  threadsUnaddressed: 1,
  linkedIssues: [],
  reviewers: [
    {
      login: 'bob',
      name: 'Bob',
      avatarUrl: 'https://avatar.test/bob',
      status: 'approved',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ],
  timeline: [
    {
      id: 'ev1',
      type: 'commit',
      author: 'alice',
      occurredAt: '2026-01-01T12:00:00Z',
      summary: 'abc1234 Fix the bug',
      url: 'https://github.com/acme/repo/commit/abc1234',
    },
    {
      id: 'ev2',
      type: 'comment',
      author: 'bob',
      occurredAt: '2026-01-01T14:00:00Z',
      summary: 'Looks good overall',
      url: 'https://github.com/acme/repo/pull/1#issuecomment-1',
    },
  ],
  ...overrides,
})

describe('PullRequestHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return fn(controller.signal)
    })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders loading state when fetching history', () => {
    mockEnqueue.mockImplementation(() => new Promise(() => {}))

    render(<PullRequestHistoryPanel pr={makePR()} />)
    expect(screen.getByText('Loading PR history…')).toBeInTheDocument()
  })

  it('renders history data after fetch', async () => {
    const history = makeHistory()
    mockFetchPRHistory.mockResolvedValue(history)

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Commits')).toBeInTheDocument()
    })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Comments (Total)')).toBeInTheDocument()
    expect(screen.getByText('Review comments')).toBeInTheDocument()
    expect(screen.getByText('Issue comments')).toBeInTheDocument()
  })

  it('renders error state on fetch failure with retry button', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('Network failure'))

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load PR history')).toBeInTheDocument()
    })
    expect(screen.getByText('Network failure')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows commit entries in timeline', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())

    render(<PullRequestHistoryPanel pr={makePR()} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('Commit Timeline')).toBeInTheDocument()
    })
    expect(screen.getByText('commit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'abc1234 Fix the bug' })).toBeInTheDocument()
  })

  it('shows review comments count in metrics', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory({ reviewCommentCount: 12, totalComments: 20 }))

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument()
    })
    expect(screen.getByText('Review comments')).toBeInTheDocument()
  })

  it('calls onLoaded callback when history is loaded', async () => {
    const history = makeHistory()
    mockFetchPRHistory.mockResolvedValue(history)
    const onLoaded = vi.fn()

    render(<PullRequestHistoryPanel pr={makePR()} onLoaded={onLoaded} />)

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledWith(history)
    })
  })

  it('shows embedded class when embedded prop is true', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())

    const { container } = render(<PullRequestHistoryPanel pr={makePR()} embedded />)

    await waitFor(() => {
      expect(container.querySelector('.pr-history-container.embedded')).toBeInTheDocument()
    })
  })

  it('opens external link when Open PR button is clicked', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Open PR')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open PR'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/acme/repo/pull/1')
  })

  it('retries fetch on Retry button click', async () => {
    let callCount = 0
    mockFetchPRHistory.mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('Temporary error')
      return makeHistory()
    })

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load PR history')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.queryByText('Failed to load PR history')).not.toBeInTheDocument()
    })
  })

  it('shows inline title when embedded', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())

    render(<PullRequestHistoryPanel pr={makePR()} embedded />)

    await waitFor(() => {
      expect(screen.getByText('PR History')).toBeInTheDocument()
    })
    expect(screen.queryByText('Open PR')).not.toBeInTheDocument()
  })

  it('renders reviewer list with name and status', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())

    render(<PullRequestHistoryPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Bob (bob)')).toBeInTheDocument()
    })
    expect(screen.getByText('approved')).toBeInTheDocument()
  })

  it('shows context menu on right-click of Unaddressed card', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('Unaddressed')).toBeInTheDocument()
    })
    const unaddressedCard = screen.getByTitle('Right-click for actions')
    fireEvent.contextMenu(unaddressedCard)
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()
  })

  it('closes context menu on Escape', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('Unaddressed')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('Right-click for actions'))
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
  })

  it('closes context menu on scroll', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('Unaddressed')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('Right-click for actions'))
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
  })

  it('disables Address Comments when threadsUnaddressed is 0', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory({ threadsUnaddressed: 0 }))
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('Unaddressed')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('Right-click for actions'))
    const addressBtn = screen.getByText('Address Unresolved Comments')
    expect(addressBtn.closest('button')).toBeDisabled()
  })

  it('dispatches assistant prompt when Address Comments clicked', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('Unaddressed')).toBeInTheDocument()
    })
    fireEvent.contextMenu(screen.getByTitle('Right-click for actions'))
    fireEvent.click(screen.getByText('Address Unresolved Comments'))
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'assistant:send-prompt' })
    )
    dispatchSpy.mockRestore()
  })

  it('shows "No assigned reviewers" when reviewers list is empty', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory({ reviewers: [] }))
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('No assigned reviewers')).toBeInTheDocument()
    })
  })

  it('shows reviewer avatar fallback when avatarUrl is missing', async () => {
    mockFetchPRHistory.mockResolvedValue(
      makeHistory({
        reviewers: [
          { login: 'charlie', name: null, avatarUrl: null, status: 'pending', updatedAt: null },
        ],
      })
    )
    const { container } = render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(screen.getByText('C')).toBeInTheDocument()
    })
    expect(container.querySelector('.reviewer-avatar-fallback')).toBeInTheDocument()
  })

  it('shows timeline events without URL as plain text', async () => {
    mockFetchPRHistory.mockResolvedValue(
      makeHistory({
        timeline: [
          {
            id: 'ev3',
            type: 'commit',
            author: 'bob',
            occurredAt: '2026-01-02T10:00:00Z',
            summary: 'No-link commit',
            url: null,
          },
        ],
      })
    )
    render(<PullRequestHistoryPanel pr={makePR()} focus="commits" />)
    await waitFor(() => {
      expect(screen.getByText('No-link commit')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'No-link commit' })).not.toBeInTheDocument()
  })

  it('only shows commit events when focus is "commits"', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={makePR()} focus="commits" />)
    await waitFor(() => {
      expect(screen.getByText('Commit Timeline')).toBeInTheDocument()
    })
    expect(screen.getByText('abc1234 Fix the bug')).toBeInTheDocument()
    expect(screen.queryByText('Looks good overall')).not.toBeInTheDocument()
  })

  it('shows footer thread status text in focus="all" mode', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={makePR()} />)
    await waitFor(() => {
      expect(
        screen.getByText(/thread status is derived from github review thread/i)
      ).toBeInTheDocument()
    })
  })
})
