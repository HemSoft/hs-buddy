import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountQuotaCard } from './AccountQuotaCard'
import type { AccountQuotaState, QuotaData } from './quotaUtils'
import type { GitHubAccount } from '../../types/config'

// Mock UsageRing to simplify rendering
vi.mock('./UsageRing', () => ({
  UsageRing: ({ percentUsed }: { percentUsed: number }) => (
    <div data-testid="usage-ring">{percentUsed}%</div>
  ),
}))

// Mock window.shell for external link
beforeEach(() => {
  window.shell = { openExternal: vi.fn() } as never
})

const account: GitHubAccount = { username: 'alice', org: 'acme' }

function makeQuotaData(overrides: Partial<QuotaData> = {}): QuotaData {
  return {
    login: 'alice',
    copilot_plan: 'individual',
    quota_reset_date: '2024-07-01',
    quota_reset_date_utc: '2024-07-01T00:00:00Z',
    organization_login_list: [],
    quota_snapshots: {
      chat: {
        entitlement: 1000,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 100,
        quota_id: 'chat',
        quota_remaining: 1000,
        remaining: 1000,
        unlimited: false,
        timestamp_utc: '2024-06-20T00:00:00Z',
      },
      completions: {
        entitlement: 5000,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 100,
        quota_id: 'completions',
        quota_remaining: 5000,
        remaining: 5000,
        unlimited: false,
        timestamp_utc: '2024-06-20T00:00:00Z',
      },
      premium_interactions: {
        entitlement: 300,
        overage_count: 0,
        overage_permitted: true,
        percent_remaining: 50,
        quota_id: 'premium',
        quota_remaining: 150,
        remaining: 150,
        unlimited: false,
        timestamp_utc: '2024-06-20T00:00:00Z',
      },
    },
    ...overrides,
  }
}

describe('AccountQuotaCard', () => {
  it('shows loading state when no data', () => {
    const state: AccountQuotaState = { data: null, loading: true, error: null, fetchedAt: null }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows error state when no data', () => {
    const state: AccountQuotaState = {
      data: null,
      loading: false,
      error: 'Network error',
      fetchedAt: null,
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
  })

  it('shows "No Copilot subscription" for 404 errors', () => {
    const state: AccountQuotaState = {
      data: null,
      loading: false,
      error: '404 Not Found',
      fetchedAt: null,
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('No Copilot subscription')).toBeInTheDocument()
  })

  it('renders quota data with usage ring', () => {
    const data = makeQuotaData()
    const state: AccountQuotaState = {
      data,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByTestId('usage-ring')).toHaveTextContent('50%')
    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('Entitlement')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument() // Entitlement total
  })

  it('shows overage cost when overage exists', () => {
    const data = makeQuotaData()
    data.quota_snapshots.premium_interactions.remaining = -10
    data.quota_snapshots.premium_interactions.overage_count = 10
    const state: AccountQuotaState = {
      data,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('Overage Cost')).toBeInTheDocument()
  })

  it('shows enterprise plan icon', () => {
    const data = makeQuotaData({ copilot_plan: 'enterprise' })
    const state: AccountQuotaState = {
      data,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('shows organization list when present', () => {
    const data = makeQuotaData({ organization_login_list: ['acme', 'globex'] })
    const state: AccountQuotaState = {
      data,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    }
    render(<AccountQuotaCard account={account} state={state} />)

    expect(screen.getByText('acme, globex')).toBeInTheDocument()
  })

  it('hides organization list when empty', () => {
    const data = makeQuotaData({ organization_login_list: [] })
    const state: AccountQuotaState = {
      data,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    }
    const { container } = render(<AccountQuotaCard account={account} state={state} />)

    expect(container.querySelector('.usage-account-orgs')).not.toBeInTheDocument()
  })

  it('shows spinner in header during refresh with existing data', () => {
    const data = makeQuotaData()
    const state: AccountQuotaState = {
      data,
      loading: true,
      error: null,
      fetchedAt: Date.now(),
    }
    const { container } = render(<AccountQuotaCard account={account} state={state} />)

    // Should still show data (not loading placeholder)
    expect(screen.getByText('alice')).toBeInTheDocument()
    // Should have a spinner in the header
    expect(container.querySelector('.spin')).toBeInTheDocument()
  })
})
