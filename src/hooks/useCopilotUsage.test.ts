import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockAccounts = [
  { username: 'user1', org: 'org1', token: 'tok1' },
  { username: 'user2', org: 'org1', token: 'tok2' },
  { username: 'user3', org: '', token: 'tok3' },
]

vi.mock('./useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

const mockGetCopilotUsage = vi.fn()
const mockGetCopilotBudget = vi.fn()

Object.defineProperty(window, 'github', {
  value: { getCopilotUsage: mockGetCopilotUsage, getCopilotBudget: mockGetCopilotBudget },
  writable: true,
  configurable: true,
})

import { useCopilotUsage } from './useCopilotUsage'

// Org-pool AI Credit metrics returned by getCopilotUsage. With seats=1 and a
// non-promotional month (May 2026 -> 3,900 credits/seat) the synthesized snapshot
// derives used = premiumRequests, so totalUsed math stays predictable.
function makeUsageData(overrides: Record<string, unknown> = {}) {
  return {
    org: 'org1',
    premiumRequests: 200,
    grossCost: 50,
    discount: 0,
    netCost: 0,
    businessSeats: 1,
    seatPlan: 'Copilot Business',
    seats: 1,
    budgetAmount: 500,
    spent: 0,
    billingMonth: 5,
    billingYear: 2026,
    fetchedAt: Date.now(),
    ...overrides,
  }
}

function makeBudgetData(overrides: Record<string, unknown> = {}) {
  return {
    org: 'org1',
    budgetAmount: 500,
    preventFurtherUsage: false,
    spent: 120,
    gross: 50,
    spentUnavailable: false,
    useQuotaOverage: true,
    billingMonth: 4,
    billingYear: 2026,
    fetchedAt: Date.now(),
    ...overrides,
  }
}

describe('useCopilotUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCopilotUsage.mockResolvedValue({ success: true, data: makeUsageData() })
    mockGetCopilotBudget.mockResolvedValue({ success: true, data: makeBudgetData() })
  })

  it('fetches usage pool for each account with an org on mount', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotUsage).toHaveBeenCalledWith('org1', 'user1')
    expect(mockGetCopilotUsage).toHaveBeenCalledWith('org1', 'user2')
    expect(result.current.quotas['user1']?.data).toBeDefined()
  })

  it('marks accounts without an org as unavailable', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user3']?.data).toBeNull()
    expect(result.current.quotas['user3']?.error).toMatch(/organization with Copilot seats/)
  })

  it('marks accounts whose org has no seats as unavailable', async () => {
    mockGetCopilotUsage.mockResolvedValue({ success: true, data: makeUsageData({ seats: 0 }) })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.data).toBeNull()
    expect(result.current.quotas['user1']?.error).toMatch(/organization with Copilot seats/)
  })

  it('fetches budget for unique orgs', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotBudget).toHaveBeenCalledTimes(1)
    expect(mockGetCopilotBudget).toHaveBeenCalledWith('org1', 'user1')
    expect(result.current.orgBudgets['org1']?.data).toBeDefined()
  })

  it('handles usage fetch error', async () => {
    mockGetCopilotUsage.mockResolvedValue({ success: false, error: 'Unauthorized' })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.error).toBe('Unauthorized')
  })

  it('handles usage fetch exception', async () => {
    mockGetCopilotUsage.mockRejectedValue(new Error('Network down'))
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

  it('computes aggregate totals from quotas (deduped per org)', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    // user1 + user2 share org1 -> org pool counted once: used = premiumRequests = 200
    expect(result.current.aggregateTotals.totalUsed).toBe(200)
  })

  it('uses a sibling with data when the first account in an org errors', async () => {
    // user1 (first in org1) fails; user2 (same org) succeeds. The org pool must
    // still be represented by user2's data rather than dropped to zero.
    mockGetCopilotUsage.mockImplementation((_org: string, username: string) =>
      username === 'user1'
        ? Promise.resolve({ success: false, error: 'no billing access' })
        : Promise.resolve({ success: true, data: makeUsageData() })
    )
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.error).toBe('no billing access')
    expect(result.current.aggregateTotals.totalUsed).toBe(200)
    expect(result.current.orgOverageFromQuotas.has('org1')).toBe(true)
  })

  it('returns uniqueOrgs map', () => {
    const { result } = renderHook(() => useCopilotUsage())
    expect(result.current.uniqueOrgs.has('org1')).toBe(true)
    expect(result.current.uniqueOrgs.get('org1')).toBe('user1')
  })

  it('aggregateProjections returns null without data', async () => {
    mockGetCopilotUsage.mockResolvedValue({ success: false, error: 'no data' })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.aggregateProjections).toBeNull()
  })

  it('computes overage costs per org', async () => {
    // premiumRequests above the 3,900 May allotment -> overage
    mockGetCopilotUsage.mockResolvedValue({
      success: true,
      data: makeUsageData({ premiumRequests: 4000 }),
    })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    const orgCost = result.current.orgOverageFromQuotas.get('org1')
    expect(orgCost).toBeGreaterThan(0)
  })

  it('reports anyLoading while fetching', () => {
    mockGetCopilotUsage.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCopilotUsage())
    expect(result.current.anyLoading).toBe(true)
  })

  it('refreshAll re-fetches quotas and budgets', async () => {
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))

    mockGetCopilotUsage.mockClear()
    mockGetCopilotBudget.mockClear()
    mockGetCopilotUsage.mockResolvedValue({ success: true, data: makeUsageData() })
    mockGetCopilotBudget.mockResolvedValue({ success: true, data: makeBudgetData() })

    await act(async () => {
      result.current.refreshAll()
    })

    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(mockGetCopilotUsage).toHaveBeenCalledWith('org1', 'user1')
    expect(mockGetCopilotUsage).toHaveBeenCalledWith('org1', 'user2')
    expect(mockGetCopilotBudget).toHaveBeenCalledWith('org1', 'user1')
  })

  it('monthly refresh triggers when billing month is outdated', async () => {
    vi.useFakeTimers()
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: makeBudgetData({ billingMonth: 1, billingYear: 2020 }),
    })

    renderHook(() => useCopilotUsage())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    mockGetCopilotUsage.mockClear()
    mockGetCopilotBudget.mockClear()
    mockGetCopilotUsage.mockResolvedValue({ success: true, data: makeUsageData() })
    mockGetCopilotBudget.mockResolvedValue({ success: true, data: makeBudgetData({ spent: 0 }) })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockGetCopilotUsage).toHaveBeenCalled()
    expect(mockGetCopilotBudget).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('monthly refresh does not trigger when billing month is current', async () => {
    vi.useFakeTimers()
    const now = new Date()
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: makeBudgetData({
        billingMonth: now.getUTCMonth() + 1,
        billingYear: now.getUTCFullYear(),
      }),
    })

    renderHook(() => useCopilotUsage())

    await vi.advanceTimersByTimeAsync(0)

    mockGetCopilotUsage.mockClear()
    mockGetCopilotBudget.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockGetCopilotUsage).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('computes aggregateProjections with valid quota data', async () => {
    const now = new Date()
    mockGetCopilotUsage.mockResolvedValue({
      success: true,
      data: makeUsageData({
        billingMonth: now.getUTCMonth() + 1,
        billingYear: now.getUTCFullYear(),
      }),
    })

    const { result } = renderHook(() => useCopilotUsage())

    await waitFor(() => {
      expect(Object.keys(result.current.quotas).length).toBeGreaterThan(0)
      expect(Object.values(result.current.quotas).every(s => !s.loading)).toBe(true)
    })

    if (result.current.aggregateProjections !== null) {
      expect(result.current.aggregateProjections.projectedTotal).toBeGreaterThanOrEqual(0)
      expect(result.current.aggregateProjections.projectedOverageCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('aggregateProjections returns null when no account has a usable pool', async () => {
    mockGetCopilotUsage.mockResolvedValue({ success: true, data: makeUsageData({ seats: 0 }) })

    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.aggregateProjections).toBeNull()
  })

  it('unique org deduplication uses first username', () => {
    const { result } = renderHook(() => useCopilotUsage())
    expect(result.current.uniqueOrgs.get('org1')).toBe('user1')
  })

  it('aggregateSpend is null when every org bills from the quota pool', async () => {
    // Default budget mock has useQuotaOverage: true -> excluded from dollar spend.
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.aggregateSpend).toBeNull()
  })

  it('aggregateSpend sums dollar spend and projects it to month-end', async () => {
    // 15 days into the 30-day April 2026 period, $300 spent -> ~$600 projected.
    const periodStartMs = Date.UTC(2026, 3, 1)
    const midMonth = periodStartMs + 15 * 86_400_000
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: makeBudgetData({
        useQuotaOverage: false,
        spentUnavailable: false,
        spent: 300,
        billingMonth: 4,
        billingYear: 2026,
        fetchedAt: midMonth,
      }),
    })

    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))

    expect(result.current.aggregateSpend).not.toBeNull()
    expect(result.current.aggregateSpend!.totalSpent).toBe(300)
    expect(result.current.aggregateSpend!.projectedSpend).toBeCloseTo(600, 0)
  })

  it('aggregateSpend excludes orgs with unavailable spend', async () => {
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: makeBudgetData({ useQuotaOverage: false, spentUnavailable: true, spent: 0 }),
    })

    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.aggregateSpend).toBeNull()
  })

  it('aggregateSpend falls back to spent when a projection is unavailable', async () => {
    // Billing period in the past -> computeBudgetProjection returns null,
    // so projectedSpend should fall back to the raw spent figure.
    mockGetCopilotBudget.mockResolvedValue({
      success: true,
      data: makeBudgetData({
        useQuotaOverage: false,
        spentUnavailable: false,
        spent: 75,
        billingMonth: 1,
        billingYear: 2020,
        fetchedAt: Date.now(),
      }),
    })

    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))

    expect(result.current.aggregateSpend).not.toBeNull()
    expect(result.current.aggregateSpend!.totalSpent).toBe(75)
    expect(result.current.aggregateSpend!.projectedSpend).toBe(75)
  })

  it('handles usage fetch error with no error message', async () => {
    mockGetCopilotUsage.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.quotas['user1']?.error).toBe('Unknown error')
  })

  it('handles budget fetch error with no error message', async () => {
    mockGetCopilotBudget.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useCopilotUsage())
    await waitFor(() => expect(result.current.anyLoading).toBe(false))
    expect(result.current.orgBudgets['org1']?.error).toBe('Unknown error')
  })
})
