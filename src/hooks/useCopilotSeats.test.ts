import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'

const mockGetCopilotSeats = vi.fn()
const mockGetBatchMonthlyRequests = vi.fn()

Object.defineProperty(window, 'github', {
  value: {
    getCopilotSeats: mockGetCopilotSeats,
    getBatchMonthlyRequests: mockGetBatchMonthlyRequests,
  },
  writable: true,
  configurable: true,
})

import { useCopilotSeats } from './useCopilotSeats'

function makeSeat(login: string, lastActivityAt: string | null = null) {
  return {
    login,
    displayName: null,
    planType: 'business',
    lastActivityAt,
    lastActivityEditor: 'vscode/1.95.0',
    createdAt: '2024-01-01T00:00:00Z',
    pendingCancellation: null,
  }
}

describe('useCopilotSeats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBatchMonthlyRequests.mockResolvedValue({ success: false })
  })

  it('returns empty state when no orgs', () => {
    const orgs = new Map<string, string>()
    const { result } = renderHook(() => useCopilotSeats(orgs))
    expect(result.current.seats).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches seats for each org in parallel', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 2,
        fetchedSeats: 2,
        seats: [makeSeat('alice', '2026-05-16T12:00:00Z'), makeSeat('bob', '2026-05-15T12:00:00Z')],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: {
        alice: { requests: 100, lastActiveDate: null },
        bob: { requests: 50, lastActiveDate: null },
      },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toHaveLength(2)
    expect(result.current.seats[0].login).toBe('alice')
    expect(result.current.seats[0].org).toBe('org1')
    expect(result.current.seats[1].login).toBe('bob')
  })

  it('sorts by premium requests descending with zeros excluded', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 3,
        fetchedSeats: 3,
        seats: [
          makeSeat('low', '2026-05-16T12:00:00Z'),
          makeSeat('high', '2026-05-15T12:00:00Z'),
          makeSeat('zero', '2026-01-01T12:00:00Z'),
        ],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: {
        low: { requests: 10, lastActiveDate: null },
        high: { requests: 500, lastActiveDate: null },
        zero: { requests: 0, lastActiveDate: null },
      },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats.map(s => s.login)).toEqual(['high', 'low'])
  })

  it('limits results to 50', async () => {
    const seats = Array.from({ length: 60 }, (_, i) =>
      makeSeat(`user${i}`, `2026-05-${String(16 - (i % 16)).padStart(2, '0')}T12:00:00Z`)
    )
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: { totalSeats: 60, fetchedSeats: 60, seats },
    })
    const premiumData: Record<string, { requests: number; lastActiveDate: null }> = {}
    for (let i = 0; i < 60; i++) {
      premiumData[`user${i}`] = { requests: 60 - i, lastActiveDate: null }
    }
    mockGetBatchMonthlyRequests.mockResolvedValue({ success: true, data: premiumData })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toHaveLength(50)
  })

  it('merges seats from multiple orgs', async () => {
    mockGetCopilotSeats
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalSeats: 1,
          fetchedSeats: 1,
          seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalSeats: 1,
          fetchedSeats: 1,
          seats: [makeSeat('bob', '2026-05-15T12:00:00Z')],
        },
      })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: {
        alice: { requests: 200, lastActiveDate: null },
        bob: { requests: 100, lastActiveDate: null },
      },
    })

    const orgs = new Map([
      ['org1', 'user1'],
      ['org2', 'user2'],
    ])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toHaveLength(2)
    expect(result.current.seats[0].org).toBe('org1')
    expect(result.current.seats[1].org).toBe('org2')
  })

  it('handles partial org failure gracefully', async () => {
    mockGetCopilotSeats
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalSeats: 1,
          fetchedSeats: 1,
          seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'No billing access',
      })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: { alice: { requests: 50, lastActiveDate: null } },
    })

    const orgs = new Map([
      ['org1', 'user1'],
      ['org2', 'user2'],
    ])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toHaveLength(1)
    expect(result.current.orgErrors).toHaveLength(1)
    expect(result.current.orgErrors[0].error).toBe('No billing access')
  })

  it('reports truncation when fetchedSeats < totalSeats', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 1000,
        fetchedSeats: 500,
        seats: Array.from({ length: 500 }, (_, i) => makeSeat(`user${i}`, '2026-05-16T12:00:00Z')),
      },
    })
    const premiumData: Record<string, { requests: number; lastActiveDate: null }> = {}
    for (let i = 0; i < 500; i++) {
      premiumData[`user${i}`] = { requests: 500 - i, lastActiveDate: null }
    }
    mockGetBatchMonthlyRequests.mockResolvedValue({ success: true, data: premiumData })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.truncated).toBe(true)
  })

  it('refresh re-fetches seats', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 1,
        fetchedSeats: 1,
        seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: { alice: { requests: 10, lastActiveDate: null } },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetCopilotSeats).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(mockGetCopilotSeats).toHaveBeenCalledTimes(2))
  })

  it('fetches premium requests and sorts by highest count', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 2,
        fetchedSeats: 2,
        seats: [makeSeat('alice', '2026-05-16T12:00:00Z'), makeSeat('bob', '2026-05-15T12:00:00Z')],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: {
        alice: { requests: 42, lastActiveDate: '2026-05-17' },
        bob: { requests: 150, lastActiveDate: '2026-05-15' },
      },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Sorted by premium requests descending: bob (150) then alice (42)
    expect(result.current.seats[0].premiumRequests).toBe(150)
    expect(result.current.seats[0].login).toBe('bob')
    expect(result.current.seats[1].premiumRequests).toBe(42)
    expect(result.current.seats[1].login).toBe('alice')
    expect(mockGetBatchMonthlyRequests).toHaveBeenCalledWith(['alice', 'bob'], 'user1', true)
  })

  it('sets premiumRequests to null when batch request fails', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 1,
        fetchedSeats: 1,
        seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({ success: false, error: 'API error' })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toHaveLength(0) // no premium requests → filtered out
  })

  it('skips premium request lookup when orgs return no seats', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: { totalSeats: 0, fetchedSeats: 0, seats: [] },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toEqual([])
    expect(mockGetBatchMonthlyRequests).not.toHaveBeenCalled()
  })

  it('records unknown org errors for rejected seat requests', async () => {
    mockGetCopilotSeats.mockRejectedValue(new Error('Network unavailable'))

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toEqual([])
    expect(result.current.orgErrors).toEqual([{ org: 'unknown', error: 'Network unavailable' }])
  })

  it('uses null error when org seat lookup fails without a message', async () => {
    mockGetCopilotSeats.mockResolvedValue({ success: false })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toEqual([])
    expect(result.current.orgErrors).toEqual([])
  })

  it('keeps only seats with returned premium usage', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 3,
        fetchedSeats: 3,
        seats: [
          makeSeat('missing-first', '2026-05-16T12:00:00Z'),
          makeSeat('used', '2026-05-15T12:00:00Z'),
          makeSeat('missing-last', '2026-05-14T12:00:00Z'),
        ],
      },
    })
    mockGetBatchMonthlyRequests.mockResolvedValue({
      success: true,
      data: { used: { requests: 25, lastActiveDate: null } },
    })

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats.map(s => s.login)).toEqual(['used'])
  })

  it('reports an all-org error when premium request lookup throws', async () => {
    mockGetCopilotSeats.mockResolvedValue({
      success: true,
      data: {
        totalSeats: 1,
        fetchedSeats: 1,
        seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
      },
    })
    mockGetBatchMonthlyRequests.mockRejectedValue(new Error('Usage API unavailable'))

    const orgs = new Map([['org1', 'user1']])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats).toEqual([])
    expect(result.current.orgErrors).toEqual([{ org: 'all', error: 'Usage API unavailable' }])
  })

  it('falls back to next username when first returns empty billing data', async () => {
    mockGetCopilotSeats
      .mockResolvedValueOnce({ success: true, data: { totalSeats: 0, fetchedSeats: 0, seats: [] } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalSeats: 1,
          fetchedSeats: 1,
          seats: [makeSeat('alice', '2026-05-16T12:00:00Z')],
        },
      })
    mockGetBatchMonthlyRequests
      .mockResolvedValueOnce({ success: true, data: {} }) // personal-user returns empty
      .mockResolvedValueOnce({
        success: true,
        data: { alice: { requests: 300, lastActiveDate: null } },
      }) // enterprise-user returns data

    const orgs = new Map([
      ['personal-org', 'personal-user'],
      ['enterprise-org', 'enterprise-user'],
    ])
    const { result } = renderHook(() => useCopilotSeats(orgs))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.seats[0].premiumRequests).toBe(300)
    // Tried personal-user first (empty), then fell back to enterprise-user
    expect(mockGetBatchMonthlyRequests).toHaveBeenNthCalledWith(1, ['alice'], 'personal-user', true)
    expect(mockGetBatchMonthlyRequests).toHaveBeenNthCalledWith(
      2,
      ['alice'],
      'enterprise-user',
      true
    )
  })
})
