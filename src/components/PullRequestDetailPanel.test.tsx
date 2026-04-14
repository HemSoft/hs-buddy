import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PRDetailInfo } from '../utils/prDetailView'

/* ── mocks ── */
const mockEnqueue = vi.fn()
const mockOpenExternal = vi.fn()

const stableAccounts = vi.hoisted(() => [{ username: 'alice', org: 'test-org' }])

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: stableAccounts,
    loading: false,
  }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchPRBranches: vi.fn().mockResolvedValue({
      headBranch: 'feature-branch',
      baseBranch: 'main',
    }),
    fetchPRHistory: vi.fn().mockResolvedValue({
      commits: [],
      reviewers: [],
      updatedAt: '2025-06-01T10:00:00Z',
      linkedIssues: [],
    }),
    listPRReviews: vi.fn().mockResolvedValue([]),
    requestCopilotReview: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../utils/notificationSound', () => ({
  createNotificationSoundBlob: vi.fn(),
}))

vi.mock('./PullRequestHistoryPanel', () => ({
  PullRequestHistoryPanel: ({ pr }: { pr: PRDetailInfo }) => (
    <div data-testid="history-panel">History: #{pr.id}</div>
  ),
}))

vi.mock('./PRChecksPanel', () => ({
  PRChecksPanel: ({ pr }: { pr: PRDetailInfo }) => (
    <div data-testid="checks-panel">Checks: #{pr.id}</div>
  ),
}))

vi.mock('./PRFilesChangedPanel', () => ({
  PRFilesChangedPanel: ({ pr }: { pr: PRDetailInfo }) => (
    <div data-testid="files-panel">Files: #{pr.id}</div>
  ),
}))

vi.mock('./PRThreadsPanel', () => ({
  PRThreadsPanel: ({ pr }: { pr: PRDetailInfo }) => (
    <div data-testid="threads-panel">Threads: #{pr.id}</div>
  ),
}))

vi.mock('./PRReviewsPanel', () => ({
  PRReviewsPanel: ({ pr }: { pr: PRDetailInfo }) => (
    <div data-testid="reviews-panel">Reviews: #{pr.id}</div>
  ),
}))

import { PullRequestDetailPanel } from './PullRequestDetailPanel'

function makePR(overrides: Partial<PRDetailInfo> = {}): PRDetailInfo {
  return {
    source: 'GitHub',
    repository: 'test-org/hs-buddy',
    id: 42,
    title: 'Add cool feature',
    author: 'octocat',
    authorAvatarUrl: 'https://example.com/avatar.png',
    url: 'https://github.com/test-org/hs-buddy/pull/42',
    state: 'open',
    approvalCount: 2,
    assigneeCount: 3,
    iApproved: false,
    created: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-02T10:00:00Z',
    headBranch: 'feature-branch',
    baseBranch: 'main',
    date: '2025-06-01T10:00:00Z',
    org: 'test-org',
    ...overrides,
  }
}

describe('PullRequestDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
    Object.defineProperty(window, 'shell', {
      value: { openExternal: mockOpenExternal },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(false),
      },
      writable: true,
      configurable: true,
    })
    // Mock sessionStorage
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  it('renders PR title and number', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('Add cool feature')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('renders PR state badge', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    const badges = screen.getAllByText('open')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders author name', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getAllByText('octocat').length).toBeGreaterThanOrEqual(1)
  })

  it('renders repository info', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('test-org/hs-buddy')).toBeInTheDocument()
  })

  it('renders org name', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('test-org')).toBeInTheDocument()
  })

  it('renders branch flow when branches are provided', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('feature-branch')).toBeInTheDocument()
  })

  it('renders overview cards with status info', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Approvals')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('shows "You Approved: No" when not approved', () => {
    render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)
    expect(screen.getByText('You Approved')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('shows "You Approved: Yes" when approved', () => {
    render(<PullRequestDetailPanel pr={makePR({ iApproved: true })} />)
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('renders author avatar when present', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    const avatar = screen.getByAltText('octocat') as HTMLImageElement
    expect(avatar.src).toBe('https://example.com/avatar.png')
  })

  it('opens PR on GitHub when clicking "Open on GitHub"', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy/pull/42')
  })

  it('renders history panel in default (overview) mode', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByTestId('history-panel')).toBeInTheDocument()
  })

  it('renders threads panel in default mode', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByTestId('threads-panel')).toBeInTheDocument()
  })

  it('shows "Linked Issue: None" when no linked issue', () => {
    render(<PullRequestDetailPanel pr={makePR({ headBranch: 'some-branch' })} />)
    expect(screen.getByText('Linked Issue')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('parses linked issue from branch name pattern', () => {
    render(<PullRequestDetailPanel pr={makePR({ headBranch: 'fix/issue-123-something' })} />)
    expect(screen.getByText('#123')).toBeInTheDocument()
  })

  describe('focused sections', () => {
    it('renders checks panel for checks section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.getByTestId('checks-panel')).toBeInTheDocument()
      expect(screen.getByText('Tree section: Checks')).toBeInTheDocument()
    })

    it('renders files panel for files-changed section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="files-changed" />)
      expect(screen.getByTestId('files-panel')).toBeInTheDocument()
      expect(screen.getByText('Tree section: Files changed')).toBeInTheDocument()
    })

    it('renders reviews panel for ai-reviews section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="ai-reviews" />)
      expect(screen.getByTestId('reviews-panel')).toBeInTheDocument()
      expect(screen.getByText('Tree section: AI Reviews')).toBeInTheDocument()
    })

    it('renders conversation section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="conversation" />)
      expect(screen.getByTestId('threads-panel')).toBeInTheDocument()
      expect(screen.getByText('Tree section: Conversation')).toBeInTheDocument()
    })

    it('renders commits section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="commits" />)
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
      expect(screen.getByText('Tree section: Commits')).toBeInTheDocument()
    })

    it('shows "Open Checks" button for checks section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.getByText('Open Checks')).toBeInTheDocument()
    })

    it('shows "Open Files Changed" button for files-changed section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="files-changed" />)
      expect(screen.getByText('Open Files Changed')).toBeInTheDocument()
    })

    it('does not show overview cards in focused section mode', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.queryByText('Approvals')).not.toBeInTheDocument()
    })
  })

  it('renders meta items with created and activity dates', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByText('Author')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Last Activity')).toBeInTheDocument()
  })

  it('renders copilot review button', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByTitle('Request Copilot Review')).toBeInTheDocument()
  })

  it('renders refresh button', () => {
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(screen.getByTitle('Refresh PR data')).toBeInTheDocument()
  })

  it('uses state from props for state badge', () => {
    render(<PullRequestDetailPanel pr={makePR({ state: 'merged' })} />)
    const badges = screen.getAllByText('merged')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })
})
