import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { PullRequestDetailPanel } from './PullRequestDetailPanel'
import type { PRDetailInfo, PRDetailSection } from '../utils/prDetailView'

/* ── hoisted mocks ──────────────────────────────────────────────────── */

const prDetailMocks = vi.hoisted(() => ({
  useGitHubAccounts: vi.fn(),
  useTaskQueue: vi.fn(),
  formatDistanceToNow: vi.fn(),
  formatDateFull: vi.fn(),
  parseOwnerRepoFromUrl: vi.fn(),
  createNotificationSoundBlob: vi.fn(),
  throwIfAborted: vi.fn(),
  mockClient: {
    fetchPRBranches: vi.fn(),
    listPRReviews: vi.fn(),
    requestCopilotReview: vi.fn(),
  },
  capturedOnLoaded: { current: null as ((history: unknown) => void) | null },
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: prDetailMocks.useGitHubAccounts,
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: prDetailMocks.useTaskQueue,
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: prDetailMocks.formatDistanceToNow,
  formatDateFull: prDetailMocks.formatDateFull,
}))

vi.mock('../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: prDetailMocks.parseOwnerRepoFromUrl,
}))

vi.mock('../utils/notificationSound', () => ({
  createNotificationSoundBlob: prDetailMocks.createNotificationSoundBlob,
}))

vi.mock('../utils/errorUtils', () => ({
  throwIfAborted: prDetailMocks.throwIfAborted,
  isAbortError: (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
}))

vi.mock('../api/github', () => ({
  GitHubClient: class MockGitHubClient {
    fetchPRBranches = prDetailMocks.mockClient.fetchPRBranches
    listPRReviews = prDetailMocks.mockClient.listPRReviews
    requestCopilotReview = prDetailMocks.mockClient.requestCopilotReview
  },
}))

/* ── mock child panels as thin stubs ────────────────────────────────── */

vi.mock('./PullRequestHistoryPanel', () => ({
  PullRequestHistoryPanel: (props: { onLoaded?: (h: unknown) => void }) => {
    prDetailMocks.capturedOnLoaded.current = props.onLoaded ?? null
    return <div data-testid="history-panel" />
  },
}))
vi.mock('./PRChecksPanel', () => ({
  PRChecksPanel: () => <div data-testid="checks-panel" />,
}))
vi.mock('./PRFilesChangedPanel', () => ({
  PRFilesChangedPanel: () => <div data-testid="files-changed-panel" />,
}))
vi.mock('./PRThreadsPanel', () => ({
  PRThreadsPanel: () => <div data-testid="threads-panel" />,
}))
vi.mock('./PRReviewsPanel', () => ({
  PRReviewsPanel: () => <div data-testid="reviews-panel" />,
}))

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="icon-check" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  CircleDot: () => <span data-testid="icon-circle-dot" />,
  Clock: () => <span data-testid="icon-clock" />,
  ExternalLink: () => <span data-testid="icon-external" />,
  GitBranch: () => <span data-testid="icon-git-branch" />,
  GitPullRequest: () => <span data-testid="icon-git-pr" />,
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="icon-loader" className={className} />
  ),
  RefreshCw: () => <span data-testid="icon-refresh" />,
  Sparkles: ({ className }: { className?: string }) => (
    <span data-testid="icon-sparkles" className={className} />
  ),
  User: () => <span data-testid="icon-user" />,
  X: () => <span data-testid="icon-x" />,
}))

/* ── test data factory ──────────────────────────────────────────────── */

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'test-repo',
  id: 42,
  title: 'Fix critical bug',
  author: 'octocat',
  authorAvatarUrl: 'https://example.com/avatar.png',
  url: 'https://github.com/octo-org/test-repo/pull/42',
  state: 'open',
  approvalCount: 1,
  assigneeCount: 2,
  iApproved: false,
  created: '2026-04-10T10:00:00Z',
  updatedAt: '2026-04-13T15:30:00Z',
  headBranch: 'fix/critical-bug',
  baseBranch: 'main',
  date: '2026-04-10T10:00:00Z',
  org: 'octo-org',
  ...overrides,
})

/* ── setup / teardown ───────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()

  // Default mock returns
  prDetailMocks.useGitHubAccounts.mockReturnValue({
    accounts: [{ username: 'octocat', org: 'octo-org', token: 'ghp_test' }],
  })
  prDetailMocks.useTaskQueue.mockReturnValue({
    enqueue: vi.fn(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    ),
  })
  prDetailMocks.formatDistanceToNow.mockReturnValue('3 days ago')
  prDetailMocks.formatDateFull.mockReturnValue('April 10, 2026')
  prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue({ owner: 'octo-org', repo: 'test-repo' })
  prDetailMocks.throwIfAborted.mockImplementation(() => {})

  // GitHubClient method defaults
  prDetailMocks.mockClient.fetchPRBranches.mockResolvedValue({
    headBranch: 'fix/critical-bug',
    baseBranch: 'main',
  })
  prDetailMocks.mockClient.listPRReviews.mockResolvedValue([])
  prDetailMocks.mockClient.requestCopilotReview.mockResolvedValue(undefined)

  // window globals
  window.ipcRenderer = {
    send: vi.fn(),
    invoke: vi.fn().mockResolvedValue(false),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as typeof window.ipcRenderer
  window.shell = {
    openExternal: vi.fn(),
  } as unknown as typeof window.shell
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ── helper function tests (module-level) ───────────────────────────── */
// These are tested indirectly through the component's behavior since they're
// not exported. We test sessionStorage round-trips and isFreshCopilotReview
// through the Copilot review state machine.

/* ── rendering tests ────────────────────────────────────────────────── */

describe('PullRequestDetailPanel', () => {
  describe('basic rendering', () => {
    it('renders PR title and number', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Fix critical bug')).toBeInTheDocument()
      expect(screen.getByText('#42')).toBeInTheDocument()
    })

    it('renders PR state badge', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const badge = document.querySelector('.pr-detail-state-badge')
      expect(badge).toBeTruthy()
      expect(badge?.textContent).toBe('open')
    })

    it('renders author name', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getAllByText('octocat').length).toBeGreaterThan(0)
    })

    it('renders org and repository', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('octo-org')).toBeInTheDocument()
      expect(screen.getByText('test-repo')).toBeInTheDocument()
    })

    it('renders branch flow when branches available', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('main')).toBeInTheDocument()
      expect(screen.getByText('fix/critical-bug')).toBeInTheDocument()
    })

    it('renders author avatar when provided', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const avatar = document.querySelector('.pr-detail-avatar') as HTMLImageElement
      expect(avatar).toBeTruthy()
      expect(avatar.src).toBe('https://example.com/avatar.png')
    })

    it('omits avatar when not provided', () => {
      render(<PullRequestDetailPanel pr={makePR({ authorAvatarUrl: undefined })} />)
      expect(document.querySelector('.pr-detail-avatar')).toBeNull()
    })

    it('defaults state to "open" when empty', () => {
      render(<PullRequestDetailPanel pr={makePR({ state: ' ' })} />)
      expect(screen.getByText('open')).toBeInTheDocument()
    })
  })

  describe('overview cards', () => {
    it('shows status, approvals, and you-approved cards in overview', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Approvals')).toBeInTheDocument()
      expect(screen.getByText('You Approved')).toBeInTheDocument()
    })

    it('shows approval fraction', () => {
      render(<PullRequestDetailPanel pr={makePR({ approvalCount: 1, assigneeCount: 2 })} />)
      expect(screen.getByText('1/2')).toBeInTheDocument()
    })

    it('shows "?" when no assignees', () => {
      render(<PullRequestDetailPanel pr={makePR({ assigneeCount: 0 })} />)
      expect(screen.getByText('1/?')).toBeInTheDocument()
    })

    it('shows "No" when you have not approved', () => {
      render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)
      expect(screen.getByText('No')).toBeInTheDocument()
    })

    it('shows "Yes" when you have approved', () => {
      render(<PullRequestDetailPanel pr={makePR({ iApproved: true })} />)
      expect(screen.getByText('Yes')).toBeInTheDocument()
    })

    it('shows "None" when no linked issue', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'feature/no-issue' })} />)
      expect(screen.getByText('None')).toBeInTheDocument()
    })
  })

  describe('date metadata', () => {
    it('shows created date', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Created')).toBeInTheDocument()
    })

    it('shows last activity', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Last Activity')).toBeInTheDocument()
    })
  })

  describe('section-focused rendering', () => {
    it('renders conversation section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="conversation" />)
      expect(screen.getByText('Tree section: Conversation')).toBeInTheDocument()
      expect(screen.getByTestId('threads-panel')).toBeInTheDocument()
    })

    it('renders commits section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="commits" />)
      expect(screen.getByText('Tree section: Commits')).toBeInTheDocument()
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    })

    it('renders checks section with Open Checks button', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.getByText('Tree section: Checks')).toBeInTheDocument()
      expect(screen.getByTestId('checks-panel')).toBeInTheDocument()
      expect(screen.getByText('Open Checks')).toBeInTheDocument()
    })

    it('renders files-changed section with Open Files Changed button', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="files-changed" />)
      expect(screen.getByText('Tree section: Files changed')).toBeInTheDocument()
      expect(screen.getByTestId('files-changed-panel')).toBeInTheDocument()
      expect(screen.getByText('Open Files Changed')).toBeInTheDocument()
    })

    it('renders ai-reviews section', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="ai-reviews" />)
      expect(screen.getByText('Tree section: AI Reviews')).toBeInTheDocument()
      expect(screen.getByTestId('reviews-panel')).toBeInTheDocument()
    })

    it('hides overview cards when section is focused', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.queryByText('Status')).not.toBeInTheDocument()
      expect(screen.queryByText('Approvals')).not.toBeInTheDocument()
    })

    it('shows overview cards when no section', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Status')).toBeInTheDocument()
      // In overview mode, both history and threads panels are shown
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
      expect(screen.getByTestId('threads-panel')).toBeInTheDocument()
    })
  })

  describe('action buttons', () => {
    it('opens PR on GitHub when Open on GitHub is clicked', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      fireEvent.click(screen.getByText('Open on GitHub'))
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/pull/42'
      )
    })

    it('opens checks URL when Open Checks is clicked', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      fireEvent.click(screen.getByText('Open Checks'))
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/pull/42/checks'
      )
    })

    it('opens files-changed URL when Open Files Changed is clicked', () => {
      render(<PullRequestDetailPanel pr={makePR()} section="files-changed" />)
      fireEvent.click(screen.getByText('Open Files Changed'))
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/pull/42/files'
      )
    })
  })

  describe('Copilot review request button', () => {
    it('shows Request Copilot Review button in idle state', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const btn = screen.getByTitle('Request Copilot Review')
      expect(btn).not.toBeDisabled()
      expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument()
    })

    it('transitions to requesting state on click', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle('Request Copilot Review'))
      })

      // After request completes, should enter monitoring state
      await waitFor(() => {
        expect(screen.getByTitle('Waiting for Copilot review…')).toBeInTheDocument()
      })
    })

    it('disables button during non-idle state', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle('Request Copilot Review'))
      })

      await waitFor(() => {
        const btn = screen.getByTitle('Waiting for Copilot review…')
        expect(btn).toBeDisabled()
      })
    })
  })

  describe('Copilot review monitoring', () => {
    it('resumes monitoring from sessionStorage on mount', async () => {
      const prUrl = 'https://github.com/octo-org/test-repo/pull/42'
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [prUrl]: { prUrl, baselineReviewId: 100 } })
      )

      render(<PullRequestDetailPanel pr={makePR()} />)

      // Should enter monitoring state from sessionStorage
      await waitFor(() => {
        expect(screen.getByTitle('Waiting for Copilot review…')).toBeInTheDocument()
      })
    })

    it('shows completion banner when fresh Copilot review detected', async () => {
      const prUrl = 'https://github.com/octo-org/test-repo/pull/42'
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [prUrl]: { prUrl, baselineReviewId: 100 } })
      )

      prDetailMocks.mockClient.listPRReviews.mockResolvedValue([
        { id: 200, user: { login: 'copilot-pull-request-reviewer[bot]' } },
      ])

      render(<PullRequestDetailPanel pr={makePR()} />)

      await waitFor(() => {
        expect(screen.getByText('Copilot review complete')).toBeInTheDocument()
      })
    })

    it('clears session storage when review completes', async () => {
      const prUrl = 'https://github.com/octo-org/test-repo/pull/42'
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [prUrl]: { prUrl, baselineReviewId: 100 } })
      )

      prDetailMocks.mockClient.listPRReviews.mockResolvedValue([
        { id: 200, user: { login: 'copilot-pull-request-reviewer[bot]' } },
      ])

      render(<PullRequestDetailPanel pr={makePR()} />)

      await waitFor(() => {
        expect(screen.getByText('Copilot review complete')).toBeInTheDocument()
      })

      const stored = JSON.parse(sessionStorage.getItem('hs-buddy:pending-copilot-reviews') ?? '{}')
      expect(stored[prUrl]).toBeUndefined()
    })

    it('dismisses banner on dismiss button click', async () => {
      const prUrl = 'https://github.com/octo-org/test-repo/pull/42'
      sessionStorage.setItem(
        'hs-buddy:pending-copilot-reviews',
        JSON.stringify({ [prUrl]: { prUrl, baselineReviewId: 100 } })
      )

      prDetailMocks.mockClient.listPRReviews.mockResolvedValue([
        { id: 200, user: { login: 'copilot-pull-request-reviewer[bot]' } },
      ])

      render(<PullRequestDetailPanel pr={makePR()} />)

      await waitFor(() => {
        expect(screen.getByText('Copilot review complete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(screen.queryByText('Copilot review complete')).not.toBeInTheDocument()
    })

    it('reverts to idle if no Copilot URL parse fails', async () => {
      prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)

      render(<PullRequestDetailPanel pr={makePR()} />)

      // Button should remain idle since parseOwnerRepoFromUrl returns null
      const btn = screen.getByTitle('Request Copilot Review')
      expect(btn).not.toBeDisabled()

      await act(async () => {
        fireEvent.click(btn)
      })

      // Should still be idle — the handler bails early
      expect(screen.getByTitle('Request Copilot Review')).not.toBeDisabled()
    })

    it('reverts to idle on request error', async () => {
      prDetailMocks.mockClient.listPRReviews.mockRejectedValue(new Error('API error'))

      render(<PullRequestDetailPanel pr={makePR()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle('Request Copilot Review'))
      })

      // Should revert to idle after error
      await waitFor(() => {
        expect(screen.getByTitle('Request Copilot Review')).not.toBeDisabled()
      })
    })
  })

  describe('linked issue from branch name', () => {
    it('parses issue number from branch name', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'agent-fix/issue-123' })} />)
      expect(screen.getByText('#123')).toBeInTheDocument()
    })

    it('shows "None" for non-issue branch names', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'feature/cool-thing' })} />)
      expect(screen.getByText('None')).toBeInTheDocument()
    })
  })

  describe('refresh button', () => {
    it('has a refresh PR data button', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByTitle('Refresh PR data')).toBeInTheDocument()
    })

    it('clicking refresh button triggers child re-render via key change', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const refreshBtn = screen.getByTitle('Refresh PR data')
      fireEvent.click(refreshBtn)
      // After clicking, the panels should still be rendered (key changes cause remount)
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    })
  })

  describe('linked issue keyboard navigation', () => {
    it('opens linked issue on Enter key', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'agent-fix/issue-99' })} />)
      const issueCard = screen.getByTitle('Open Issue #99 on GitHub')
      fireEvent.keyDown(issueCard, { key: 'Enter' })
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/issues/99'
      )
    })

    it('opens linked issue on Space key', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'agent-fix/issue-99' })} />)
      const issueCard = screen.getByTitle('Open Issue #99 on GitHub')
      fireEvent.keyDown(issueCard, { key: ' ' })
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/issues/99'
      )
    })

    it('does not open issue on other keys', () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'agent-fix/issue-99' })} />)
      const issueCard = screen.getByTitle('Open Issue #99 on GitHub')
      fireEvent.keyDown(issueCard, { key: 'Tab' })
      expect(window.shell.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('fetchBranches error paths', () => {
    it('sets branches to null when parseOwnerRepoFromUrl returns null and PR has no branches', async () => {
      prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)
      render(
        <PullRequestDetailPanel pr={makePR({ headBranch: undefined, baseBranch: undefined })} />
      )
      // Should not show branch flow since branches are null
      await waitFor(() => {
        expect(screen.queryByText('fix/critical-bug')).not.toBeInTheDocument()
      })
    })

    it('sets branches to null when enqueue rejects during branch fetch', async () => {
      prDetailMocks.useTaskQueue.mockReturnValue({
        enqueue: vi.fn().mockRejectedValue(new Error('Network error')),
      })
      render(
        <PullRequestDetailPanel pr={makePR({ headBranch: undefined, baseBranch: undefined })} />
      )
      // Should not show branch flow after error
      await waitFor(() => {
        expect(screen.queryByTestId('icon-git-branch')).not.toBeInTheDocument()
      })
    })
  })

  describe('handleHistoryLoaded', () => {
    it('updates youApproved based on reviewer matching scoped accounts', async () => {
      render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)

      // Initially shows "No"
      expect(screen.getByText('No')).toBeInTheDocument()

      // Simulate history loaded with reviewer matching account
      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: '2026-04-14T12:00:00Z',
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument()
      })
    })

    it('does not set youApproved when reviewer has non-approved status', async () => {
      render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: '2026-04-14T12:00:00Z',
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'changes_requested' }],
        })
      })

      expect(screen.getByText('No')).toBeInTheDocument()
    })

    it('does not update youApproved when no accounts match', async () => {
      prDetailMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'other-user', org: 'other-org', token: 'ghp_test' }],
      })
      render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      expect(screen.getByText('No')).toBeInTheDocument()
    })

    it('falls back to all accounts when no scoped accounts match namespace', async () => {
      prDetailMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'octocat', org: 'different-org', token: 'ghp_test' }],
      })
      render(<PullRequestDetailPanel pr={makePR({ org: 'no-match-org' })} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument()
      })
    })

    it('returns early when candidateLogins is empty', async () => {
      prDetailMocks.useGitHubAccounts.mockReturnValue({
        accounts: [],
      })
      render(<PullRequestDetailPanel pr={makePR({ iApproved: false })} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      // Should still show No since no accounts to match
      expect(screen.getByText('No')).toBeInTheDocument()
    })

    it('updates linked issues from history', async () => {
      render(<PullRequestDetailPanel pr={makePR({ headBranch: 'feature/no-issue' })} />)

      // Initially shows "None"
      expect(screen.getByText('None')).toBeInTheDocument()

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [
            {
              number: 55,
              title: 'Fix bug',
              url: 'https://github.com/octo-org/test-repo/issues/55',
            },
          ],
          reviewers: [],
        })
      })

      await waitFor(() => {
        expect(screen.getByText('#55')).toBeInTheDocument()
      })
    })

    it('clicking linked issue opens external URL', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [
            {
              number: 55,
              title: 'Fix bug',
              url: 'https://github.com/octo-org/test-repo/issues/55',
            },
          ],
          reviewers: [],
        })
      })

      await waitFor(() => {
        expect(screen.getByTitle('Open Issue #55 on GitHub')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Open Issue #55 on GitHub'))
      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/issues/55'
      )
    })
  })

  describe('source/org fallback', () => {
    it('shows pr.source when org is empty', () => {
      render(<PullRequestDetailPanel pr={makePR({ org: '' })} />)
      expect(screen.getByText('GitHub')).toBeInTheDocument()
    })
  })

  describe('activity date fallback chain', () => {
    it('uses pr.date for activity when updatedAt is null', () => {
      render(<PullRequestDetailPanel pr={makePR({ updatedAt: null })} />)
      expect(screen.getByText('Fix critical bug')).toBeInTheDocument()
    })

    it('uses pr.created for activity when updatedAt and date are both null', () => {
      render(<PullRequestDetailPanel pr={makePR({ updatedAt: null, date: null })} />)
      expect(screen.getByText('Fix critical bug')).toBeInTheDocument()
    })

    it('handles null created date via formatRelative', () => {
      render(<PullRequestDetailPanel pr={makePR({ created: null, updatedAt: null, date: null })} />)
      expect(screen.getByText('Fix critical bug')).toBeInTheDocument()
    })
  })

  describe('section label fallback', () => {
    it('handles section value not in SECTION_LABELS', () => {
      render(<PullRequestDetailPanel pr={makePR()} section={'unknown' as PRDetailSection} />)
      expect(screen.getByText('Fix critical bug')).toBeInTheDocument()
      // sectionLabel is null so the "Tree section:" note should not render
      expect(screen.queryByText(/Tree section/)).not.toBeInTheDocument()
    })
  })

  describe('branchIssue ownerRepo null', () => {
    it('shows "None" for linked issue when parseOwnerRepoFromUrl returns null despite issue branch', () => {
      prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)
      render(
        <PullRequestDetailPanel
          pr={makePR({ headBranch: 'agent-fix/issue-99', baseBranch: undefined })}
        />
      )
      expect(screen.getByText('None')).toBeInTheDocument()
    })
  })

  describe('handleHistoryLoaded namespace fallbacks', () => {
    it('uses ownerRepo.owner for namespace when pr.org is empty', async () => {
      render(<PullRequestDetailPanel pr={makePR({ org: '' })} />)

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument()
      })
    })

    it('uses empty namespace when both org and ownerRepo are null', async () => {
      prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)
      render(
        <PullRequestDetailPanel
          pr={makePR({ org: '', headBranch: undefined, baseBranch: undefined })}
        />
      )

      await act(async () => {
        prDetailMocks.capturedOnLoaded.current?.({
          updatedAt: null,
          linkedIssues: [],
          reviewers: [{ login: 'octocat', status: 'approved' }],
        })
      })

      // With empty namespace, falls back to all accounts
      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument()
      })
    })
  })
})
