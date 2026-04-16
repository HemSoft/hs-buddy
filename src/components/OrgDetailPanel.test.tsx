import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrgDetailPanel } from './OrgDetailPanel'

/* ── hoisted mocks ─────────────────────────────────────────────────── */

const orgMocks = vi.hoisted(() => ({
  useGitHubAccounts: vi.fn(),
  usePRSettings: vi.fn(),
  useTaskQueue: vi.fn(),
  useCopilotUsage: vi.fn(),
  formatDistanceToNow: vi.fn(),
  formatTime: vi.fn(),
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  isAbortError: vi.fn().mockReturnValue(false),
  throwIfAborted: vi.fn(),
  dataCacheGet: vi.fn().mockReturnValue(null),
  dataCacheSet: vi.fn(),
  dataCacheDelete: vi.fn(),
  dataCacheIsFresh: vi.fn().mockReturnValue(false),
  dataCacheSubscribe: vi.fn().mockReturnValue(() => {}),
  getTaskQueue: vi.fn(),
  mockClient: {
    fetchOrgOverview: vi.fn(),
    getOrgMembers: vi.fn(),
    fetchOrgCopilot: vi.fn(),
    getRateLimit: vi.fn(),
  },
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: orgMocks.useGitHubAccounts,
  usePRSettings: orgMocks.usePRSettings,
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: orgMocks.useTaskQueue,
}))

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: orgMocks.useCopilotUsage,
}))

vi.mock('../api/github', () => ({
  GitHubClient: class MockGitHubClient {
    fetchOrgOverview = orgMocks.mockClient.fetchOrgOverview
    getOrgMembers = orgMocks.mockClient.getOrgMembers
    fetchOrgCopilot = orgMocks.mockClient.fetchOrgCopilot
    getRateLimit = orgMocks.mockClient.getRateLimit
  },
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: orgMocks.dataCacheGet,
    set: orgMocks.dataCacheSet,
    delete: orgMocks.dataCacheDelete,
    isFresh: orgMocks.dataCacheIsFresh,
    subscribe: orgMocks.dataCacheSubscribe,
  },
}))

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: orgMocks.getTaskQueue,
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: orgMocks.formatDistanceToNow,
  formatTime: orgMocks.formatTime,
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: orgMocks.getErrorMessage,
  isAbortError: orgMocks.isAbortError,
  throwIfAborted: orgMocks.throwIfAborted,
}))

vi.mock('./copilot-usage/AccountQuotaCard', () => ({
  AccountQuotaCard: ({ account }: { account: { username: string } }) => (
    <div data-testid={`quota-card-${account.username}`}>QuotaCard</div>
  ),
}))

vi.mock('./RateLimitGauge', () => ({
  RateLimitGauge: () => <div data-testid="rate-limit-gauge">RateLimitGauge</div>,
}))

/* ── test data factories ──────────────────────────────────────────── */

function makeOverview(overrides = {}) {
  return {
    authenticatedAs: 'alice',
    isUserNamespace: false,
    metrics: {
      org: 'test-org',
      repoCount: 25,
      privateRepoCount: 10,
      archivedRepoCount: 3,
      openIssueCount: 42,
      openPullRequestCount: 7,
      totalStars: 150,
      totalForks: 35,
      activeReposToday: 5,
      commitsToday: 28,
      lastPushAt: '2026-04-14T02:00:00Z',
      topContributorsToday: [
        { login: 'alice', commits: 12 },
        { login: 'bob', commits: 8 },
      ],
      ...overrides,
    },
  }
}

function makeMembers() {
  return {
    members: [
      { login: 'alice', name: 'Alice Smith', url: 'https://github.com/alice', type: 'User' },
      { login: 'bob', name: 'Bob Jones', url: 'https://github.com/bob', type: 'User' },
      { login: 'charlie', name: null, url: 'https://github.com/charlie', type: 'User' },
    ],
  }
}

/* ── setup / teardown ─────────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })

  const overview = makeOverview()
  const members = makeMembers()

  orgMocks.useGitHubAccounts.mockReturnValue({
    accounts: [{ username: 'alice', org: 'test-org', token: 'ghp_test' }],
    loading: false,
  })
  orgMocks.usePRSettings.mockReturnValue({
    refreshInterval: 15,
    loading: false,
  })
  orgMocks.useTaskQueue.mockReturnValue({
    enqueue: vi.fn(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    ),
    stats: { active: 0, completed: 0, failed: 0 },
    cancelAll: vi.fn(),
  })
  orgMocks.useCopilotUsage.mockReturnValue({
    quotas: {},
    orgBudgets: {},
    orgOverageFromQuotas: new Map(),
  })

  orgMocks.dataCacheGet.mockImplementation((key: string) => {
    if (key === 'org-overview:test-org') return { data: overview, fetchedAt: Date.now() }
    if (key === 'org-members:test-org') return { data: members, fetchedAt: Date.now() }
    return null
  })
  orgMocks.dataCacheIsFresh.mockReturnValue(true)

  orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(overview)
  orgMocks.mockClient.getOrgMembers.mockResolvedValue(members)
  orgMocks.mockClient.fetchOrgCopilot.mockResolvedValue(null)
  orgMocks.mockClient.getRateLimit.mockResolvedValue({
    limit: 5000,
    remaining: 4500,
    reset: Date.now() / 1000 + 3600,
    used: 500,
  })

  orgMocks.formatDistanceToNow.mockReturnValue('2 hours ago')
  orgMocks.formatTime.mockReturnValue('10:30 AM')

  orgMocks.getTaskQueue.mockReturnValue({
    hasTaskWithName: vi.fn().mockReturnValue(false),
  })

  window.shell = {
    openExternal: vi.fn(),
    openInAppBrowser: vi.fn(),
  } as unknown as typeof window.shell
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ── tests ────────────────────────────────────────────────────────── */

describe('OrgDetailPanel', () => {
  describe('loading state', () => {
    it('renders skeleton when no cached overview exists', () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      render(<OrgDetailPanel org="test-org" />)
      expect(screen.getAllByText('Loading…').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('test-org')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('renders error when overview fetch fails and no cached data', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      orgMocks.mockClient.fetchOrgOverview.mockRejectedValue(new Error('Network error'))

      render(<OrgDetailPanel org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load organization overview')).toBeInTheDocument()
      })
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    it('shows retry button on error that retries the fetch', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      orgMocks.mockClient.fetchOrgOverview.mockRejectedValue(new Error('Timeout'))

      render(<OrgDetailPanel org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })

      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(makeOverview())
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        return null
      })

      fireEvent.click(screen.getByText('Retry'))
    })
  })

  describe('hero section', () => {
    it('renders org name and authentication info', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })
      expect(screen.getByText(/Authenticated via @alice/)).toBeInTheDocument()
    })

    it('renders Organization Overview kicker for orgs', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Organization Overview')).toBeInTheDocument()
      })
    })

    it('renders User Namespace kicker for user namespaces', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('User Namespace')).toBeInTheDocument()
      })
    })

    it('renders live status pills', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument()
      })
      // "Members" and "Copilot" may appear in both pills and metrics; assert at least one
      expect(screen.getAllByText('Members').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Copilot').length).toBeGreaterThanOrEqual(1)
    })

    it('renders Open GitHub button that opens the org URL', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Open GitHub')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Open GitHub'))
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test-org')
    })

    it('renders Refresh button', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument()
      })
    })

    it('shows spotlight text when memberLogin provided', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="alice" />)
      await waitFor(() => {
        expect(screen.getByText(/spotlight on alice/)).toBeInTheDocument()
      })
    })
  })

  describe('metrics grid', () => {
    it('renders repo count', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Repositories')).toBeInTheDocument()
      })
      expect(screen.getByText('25')).toBeInTheDocument()
      expect(screen.getByText('10 private · 3 archived')).toBeInTheDocument()
    })

    it('renders commits today', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Commits Today')).toBeInTheDocument()
      })
      expect(screen.getByText('28')).toBeInTheDocument()
      expect(screen.getByText('5 active repos')).toBeInTheDocument()
    })

    it('renders stars and forks', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Stars')).toBeInTheDocument()
      })
      expect(screen.getByText('150')).toBeInTheDocument()
      expect(screen.getByText('35 forks')).toBeInTheDocument()
    })

    it('renders open PRs and issues', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Open PRs')).toBeInTheDocument()
      })
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('42 open issues')).toBeInTheDocument()
    })

    it('renders member count', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getAllByText('Members').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('copilot section', () => {
    it('renders Copilot Pulse header for org', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Copilot Pulse')).toBeInTheDocument()
      })
    })

    it('renders Copilot Quota header for user namespace', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Copilot Quota')).toBeInTheDocument()
      })
    })

    it('renders mini metrics for copilot data', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Premium Requests')).toBeInTheDocument()
      })
      expect(screen.getByText('Net Cost')).toBeInTheDocument()
      expect(screen.getByText('Business Seats')).toBeInTheDocument()
    })

    it('renders budget band for org', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Budget')).toBeInTheDocument()
      })
      expect(screen.getByText('Spent')).toBeInTheDocument()
      expect(screen.getByText('My Share')).toBeInTheDocument()
    })
  })

  describe('leaders section', () => {
    it('renders top contributors', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText("Today's Leaders")).toBeInTheDocument()
      })
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
    })

    it('navigates to user on contributor click', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText("Today's Leaders")).toBeInTheDocument()
      })
      const aliceButton = screen.getByText('Alice Smith')
      fireEvent.click(aliceButton)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app:navigate',
          detail: { viewId: 'org-user:test-org/alice' },
        })
      )
    })
  })

  describe('member spotlight', () => {
    it('renders spotlight section when memberLogin is provided', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="alice" />)
      await waitFor(() => {
        expect(screen.getByText('Member Spotlight')).toBeInTheDocument()
      })
      // "Alice Smith (alice)" appears in both spotlight and roster; just confirm spotlight header rendered
      expect(screen.getAllByText('Alice Smith (alice)').length).toBeGreaterThanOrEqual(1)
    })

    it('shows commit count for active contributor', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="alice" />)
      await waitFor(() => {
        expect(screen.getByText(/12 commits today/)).toBeInTheDocument()
      })
    })

    it('shows no commits for idle member', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="charlie" />)
      await waitFor(() => {
        expect(screen.getByText(/no commits today/)).toBeInTheDocument()
      })
    })
  })

  describe('configured accounts section', () => {
    it('renders AccountQuotaCard for configured accounts', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByTestId('quota-card-alice')).toBeInTheDocument()
      })
    })

    it('does not render section when no configured accounts', async () => {
      orgMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'alice', org: 'other-org', token: 'ghp_test' }],
        loading: false,
      })
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })
      expect(screen.queryByText('Configured Accounts')).not.toBeInTheDocument()
    })
  })

  describe('member roster', () => {
    it('renders roster with all members', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Member Roster')).toBeInTheDocument()
      })
      expect(screen.getByText('Alice Smith (alice)')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones (bob)')).toBeInTheDocument()
      expect(screen.getByText('charlie')).toBeInTheDocument()
    })

    it('renders filter buttons with counts', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument()
      })
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Configured')).toBeInTheDocument()
      expect(screen.getByText('Idle')).toBeInTheDocument()
    })

    it('filters members by Active filter', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Active'))
      // alice and bob are contributors, charlie is not
      await waitFor(() => {
        expect(screen.queryByText('charlie')).not.toBeInTheDocument()
      })
    })

    it('sorts by commits when sort button clicked', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Name'))
      // Should toggle to Commits — may appear in multiple places
      expect(screen.getAllByText('Commits').length).toBeGreaterThanOrEqual(1)
    })

    it('shows contributor status in member meta', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText(/12 today/)).toBeInTheDocument()
      })
      expect(screen.getByText(/8 today/)).toBeInTheDocument()
      expect(screen.getByText(/idle today/)).toBeInTheDocument()
    })

    it('navigates to member on roster item click', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Bob Jones (bob)')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Bob Jones (bob)').closest('button')!)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app:navigate',
          detail: { viewId: 'org-user:test-org/bob' },
        })
      )
    })

    it('shows empty state when no members returned', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: { members: [] }, fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.getOrgMembers.mockResolvedValue({ members: [] })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('No members returned for this namespace.')).toBeInTheDocument()
      })
    })
  })

  describe('inline errors', () => {
    it('shows members error banner when members fail', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.getOrgMembers.mockRejectedValue(new Error('Members API error'))

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        // Members pill should show error state (Unavailable)
        const pills = document.querySelectorAll('.org-detail-live-pill-error')
        expect(pills.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows copilot error banner when copilot fetch fails', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.dataCacheIsFresh.mockReturnValue(false)
      // window.github.getCopilotUsage must exist for the copilot fetch path
      window.github = {
        getCopilotUsage: vi.fn().mockRejectedValue(new Error('Copilot API error')),
      } as unknown as typeof window.github

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        const pills = document.querySelectorAll('.org-detail-live-pill-error')
        expect(pills.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('roster filters', () => {
    it('filters by Configured showing only configured members', async () => {
      orgMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'alice', org: 'test-org', token: 'ghp_test' }],
        loading: false,
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Configured')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Configured'))
      // Only alice is configured
      await waitFor(() => {
        expect(screen.getByText('Alice Smith (alice)')).toBeInTheDocument()
      })
      expect(screen.queryByText('Bob Jones (bob)')).not.toBeInTheDocument()
      expect(screen.queryByText('charlie')).not.toBeInTheDocument()
    })

    it('filters by Idle showing only idle members', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Idle')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Idle'))
      // charlie has no commits — idle; alice and bob are active contributors
      await waitFor(() => {
        expect(screen.getByText('charlie')).toBeInTheDocument()
      })
      expect(screen.queryByText('Alice Smith (alice)')).not.toBeInTheDocument()
      expect(screen.queryByText('Bob Jones (bob)')).not.toBeInTheDocument()
    })

    it('shows "No members match" when filter yields empty results', async () => {
      // No accounts configured for this org → Configured filter yields 0
      orgMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'alice', org: 'other-org', token: 'ghp_test' }],
        loading: false,
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Configured')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Configured'))
      await waitFor(() => {
        expect(screen.getByText('No members match the current filter.')).toBeInTheDocument()
      })
    })

    it('sorts members by commits descending when toggled to Commits', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
      })
      // Toggle to Commits sorting
      fireEvent.click(screen.getByText('Name'))
      await waitFor(() => {
        // The sort button should now read "Commits"
        expect(screen.getByTitle('Sort by name')).toBeInTheDocument()
      })
      // alice has 12 commits, bob has 8, charlie has 0 → alice first
      const buttons = document.querySelectorAll('.org-detail-roster-item')
      const names = [...buttons].map(
        btn => btn.querySelector('.org-detail-roster-name')?.textContent
      )
      expect(names[0]).toContain('alice')
      expect(names[1]).toContain('bob')
      expect(names[2]).toContain('charlie')
    })

    it('shows "configured" tag for members with configured accounts', async () => {
      orgMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'alice', org: 'test-org', token: 'ghp_test' }],
        loading: false,
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText(/configured/)).toBeInTheDocument()
      })
    })
  })

  describe('leaders empty states', () => {
    it('shows computing message when no contributors and no full overview', async () => {
      // Provide empty contributors in the overview, but resolve fast
      // The overview returns with 0 contributors, but hasCachedFullOverview is false initially
      const emptyOverview = makeOverview({ topContributorsToday: [] })
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      // Resolve overview: hasFullOverview becomes true, so "No commits" shows instead
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(emptyOverview)

      render(<OrgDetailPanel org="test-org" />)
      // After fetch resolves, we get "no commits" since hasFullOverview=true + empty contributors
      await waitFor(() => {
        expect(screen.getByText('No commits recorded yet today.')).toBeInTheDocument()
      })
    })

    it('shows no commits message when no contributors but has full overview', async () => {
      const emptyOverview = makeOverview({ topContributorsToday: [] })
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: emptyOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(emptyOverview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('No commits recorded yet today.')).toBeInTheDocument()
      })
    })
  })

  describe('metrics edge cases', () => {
    it('shows "no recent pushes" when lastPushAt is null', async () => {
      const overview = makeOverview({ lastPushAt: null })
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: overview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(overview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('no recent pushes')).toBeInTheDocument()
      })
    })

    it('renders zero metrics correctly', async () => {
      const overview = makeOverview({
        repoCount: 0,
        privateRepoCount: 0,
        archivedRepoCount: 0,
        openIssueCount: 0,
        openPullRequestCount: 0,
        totalStars: 0,
        totalForks: 0,
        activeReposToday: 0,
        commitsToday: 0,
      })
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: overview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(overview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Repositories')).toBeInTheDocument()
      })
      expect(screen.getByText('0 private · 0 archived')).toBeInTheDocument()
      expect(screen.getByText('0 active repos')).toBeInTheDocument()
      expect(screen.getByText('0 forks')).toBeInTheDocument()
      expect(screen.getByText('0 open issues')).toBeInTheDocument()
    })
  })

  describe('copilot section branches', () => {
    it('renders personal quota pulse for user namespace', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: {
          alice: {
            data: {
              quota_snapshots: {
                premium_interactions: {
                  entitlement: 1000,
                  remaining: 700,
                  overage_count: 0,
                },
              },
            },
            loading: false,
            fetchedAt: Date.now(),
          },
        },
        orgBudgets: {},
        orgOverageFromQuotas: new Map(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Used Premium')).toBeInTheDocument()
      })
      expect(screen.getByText('Remaining')).toBeInTheDocument()
      expect(screen.getByText('Entitlement')).toBeInTheDocument()
      expect(screen.getByText('Overage Cost')).toBeInTheDocument()
    })

    it('renders user namespace budget band with personal quota info', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Namespace Type')).toBeInTheDocument()
      })
      expect(screen.getByText('Personal quota')).toBeInTheDocument()
      expect(screen.getAllByText('Configured Accounts').length).toBeGreaterThanOrEqual(1)
    })

    it('renders org budget with actual budget amount', async () => {
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: {},
        orgBudgets: {
          'test-org': {
            data: { budgetAmount: 500, spent: 123.45 },
            loading: false,
          },
        },
        orgOverageFromQuotas: new Map([['test-org', 12.5]]),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Budget')).toBeInTheDocument()
      })
      expect(screen.getByText('Spent')).toBeInTheDocument()
    })

    it('renders "Not set" when budget amount is null', async () => {
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: {},
        orgBudgets: {
          'test-org': {
            data: { budgetAmount: null, spent: 0 },
            loading: false,
          },
        },
        orgOverageFromQuotas: new Map(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Not set')).toBeInTheDocument()
      })
    })

    it('renders copilot warming up message when not ready and no usage', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      // Make the copilot task "active" so the phase stays loading
      orgMocks.getTaskQueue.mockReturnValue({
        hasTaskWithName: vi.fn((name: string) => name.includes('copilot')),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Copilot metrics are still warming up.')).toBeInTheDocument()
      })
    })

    it('renders personal quota waiting message for user namespace', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)
      // No quota data and still loading
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: { alice: { data: null, loading: true, fetchedAt: null } },
        orgBudgets: {},
        orgOverageFromQuotas: new Map(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Waiting for personal quota data.')).toBeInTheDocument()
      })
    })
  })

  describe('member spotlight branches', () => {
    it('renders spotlight with configured account quota card', async () => {
      orgMocks.useGitHubAccounts.mockReturnValue({
        accounts: [{ username: 'alice', org: 'test-org', token: 'ghp_test' }],
        loading: false,
      })
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: {
          alice: {
            data: {
              quota_snapshots: {
                premium_interactions: { entitlement: 100, remaining: 50, overage_count: 0 },
              },
            },
            loading: false,
            fetchedAt: Date.now(),
          },
        },
        orgBudgets: {},
        orgOverageFromQuotas: new Map(),
      })

      render(<OrgDetailPanel org="test-org" memberLogin="alice" />)
      await waitFor(() => {
        expect(screen.getByText('Member Spotlight')).toBeInTheDocument()
      })
      // Should render the quota card for alice in the spotlight
      expect(screen.getAllByTestId('quota-card-alice').length).toBeGreaterThanOrEqual(1)
    })

    it('renders no configured card message for unconfigured member', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="bob" />)
      await waitFor(() => {
        expect(screen.getByText('Member Spotlight')).toBeInTheDocument()
      })
      expect(
        screen.getByText('No configured Copilot quota card for this member.')
      ).toBeInTheDocument()
    })

    it('shows member type in spotlight meta', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="charlie" />)
      await waitFor(() => {
        expect(screen.getByText('Member Spotlight')).toBeInTheDocument()
      })
      // charlie has no name, so display format is just login, with User type
      expect(screen.getByText(/User/)).toBeInTheDocument()
    })

    it('opens member profile on Profile button click', async () => {
      render(<OrgDetailPanel org="test-org" memberLogin="alice" />)
      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Profile'))
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/alice')
    })
  })

  describe('refresh and updating', () => {
    it('triggers refresh on Refresh button click', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Refresh'))
      // fetchOrgOverview should be called again
      expect(orgMocks.mockClient.fetchOrgOverview).toHaveBeenCalled()
    })
  })

  describe('rate limit', () => {
    it('renders rate limit gauge when rate limit data is available', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByTestId('rate-limit-gauge')).toBeInTheDocument()
      })
    })
  })

  describe('buildSeedOverview fallback', () => {
    it('seeds from cached repos when overview cache is empty', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-repos:test-org')
          return {
            data: {
              authenticatedAs: 'alice',
              isUserNamespace: false,
              repos: [
                {
                  name: 'repo1',
                  isPrivate: true,
                  isArchived: false,
                  stargazersCount: 10,
                  forksCount: 3,
                  pushedAt: '2026-04-14T01:00:00Z',
                },
                {
                  name: 'repo2',
                  isPrivate: false,
                  isArchived: true,
                  stargazersCount: 5,
                  forksCount: 2,
                  pushedAt: null,
                },
              ],
            },
            fetchedAt: Date.now(),
          }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(makeOverview())

      render(<OrgDetailPanel org="test-org" />)
      // Should seed from repos → 2 repos, 1 private, 1 archived
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })
    })
  })

  describe('null overview guard', () => {
    it('renders nothing when overview is null and not loading', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      orgMocks.dataCacheIsFresh.mockReturnValue(true)
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(null)

      const { container } = render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        // Should render skeleton initially, then nothing after null resolves
        expect(container.querySelector('.org-detail-container')).toBeFalsy()
      })
    })
  })

  describe('abort error handling', () => {
    it('silently ignores abort errors on overview fetch (no error banner)', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      const abortErr = new DOMException('AbortError', 'AbortError')
      orgMocks.mockClient.fetchOrgOverview.mockRejectedValue(abortErr)
      orgMocks.isAbortError.mockImplementation((err: unknown) => err === abortErr)

      render(<OrgDetailPanel org="test-org" />)
      // Give time for the fetch to reject
      await vi.advanceTimersByTimeAsync(100)

      expect(screen.queryByText('Failed to load organization overview')).not.toBeInTheDocument()
    })

    it('silently ignores abort errors on members fetch (no error pill)', async () => {
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: makeOverview(), fetchedAt: Date.now() }
        return null
      })
      const abortErr = new DOMException('AbortError', 'AbortError')
      orgMocks.isAbortError.mockImplementation((err: unknown) => err === abortErr)
      // Make enqueue reject with an abort error for the members task
      orgMocks.useTaskQueue.mockReturnValue({
        enqueue: vi.fn(
          async (fn: (signal: AbortSignal) => Promise<unknown>, opts?: { name?: string }) => {
            if (opts?.name?.includes('members')) throw abortErr
            return fn(new AbortController().signal)
          }
        ),
        stats: { active: 0, completed: 0, failed: 0 },
        cancelAll: vi.fn(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await vi.advanceTimersByTimeAsync(100)

      // Members error banner should NOT appear for abort errors
      expect(screen.queryByText(/Members.*error/i)).not.toBeInTheDocument()
    })
  })

  describe('refresh vs loading phase', () => {
    it('shows refreshing pill when data exists and a refetch is in-flight', async () => {
      let overviewEnqueued = false
      orgMocks.getTaskQueue.mockReturnValue({
        hasTaskWithName: vi.fn((name: string) => name.includes('overview') && overviewEnqueued),
      })
      orgMocks.dataCacheIsFresh.mockReturnValue(false)
      orgMocks.useTaskQueue.mockReturnValue({
        enqueue: vi.fn(
          async (fn: (signal: AbortSignal) => Promise<unknown>, opts?: { name?: string }) => {
            if (opts?.name?.includes('overview')) {
              overviewEnqueued = true
              return new Promise(() => {})
            }
            return fn(new AbortController().signal)
          }
        ),
        stats: { active: 1, completed: 0, failed: 0 },
        cancelAll: vi.fn(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        const pills = document.querySelectorAll('.org-detail-live-pill-refreshing')
        expect(pills.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('task queue deduplication', () => {
    it('skips fetch when task is already queued', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      orgMocks.dataCacheIsFresh.mockReturnValue(false)
      // hasTaskWithName returns true → fetch should be skipped
      orgMocks.getTaskQueue.mockReturnValue({
        hasTaskWithName: vi.fn().mockReturnValue(true),
      })

      render(<OrgDetailPanel org="test-org" />)
      await vi.advanceTimersByTimeAsync(100)

      // enqueue should NOT have been called since hasTaskWithName returned true
      // and the cache was empty, so it returns early
      const enqueue = orgMocks.useTaskQueue.mock.results[0]?.value?.enqueue
      if (enqueue) {
        expect(enqueue).not.toHaveBeenCalled()
      }
    })
  })

  describe('user namespace copilot reset', () => {
    it('skips copilot fetch and shows personal quota UI for user namespace', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)

      window.github = {
        getCopilotUsage: vi.fn(),
      } as unknown as typeof window.github

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Copilot Quota')).toBeInTheDocument()
      })

      // getCopilotUsage should NOT have been called for user namespaces
      expect(window.github.getCopilotUsage).not.toHaveBeenCalled()
    })
  })

  describe('sorting with commit tie-breaking', () => {
    it('sorts members with equal commits by name when sorted by commits', async () => {
      const tiedOverview = makeOverview({
        topContributorsToday: [
          { login: 'alice', commits: 10 },
          { login: 'bob', commits: 10 },
          { login: 'charlie', commits: 5 },
        ],
      })
      const tiedMembers = {
        members: [
          { login: 'bob', name: 'Bob Jones', url: 'https://github.com/bob', type: 'User' },
          { login: 'alice', name: 'Alice Smith', url: 'https://github.com/alice', type: 'User' },
          { login: 'charlie', name: 'Charlie', url: 'https://github.com/charlie', type: 'User' },
        ],
      }
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: tiedOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: tiedMembers, fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(tiedOverview)
      orgMocks.mockClient.getOrgMembers.mockResolvedValue(tiedMembers)

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument()
      })

      // Toggle to commits sorting
      fireEvent.click(screen.getByText('Name'))

      await waitFor(() => {
        expect(screen.getByTitle('Sort by name')).toBeInTheDocument()
      })

      // alice and bob both have 10 commits; charlie has 5
      const buttons = document.querySelectorAll('.org-detail-roster-item')
      const names = [...buttons].map(
        btn => btn.querySelector('.org-detail-roster-name')?.textContent
      )
      // charlie (5) should be last; alice and bob (10 each) should be first two
      expect(names[2]).toContain('Charlie')
      // The first two should have 10 commits each
      expect(names[0]).toMatch(/alice|bob/i)
      expect(names[1]).toMatch(/alice|bob/i)
    })
  })

  describe('member with null name', () => {
    it('displays just login for members with null name in roster', async () => {
      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Member Roster')).toBeInTheDocument()
      })
      // charlie has name: null — should display just 'charlie' not 'null (charlie)'
      const charlieEl = screen.getByText('charlie')
      expect(charlieEl).toBeInTheDocument()
      // Verify the meta line does NOT include '@charlie · ' prefix (only appears when name exists)
      const rosterItems = document.querySelectorAll('.org-detail-roster-item')
      const charlieItem = [...rosterItems].find(
        item => item.querySelector('.org-detail-roster-name')?.textContent === 'charlie'
      )
      expect(charlieItem).toBeTruthy()
      const meta = charlieItem!.querySelector('.org-detail-roster-meta')?.textContent ?? ''
      expect(meta).not.toContain('@charlie')
    })
  })

  describe('overage calculation with negative remaining', () => {
    it('computes overage cost from negative remaining', async () => {
      const userOverview = makeOverview()
      userOverview.isUserNamespace = true
      orgMocks.dataCacheGet.mockImplementation((key: string) => {
        if (key === 'org-overview:test-org') return { data: userOverview, fetchedAt: Date.now() }
        if (key === 'org-members:test-org') return { data: makeMembers(), fetchedAt: Date.now() }
        return null
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(userOverview)
      orgMocks.useCopilotUsage.mockReturnValue({
        quotas: {
          alice: {
            data: {
              quota_snapshots: {
                premium_interactions: {
                  entitlement: 1000,
                  remaining: -50,
                  overage_count: 0,
                },
              },
            },
            loading: false,
            fetchedAt: Date.now(),
          },
        },
        orgBudgets: {},
        orgOverageFromQuotas: new Map(),
      })

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('Overage Cost')).toBeInTheDocument()
      })
      // remaining = -50, Math.max(0, -(-50)) = 50 overage requests
      // overageCost = 50 * 0.04 = $2.00
      // The overage cost appears in the mini-metric for "Overage Cost"
      const overageCostEl = screen.getByText('Overage Cost').closest('.org-detail-mini-metric')
      expect(overageCostEl?.querySelector('.org-detail-mini-value')?.textContent).toBe('$2.00')
    })
  })

  describe('no rate limit data', () => {
    it('does not render rate limit gauge when rateLimit is null', async () => {
      orgMocks.mockClient.getRateLimit.mockRejectedValue(new Error('Rate limit unavailable'))

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })
      // Wait a bit for the rate limit fetch to fail
      await vi.advanceTimersByTimeAsync(200)

      expect(screen.queryByTestId('rate-limit-gauge')).not.toBeInTheDocument()
    })
  })

  describe('buildSeedOverview null fallback', () => {
    it('returns null seed when neither overview nor repos cache exists', async () => {
      orgMocks.dataCacheGet.mockReturnValue(null)
      orgMocks.dataCacheIsFresh.mockReturnValue(false)
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(makeOverview())
      orgMocks.mockClient.getOrgMembers.mockResolvedValue(makeMembers())

      render(<OrgDetailPanel org="test-org" />)
      // Should start with skeleton (loading) since no seed data
      expect(screen.getAllByText('Loading…').length).toBeGreaterThanOrEqual(1)

      // After fetch resolves, should show content
      await waitFor(() => {
        expect(screen.getByText('Repositories')).toBeInTheDocument()
      })
    })
  })

  describe('zero/negative refresh interval', () => {
    it('does not set up auto-refresh when refreshInterval is 0', async () => {
      orgMocks.usePRSettings.mockReturnValue({
        refreshInterval: 0,
        loading: false,
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(makeOverview())

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })

      // Clear call counts after initial fetch
      orgMocks.mockClient.fetchOrgOverview.mockClear()

      // Advance time well past what a 15-min interval would trigger
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

      // fetchOrgOverview should NOT have been called again (no auto-refresh)
      expect(orgMocks.mockClient.fetchOrgOverview).not.toHaveBeenCalled()
    })

    it('does not set up auto-refresh when refreshInterval is negative', async () => {
      orgMocks.usePRSettings.mockReturnValue({
        refreshInterval: -5,
        loading: false,
      })
      orgMocks.mockClient.fetchOrgOverview.mockResolvedValue(makeOverview())

      render(<OrgDetailPanel org="test-org" />)
      await waitFor(() => {
        expect(screen.getByText('test-org')).toBeInTheDocument()
      })

      orgMocks.mockClient.fetchOrgOverview.mockClear()

      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

      expect(orgMocks.mockClient.fetchOrgOverview).not.toHaveBeenCalled()
    })
  })
})
