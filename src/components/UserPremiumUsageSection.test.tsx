import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/* ── hoisted mocks ── */
vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [
      { username: 'alice', org: 'test-org' },
      { username: 'bob', org: 'other-org' },
    ],
    loading: false,
  }),
}))

vi.mock('./copilot-usage/quotaUtils', () => ({
  OVERAGE_COST_PER_REQUEST: 0.04,
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  computeProjection: vi.fn().mockReturnValue(null),
  getQuotaColor: () => '#4caf50',
}))

vi.mock('../utils/copilotFormatUtils', () => ({
  daysUntilReset: () => 15,
  formatCopilotPlan: (plan: string | null) =>
    plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free',
  formatResetDate: () => 'Jan 30',
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '2 hours ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (err: unknown) => String(err),
}))

const mockGetCopilotQuota = vi.fn()
const mockGetCopilotMemberUsage = vi.fn()
const mockGetUserPremiumRequests = vi.fn()

import { UserPremiumUsageSection, _resetCaches } from './UserPremiumUsageSection'
import { computeProjection } from './copilot-usage/quotaUtils'

beforeEach(() => {
  _resetCaches()
})

describe('UserPremiumUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(computeProjection).mockReturnValue(null)
    Object.defineProperty(window, 'github', {
      value: {
        getCopilotQuota: mockGetCopilotQuota,
        getCopilotMemberUsage: mockGetCopilotMemberUsage,
        getUserPremiumRequests: mockGetUserPremiumRequests,
      },
      writable: true,
      configurable: true,
    })

    // Default: premium requests return empty
    mockGetUserPremiumRequests.mockResolvedValue({
      success: true,
      data: {
        userMonthlyRequests: 150,
        userTodayRequests: 10,
        userMonthlyModels: [
          { model: 'gpt-4', requests: 100 },
          { model: 'claude-3', requests: 50 },
        ],
        orgMonthlyRequests: 500,
        orgMonthlyNetCost: 20.0,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('when user is a configured account (QuotaView)', () => {
    it('shows loading state initially', () => {
      mockGetCopilotQuota.mockReturnValue(new Promise(() => {}))
      render(<UserPremiumUsageSection username="alice" org="test-org" />)
      expect(screen.getByText('Loading premium usage…')).toBeInTheDocument()
    })

    it('shows error state on failure', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: false,
        error: 'Request failed',
      })
      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load premium usage')).toBeInTheDocument()
      })
    })

    it('shows "No Copilot subscription" on 404 error', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: false,
        error: '404 Not Found',
      })
      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('No Copilot subscription')).toBeInTheDocument()
      })
    })

    it('renders quota data with usage stats', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('40.0%')).toBeInTheDocument()
        expect(screen.getByText('used')).toBeInTheDocument()
      })
    })

    it('shows used / remaining / entitlement stats', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('400')).toBeInTheDocument() // Used
        expect(screen.getByText('600')).toBeInTheDocument() // Remaining
        expect(screen.getByText('1,000')).toBeInTheDocument() // Entitlement
      })
    })

    it('shows reset date', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText(/Resets Jan 30/)).toBeInTheDocument()
        expect(screen.getByText('(15d)')).toBeInTheDocument()
      })
    })

    it('shows overage cost when over budget', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: -50,
              overage_count: 50,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('$2.00')).toBeInTheDocument() // 50 * 0.04
        expect(screen.getByText('Overage')).toBeInTheDocument()
      })
    })

    it('shows model breakdown when premium data loads', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('gpt-4')).toBeInTheDocument()
        expect(screen.getByText('100')).toBeInTheDocument()
      })
    })

    it('shows org footer with total requests', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('500')).toBeInTheDocument() // org total
        expect(screen.getByText(/Org total/)).toBeInTheDocument()
      })
    })

    it('refresh button triggers new fetch', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              entitlement: 1000,
              remaining: 600,
              overage_count: 0,
            },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByTitle('Refresh')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Refresh'))
      // Second call to getCopilotQuota
      expect(mockGetCopilotQuota).toHaveBeenCalledTimes(2)
    })

    it('renders projection section when computeProjection returns data', async () => {
      vi.mocked(computeProjection).mockReturnValue({
        projectedTotal: 800,
        projectedOverage: 0,
        projectedOverageCost: 0,
        projectedPercent: 80,
        dailyRate: 27,
      })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Projected:')).toBeInTheDocument()
        expect(screen.getByText('800')).toBeInTheDocument()
        expect(screen.getByText('27/day')).toBeInTheDocument()
      })
      // Projection bar should render (projectedPercent 80 > percentUsed 40)
      expect(document.querySelector('.ud-premium-bar-projected')).toBeInTheDocument()
    })

    it('renders projection overage when projectedOverage > 0', async () => {
      vi.mocked(computeProjection).mockReturnValue({
        projectedTotal: 1200,
        projectedOverage: 200,
        projectedOverageCost: 8.0,
        projectedPercent: 120,
        dailyRate: 40,
      })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('$8.00 est. overage')).toBeInTheDocument()
      })
    })

    it('does not render projection bar when projectedPercent <= percentUsed', async () => {
      vi.mocked(computeProjection).mockReturnValue({
        projectedTotal: 300,
        projectedOverage: 0,
        projectedOverageCost: 0,
        projectedPercent: 30,
        dailyRate: 10,
      })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Projected:')).toBeInTheDocument()
      })
      expect(document.querySelector('.ud-premium-bar-projected')).not.toBeInTheDocument()
    })

    it('handles entitlement of 0 (percentUsed = 0)', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 0, remaining: 0, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('0.0%')).toBeInTheDocument()
      })
    })

    it('computes overage from negative remaining when overage_count is null', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: -30, overage_count: null },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('$1.20')).toBeInTheDocument() // 30 * 0.04
        expect(screen.getByText('Overage')).toBeInTheDocument()
      })
    })

    it('handles getCopilotQuota rejection (catch path)', async () => {
      mockGetCopilotQuota.mockRejectedValue(new Error('Network error'))

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load premium usage')).toBeInTheDocument()
      })
    })

    it('hides org footer net cost when orgMonthlyNetCost is 0', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 100,
          userTodayRequests: 5,
          userMonthlyModels: [{ model: 'gpt-4', requests: 100 }],
          orgMonthlyRequests: 300,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText(/Org total/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/net cost/)).not.toBeInTheDocument()
    })

    it('hides model breakdown and org footer when premium data is null', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({ success: true, data: null })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('40.0%')).toBeInTheDocument()
      })
      expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()
      expect(screen.queryByText(/Org total/)).not.toBeInTheDocument()
    })

    it('returns null content when data lacks premium_interactions', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {},
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.queryByText('Loading premium usage…')).not.toBeInTheDocument()
      })
      expect(document.querySelector('.ud-premium-header')).not.toBeInTheDocument()
      expect(document.querySelector('.ud-premium-bar-track')).not.toBeInTheDocument()
    })

    it('uses cached premium data on re-render', async () => {
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      const { unmount } = render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('gpt-4')).toBeInTheDocument()
      })
      expect(mockGetUserPremiumRequests).toHaveBeenCalledTimes(1)

      unmount()
      mockGetUserPremiumRequests.mockClear()
      mockGetCopilotQuota.mockClear()

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('gpt-4')).toBeInTheDocument()
      })
      // Premium data should come from cache
      expect(mockGetUserPremiumRequests).not.toHaveBeenCalled()
    })

    it('model pct is 0 when userMonthlyRequests is 0 with models present', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 0,
          userTodayRequests: 0,
          userMonthlyModels: [{ model: 'gpt-4', requests: 0 }],
          orgMonthlyRequests: 100,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotQuota.mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
          },
          quota_reset_date_utc: '2025-01-30T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="alice" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('gpt-4')).toBeInTheDocument()
      })
      // Model fill bar should have 0% width
      const fill = document.querySelector('.ud-prem-model-fill') as HTMLElement
      expect(fill.style.width).toBe('0%')
    })
  })

  describe('when user is not configured (SeatView)', () => {
    it('shows loading state for seat info', () => {
      mockGetCopilotMemberUsage.mockReturnValue(new Promise(() => {}))
      render(<UserPremiumUsageSection username="charlie" org="test-org" />)
      expect(screen.getByText('Loading Copilot seat info…')).toBeInTheDocument()
    })

    it('shows error on seat fetch failure', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: false,
        error: 'Server error',
      })
      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load seat data')).toBeInTheDocument()
      })
    })

    it('shows "Copilot billing not available" on 404', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: false,
        error: '404 Not Found',
      })
      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Copilot billing not available')).toBeInTheDocument()
      })
    })

    it('shows "No Copilot seat assigned" when data is null', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: null,
      })
      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('No Copilot seat assigned')).toBeInTheDocument()
      })
    })

    it('renders seat metadata when data loads', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: '2025-06-01T10:00:00Z',
          lastActivityEditor: 'vscode/1.90',
          createdAt: '2024-01-01T00:00:00Z',
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Business')).toBeInTheDocument()
        expect(screen.getByText('vscode')).toBeInTheDocument()
      })
    })

    it('shows pending cancellation warning', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: '2025-07-01T00:00:00Z',
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText(/Cancelling/)).toBeInTheDocument()
      })
    })

    it('shows hero stats from premium data', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument() // monthly
        expect(screen.getByText('10')).toBeInTheDocument() // today
        expect(screen.getByText('this month')).toBeInTheDocument()
        expect(screen.getByText('today')).toBeInTheDocument()
      })
    })

    it('refresh button in SeatView triggers refetch', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByTitle('Refresh')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Refresh'))
      expect(mockGetCopilotMemberUsage).toHaveBeenCalledTimes(2)
    })

    it('handles getCopilotMemberUsage rejection (catch path)', async () => {
      mockGetCopilotMemberUsage.mockRejectedValue(new Error('Network failure'))

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load seat data')).toBeInTheDocument()
      })
    })

    it('hides hero section when premium data is null', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({ success: true, data: null })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Business')).toBeInTheDocument()
      })
      expect(screen.queryByText('this month')).not.toBeInTheDocument()
      expect(screen.queryByText('today')).not.toBeInTheDocument()
      expect(screen.queryByText('of org')).not.toBeInTheDocument()
    })

    it('hides model breakdown when premium models are empty', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 50,
          userTodayRequests: 5,
          userMonthlyModels: [],
          orgMonthlyRequests: 200,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Business')).toBeInTheDocument()
      })
      expect(document.querySelector('.ud-prem-models')).not.toBeInTheDocument()
    })

    it('hides org footer when orgMonthlyRequests is 0', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 50,
          userTodayRequests: 5,
          userMonthlyModels: [],
          orgMonthlyRequests: 0,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Business')).toBeInTheDocument()
      })
      expect(screen.queryByText(/Org total/)).not.toBeInTheDocument()
    })

    it('shows org footer without net cost when orgMonthlyNetCost is 0', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 50,
          userTodayRequests: 5,
          userMonthlyModels: [],
          orgMonthlyRequests: 200,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText(/Org total/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/net cost/)).not.toBeInTheDocument()
    })

    it('computes orgPct as 0 when orgMonthlyRequests is 0', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 50,
          userTodayRequests: 5,
          userMonthlyModels: [],
          orgMonthlyRequests: 0,
          orgMonthlyNetCost: 0,
        },
      })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('0.0%')).toBeInTheDocument()
        expect(screen.getByText('of org')).toBeInTheDocument()
      })
    })

    it('passes undefined authUsername when org is not in accounts', async () => {
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'enterprise',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="unknown-org" />)

      await waitFor(() => {
        expect(screen.getByText('Enterprise')).toBeInTheDocument()
      })
      expect(mockGetCopilotMemberUsage).toHaveBeenCalledWith('unknown-org', 'charlie', undefined)
    })

    it('hides lastActivity and editor pills when null', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({ success: true, data: null })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'free',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('Free')).toBeInTheDocument()
      })
      expect(screen.queryByText(/ago/)).not.toBeInTheDocument()
      // No editor pill rendered
      const pills = document.querySelectorAll('.ud-prem-pill--muted')
      expect(pills.length).toBe(0)
    })

    it('SeatView model pct is 0 when userMonthlyRequests is 0 with models present', async () => {
      mockGetUserPremiumRequests.mockResolvedValue({
        success: true,
        data: {
          userMonthlyRequests: 0,
          userTodayRequests: 0,
          userMonthlyModels: [{ model: 'gpt-4', requests: 0 }],
          orgMonthlyRequests: 100,
          orgMonthlyNetCost: 5,
        },
      })
      mockGetCopilotMemberUsage.mockResolvedValue({
        success: true,
        data: {
          login: 'charlie',
          planType: 'business',
          lastActivityAt: null,
          lastActivityEditor: null,
          createdAt: null,
          pendingCancellation: null,
        },
      })

      render(<UserPremiumUsageSection username="charlie" org="test-org" />)

      await waitFor(() => {
        expect(screen.getByText('gpt-4')).toBeInTheDocument()
      })
      const fill = document.querySelector('.ud-prem-model-fill') as HTMLElement
      expect(fill.style.width).toBe('0%')
    })
  })
})

/* ── Reducer unit tests ── */
describe('quotaReducer', () => {
  // Import the reducers to test them directly
  // They are module-private, so we test them via the component behavior above
  // This section verifies the key state transitions are working through the UI
  it('transitions from loading → success → displays data', async () => {
    mockGetCopilotQuota.mockResolvedValue({
      success: true,
      data: {
        quota_snapshots: {
          premium_interactions: {
            entitlement: 500,
            remaining: 200,
            overage_count: 0,
          },
        },
        quota_reset_date_utc: '2025-01-30T00:00:00Z',
      },
    })
    mockGetUserPremiumRequests.mockResolvedValue({ success: true, data: null })

    Object.defineProperty(window, 'github', {
      value: {
        getCopilotQuota: mockGetCopilotQuota,
        getCopilotMemberUsage: mockGetCopilotMemberUsage,
        getUserPremiumRequests: mockGetUserPremiumRequests,
      },
      writable: true,
      configurable: true,
    })

    render(<UserPremiumUsageSection username="alice" org="test-org" />)

    await waitFor(() => {
      expect(screen.getByText('60.0%')).toBeInTheDocument() // 300/500
    })
  })
})

/* ── fetchPremiumData edge cases ── */
describe('fetchPremiumData edge cases', () => {
  beforeEach(() => {
    _resetCaches()
    vi.clearAllMocks()
    vi.mocked(computeProjection).mockReturnValue(null)
    Object.defineProperty(window, 'github', {
      value: {
        getCopilotQuota: mockGetCopilotQuota,
        getCopilotMemberUsage: mockGetCopilotMemberUsage,
        getUserPremiumRequests: mockGetUserPremiumRequests,
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gracefully handles getUserPremiumRequests rejection', async () => {
    mockGetUserPremiumRequests.mockRejectedValue(new Error('API down'))
    mockGetCopilotQuota.mockResolvedValue({
      success: true,
      data: {
        quota_snapshots: {
          premium_interactions: { entitlement: 1000, remaining: 600, overage_count: 0 },
        },
        quota_reset_date_utc: '2025-01-30T00:00:00Z',
      },
    })

    render(<UserPremiumUsageSection username="alice" org="test-org" />)

    // Quota data still renders even though premium fetch failed
    await waitFor(() => {
      expect(screen.getByText('40.0%')).toBeInTheDocument()
    })
    // No model breakdown since premium failed
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()
  })

  it('skips premium API call when result.success is true but data is falsy', async () => {
    mockGetUserPremiumRequests.mockResolvedValue({ success: true, data: undefined })
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: true,
      data: {
        login: 'charlie',
        planType: 'business',
        lastActivityAt: null,
        lastActivityEditor: null,
        createdAt: null,
        pendingCancellation: null,
      },
    })

    render(<UserPremiumUsageSection username="charlie" org="test-org" />)

    await waitFor(() => {
      expect(screen.getByText('Business')).toBeInTheDocument()
    })
    // Hero section not shown because premium data was falsy
    expect(screen.queryByText('this month')).not.toBeInTheDocument()
  })

  it('QuotaView error with empty error string falls back to default message', async () => {
    mockGetCopilotQuota.mockResolvedValue({
      success: false,
      error: '',
    })

    render(<UserPremiumUsageSection username="alice" org="test-org" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load premium usage')).toBeInTheDocument()
    })
  })

  it('SeatView error with empty error string falls back to default message', async () => {
    mockGetCopilotMemberUsage.mockResolvedValue({
      success: false,
      error: '',
    })

    render(<UserPremiumUsageSection username="charlie" org="test-org" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load seat data')).toBeInTheDocument()
    })
  })
})
