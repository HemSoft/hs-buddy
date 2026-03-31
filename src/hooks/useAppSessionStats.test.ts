import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppSessionStats } from './useAppSessionStats'

const mockIncrement = vi.fn().mockResolvedValue(undefined)
const mockRecordSessionStart = vi.fn().mockResolvedValue(undefined)
const mockRecordSessionEnd = vi.fn().mockResolvedValue(undefined)
const mockCheckpointUptime = vi.fn().mockResolvedValue(undefined)

vi.mock('./useConvex', () => ({
  useBuddyStatsMutations: () => ({
    increment: mockIncrement,
    recordSessionStart: mockRecordSessionStart,
    recordSessionEnd: mockRecordSessionEnd,
    checkpointUptime: mockCheckpointUptime,
  }),
}))

describe('useAppSessionStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls recordSessionStart on mount', () => {
    renderHook(() => useAppSessionStats())
    expect(mockRecordSessionStart).toHaveBeenCalledOnce()
  })

  it('returns trackViewOpen function', () => {
    const { result } = renderHook(() => useAppSessionStats())
    expect(typeof result.current.trackViewOpen).toBe('function')
  })

  it('trackViewOpen increments tabsOpened', () => {
    const { result } = renderHook(() => useAppSessionStats())
    act(() => {
      result.current.trackViewOpen('some-view')
    })
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'tabsOpened' })
  })

  it('trackViewOpen increments PR-specific stat for pr-my-prs', () => {
    const { result } = renderHook(() => useAppSessionStats())
    act(() => {
      result.current.trackViewOpen('pr-my-prs')
    })
    // Should call increment twice: once for tabsOpened, once for prsViewed
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'tabsOpened' })
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'prsViewed' })
  })

  it('trackViewOpen increments prsReviewed for pr-needs-review', () => {
    const { result } = renderHook(() => useAppSessionStats())
    act(() => {
      result.current.trackViewOpen('pr-needs-review')
    })
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'prsReviewed' })
  })

  it('trackViewOpen increments prsMergedWatched for pr-recently-merged', () => {
    const { result } = renderHook(() => useAppSessionStats())
    act(() => {
      result.current.trackViewOpen('pr-recently-merged')
    })
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'prsMergedWatched' })
  })
})
