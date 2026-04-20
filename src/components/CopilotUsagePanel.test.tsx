import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopilotUsagePanel } from './CopilotUsagePanel'

let mockAccounts: Array<{ username: string; org?: string }> = [
  { username: 'testuser', org: 'testorg' },
]
let mockAggregateProjections: { projectedTotal: number; projectedOverageCost: number } | null = {
  projectedTotal: 200,
  projectedOverageCost: 0,
}

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
    orgBudgets: {},
    uniqueOrgs: ['testorg'],
    refreshAll: vi.fn(),
    anyLoading: false,
    aggregateTotals: { totalUsed: 100, totalOverageCost: 0 },
    aggregateProjections: mockAggregateProjections,
    orgOverageFromQuotas: {},
  }),
}))

vi.mock('./copilot-usage/AccountQuotaCard', () => ({
  AccountQuotaCard: ({ account }: { account: { username: string; org: string } }) => (
    <div data-testid={`quota-card-${account.username}`}>
      Quota: {account.username} org={account.org}
    </div>
  ),
}))

vi.mock('./copilot-usage/OrgBudgetsSection', () => ({
  OrgBudgetsSection: () => <div data-testid="org-budgets">Org Budgets</div>,
}))

vi.mock('./copilot-usage/UsageHeader', () => ({
  UsageHeader: ({
    totalUsed,
    projectedTotal,
  }: {
    totalUsed: number
    projectedTotal: number | null
  }) => (
    <div data-testid="usage-header">
      Total: {totalUsed} Projected: {projectedTotal === null ? 'null' : projectedTotal}
    </div>
  ),
}))

describe('CopilotUsagePanel', () => {
  beforeEach(() => {
    mockAccounts = [{ username: 'testuser', org: 'testorg' }]
    mockAggregateProjections = { projectedTotal: 200, projectedOverageCost: 0 }
  })

  it('renders usage header', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('usage-header')).toBeTruthy()
    expect(screen.getByText(/Total: 100/)).toBeTruthy()
  })

  it('renders account quota cards', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('quota-card-testuser')).toBeTruthy()
  })

  it('renders org budgets section', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('org-budgets')).toBeTruthy()
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

describe('CopilotUsagePanel – undefined org fallback', () => {
  it('falls back to empty string when account.org is undefined', () => {
    mockAggregateProjections = { projectedTotal: 200, projectedOverageCost: 0 }
    mockAccounts = [{ username: 'noorguser' }]
    render(<CopilotUsagePanel />)
    expect(screen.getByText(/org=/)).toBeTruthy()
  })
})
