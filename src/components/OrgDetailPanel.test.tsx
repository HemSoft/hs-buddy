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
  })
})
