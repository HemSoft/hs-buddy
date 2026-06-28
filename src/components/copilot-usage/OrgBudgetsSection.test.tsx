import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrgBudgetSummary, OrgBudgetsSection } from './OrgBudgetsSection'
import type { OrgBudgetState } from './types'

vi.mock('../../utils/dateUtils', () => ({
  formatTime: (ts: number) => `time:${ts}`,
}))

type OrgBudgetData = NonNullable<OrgBudgetState['data']>

function makeOrgBudgetData(overrides: Partial<OrgBudgetData> = {}): OrgBudgetData {
  return {
    org: 'acme',
    budgetAmount: 100,
    spent: 42,
    gross: 0,
    spentUnavailable: false,
    useQuotaOverage: false,
    preventFurtherUsage: false,
    billingYear: 2026,
    billingMonth: 4,
    fetchedAt: 1700000000000,
    ...overrides,
  }
}

function makeMalformedOrgBudgetData(overrides: Record<string, unknown>): OrgBudgetData {
  return { ...makeOrgBudgetData(), ...overrides } as OrgBudgetData
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
      acme: { data: makeOrgBudgetData(), loading: false, error: null },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText(/spent/)).toBeInTheDocument()
  })

  it('shows loading spinner', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: makeOrgBudgetData(), loading: true, error: null },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByLabelText('Loading org budget')).toBeInTheDocument()
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
        data: makeOrgBudgetData({ preventFurtherUsage: true }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('Stop at limit')).toBeInTheDocument()
  })

  it('shows loading and stop-at-limit badges together', () => {
    const orgs = new Map([['acme', 'acme-token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ preventFurtherUsage: true }),
        loading: true,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    expect(screen.getByLabelText('Loading org budget')).toBeInTheDocument()
    expect(screen.getByText('Stop at limit')).toBeInTheDocument()
  })

  it('shows "no budget set" when budget amount is null', () => {
    const orgs = new Map([['unknown-org', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      'unknown-org': {
        data: makeOrgBudgetData({ budgetAmount: null }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('no budget set')).toBeInTheDocument()
  })

  it('hides the budget progress bar when no budget is set', () => {
    const orgs = new Map([['unknown-org', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      'unknown-org': {
        data: makeOrgBudgetData({ budgetAmount: null }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    expect(screen.queryByRole('progressbar', { name: 'Budget usage' })).not.toBeInTheDocument()
  })

  it('shows overage when useQuotaOverage is true', () => {
    const orgs = new Map([['acme', 'token']])
    const overages = new Map([['acme', 25]])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ useQuotaOverage: true }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={overages} />
    )
    expect(screen.getByText(/overage/)).toBeInTheDocument()
  })

  it('shows spend unavailable when spent is null', () => {
    const orgs = new Map([['acme', 'token']])
    const overages = new Map([['acme', 0]])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ useQuotaOverage: false, spent: null }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={overages} />
    )
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.getByText('Spend unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/\$0\.00 spent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/overage/i)).not.toBeInTheDocument()
  })

  it('treats non-finite spend as unavailable', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ spent: Number.NaN }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    expect(screen.getByText('Spend unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Month-End Projection')).not.toBeInTheDocument()
  })

  it('does not project when spend is not numeric', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeMalformedOrgBudgetData({ spent: '42' }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    expect(screen.getByText('Spend unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Month-End Projection')).not.toBeInTheDocument()
  })

  it('renders zero-width budget progress when spend and share are zero', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ spent: 0, budgetAmount: 100 }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    const progress = screen.getByRole('progressbar', { name: 'Budget usage' })
    expect(progress).toHaveAttribute('value', '0')
    expect(progress).toHaveAttribute('max', '100')
  })

  it('shows gross consumption when gross spend is positive and budget is not quota-backed', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData({ gross: 120.5, useQuotaOverage: false }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )

    expect(screen.getByText('$120.50 consumed')).toBeInTheDocument()
  })

  it('renders loading and stop-at-limit badges in the compact org budget summary', () => {
    const state: OrgBudgetState = {
      data: makeOrgBudgetData({ preventFurtherUsage: true }),
      loading: true,
      error: null,
    }

    render(<OrgBudgetSummary state={state} quotaOverage={0} />)

    expect(screen.getByLabelText('Loading org budget summary')).toBeInTheDocument()
    expect(screen.getByText('Stop at limit')).toBeInTheDocument()
  })

  it('shows "no budget set" for hemsoft org when budget amount is null', () => {
    const orgs = new Map([['Hemsoft', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      Hemsoft: {
        data: makeOrgBudgetData({ budgetAmount: null }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('no budget set')).toBeInTheDocument()
  })

  it('skips the lowercase hemsoft org entirely', () => {
    const orgs = new Map([
      ['acme', 'token'],
      ['hemsoft', 'token'],
    ])
    const budgets: Record<string, OrgBudgetState> = {
      acme: { data: makeOrgBudgetData(), loading: false, error: null },
      hemsoft: {
        data: makeOrgBudgetData(),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={new Map()} />
    )
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.queryByText('hemsoft')).toBeNull()
  })

  it('renders billing period', () => {
    const orgs = new Map([['acme', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      acme: {
        data: makeOrgBudgetData(),
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
        }),
        loading: false,
        error: null,
      },
    }

    render(
      <OrgBudgetsSection uniqueOrgs={orgs} orgBudgets={budgets} orgOverageFromQuotas={overages} />
    )
    expect(screen.getByText(/mine/)).toBeInTheDocument()
    expect(screen.getByTitle('My share: $15.00')).toBeInTheDocument()
  })

  it('shows "from quota" when useQuotaOverage is true and no budget is set', () => {
    const orgs = new Map([['unknown-org', 'token']])
    const budgets: Record<string, OrgBudgetState> = {
      'unknown-org': {
        data: makeOrgBudgetData({
          useQuotaOverage: true,
          budgetAmount: null,
        }),
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
        data: makeOrgBudgetData(),
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

  describe('budget projection', () => {
    // Mid-April 2026 fetchedAt so it falls within the billing period
    const midApril2026 = Date.UTC(2026, 3, 15, 12, 0, 0) // Apr 15, 2026 12:00 UTC

    it('renders projection when spend data and valid billing period exist', () => {
      const orgs = new Map([['acme', 'token']])
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 300,
            budgetAmount: 1000,
            fetchedAt: midApril2026,
            spentUnavailable: false,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.getByText('Month-End Projection')).toBeInTheDocument()
      expect(screen.getByText('Projected')).toBeInTheDocument()
      expect(screen.getByText('Per Day')).toBeInTheDocument()
    })

    it('does not render projection when useQuotaOverage is true', () => {
      const orgs = new Map([['acme', 'token']])
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 300,
            useQuotaOverage: true,
            fetchedAt: midApril2026,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.queryByText('Month-End Projection')).not.toBeInTheDocument()
    })

    it('does not render projection when spentUnavailable is true', () => {
      const orgs = new Map([['acme', 'token']])
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 300,
            spentUnavailable: true,
            fetchedAt: midApril2026,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.queryByText('Month-End Projection')).not.toBeInTheDocument()
    })

    it('does not render projection when fetchedAt is outside billing period', () => {
      const orgs = new Map([['acme', 'token']])
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 300,
            fetchedAt: 1700000000000, // Nov 2023 — outside Apr 2026
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.queryByText('Month-End Projection')).not.toBeInTheDocument()
    })

    it('shows "Over Budget" when projected spend exceeds budget', () => {
      const orgs = new Map([['acme', 'token']])
      // 5 days in, already $500 spent on a $1000 budget → projects to ~$3000
      const fiveDaysIn = Date.UTC(2026, 3, 6, 0, 0, 0) // Apr 6
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 500,
            budgetAmount: 1000,
            fetchedAt: fiveDaysIn,
            spentUnavailable: false,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.getByText('Over Budget')).toBeInTheDocument()
    })

    it('does not show "Over Budget" when projected spend is within budget', () => {
      const orgs = new Map([['acme', 'token']])
      // 25 days in, $10 spent on a $1000 budget → projects to ~$12
      const latePeriod = Date.UTC(2026, 3, 26, 0, 0, 0) // Apr 26
      const budgets: Record<string, OrgBudgetState> = {
        acme: {
          data: makeOrgBudgetData({
            spent: 10,
            budgetAmount: 1000,
            fetchedAt: latePeriod,
            spentUnavailable: false,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.queryByText('Over Budget')).not.toBeInTheDocument()
    })

    it('does not show "Over Budget" when no budget is set', () => {
      const orgs = new Map([['unknown-org', 'token']])
      const budgets: Record<string, OrgBudgetState> = {
        'unknown-org': {
          data: makeOrgBudgetData({
            spent: 300,
            budgetAmount: null,
            fetchedAt: midApril2026,
            spentUnavailable: false,
          }),
          loading: false,
          error: null,
        },
      }

      render(
        <OrgBudgetsSection
          uniqueOrgs={orgs}
          orgBudgets={budgets}
          orgOverageFromQuotas={new Map()}
        />
      )
      expect(screen.getByText('Month-End Projection')).toBeInTheDocument()
      expect(screen.queryByText('Over Budget')).not.toBeInTheDocument()
    })
  })
})
