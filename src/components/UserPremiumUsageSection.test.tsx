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

beforeEach(() => {
  _resetCaches()
})

describe('UserPremiumUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
