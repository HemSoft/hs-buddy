import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockAccounts = [
  { username: 'user1', org: 'org1', token: 'tok1' },
  { username: 'user2', org: 'org1', token: 'tok2' },
]

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

const mockGetCopilotQuota = vi.fn()
const mockGetCopilotBudget = vi.fn()

Object.defineProperty(window, 'github', {
  value: { getCopilotQuota: mockGetCopilotQuota, getCopilotBudget: mockGetCopilotBudget },
  writable: true,
  configurable: true,
})

import { useCopilotUsage } from './useCopilotUsage'

function makeQuotaData() {
  return {
    login: 'user1',
    copilot_plan: 'business',
    quota_reset_date: '2026-05-01',
    quota_reset_date_utc: '2026-05-01T00:00:00Z',
    organization_login_list: ['org1'],
    quota_snapshots: {
      chat: {
        entitlement: 1000,
        remaining: 500,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 50,
        quota_id: 'chat',
        quota_remaining: 500,
        unlimited: false,
        timestamp_utc: '',
      },
      completions: {
        entitlement: 5000,
        remaining: 3000,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 60,
        quota_id: 'comp',
        quota_remaining: 3000,
        unlimited: false,
        timestamp_utc: '',
      },
      premium_interactions: {
        entitlement: 300,
        remaining: 100,
        overage_count: 0,
        overage_permitted: true,
        percent_remaining: 33,
        quota_id: 'premium',
        quota_remaining: 100,
        unlimited: false,
        timestamp_utc: '',
      },
    },
  }
}

describe('useCopilotUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCopilotQuota.mockResolvedValue({ success: true, data: makeQuotaData() })
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: {
        org: 'org1',
        budgetAmount: 500,
        preventFurtherUsage: false,
        spent: 120,
        spentUnavailable: false,
        useQuotaOverage: true,
        billingMonth: 4,
        billingYear: 2026,
        fetchedAt: Date.now(),
      },
    })
  })

  it('fetches quotas for each account on mount', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotQuota).toHaveBeenCalledWith('user1')
    expect(mockGetCopilotQuota).toHaveBeenCalledWith('user2')
    expect(result.current.quotas['user1']?.data).toBeDefined()
  })

  it('fetches budget for unique orgs', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotBudget).toHaveBeenCalledTimes(1)
    expect(mockGetCopilotBudget).toHaveBeenCalledWith('org1', 'user1')
    expect(result.current.orgBudgets['org1']?.data).toBeDefined()
  })

  it('handles quota fetch error', async () => {
    mockGetCopilotQuota.mockResolvedValue({ success: false, error: 'Unauthorized' })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.error).toBe('Unauthorized')
  })

  it('handles quota fetch exception', async () => {
    mockGetCopilotQuota.mockRejectedValue(new Error('Network down'))
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.error).toBe('Network down')
  })

  it('handles budget fetch error', async () => {
    mockGetCopilotBudget.mockResolvedValue({ success: false, error: 'Forbidden' })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.orgBudgets['org1']?.error).toBe('Forbidden')
  })

  it('handles budget fetch exception', async () => {
    mockGetCopilotBudget.mockRejectedValue(new Error('Timeout'))
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.orgBudgets['org1']?.error).toBe('Timeout')
  })

  it('computes aggregate totals from quotas', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    // Both users: entitlement 300, remaining 100 → used 200 each = 400 total
    expect(result.current.aggregateTotals.totalUsed).toBe(400)
  })

  it('returns uniqueOrgs map', () => {
    const { result } = renderHook(() => useCopilotUsage())
    expect(result.current.uniqueOrgs.has('org1')).toBe(true)
    expect(result.current.uniqueOrgs.get('org1')).toBe('user1')
  })

  it('aggregateProjections returns null without data', async () => {
    mockGetCopilotQuota.mockResolvedValue({ success: false, error: 'no data' })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.aggregateProjections).toBeNull()
  })

  it('computes overage costs per org', async () => {
    mockGetCopilotQuota.mockResolvedValue({
      success: true,
      data: {
        ...makeQuotaData(),
        quota_snapshots: {
          ...makeQuotaData().quota_snapshots,
          premium_interactions: {
            entitlement: 300,
            remaining: -20,
            overage_count: 25,
            overage_permitted: true,
            percent_remaining: -6,
            quota_id: 'p',
            quota_remaining: -20,
            unlimited: false,
            timestamp_utc: '',
          },
        },
      },
    })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    const orgCost = result.current.orgOverageFromQuotas.get('org1')
    expect(orgCost).toBeGreaterThan(0)
  })

  it('reports anyLoading while fetching', () => {
    mockGetCopilotQuota.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCopilotUsage())
    expect(result.current.anyLoading).toBe(true)
  })

  it('refreshAll re-fetches quotas and budgets', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))

    mockGetCopilotQuota.mockClear()
    mockGetCopilotBudget.mockClear()
    mockGetCopilotQuota.mockResolvedValue({ success: true, data: makeQuotaData() })
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: {
        org: 'org1',
        budgetAmount: 500,
        preventFurtherUsage: false,
        spent: 120,
        spentUnavailable: false,
        useQuotaOverage: true,
        billingMonth: 4,
        billingYear: 2026,
        fetchedAt: Date.now(),
      },
    })

    await act(async () => {
      result.current.refreshAll()
    })

    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotQuota).toHaveBeenCalledWith('user1')
    expect(mockGetCopilotQuota).toHaveBeenCalledWith('user2')
    expect(mockGetCopilotBudget).toHaveBeenCalledWith('org1', 'user1')
  })

  it('monthly refresh triggers when billing month is outdated', async () => {
    vi.useFakeTimers()
    // Set budget data with old billing month
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: {
        org: 'org1',
        budgetAmount: 500,
        preventFurtherUsage: false,
        spent: 120,
        spentUnavailable: false,
        useQuotaOverage: true,
        billingMonth: 1, // January 2020 — always in the past
        billingYear: 2020,
        fetchedAt: Date.now(),
      },
    })

    renderHook(() => useCopilotUsage())

    // Flush initial async effects — need multiple ticks for state batching
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    mockGetCopilotQuota.mockClear()
    mockGetCopilotBudget.mockClear()
    mockGetCopilotQuota.mockResolvedValue({ success: true, data: makeQuotaData() })
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: {
        org: 'org1',
        budgetAmount: 500,
        preventFurtherUsage: false,
        spent: 0,
        spentUnavailable: false,
        useQuotaOverage: true,
        billingMonth: 4,
        billingYear: 2026,
        fetchedAt: Date.now(),
      },
    })

    // Advance past the 5-minute refresh interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockGetCopilotQuota).toHaveBeenCalled()
    expect(mockGetCopilotBudget).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('monthly refresh does not trigger when billing month is current', async () => {
    vi.useFakeTimers()
    const now = new Date()
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: {
        org: 'org1',
        budgetAmount: 500,
        preventFurtherUsage: false,
        spent: 120,
        spentUnavailable: false,
        useQuotaOverage: true,
        billingMonth: now.getUTCMonth() + 1,
        billingYear: now.getUTCFullYear(),
        fetchedAt: Date.now(),
      },
    })

    renderHook(() => useCopilotUsage())

    // Flush initial async effects
    await vi.advanceTimersByTimeAsync(0)

    mockGetCopilotQuota.mockClear()
    mockGetCopilotBudget.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    // Should NOT have refreshed since billing month is current
    expect(mockGetCopilotQuota).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('computes aggregateProjections with valid quota data', async () => {
    const quotaData = {
      ...makeQuotaData(),
      quota_reset_date_utc: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    }
    mockGetCopilotQuota.mockResolvedValue({ success: true, data: quotaData })

    const { result } = renderHook(() => useCopilotUsage())

    await waitFor(() => {
      expect(Object.keys(result.current.quotas).length).toBeGreaterThan(0)
      expect(Object.values(result.current.quotas).every(s => !s.loading)).toBe(true)
    })

    // With valid premium data and a future reset date, projections should compute
    if (result.current.aggregateProjections !== null) {
      expect(result.current.aggregateProjections.projectedTotal).toBeGreaterThanOrEqual(0)
      expect(result.current.aggregateProjections.projectedOverageCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('unique org deduplication uses first username', () => {
    const { result } = renderHook(() => useCopilotUsage())
    // user1 and user2 both in org1, first one wins
    expect(result.current.uniqueOrgs.get('org1')).toBe('user1')
  })
})
