import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrgBudgetsSection } from './OrgBudgetsSection'
import type { OrgBudgetState } from './types'

describe('OrgBudgetsSection', () => {
  it('renders nothing when no orgs', () => {
    const { container } = render(
      <OrgBudgetsSection uniqueOrgs={new Map()} orgBudgets={{}} orgOverageFromQuotas={new Map()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders org heading and cards', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: 500,
          preventFurtherUsage: false,
          spent: 125,
          spentUnavailable: false,
          useQuotaOverage: false,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(screen.getByText('Org Budgets')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
  })

  it('shows error for org without enhanced billing', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: null,
        loading: false,
        error: 'enhanced billing not enabled',
      },
    }

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(screen.getByText('Not on enhanced billing')).toBeInTheDocument()
  })

  it('shows generic error for other errors', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: null,
        loading: false,
        error: 'Network timeout',
      },
    }

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows stop-at-limit badge when preventFurtherUsage is true', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: 500,
          preventFurtherUsage: true,
          spent: 500,
          spentUnavailable: false,
          useQuotaOverage: false,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(screen.getByText('Stop at limit')).toBeInTheDocument()
  })

  it('displays "no budget set" when budget is null', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: null,
          preventFurtherUsage: false,
          spent: 50,
          spentUnavailable: false,
          useQuotaOverage: false,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(screen.getByText('no budget set')).toBeInTheDocument()
  })

  it('shows "overage" and "from quota" for useQuotaOverage mode', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: null,
          preventFurtherUsage: false,
          spent: 0,
          spentUnavailable: false,
          useQuotaOverage: true,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: false,
        error: null,
      },
    }
    const quotaOverage = new Map([['acme', 15.5]])

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={quotaOverage}
      />
    )

    expect(screen.getByText(/overage/)).toBeInTheDocument()
    expect(screen.getByText('from quota')).toBeInTheDocument()
  })

  it('shows "mine" label when not in useQuotaOverage mode and quotaOverage > 0', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: 500,
          preventFurtherUsage: false,
          spent: 100,
          spentUnavailable: false,
          useQuotaOverage: false,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: false,
        error: null,
      },
    }
    const quotaOverage = new Map([['acme', 25]])

    render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={quotaOverage}
      />
    )

    expect(screen.getByText(/mine/)).toBeInTheDocument()
  })

  it('renders loading spinner for org still loading', () => {
    const uniqueOrgs = new Map([['acme', 'alice']])
    const orgBudgets: Record<string, OrgBudgetState> = {
      acme: {
        data: {
          org: 'acme',
          budgetAmount: 500,
          preventFurtherUsage: false,
          spent: 100,
          spentUnavailable: false,
          useQuotaOverage: false,
          billingMonth: 6,
          billingYear: 2024,
          fetchedAt: Date.now(),
        },
        loading: true,
        error: null,
      },
    }

    const { container } = render(
      <OrgBudgetsSection
        uniqueOrgs={uniqueOrgs}
        orgBudgets={orgBudgets}
        orgOverageFromQuotas={new Map()}
      />
    )

    expect(container.querySelector('.spin')).toBeInTheDocument()
  })
})
