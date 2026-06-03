import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CopilotUsagePanel } from './CopilotUsagePanel'

let mockAccounts: Array<{ username: string; org?: string }> = [
  { username: 'testuser', org: 'testorg' },
]
let mockAggregateProjections: { projectedTotal: number; projectedOverageCost: number } | null = {
  projectedTotal: 200,
  projectedOverageCost: 0,
}
let mockAggregateSpend: { totalSpent: number; projectedSpend: number } | null = {
  totalSpent: 50,
  projectedSpend: 100,
}
let mockOrgBudgets: Record<string, { data: unknown; loading: boolean; error: string | null }> = {}
let mockOrgOverageFromQuotas = new Map<string, number>()
const mockRefreshAll = vi.fn()

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    accounts: mockAccounts,
    quotas: {
      testuser: {
        status: 'done',
        data: {
          totalUsed: 100,
          totalEntitlement: 500,
          percentUsed: 20,
          premiumBreakdown: [],
        },
      },
    },
    orgBudgets: mockOrgBudgets,
    uniqueOrgs: new Map([['testorg', 'testuser']]),
    refreshAll: mockRefreshAll,
    anyLoading: false,
    aggregateTotals: { totalUsed: 100, totalEntitlement: 500, totalOverageCost: 0 },
    aggregateProjections: mockAggregateProjections,
    aggregateSpend: mockAggregateSpend,
    orgOverageFromQuotas: mockOrgOverageFromQuotas,
  }),
}))

vi.mock('./copilot-usage/AccountQuotaCard', () => ({
  AccountQuotaCard: ({
    account,
    budgetState,
    quotaOverage,
  }: {
    account: { username: string; org: string }
    budgetState?: { data: unknown; loading: boolean; error: string | null }
    quotaOverage?: number
  }) => (
    <div data-testid={`quota-card-${account.username}`}>
      Quota: {account.username} org={account.org} budget={budgetState ? 'yes' : 'no'} overage=
      {quotaOverage ?? 0}
    </div>
  ),
}))

vi.mock('./copilot-usage/UsageHeader', () => ({
  UsageHeader: ({
    totalUsed,
    projectedTotal,
    totalSpent,
    projectedSpend,
    onRefreshAll,
  }: {
    totalUsed: number
    projectedTotal: number | null
    totalSpent: number | null
    projectedSpend: number | null
    onRefreshAll: () => void
  }) => (
    <div data-testid="usage-header">
      Total: {totalUsed} Projected: {projectedTotal === null ? 'null' : projectedTotal} Spend:{' '}
      {totalSpent === null ? 'null' : totalSpent} ProjSpend:{' '}
      {projectedSpend === null ? 'null' : projectedSpend}
      <button type="button" onClick={onRefreshAll}>
        Refresh
      </button>
    </div>
  ),
}))

const mockTopUsersSection = vi.fn()

vi.mock('./copilot-usage/TopUsersSection', () => ({
  TopUsersSection: ({ refreshToken }: { refreshToken: number }) => {
    mockTopUsersSection(refreshToken)
    return (
      <div>
        <h3>Copilot Enterprise Users</h3>
        <span>fhemmerrelias</span>
        <span data-testid="enterprise-users-refresh-token">{refreshToken}</span>
      </div>
    )
  },
}))

describe('CopilotUsagePanel', () => {
  beforeEach(() => {
    mockAccounts = [{ username: 'testuser', org: 'testorg' }]
    mockAggregateProjections = { projectedTotal: 200, projectedOverageCost: 0 }
    mockAggregateSpend = { totalSpent: 50, projectedSpend: 100 }
    mockOrgBudgets = {}
    mockOrgOverageFromQuotas = new Map()
    mockRefreshAll.mockClear()
    mockTopUsersSection.mockClear()
  })

  it('renders usage header', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('usage-header')).toBeTruthy()
    expect(screen.getByText(/Total: 100/)).toBeTruthy()
  })

  it('passes aggregate spend through to the header', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/Spend: 50/)).toBeTruthy()
    expect(screen.getByText(/ProjSpend: 100/)).toBeTruthy()
  })

  it('renders account quota cards', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('quota-card-testuser')).toBeTruthy()
  })

  it('passes org budget details to account quota cards', () => {
    mockOrgBudgets = {
      testorg: { data: { spent: 42 }, loading: false, error: null },
    }
    mockOrgOverageFromQuotas = new Map([['testorg', 12]])
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/budget=yes/)).toBeTruthy()
    expect(screen.getByText(/overage=12/)).toBeTruthy()
  })

  it('renders the Copilot enterprise users section', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByText('Copilot Enterprise Users')).toBeTruthy()
    expect(screen.getByText('fhemmerrelias')).toBeTruthy()
  })

  it('refreshes the Copilot Enterprise users list when the page refresh button is clicked', () => {
    render(<CopilotUsagePanel />)

    expect(screen.getByTestId('enterprise-users-refresh-token').textContent).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(mockRefreshAll).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('enterprise-users-refresh-token').textContent).toBe('1')
    expect(mockTopUsersSection).toHaveBeenLastCalledWith(1)
  })
})

describe('CopilotUsagePanel – empty accounts', () => {
  it('renders empty state when no accounts configured', () => {
    mockAccounts = []
    render(<CopilotUsagePanel />)
    expect(screen.getByText('No GitHub accounts configured.')).toBeTruthy()
  })
})

describe('CopilotUsagePanel – null projections', () => {
  it('passes null when aggregateProjections is null', () => {
    mockAggregateProjections = null
    mockAccounts = [{ username: 'testuser', org: 'testorg' }]
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/Projected: null/)).toBeTruthy()
  })
})

describe('CopilotUsagePanel – null aggregate spend', () => {
  it('passes null spend through to the header when aggregateSpend is null', () => {
    mockAggregateSpend = null
    mockAccounts = [{ username: 'testuser', org: 'testorg' }]
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/Spend: null/)).toBeTruthy()
    expect(screen.getByText(/ProjSpend: null/)).toBeTruthy()
  })
})

describe('CopilotUsagePanel – undefined org fallback', () => {
  it('falls back to empty string when account.org is undefined', () => {
    mockAggregateProjections = { projectedTotal: 200, projectedOverageCost: 0 }
    mockAccounts = [{ username: 'noorguser' }]
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/org=/)).toBeTruthy()
  })
})

describe('CopilotUsagePanel – hemsoft org skipped', () => {
  it('does not render a quota card for hemsoft accounts', () => {
    mockAggregateProjections = { projectedTotal: 200, projectedOverageCost: 0 }
    mockAccounts = [
      { username: 'testuser', org: 'testorg' },
      { username: 'hemsoftuser', org: 'hemsoft' },
    ]
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('quota-card-testuser')).toBeTruthy()
    expect(screen.queryByTestId('quota-card-hemsoftuser')).toBeNull()
  })
})
