import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('trackViewOpen does not increment PR stat for non-PR views', () => {
    const { result } = renderHook(() => useAppSessionStats())
    act(() => {
      result.current.trackViewOpen('settings-accounts')
    })
    expect(mockIncrement).toHaveBeenCalledTimes(1) // only tabsOpened
    expect(mockIncrement).toHaveBeenCalledWith({ field: 'tabsOpened' })
  })

  it('sets up checkpoint timer that fires every 5 minutes', () => {
    renderHook(() => useAppSessionStats())
    expect(mockCheckpointUptime).not.toHaveBeenCalled()

    // Advance 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(mockCheckpointUptime).toHaveBeenCalledOnce()

    // Advance another 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(mockCheckpointUptime).toHaveBeenCalledTimes(2)
  })

  it('registers beforeunload listener that calls recordSessionEnd', () => {
    renderHook(() => useAppSessionStats())
    window.dispatchEvent(new Event('beforeunload'))
    expect(mockRecordSessionEnd).toHaveBeenCalledOnce()
  })

  it('cleans up timer and beforeunload listener on unmount', () => {
    const { unmount } = renderHook(() => useAppSessionStats())
    unmount()

    // Timer should be cleared - advancing shouldn't trigger checkpoint
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(mockCheckpointUptime).not.toHaveBeenCalled()

    // beforeunload should be removed
    mockRecordSessionEnd.mockClear()
    window.dispatchEvent(new Event('beforeunload'))
    expect(mockRecordSessionEnd).not.toHaveBeenCalled()
  })
})
