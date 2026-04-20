import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrgBudgetsSection } from './OrgBudgetsSection'
import type { OrgBudgetState } from './types'

vi.mock('../../utils/dateUtils', () => ({
  formatTime: (ts: number) => `time:${ts}`,
}))

function makeOrgBudgetData(overrides: Record<string, unknown> = {}) {
  return {
    budgetAmount: 100,
    spent: 42,
    useQuotaOverage: false,
    preventFurtherUsage: false,
    billingYear: 2026,
    billingMonth: 4,
    fetchedAt: 1700000000000,
    ...overrides,
  }
}

describe('OrgBudgetsSection', () => {
  it('returns null when uniqueOrgs is empty', () => {
    const { container } = render(
      <OrgBudgetsSection uniqueOrgs={new Map()} orgBudgets={{}} orgOverageFromQuotas={new Map()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the section heading', () => {
    const orgs = new Map([['acme', 'acme-token']])
    render(<OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={{}} orgOverageFromQuotas={new Map()} />)
    expect(screen.getByText('Org Budgets')).toBeInTheDocument()
  })

  it('renders org name', () => {
    const orgs = new Map([['acme', 'acme-token']])
    render(<OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={{}} orgOverageFromQuotas={new Map()} />)
    expect(screen.getByText('acme')).toBeInTheDocument()
  })

  it('renders budget data with spent amount', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: makeOrgBudgetData() as OrgBudgetState['data'], loading: false, error: null },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText(/spent/)).toBeInTheDocument()
  })

  it('shows loading spinner', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: makeOrgBudgetData() as OrgBudgetState['data'], loading: true, error: null },
    }

    const { container } = render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(container.querySelector('.spin')).toBeTruthy()
  })

  it('shows "Not on enhanced billing" for enhanced billing errors', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: null, loading: false, error: 'No enhanced billing available' },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('Not on enhanced billing')).toBeInTheDocument()
  })

  it('shows "Failed to load" for generic errors', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: null, loading: false, error: 'Network timeout' },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows "Stop at limit" badge when preventFurtherUsage is true', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ preventFurtherUsage: true }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('Stop at limit')).toBeInTheDocument()
  })

  it('shows "no budget set" when budget amount is null and org is not in PERSONAL_BUDGETS', () => {
    const orgs = new Map([['unknown-org', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      'unknown-org': {
        data: makeOrgBudgetData({ budgetAmount: null }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('no budget set')).toBeInTheDocument()
  })

  it('shows overage when useQuotaOverage is true', () => {
    const orgs = new Map([['acme', 'token']])
    const overages = new Map([['acme', 25]])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ useQuotaOverage: true }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={overages} />
    )
    expect(screen.getByText(/overage/)).toBeInTheDocument()
  })

  it('uses PERSONAL_BUDGETS fallback for hemsoft org', () => {
    const orgs = new Map([['Hemsoft', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      Hemsoft: {
        data: makeOrgBudgetData({ budgetAmount: null }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    // Should not show "no budget set" since hemsoft has a personal budget of $50
    expect(screen.queryByText('no budget set')).not.toBeInTheDocument()
  })

  it('renders billing period', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData() as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    // April 2026 should be rendered in some locale format
    const el = screen.getByText(/2026/)
    expect(el).toBeInTheDocument()
  })

  it('shows my-share bar and label when quota overage exists with useQuotaOverage false', () => {
    const orgs = new Map([['acme', 'token']])
    const overages = new Map([['acme', 15]])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({
          useQuotaOverage: false,
          budgetAmount: 100,
        }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={overages} />
    )
    expect(screen.getByText(/mine/)).toBeInTheDocument()
    expect(document.querySelector('.usage-budget-bar-myshare')).toBeTruthy()
  })

  it('shows "from quota" when useQuotaOverage is true and no budget is set', () => {
    const orgs = new Map([['unknown-org', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      'unknown-org': {
        data: makeOrgBudgetData({
          useQuotaOverage: true,
          budgetAmount: null,
        }) as OrgBudgetState['data'],
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('from quota')).toBeInTheDocument()
  })

  it('hides error message when data is present even if error is set', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData() as OrgBudgetState['data'],
        loading: false,
        error: 'Some error',
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.queryByText('Failed to load')).not.toBeInTheDocument()
    expect(screen.getByText(/spent/)).toBeInTheDocument()
  })
})
