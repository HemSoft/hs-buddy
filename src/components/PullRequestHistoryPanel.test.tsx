import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { PRDetailInfo } from '../utils/prDetailView'

const { mockEnqueue, mockCacheGet, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
  useCopilotSettings: () => ({ premiumModel: 'claude-sonnet' }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchPRHistory: vi.fn(),
    requestCopilotReview: vi.fn(),
  })),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
  formatDateFull: () => 'Jun 1, 2025',
}))

import { PullRequestHistoryPanel } from './PullRequestHistoryPanel'

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

function makeHistory(overrides = {}) {
  return {
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-02T10:00:00Z',
    mergedAt: null,
    commitCount: 5,
    totalComments: 10,
    issueCommentCount: 3,
    reviewCommentCount: 7,
    threadsTotal: 4,
    threadsOutdated: 1,
    threadsAddressed: 2,
    threadsUnaddressed: 1,
    reviewers: [
      {
        login: 'reviewer1',
        name: 'Reviewer One',
        avatarUrl: 'https://example.com/r1.png',
        status: 'approved',
        updatedAt: '2025-06-02T08:00:00Z',
      },
    ],
    timeline: [
      {
        id: 'ev1',
        type: 'commit',
        author: 'octocat',
        summary: 'Initial commit',
        occurredAt: '2025-06-01T11:00:00Z',
        url: 'https://github.com/test-org/hs-buddy/commit/abc123',
      },
      {
        id: 'ev2',
        type: 'review',
        author: 'reviewer1',
        summary: 'Approved',
        occurredAt: '2025-06-02T08:00:00Z',
        url: null,
      },
    ],
    ...overrides,
  }
}

describe('PullRequestHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheGet.mockReturnValue(null)
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<PullRequestHistoryPanel pr={defaultPr} />)
    expect(screen.getByText('Loading PR history…')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('API error'))
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load PR history')).toBeInTheDocument()
    })
    expect(screen.getByText('API error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('renders history after loading', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('PR History')).toBeInTheDocument()
    })
  })

  it('shows commit count', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('shows total comments', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument()
    })
  })

  it('shows thread status', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })
  })

  it('shows thread counts', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument() // total
      expect(screen.getByText('2')).toBeInTheDocument() // addressed
    })
  })

  it('renders reviewers', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Reviewer One (reviewer1)')).toBeInTheDocument()
      expect(screen.getByText('approved')).toBeInTheDocument()
    })
  })

  it('shows no reviewers message', async () => {
    mockEnqueue.mockResolvedValue(makeHistory({ reviewers: [] }))
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('No assigned reviewers')).toBeInTheDocument()
    })
  })

  it('renders timeline events', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('Initial commit')).toBeInTheDocument()
    })
  })

  it('shows no timeline events message', async () => {
    mockEnqueue.mockResolvedValue(makeHistory({ timeline: [] }))
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('No timeline events')).toBeInTheDocument()
    })
  })

  it('shows embedded header when embedded prop is true', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} embedded />)

    await waitFor(() => {
      const heading = screen.getByText('PR History')
      expect(heading.closest('.pr-history-inline-title')).toBeInTheDocument()
    })
  })

  it('shows Open PR button in non-embedded mode', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Open PR')).toBeInTheDocument()
    })
  })

  it('hides Open PR button in embedded mode', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} embedded />)

    await waitFor(() => {
      expect(screen.queryByText('Open PR')).not.toBeInTheDocument()
    })
  })

  it('shows commits-only view when focus is commits', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('Commit Timeline')).toBeInTheDocument()
    })
    // Only commit events should show
    expect(screen.getByText('Initial commit')).toBeInTheDocument()
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
  })

  it('hides overview and reviewers in commits focus', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('Commit Timeline')).toBeInTheDocument()
    })
    expect(screen.queryByText('Review Thread Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Assigned Reviewers')).not.toBeInTheDocument()
  })

  it('shows footer in all focus mode', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} focus="all" />)

    await waitFor(() => {
      expect(screen.getByText(/Thread status is derived from GitHub/)).toBeInTheDocument()
    })
  })

  it('calls onLoaded callback when history loads', async () => {
    const onLoaded = vi.fn()
    const history = makeHistory()
    mockEnqueue.mockResolvedValue(history)
    render(<PullRequestHistoryPanel pr={defaultPr} onLoaded={onLoaded} />)

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledWith(history)
    })
  })

  it('shows reviewer avatar fallback when no avatarUrl', async () => {
    mockEnqueue.mockResolvedValue(
      makeHistory({
        reviewers: [
          {
            login: 'bob',
            name: null,
            avatarUrl: null,
            status: 'pending',
            updatedAt: null,
          },
        ],
      })
    )
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('B')).toBeInTheDocument()
      expect(screen.getByText('bob')).toBeInTheDocument()
    })
  })
})
