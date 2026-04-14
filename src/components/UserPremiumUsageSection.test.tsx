import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserPremiumUsageSection } from './UserPremiumUsageSection'

/* ── module-level mock fns ── */
const mockGetCopilotQuota = vi.fn()
const mockGetCopilotMemberUsage = vi.fn()
const mockGetUserPremiumRequests = vi.fn()
const mockAccounts: Array<{ username: string; token: string; org: string }> = []

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('./copilot-usage/quotaUtils', () => ({
  OVERAGE_COST_PER_REQUEST: 0.04,
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
  computeProjection: () => null,
  getQuotaColor: () => '#4ec9b0',
}))

vi.mock('../utils/copilotFormatUtils', () => ({
  daysUntilReset: () => 15,
  formatCopilotPlan: (plan: string | null) => plan ?? 'Unknown',
  formatResetDate: () => 'Feb 15',
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 days ago',
  DAY: 86400000,
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
}))

vi.mock('./UserPremiumUsageSection.css', () => ({}))

/* ── helpers ── */

function setConfiguredAccounts(...usernames: string[]) {
  mockAccounts.length = 0
  usernames.forEach(u => mockAccounts.push({ username: u, token: 'tok', org: 'testorg' }))
}

function makeQuotaSnapshot(entitlement: number, remaining: number, overage = 0) {
  return {
    entitlement,
    overage_count: overage,
    overage_permitted: true,
    percent_remaining: entitlement > 0 ? (remaining / entitlement) * 100 : 0,
    quota_id: 'test-quota',
    quota_remaining: remaining,
    remaining,
    unlimited: false,
    timestamp_utc: '2024-01-15T00:00:00Z',
  }
}

function makeQuotaData(username: string, entitlement = 1000, remaining = 700) {
  return {
    login: username,
    copilot_plan: 'business',
    quota_reset_date: '2024-02-15',
    quota_reset_date_utc: '2024-02-15T00:00:00Z',
    organization_login_list: ['testorg'],
    quota_snapshots: {
      chat: makeQuotaSnapshot(100, 80),
      completions: makeQuotaSnapshot(100, 90),
      premium_interactions: makeQuotaSnapshot(entitlement, remaining),
    },
  }
}

function makeSeatData(login: string) {
  return {
    login,
    planType: 'business',
    lastActivityAt: '2024-01-10T10:00:00Z',
    lastActivityEditor: 'vscode/1.85',
    createdAt: '2023-06-01T00:00:00Z',
    pendingCancellation: null,
  }
}

function makePremiumResponse(
  overrides?: Partial<{
    userMonthlyRequests: number
    userTodayRequests: number
    userMonthlyModels: Array<{ model: string; requests: number }>
    orgMonthlyRequests: number
    orgMonthlyNetCost: number
  }>
) {
  return {
    success: true,
    data: {
      memberLogin: 'user',
      org: 'testorg',
      userMonthlyRequests: 250,
      userTodayRequests: 15,
      userMonthlyModels: [
        { model: 'gpt-4o', requests: 150 },
        { model: 'claude-3.5', requests: 100 },
      ],
      orgMonthlyRequests: 5000,
      orgMonthlyNetCost: 200,
      billingYear: 2024,
      billingMonth: 1,
      ...overrides,
    },
  }
}

/* ── tests ── */

describe('UserPremiumUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setConfiguredAccounts('testuser')
    ;(window as never as Record<string, unknown>).github = {
      getCopilotQuota: mockGetCopilotQuota,
      getCopilotMemberUsage: mockGetCopilotMemberUsage,
      getUserPremiumRequests: mockGetUserPremiumRequests,
    }

    mockGetCopilotQuota.mockResolvedValue({ success: true, data: null })
    mockGetCopilotMemberUsage.mockResolvedValue({ success: true, data: null })
    mockGetUserPremiumRequests.mockResolvedValue({ success: false })
  })

  it('shows "No Copilot seat assigned" when user has no seat', async () => {
    render(<UserPremiumUsageSection username="noseatuser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('No Copilot seat assigned')).toBeInTheDocument()
    })
  })

  it('shows loading state while fetching quota data', () => {
    setConfiguredAccounts('loadinguser')
    mockGetCopilotQuota.mockReturnValue(new Promise(() => {}))
    mockGetUserPremiumRequests.mockReturnValue(new Promise(() => {}))

    render(<UserPremiumUsageSection username="loadinguser" org="testorg" />)

    expect(screen.getByText('Loading premium usage…')).toBeInTheDocument()
  })

  it('renders quota data with usage bar and request counts', async () => {
    setConfiguredAccounts('quotauser')
    const data = makeQuotaData('quotauser', 1000, 700)
    mockGetCopilotQuota.mockResolvedValue({ success: true, data })

    render(<UserPremiumUsageSection username="quotauser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('30.0%')).toBeInTheDocument()
    })
    expect(screen.getByText('used')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
    expect(screen.getByText('700')).toBeInTheDocument()
    expect(screen.getByText(/Resets Feb 15/)).toBeInTheDocument()
    expect(screen.getByText('(15d)')).toBeInTheDocument()
  })

  it('shows error state on quota fetch failure', async () => {
    setConfiguredAccounts('erroruser')
    mockGetCopilotQuota.mockReset()
    mockGetCopilotQuota.mockRejectedValue(new Error('Network error'))

    render(<UserPremiumUsageSection username="erroruser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load premium usage')).toBeInTheDocument()
    })
  })

  it('shows seat information with plan type and last activity', async () => {
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: true,
      data: makeSeatData('seatinfouser'),
    })

    render(<UserPremiumUsageSection username="seatinfouser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('business')).toBeInTheDocument()
    })
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
    expect(screen.getByText('vscode')).toBeInTheDocument()
  })

  it('shows premium usage data with monthly and today requests', async () => {
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: true,
      data: makeSeatData('premuser'),
    })
    mockGetUserPremiumRequests.mockResolvedValue(makePremiumResponse())

    render(<UserPremiumUsageSection username="premuser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('250')).toBeInTheDocument()
    })
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('this month')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
  })

  it('refresh button triggers new data fetch', async () => {
    setConfiguredAccounts('refreshuser')
    const data = makeQuotaData('refreshuser')
    mockGetCopilotQuota.mockResolvedValue({ success: true, data })

    render(<UserPremiumUsageSection username="refreshuser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('30.0%')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      expect(mockGetCopilotQuota).toHaveBeenCalledTimes(2)
    })
  })

  it('shows model breakdown when premium data has models', async () => {
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: true,
      data: makeSeatData('modeluser'),
    })
    mockGetUserPremiumRequests.mockResolvedValue(makePremiumResponse())

    render(<UserPremiumUsageSection username="modeluser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    })
    expect(screen.getByText('claude-3.5')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('shows org total footer when premium data has org requests', async () => {
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: true,
      data: makeSeatData('orgfootuser'),
    })
    mockGetUserPremiumRequests.mockResolvedValue(makePremiumResponse())

    render(<UserPremiumUsageSection username="orgfootuser" org="testorg" />)

    await waitFor(() => {
      expect(screen.getByText(/Org total:/)).toBeInTheDocument()
    })
    expect(screen.getByText('5,000')).toBeInTheDocument()
  })
})
