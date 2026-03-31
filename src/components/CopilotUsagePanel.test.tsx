import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopilotUsagePanel } from './CopilotUsagePanel'

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    accounts: [{ username: 'testuser', org: 'testorg' }],
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
    aggregateProjections: { projectedTotal: 200, projectedOverageCost: 0 },
    orgOverageFromQuotas: {},
  }),
}))

vi.mock('./copilot-usage/AccountQuotaCard', () => ({
  AccountQuotaCard: ({ account }: { account: { username: string } }) => (
    <div data-testid={`quota-card-${account.username}`}>Quota: {account.username}</div>
  ),
}))

vi.mock('./copilot-usage/OrgBudgetsSection', () => ({
  OrgBudgetsSection: () => <div data-testid="org-budgets">Org Budgets</div>,
}))

vi.mock('./copilot-usage/UsageHeader', () => ({
  UsageHeader: ({ totalUsed }: { totalUsed: number }) => (
    <div data-testid="usage-header">Total: {totalUsed}</div>
  ),
}))

describe('CopilotUsagePanel', () => {
  it('renders usage header', () => {
    render(<CopilotUsagePanel />)
    expect(screen.getByTestId('usage-header')).toBeTruthy()
    expect(screen.getByText('Total: 100')).toBeTruthy()
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
