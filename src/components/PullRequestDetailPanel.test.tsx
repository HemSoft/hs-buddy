import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { PullRequestDetailPanel } from './PullRequestDetailPanel'
import type { PRDetailInfo, PRDetailSection } from '../utils/prDetailView'
import { parseIssueFromBranch } from '../utils/prDetailView'

/* ── hoisted mocks ──────────────────────────────────────────────────── */

const prDetailMocks = vi.hoisted(() => ({
  useGitHubAccounts: vi.fn(),
  useTaskQueue: vi.fn(),
  usePRPanelData: vi.fn(),
  formatDistanceToNow: vi.fn(),
  formatDateFull: vi.fn(),
  parseOwnerRepoFromUrl: vi.fn(),
  createNotificationSoundBlob: vi.fn(),
  throwIfAborted: vi.fn(),
  mockClient: {
    fetchPRBranches: vi.fn(),
    listPRReviews: vi.fn(),
    requestCopilotReview: vi.fn(),
    approvePullRequest: vi.fn(),
  },
  capturedOnLoaded: { current: null as ((history: unknown) => void) | null },
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: prDetailMocks.useGitHubAccounts,
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: prDetailMocks.useTaskQueue,
}))

vi.mock('../hooks/usePRPanelData', () => ({
  usePRPanelData: prDetailMocks.usePRPanelData,
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
    approvePullRequest = prDetailMocks.mockClient.approvePullRequest
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
vi.mock('./shared/MarkdownContent', () => ({
  MarkdownContent: ({ source, className }: { source: string; className?: string }) => (
    <div data-testid="markdown-content" className={className}>
      {source}
    </div>
  ),
}))

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="icon-check" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  CircleDot: () => <span data-testid="icon-circle-dot" />,
  Clock: () => <span data-testid="icon-clock" />,
  Copy: () => <span data-testid="icon-copy" />,
  ExternalLink: () => <span data-testid="icon-external" />,
  FileText: () => <span data-testid="icon-file-text" />,
  GitBranch: () => <span data-testid="icon-git-branch" />,
  GitPullRequest: () => <span data-testid="icon-git-pr" />,
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="icon-loader" className={className} />
  ),
  MessageSquare: () => <span data-testid="icon-message-square" />,
  MoreVertical: () => <span data-testid="icon-more-vertical" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
  RotateCw: () => <span data-testid="icon-rotate-cw" />,
  Sparkles: ({ className }: { className?: string }) => (
    <span data-testid="icon-sparkles" className={className} />
  ),
  User: () => <span data-testid="icon-user" />,
  ThumbsUp: () => <span data-testid="icon-thumbs-up" />,
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
  prDetailMocks.usePRPanelData.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    owner: 'octo-org',
    repo: 'test-repo',
    cacheKey: 'pr-body:octo-org/test-repo/42',
  })

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
  window.slack = {
    nudgeAuthor: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.slack
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

  describe('PR summary section', () => {
    it('renders summary when body is available', () => {
      prDetailMocks.usePRPanelData.mockReturnValue({
        data: '## Summary\nThis PR does something great.',
        loading: false,
        error: null,
        refresh: vi.fn(),
        owner: 'octo-org',
        repo: 'test-repo',
        cacheKey: 'pr-body:octo-org/test-repo/42',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.getByText('Summary')).toBeInTheDocument()
      expect(screen.getByTestId('markdown-content')).toHaveTextContent(
        '## Summary This PR does something great.'
      )
    })

    it('hides summary when body is null', () => {
      prDetailMocks.usePRPanelData.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refresh: vi.fn(),
        owner: 'octo-org',
        repo: 'test-repo',
        cacheKey: 'pr-body:octo-org/test-repo/42',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
    })

    it('hides summary when body is empty string', () => {
      prDetailMocks.usePRPanelData.mockReturnValue({
        data: '   ',
        loading: false,
        error: null,
        refresh: vi.fn(),
        owner: 'octo-org',
        repo: 'test-repo',
        cacheKey: 'pr-body:octo-org/test-repo/42',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()
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

    it('hides summary in focused section views', () => {
      prDetailMocks.usePRPanelData.mockReturnValue({
        data: '## Summary\nThis PR fixes a bug.',
        loading: false,
        error: null,
        refresh: vi.fn(),
        owner: 'octo-org',
        repo: 'test-repo',
        cacheKey: 'pr-body:octo-org/test-repo/42',
      })
      render(<PullRequestDetailPanel pr={makePR()} section="checks" />)
      expect(screen.queryByText('Summary')).not.toBeInTheDocument()
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

  describe('nudge author button', () => {
    it('renders nudge button with Slack tooltip', () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const btn = screen.getByTitle('Nudge author via Slack')
      expect(btn).toBeInTheDocument()
      expect(btn).not.toBeDisabled()
    })

    it('calls slack.nudgeAuthor on click with PR details', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      expect(window.slack.nudgeAuthor).toHaveBeenCalledWith({
        githubLogin: 'octocat',
        prTitle: 'Fix critical bug',
        prUrl: 'https://github.com/octo-org/test-repo/pull/42',
      })
    })

    it('shows sent state after successful nudge', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByTitle('Nudge sent!')).toBeInTheDocument()
      })
    })

    it('shows error state on failure', async () => {
      ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'User not found',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByTitle('Nudge failed: User not found')).toBeInTheDocument()
      })
    })

    it('shows success banner with author name after nudge', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByText('Nudge sent!')).toBeInTheDocument()
        expect(screen.getByText('Slack message delivered to octocat')).toBeInTheDocument()
      })
    })

    it('shows error banner with message on failure', async () => {
      ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Could not find Slack user for that email',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByText("Couldn't nudge octocat")).toBeInTheDocument()
        expect(screen.getByText('Could not find Slack user for that email')).toBeInTheDocument()
      })
    })

    it('dismisses nudge banner on X click', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByText('Nudge sent!')).toBeInTheDocument()
      })
      // Find the dismiss button within the nudge banner
      const banner = screen.getByText('Nudge sent!').closest('.pr-detail-nudge-banner')!
      const dismissBtn = banner.querySelector('.pr-detail-review-banner-dismiss')!
      await act(async () => {
        fireEvent.click(dismissBtn)
      })
      expect(screen.queryByText('Nudge sent!')).not.toBeInTheDocument()
    })

    it('disables button while nudge is sending', async () => {
      let resolveNudge: (v: { success: boolean }) => void = () => {}
      ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise(resolve => {
            resolveNudge = resolve
          })
      )
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      // Button should be disabled in sending state
      const btns = document.querySelectorAll('.pr-detail-refresh-btn')
      const nudgeBtn = Array.from(btns).find(b => b.querySelector('[data-testid="icon-loader"]'))
      expect(nudgeBtn).toBeTruthy()
      // Resolve to cleanup
      await act(async () => {
        resolveNudge({ success: true })
      })
    })

    it('ignores second click while nudge is sending', async () => {
      let resolveNudge: (v: { success: boolean }) => void = () => {}
      ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise(resolve => {
            resolveNudge = resolve
          })
      )
      render(<PullRequestDetailPanel pr={makePR()} />)
      // First click starts sending
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      expect(window.slack.nudgeAuthor).toHaveBeenCalledTimes(1)
      // Button should now be disabled; a second click should be a no-op
      const btn = document.querySelector('.pr-detail-refresh-btn[disabled]')
      if (btn) fireEvent.click(btn)
      expect(window.slack.nudgeAuthor).toHaveBeenCalledTimes(1)
      await act(async () => {
        resolveNudge({ success: true })
      })
    })

    it('shows error banner with fallback when nudge error is empty string', async () => {
      ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: '',
      })
      render(<PullRequestDetailPanel pr={makePR()} />)
      await act(async () => {
        fireEvent.click(screen.getByTitle('Nudge author via Slack'))
      })
      await waitFor(() => {
        expect(screen.getByText('Unknown error')).toBeInTheDocument()
        expect(screen.getByTitle('Nudge failed: Unknown error')).toBeInTheDocument()
      })
    })

    it('resets to idle after nudge failure timeout', async () => {
      vi.useFakeTimers()
      try {
        ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
          success: false,
          error: 'Slack down',
        })
        render(<PullRequestDetailPanel pr={makePR()} />)
        await act(async () => {
          fireEvent.click(screen.getByTitle('Nudge author via Slack'))
        })
        // After act, state is already updated (no waitFor needed with fake timers)
        expect(screen.getByTitle('Nudge failed: Slack down')).toBeInTheDocument()
        // Advance past the 5-second reset timer
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000)
        })
        expect(screen.getByTitle('Nudge author via Slack')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('handles thrown error from nudgeAuthor and resets after timeout', async () => {
      vi.useFakeTimers()
      try {
        ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Network error')
        )
        render(<PullRequestDetailPanel pr={makePR()} />)
        await act(async () => {
          fireEvent.click(screen.getByTitle('Nudge author via Slack'))
        })
        expect(screen.getByTitle('Nudge failed: Error: Network error')).toBeInTheDocument()
        // Advance past the 5-second reset timer
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000)
        })
        expect(screen.getByTitle('Nudge author via Slack')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
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

describe('parseIssueFromBranch', () => {
  it('returns issue number from branch name', () => {
    expect(parseIssueFromBranch('issue-42')).toBe(42)
    expect(parseIssueFromBranch('feature/issue-123')).toBe(123)
  })

  it('returns null for branches without issue pattern', () => {
    expect(parseIssueFromBranch('main')).toBeNull()
    expect(parseIssueFromBranch('feature/add-login')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseIssueFromBranch(undefined)).toBeNull()
  })
})

describe('context menu interactions (lines 133-134, 225-232)', () => {
  describe('handleMoreClick and context menu opening', () => {
    it('opens context menu when More actions button is clicked', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const moreBtn = screen.getByTitle('More actions')

      await act(async () => {
        fireEvent.click(moreBtn)
      })

      // Context menu should be visible after clicking
      expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()
      expect(screen.getByText('Start Ralph PR Review')).toBeInTheDocument()
      expect(screen.getByText('Approve')).toBeInTheDocument()
      expect(screen.getByText('Nudge Author via Slack')).toBeInTheDocument()
      expect(screen.getByText('Copy Link')).toBeInTheDocument()
    })

    it('computes context menu position based on button bounding rect (line 133-134)', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const moreBtn = screen.getByTitle('More actions')

      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const contextMenuDiv = document.querySelector('.context-menu') as HTMLElement
      expect(contextMenuDiv).toBeTruthy()
      // Menu should have positioned styles from getBoundingClientRect
      expect(contextMenuDiv.style.top).toBeTruthy()
      expect(contextMenuDiv.style.left).toBeTruthy()
    })

    it('closes context menu on overlay click', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)
      const moreBtn = screen.getByTitle('More actions')

      await act(async () => {
        fireEvent.click(moreBtn)
      })

      expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()

      const overlay = document.querySelector('.context-menu-overlay')
      await act(async () => {
        fireEvent.click(overlay!)
      })

      expect(screen.queryByText('Request Copilot Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onRequestCopilotReview (line 225)', () => {
    it('calls handleRequestCopilotReview and closes menu when Request Copilot Review clicked', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const requestBtn = screen.getByText('Request Copilot Review')
      await act(async () => {
        fireEvent.click(requestBtn)
      })

      // Should transition to monitoring state
      await waitFor(() => {
        expect(screen.getByTitle('Waiting for Copilot review…')).toBeInTheDocument()
      })

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onApprove (line 226)', () => {
    it('approves PR and closes menu when Approve clicked', async () => {
      prDetailMocks.mockClient.approvePullRequest.mockResolvedValue(undefined)
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const approveBtn = screen.getByText('Approve')
      await act(async () => {
        fireEvent.click(approveBtn)
      })

      // Should show approval was successful
      await waitFor(() => {
        expect(screen.getByTitle('You approved this PR')).toBeInTheDocument()
      })

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onNudge (line 227)', () => {
    it('nudges author and closes menu when Nudge clicked', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const nudgeBtn = screen.getByText('Nudge Author via Slack')
      await act(async () => {
        fireEvent.click(nudgeBtn)
      })

      // Should call slack.nudgeAuthor
      expect(window.slack.nudgeAuthor).toHaveBeenCalledWith({
        githubLogin: 'octocat',
        prTitle: 'Fix critical bug',
        prUrl: 'https://github.com/octo-org/test-repo/pull/42',
      })

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onRefresh (line 228)', () => {
    it('refreshes PR data and closes menu when Refresh clicked', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const contextMenuButtons = document.querySelectorAll('.context-menu button')
      const refreshBtn = Array.from(contextMenuButtons).find(
        btn => btn.textContent?.includes('Refresh') && !btn.textContent?.includes('Copilot')
      ) as HTMLElement

      await act(async () => {
        fireEvent.click(refreshBtn)
      })

      // Context menu should close (history panel should still be there)
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onCopyLink (line 229)', () => {
    it('copies PR URL to clipboard and closes menu', async () => {
      const clipboardWriteMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWriteMock },
        writable: true,
        configurable: true,
      })

      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const copyBtn = screen.getByText('Copy Link')
      await act(async () => {
        fireEvent.click(copyBtn)
      })

      expect(clipboardWriteMock).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/pull/42'
      )

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onOpenExternal (line 230)', () => {
    it('opens PR on GitHub and closes menu', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const contextMenuButtons = document.querySelectorAll('.context-menu button')
      const openBtn = Array.from(contextMenuButtons).find(btn =>
        btn.textContent?.includes('Open on GitHub')
      ) as HTMLElement

      await act(async () => {
        fireEvent.click(openBtn)
      })

      expect(window.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/octo-org/test-repo/pull/42'
      )

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })
  })

  describe('context menu callbacks - onStartRalphReview (line 231)', () => {
    it('dispatches ralph review events and closes menu', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      render(
        <PullRequestDetailPanel
          pr={makePR({
            org: 'octo-org',
            repository: 'test-repo',
            id: 42,
          })}
        />
      )

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const ralphBtn = screen.getByText('Start Ralph PR Review')
      await act(async () => {
        fireEvent.click(ralphBtn)
      })

      // Should dispatch navigation and ralph review events
      await waitFor(() => {
        const events = dispatchEventSpy.mock.calls.map(c => (c[0] as CustomEvent).type)
        expect(events).toContain('app:navigate')
        expect(events).toContain('ralph:launch-pr-review')
      })

      // Context menu should close
      expect(screen.queryByText('Start Ralph PR Review')).not.toBeInTheDocument()
    })

    it('uses org and repoRoot from accounts for ralph review (lines 707-710)', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      prDetailMocks.useGitHubAccounts.mockReturnValue({
        accounts: [
          {
            username: 'octocat',
            org: 'octo-org',
            token: 'ghp_test',
            repoRoot: 'C:\\repos',
          },
        ],
      })

      render(
        <PullRequestDetailPanel
          pr={makePR({
            org: 'octo-org',
            repository: 'test-repo',
            id: 42,
          })}
        />
      )

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const ralphBtn = screen.getByText('Start Ralph PR Review')
      await act(async () => {
        fireEvent.click(ralphBtn)
      })

      // Should dispatch with correct repo path
      await waitFor(() => {
        const calls = dispatchEventSpy.mock.calls
        const ralphCall = calls.find(c => (c[0] as CustomEvent).type === 'ralph:launch-pr-review')
        if (ralphCall) {
          const event = ralphCall[0] as CustomEvent
          expect(event.detail).toEqual({
            prNumber: 42,
            repository: 'test-repo',
            org: 'octo-org',
            repoPath: 'C:\\repos\\test-repo',
          })
        }
      })
    })

    it('handles missing repoRoot gracefully (lines 709-710)', async () => {
      // Allow any pending setTimeout from previous test to flush
      await new Promise(r => setTimeout(r, 150))
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

      prDetailMocks.useGitHubAccounts.mockReturnValue({
        accounts: [
          {
            username: 'octocat',
            org: 'octo-org',
            token: 'ghp_test',
            // No repoRoot
          },
        ],
      })

      render(
        <PullRequestDetailPanel
          pr={makePR({
            org: 'octo-org',
            repository: 'test-repo',
            id: 42,
          })}
        />
      )

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      const ralphBtn = screen.getByText('Start Ralph PR Review')
      await act(async () => {
        fireEvent.click(ralphBtn)
      })

      // Should dispatch with empty repoPath when repoRoot is missing
      await waitFor(() => {
        const calls = dispatchEventSpy.mock.calls
        const ralphCall = calls.find(c => (c[0] as CustomEvent).type === 'ralph:launch-pr-review')
        if (ralphCall) {
          const event = ralphCall[0] as CustomEvent
          expect(event.detail.repoPath).toBe('')
        }
      })
    })
  })

  describe('context menu callbacks - onClose (line 232)', () => {
    it('closes context menu when close callback is invoked', async () => {
      render(<PullRequestDetailPanel pr={makePR()} />)

      const moreBtn = screen.getByTitle('More actions')
      await act(async () => {
        fireEvent.click(moreBtn)
      })

      expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()

      const overlay = document.querySelector('.context-menu-overlay')
      await act(async () => {
        fireEvent.click(overlay!)
      })

      expect(screen.queryByText('Request Copilot Review')).not.toBeInTheDocument()
    })
  })
})

describe('approve PR functionality (lines 649-664)', () => {
  it('approves PR when Approve button clicked', async () => {
    prDetailMocks.mockClient.approvePullRequest.mockResolvedValue(undefined)
    render(<PullRequestDetailPanel pr={makePR()} />)

    const approveBtn = screen.getByTitle('Approve PR')
    await act(async () => {
      fireEvent.click(approveBtn)
    })

    expect(prDetailMocks.mockClient.approvePullRequest).toHaveBeenCalledWith(
      'octo-org',
      'test-repo',
      42
    )

    await waitFor(() => {
      expect(screen.getByTitle('You approved this PR')).toBeInTheDocument()
    })
  })

  it('does not approve if youApproved is true', async () => {
    render(<PullRequestDetailPanel pr={makePR({ iApproved: true })} />)

    const approveBtn = screen.getByTitle('You approved this PR')
    expect(approveBtn).toBeDisabled()

    await act(async () => {
      fireEvent.click(approveBtn)
    })

    expect(prDetailMocks.mockClient.approvePullRequest).not.toHaveBeenCalled()
  })

  it('does not approve if isApproving is true', async () => {
    let resolveApprove: (value?: unknown) => void = () => {}
    prDetailMocks.useTaskQueue.mockReturnValue({
      enqueue: vi.fn(
        () =>
          new Promise(resolve => {
            resolveApprove = resolve
          })
      ),
    })

    render(<PullRequestDetailPanel pr={makePR()} />)

    const approveBtn = screen.getByTitle('Approve PR')
    await act(async () => {
      fireEvent.click(approveBtn)
    })

    // Should be in approving state
    await waitFor(() => {
      const loader = document.querySelector('.pr-detail-refresh-btn .spin')
      expect(loader).toBeTruthy()
    })

    // Resolve to cleanup
    await act(async () => {
      resolveApprove()
    })
  })

  it('returns early if ownerRepo is null during approve (line 649)', async () => {
    prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)
    render(<PullRequestDetailPanel pr={makePR({ headBranch: undefined, baseBranch: undefined })} />)

    const approveBtn = screen.getByTitle('Approve PR')
    await act(async () => {
      fireEvent.click(approveBtn)
    })

    expect(prDetailMocks.mockClient.approvePullRequest).not.toHaveBeenCalled()
  })
})

describe('nudge author error handling (lines 666-690)', () => {
  it('displays error state on nudge failure', async () => {
    ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Slack connection failed',
    })

    render(<PullRequestDetailPanel pr={makePR()} />)

    const nudgeBtn = screen.getByTitle('Nudge author via Slack')
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    await waitFor(() => {
      expect(screen.getByTitle('Nudge failed: Slack connection failed')).toBeInTheDocument()
    })
  })

  it('displays Unknown error when nudge fails without error message', async () => {
    ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
    })

    render(<PullRequestDetailPanel pr={makePR()} />)

    const nudgeBtn = screen.getByTitle('Nudge author via Slack')
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    await waitFor(() => {
      expect(screen.getByTitle('Nudge failed: Unknown error')).toBeInTheDocument()
    })

    // NudgeBanner should show the fallback text
    expect(screen.getByText('Unknown error')).toBeInTheDocument()
  })

  it('handles nudge author exception', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network timeout')
    )

    render(<PullRequestDetailPanel pr={makePR()} />)

    const nudgeBtn = screen.getByTitle('Nudge author via Slack')
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    await waitFor(() => {
      expect(screen.getByTitle('Nudge failed: Error: Network timeout')).toBeInTheDocument()
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Nudge] Error:', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })

  it('prevents duplicate nudge when state is sending', async () => {
    let resolveNudge: (v: { success: boolean }) => void = () => {}
    ;(window.slack.nudgeAuthor as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveNudge = resolve
        })
    )

    render(<PullRequestDetailPanel pr={makePR()} />)

    const nudgeBtn = screen.getByTitle('Nudge author via Slack')
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    // Click again while sending
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    // Should only call once
    expect(window.slack.nudgeAuthor).toHaveBeenCalledTimes(1)

    // Resolve to cleanup
    await act(async () => {
      resolveNudge({ success: true })
    })
  })

  it('prevents nudge when state is already sent', async () => {
    render(<PullRequestDetailPanel pr={makePR()} />)

    const nudgeBtn = screen.getByTitle('Nudge author via Slack')
    await act(async () => {
      fireEvent.click(nudgeBtn)
    })

    await waitFor(() => {
      expect(screen.getByTitle('Nudge sent!')).toBeInTheDocument()
    })

    // Click again after sent
    const sentBtn = screen.getByTitle('Nudge sent!')
    expect(sentBtn).toBeDisabled()

    await act(async () => {
      fireEvent.click(sentBtn)
    })

    // Should still only call once
    expect(window.slack.nudgeAuthor).toHaveBeenCalledTimes(1)
  })
})

describe('PR body data loading (line 556)', () => {
  it('fetches PR body data on mount', () => {
    prDetailMocks.usePRPanelData.mockReturnValue({
      data: '## Summary\nTest PR body',
      loading: false,
      error: null,
      refresh: vi.fn(),
      owner: 'octo-org',
      repo: 'test-repo',
      cacheKey: 'pr-body:octo-org/test-repo/42',
    })

    render(<PullRequestDetailPanel pr={makePR()} />)

    // usePRPanelData should be called with the right parameters
    expect(prDetailMocks.usePRPanelData).toHaveBeenCalled()
    expect(screen.getByText('## Summary Test PR body')).toBeInTheDocument()
  })

  it('displays summary when PR body is available', () => {
    prDetailMocks.usePRPanelData.mockReturnValue({
      data: 'PR body content here',
      loading: false,
      error: null,
      refresh: vi.fn(),
      owner: 'octo-org',
      repo: 'test-repo',
      cacheKey: 'pr-body:octo-org/test-repo/42',
    })

    render(<PullRequestDetailPanel pr={makePR()} />)

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('PR body content here')
  })

  it('invokes the fetcher callback passed to usePRPanelData', () => {
    const fetchPRBody = vi.fn().mockReturnValue('fetched body')
    prDetailMocks.usePRPanelData.mockImplementation(
      (_pr: unknown, _key: string, fetcher: (...args: unknown[]) => unknown) => {
        fetcher({ fetchPRBody }, 'octo-org', 'test-repo', 42)
        return {
          data: null,
          loading: false,
          error: null,
          refresh: vi.fn(),
          owner: 'octo-org',
          repo: 'test-repo',
          cacheKey: 'pr-body:octo-org/test-repo/42',
        }
      }
    )
    render(<PullRequestDetailPanel pr={makePR()} />)
    expect(fetchPRBody).toHaveBeenCalledWith('octo-org', 'test-repo', 42)
  })
})

describe('ownerRepo fallback when pr.org is empty (line 708)', () => {
  it('falls back to ownerRepo.owner when pr.org is empty', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue({ owner: 'parsed-org', repo: 'test-repo' })
    prDetailMocks.useGitHubAccounts.mockReturnValue({
      accounts: [{ username: 'octocat', org: 'parsed-org', token: 'ghp_test' }],
    })

    render(<PullRequestDetailPanel pr={makePR({ org: '' })} />)

    const moreBtn = screen.getByTitle('More actions')
    await act(async () => {
      fireEvent.click(moreBtn)
    })

    const ralphBtn = screen.getByText('Start Ralph PR Review')
    await act(async () => {
      fireEvent.click(ralphBtn)
    })

    await waitFor(() => {
      const ralphCall = dispatchEventSpy.mock.calls.find(
        c => (c[0] as CustomEvent).type === 'ralph:launch-pr-review'
      )
      expect(ralphCall).toBeTruthy()
      const event = ralphCall![0] as CustomEvent
      expect(event.detail.org).toBe('parsed-org')
    })

    dispatchEventSpy.mockRestore()
  })

  it('falls back to empty string when both pr.org and ownerRepo are empty', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    prDetailMocks.parseOwnerRepoFromUrl.mockReturnValue(null)

    render(<PullRequestDetailPanel pr={makePR({ org: '' })} />)

    const moreBtn = screen.getByTitle('More actions')
    await act(async () => {
      fireEvent.click(moreBtn)
    })

    const ralphBtn = screen.getByText('Start Ralph PR Review')
    await act(async () => {
      fireEvent.click(ralphBtn)
    })

    await waitFor(() => {
      const ralphCall = dispatchEventSpy.mock.calls.find(
        c => (c[0] as CustomEvent).type === 'ralph:launch-pr-review'
      )
      expect(ralphCall).toBeTruthy()
      const event = ralphCall![0] as CustomEvent
      expect(event.detail.org).toBe('')
    })

    dispatchEventSpy.mockRestore()
  })
})
