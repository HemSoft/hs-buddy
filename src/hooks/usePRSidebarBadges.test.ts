import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockGet = vi.fn()
const mockSubscribe = vi.fn().mockReturnValue(vi.fn())

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockGet(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

vi.mock('./useConfig', () => ({
  usePRSettings: () => ({ refreshInterval: 5 }),
}))

vi.mock('../utils/progressColors', () => ({
  getProgressColor: (pct: number) => (pct > 50 ? '#ff0' : '#0f0'),
}))

import { usePRSidebarBadges } from './usePRSidebarBadges'

describe('usePRSidebarBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockGet.mockReturnValue(null)
    mockSubscribe.mockReturnValue(vi.fn())
  })

  it('returns initial state with empty counts', () => {
    const { result } = renderHook(() => usePRSidebarBadges())
    expect(result.current.prCounts).toBeDefined()
    expect(result.current.badgeProgress).toBeDefined()
    expect(result.current.setPRCount).toBeInstanceOf(Function)
  })

  it('populates counts from data cache on mount', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [{ id: 1 }, { id: 2 }] }
      if (key === 'needs-review') return { data: [{ id: 3 }] }
      return null
    })
    const { result } = renderHook(() => usePRSidebarBadges())
    expect(result.current.prCounts['pr-my-prs']).toBe(2)
    expect(result.current.prCounts['pr-needs-review']).toBe(1)
  })

  it('subscribes to data cache and unsubscribes on unmount', () => {
    const unsub = vi.fn()
    mockSubscribe.mockReturnValue(unsub)
    const { unmount } = renderHook(() => usePRSidebarBadges())
    expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('updates counts when cache changes', () => {
    let cacheCallback: ((key: string) => void) | null = null
    mockSubscribe.mockImplementation((cb: (key: string) => void) => {
      cacheCallback = cb
      return vi.fn()
    })
    const { result } = renderHook(() => usePRSidebarBadges())

    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
      return null
    })
    act(() => {
      cacheCallback?.('my-prs')
    })
    expect(result.current.prCounts['pr-my-prs']).toBe(3)
  })

  it('ignores cache updates for unknown keys', () => {
    let cacheCallback: ((key: string) => void) | null = null
    mockSubscribe.mockImplementation((cb: (key: string) => void) => {
      cacheCallback = cb
      return vi.fn()
    })
    const { result } = renderHook(() => usePRSidebarBadges())
    const before = { ...result.current.prCounts }
    act(() => {
      cacheCallback?.('unknown-key')
    })
    expect(result.current.prCounts).toEqual(before)
  })

  it('setPRCount updates individual count', () => {
    const { result } = renderHook(() => usePRSidebarBadges())
    act(() => {
      result.current.setPRCount('pr-my-prs', 42)
    })
    expect(result.current.prCounts['pr-my-prs']).toBe(42)
  })

  it('computes badge progress from cache timestamps', () => {
    vi.useFakeTimers()
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [], fetchedAt: Date.now() - 2 * 60000 }
      return null
    })
    const { result } = renderHook(() => usePRSidebarBadges())
    const badge = result.current.badgeProgress['pr-my-prs']
    expect(badge).toBeDefined()
    expect(badge.progress).toBeGreaterThanOrEqual(35)
    expect(badge.progress).toBeLessThanOrEqual(45)
    vi.useRealTimers()
  })

  it('shows "Updated just now" tooltip when cache was fetched less than 1m ago', () => {
    vi.useFakeTimers()
    mockGet.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [], fetchedAt: Date.now() - 10000 }
      return null
    })
    const { result } = renderHook(() => usePRSidebarBadges())
    const badge = result.current.badgeProgress['pr-my-prs']
    expect(badge.tooltip).toMatch(/Updated just now/)
    vi.useRealTimers()
  })

  it('ignores valid cache key with null data in subscription callback', () => {
    let cacheCallback: ((key: string) => void) | null = null
    mockSubscribe.mockImplementation((cb: (key: string) => void) => {
      cacheCallback = cb
      return vi.fn()
    })
    const { result } = renderHook(() => usePRSidebarBadges())
    const before = { ...result.current.prCounts }
    // Return cache entry with no data
    mockGet.mockReturnValue({ fetchedAt: Date.now() })
    act(() => {
      cacheCallback?.('my-prs')
    })
    expect(result.current.prCounts).toEqual(before)
  })
})
