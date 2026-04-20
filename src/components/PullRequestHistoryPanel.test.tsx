import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import type { PRDetailInfo } from '../utils/prDetailView'

const {
  mockEnqueue,
  mockCacheGet,
  stableAccounts,
  mockParseOwnerRepo,
  mockIsAbortError,
  mockFetchPRHistory,
} = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
  mockParseOwnerRepo: vi.fn(),
  mockIsAbortError: vi.fn(),
  mockFetchPRHistory: vi.fn(),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
  useCopilotSettings: () => ({ premiumModel: 'claude-sonnet' }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: class {
    fetchPRHistory(...args: unknown[]) {
      return mockFetchPRHistory(...args)
    }
    requestCopilotReview() {
      return Promise.resolve()
    }
  },
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: (...args: unknown[]) => mockIsAbortError(...args),
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
  formatDateFull: () => 'Jun 1, 2025',
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: (...args: unknown[]) => mockParseOwnerRepo(...args),
}))

vi.mock('../utils/assistantPrompts', () => ({
  buildAddressCommentsPrompt: () => 'prompt-text',
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
    mockParseOwnerRepo.mockReturnValue({ owner: 'test-org', repo: 'hs-buddy' })
    mockIsAbortError.mockReturnValue(false)
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

  it('opens PR URL when Open PR button is clicked', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Open PR')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open PR'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/pull/42'
    )
  })

  it('shows merged date when PR is merged', async () => {
    mockEnqueue.mockResolvedValue(makeHistory({ mergedAt: '2025-06-03T10:00:00Z' }))
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      // formatDateFull is mocked to return 'Jun 1, 2025'
      // Three date cards: Created, Last Updated, Merged - all show 'Jun 1, 2025'
      const dates = screen.getAllByText('Jun 1, 2025')
      expect(dates.length).toBe(3)
    })
  })

  it('opens timeline event link on click', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('Initial commit')).toBeInTheDocument()
    })

    // The first timeline event has a URL so it renders as a button
    fireEvent.click(screen.getByText('Initial commit'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/commit/abc123'
    )
  })

  it('renders timeline event without link when url is null', async () => {
    mockEnqueue.mockResolvedValue(
      makeHistory({
        timeline: [
          {
            id: 'ev-no-url',
            type: 'commit',
            author: 'reviewer1',
            summary: 'WIP commit no link',
            occurredAt: '2025-06-02T08:00:00Z',
            url: null,
          },
        ],
      })
    )
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('WIP commit no link')).toBeInTheDocument()
    })
    // No-URL events render as plain text, not a button
    const el = screen.getByText('WIP commit no link')
    expect(el.tagName).not.toBe('BUTTON')
  })

  it('shows org and repo in non-embedded header', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
      expect(screen.getByText('hs-buddy')).toBeInTheDocument()
      expect(screen.getByText('#42')).toBeInTheDocument()
    })
  })

  it('shows issue comment and review comment breakdown', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Issue comments')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Review comments')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })
  })

  it('shows reviewer time when updatedAt is provided', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('3 hours ago')).toBeInTheDocument()
    })
  })

  it('renders reviewer avatar image when avatarUrl is present', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      const avatar = document.querySelector('.reviewer-avatar') as HTMLImageElement
      expect(avatar).toBeInTheDocument()
      expect(avatar.src).toBe('https://example.com/r1.png')
    })
  })

  it('context menu opens on unaddressed thread card right-click', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })

    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()
  })

  it('closes context menu on overlay click', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()

    const overlay = document.querySelector('.pr-context-menu-overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
  })

  it('disables Address Comments when no unaddressed threads', async () => {
    mockEnqueue.mockResolvedValue(makeHistory({ threadsUnaddressed: 0 }))
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    const addressBtn = screen.getByText('Address Unresolved Comments').closest('button')!
    expect(addressBtn).toBeDisabled()
  })

  it('closes context menu on Escape key', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()

    // PullRequestHistoryPanel uses window.addEventListener('keydown', ...)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
  })

  it('shows error when parseOwnerRepoFromUrl returns null', async () => {
    mockParseOwnerRepo.mockReturnValue(null)
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load PR history')).toBeInTheDocument()
    })
    expect(screen.getByText('Could not parse owner/repo from PR URL')).toBeInTheDocument()
  })

  it('handleRequestCopilotReview returns early when parseOwnerRepoFromUrl is null', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    // Open context menu
    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()

    // Make parseOwnerRepoFromUrl return null for the request copilot review call
    mockParseOwnerRepo.mockReturnValue(null)

    // Click Request Copilot Review - should return early without closing menu
    fireEvent.click(screen.getByText('Request Copilot Review'))

    // Menu should remain open because setMenu(null) is not called when ownerRepo is null
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()
  })

  it('handleAddressComments dispatches assistant prompt and closes menu', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())

    const promptHandler = vi.fn()
    window.addEventListener('assistant:send-prompt', promptHandler as EventListener)

    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })

    const addressBtn = screen.getByText('Address Unresolved Comments')
    fireEvent.click(addressBtn)

    // Menu should close after clicking
    await waitFor(() => {
      expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
    })

    expect(promptHandler).toHaveBeenCalled()
    const event = promptHandler.mock.calls[0][0] as CustomEvent
    expect(event.detail.prompt).toBe('prompt-text')

    window.removeEventListener('assistant:send-prompt', promptHandler as EventListener)
  })

  it('uses source as fallback when org is undefined in header', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={{ ...defaultPr, org: undefined }} />)

    await waitFor(() => {
      expect(screen.getByText('PR History')).toBeInTheDocument()
    })
    // pr.org is undefined so pr.source ('GitHub') should appear in subtitle
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('test-org')).not.toBeInTheDocument()
  })

  it('uses source as org fallback in handleAddressComments', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    const promptHandler = vi.fn()
    window.addEventListener('assistant:send-prompt', promptHandler as EventListener)

    render(<PullRequestHistoryPanel pr={{ ...defaultPr, org: undefined }} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    fireEvent.click(screen.getByText('Address Unresolved Comments'))

    await waitFor(() => {
      expect(promptHandler).toHaveBeenCalled()
    })

    window.removeEventListener('assistant:send-prompt', promptHandler as EventListener)
  })

  it('does not show error when fetch is aborted', async () => {
    mockIsAbortError.mockReturnValue(true)
    mockEnqueue.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalled()
    })
    // Abort errors are silently ignored; loading state remains
    expect(screen.getByText('Loading PR history…')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load PR history')).not.toBeInTheDocument()
  })

  it('handles undefined timeline with nullish coalescing', async () => {
    mockEnqueue.mockResolvedValue(makeHistory({ timeline: undefined }))
    render(<PullRequestHistoryPanel pr={defaultPr} focus="commits" />)

    await waitFor(() => {
      expect(screen.getByText('No timeline events')).toBeInTheDocument()
    })
  })

  it('closes context menu on window scroll', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    expect(screen.getByText('Address Unresolved Comments')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByText('Address Unresolved Comments')).not.toBeInTheDocument()
  })

  it('invokes enqueue callback with throwIfAborted and GitHubClient', async () => {
    mockFetchPRHistory.mockResolvedValue(makeHistory())
    mockEnqueue.mockImplementation(async (cb: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return cb(controller.signal)
    })
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(mockFetchPRHistory).toHaveBeenCalledWith('test-org', 'hs-buddy', 42)
    })
  })

  it('discards stale success when a newer fetch completes first', async () => {
    let resolveFirst!: (val: unknown) => void
    mockEnqueue.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve
        })
    )

    const { rerender } = render(<PullRequestHistoryPanel pr={defaultPr} />)

    mockEnqueue.mockResolvedValueOnce(makeHistory({ commitCount: 5 }))
    rerender(<PullRequestHistoryPanel pr={{ ...defaultPr, id: 99 }} />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    resolveFirst(makeHistory({ commitCount: 999 }))

    await waitFor(() => {
      expect(screen.queryByText('999')).not.toBeInTheDocument()
    })
  })

  it('discards stale errors when a newer fetch completes first', async () => {
    let rejectFirst!: (err: Error) => void
    mockEnqueue.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) => {
          rejectFirst = reject
        })
    )

    const { rerender } = render(<PullRequestHistoryPanel pr={defaultPr} />)

    mockEnqueue.mockResolvedValueOnce(makeHistory())
    rerender(<PullRequestHistoryPanel pr={{ ...defaultPr, id: 99 }} />)

    await waitFor(() => {
      expect(screen.getByText('PR History')).toBeInTheDocument()
    })

    rejectFirst(new Error('Stale network error'))

    await waitFor(() => {
      expect(screen.queryByText('Stale network error')).not.toBeInTheDocument()
    })
  })

  it('handleRequestCopilotReview succeeds and closes menu', async () => {
    mockEnqueue.mockResolvedValue(makeHistory())
    render(<PullRequestHistoryPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Review Thread Status')).toBeInTheDocument()
    })

    const unaddressedCard = document.querySelector('.thread-card-interactive') as HTMLElement
    fireEvent.contextMenu(unaddressedCard, { clientX: 100, clientY: 200 })
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()

    // parseOwnerRepoFromUrl returns valid result (set in beforeEach)
    fireEvent.click(screen.getByText('Request Copilot Review'))

    // Menu should close after successful request
    await waitFor(() => {
      expect(screen.queryByText('Request Copilot Review')).not.toBeInTheDocument()
    })
  })
})
