import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AccountQuotaCard } from './AccountQuotaCard'
import type { GitHubAccount } from '../../types/config'
import type { AccountQuotaState } from './quotaUtils'
import type { OrgBudgetState } from './types'

vi.mock('./UsageRing', () => ({
  UsageRing: ({ percentUsed }: { percentUsed: number }) => (
    <div data-testid="usage-ring">{percentUsed}%</div>
  ),
}))

vi.mock('../../utils/copilotFormatUtils', () => ({
  daysUntilReset: () => 15,
  formatCopilotPlan: (plan: string) => plan.charAt(0).toUpperCase() + plan.slice(1),
  formatResetDate: () => 'May 1',
}))

vi.mock('../../utils/dateUtils', () => ({
  formatTime: (ts: number) => `time:${ts}`,
}))

const testAccount: GitHubAccount = { username: 'testuser', org: 'acme' }

function makeQuotaData(overrides: Record<string, unknown> = {}) {
  const emptySnapshot = {
    entitlement: 0,
    overage_count: 0,
    overage_permitted: false,
    percent_remaining: 100,
    quota_id: '',
    quota_remaining: 0,
    remaining: 0,
    unlimited: false,
    timestamp_utc: '2026-04-14T00:00:00Z',
  }
  return {
    login: 'testuser',
    copilot_plan: 'individual',
    quota_reset_date: '2026-05-01',
    quota_reset_date_utc: '2026-05-01T00:00:00Z',
    organization_login_list: [] as string[],
    quota_snapshots: {
      chat: { ...emptySnapshot, quota_id: 'chat' },
      completions: { ...emptySnapshot, quota_id: 'completions' },
      premium_interactions: {
        entitlement: 300,
        overage_count: 0,
        overage_permitted: true,
        percent_remaining: 60,
        quota_id: 'premium',
        quota_remaining: 180,
        remaining: 180,
        unlimited: false,
        timestamp_utc: '2026-04-14T00:00:00Z',
      },
    },
    ...overrides,
  }
}

function makeOrgBudgetData(overrides: Record<string, unknown> = {}) {
  return {
    budgetAmount: 100,
    spent: 42,
    useQuotaOverage: false,
    preventFurtherUsage: false,
    spentUnavailable: false,
    billingYear: 2026,
    billingMonth: 4,
    fetchedAt: 1700000000000,
    ...overrides,
  }
}

describe('AccountQuotaCard', () => {
  // Pin Date.now() so computeProjection produces deterministic values that
  // don't collide with the stat numbers (120, 180, 300) on any calendar day.
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('shows loading state when state is undefined (initial render race)', () => {
    render(<AccountQuotaCard account={testAccount} state={undefined} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows loading state when loading with no data', () => {
    const state: AccountQuotaState = { data: null, loading: true, error: null, fetchedAt: null }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error state for non-404 errors', () => {
    const state: AccountQuotaState = {
      data: null,
      loading: false,
      error: 'Network error',
      fetchedAt: null,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('testuser')).toBeInTheDocument()
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows "No Copilot subscription" for 404 errors', () => {
    const state: AccountQuotaState = {
      data: null,
      loading: false,
      error: '404 Not Found',
      fetchedAt: null,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('No Copilot subscription')).toBeInTheDocument()
  })

  it('renders quota data with usage ring', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByTestId('usage-ring')).toBeInTheDocument()
    expect(screen.getByText('testuser')).toBeInTheDocument()
    expect(screen.getByText('Individual')).toBeInTheDocument()
  })

  it('displays used, remaining, and entitlement stats', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    const stats = within(screen.getByTestId('quota-stats'))
    expect(stats.getByText('120')).toBeInTheDocument() // used
    expect(stats.getByText('180')).toBeInTheDocument() // remaining
    expect(stats.getByText('300')).toBeInTheDocument() // entitlement
  })

  it('shows overage cost when overage requests exist', () => {
    const data = makeQuotaData()
    data.quota_snapshots.premium_interactions.remaining = -10
    const state: AccountQuotaState = {
      data: data as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('Overage Cost')).toBeInTheDocument()
  })

  it('renders reset date info', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText(/Resets May 1/)).toBeInTheDocument()
    expect(screen.getByText('(15d)')).toBeInTheDocument()
  })

  it('renders organization list when present', () => {
    const data = makeQuotaData({ organization_login_list: ['acme-corp', 'hemsoft'] })
    const state: AccountQuotaState = {
      data: data as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('acme-corp, hemsoft')).toBeInTheDocument()
  })

  it('does not render organization list when empty', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    const { container } = render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(container.querySelector('.usage-account-orgs')).not.toBeInTheDocument()
  })

  it('renders PlanIcon for enterprise plan', () => {
    const data = makeQuotaData({ copilot_plan: 'enterprise' })
    const state: AccountQuotaState = {
      data: data as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('Enterprise')).toBeInTheDocument()
  })

  it('renders PlanIcon for business plan', () => {
    const data = makeQuotaData({ copilot_plan: 'business' })
    const state: AccountQuotaState = {
      data: data as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('Business')).toBeInTheDocument()
  })

  it('shows fetched-at timestamp', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.getByText('time:1700000000000')).toBeInTheDocument()
  })

  it('does not show fetched-at timestamp when fetchedAt is null', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: null,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(document.querySelector('.usage-fetched-at')).not.toBeInTheDocument()
  })

  it('renders personal usage and a share-of-org bar when personal data is present', () => {
    const personal = {
      entitlement: 7000,
      overage_count: 1235,
      overage_permitted: true,
      percent_remaining: 0,
      quota_id: 'premium_interactions',
      quota_remaining: -1235,
      remaining: -1235,
      unlimited: false,
      timestamp_utc: '2026-04-14T00:00:00Z',
    }
    const data = makeQuotaData({ personal, orgConsumed: 10940 })
    const state: AccountQuotaState = {
      data: data as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    const stats = within(screen.getByTestId('quota-stats'))
    expect(stats.getByText('8,235')).toBeInTheDocument() // personal used (7000 - -1235)
    expect(stats.getByText('7,000')).toBeInTheDocument() // personal entitlement

    const share = within(screen.getByTestId('share-of-org'))
    expect(share.getByText(/8,235 \/ 10,940 \(75%\)/)).toBeInTheDocument()
  })

  it('does not render a share-of-org bar without personal data', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    render(<AccountQuotaCard account={testAccount} state={state} />)
    expect(screen.queryByTestId('share-of-org')).not.toBeInTheDocument()
  })

  it('renders org budget details inside the quota card', () => {
    const state: AccountQuotaState = {
      data: makeQuotaData() as AccountQuotaState['data'],
      loading: false,
      error: null,
      fetchedAt: 1700000000000,
    }
    const budgetState: OrgBudgetState = {
      data: makeOrgBudgetData() as OrgBudgetState['data'],
      loading: false,
      error: null,
    }

    render(
      <AccountQuotaCard
        account={testAccount}
        state={state}
        budgetState={budgetState}
        quotaOverage={15}
      />
    )

    expect(screen.getByTestId('org-budget-summary')).toBeInTheDocument()
    expect(screen.getByText('Org Budget')).toBeInTheDocument()
    expect(screen.getByText('$42.00 spent')).toBeInTheDocument()
    expect(screen.getByText('$15.00 mine')).toBeInTheDocument()
  })
})
