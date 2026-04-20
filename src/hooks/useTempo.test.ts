import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockGetToday = vi.fn()
const mockGetWeek = vi.fn()
const mockGetCapexMap = vi.fn()
const mockGetSchedule = vi.fn()
const mockCreateWorklog = vi.fn()
const mockUpdateWorklog = vi.fn()
const mockDeleteWorklog = vi.fn()

Object.defineProperty(window, 'tempo', {
  value: {
    getToday: mockGetToday,
    getWeek: mockGetWeek,
    getCapexMap: mockGetCapexMap,
    getSchedule: mockGetSchedule,
    createWorklog: mockCreateWorklog,
    updateWorklog: mockUpdateWorklog,
    deleteWorklog: mockDeleteWorklog,
  },
  writable: true,
  configurable: true,
})

import {
  getMonthRange,
  useTempoToday,
  useTempoMonth,
  useCapexMap,
  useUserSchedule,
  useTempoActions,
} from './useTempo'

describe('getMonthRange', () => {
  it('returns first and last day of the month', () => {
    const result = getMonthRange(new Date(2026, 2, 15))
    expect(result.from).toBe('2026-03-01')
    expect(result.to).toBe('2026-03-31')
  })

  it('handles February in a leap year', () => {
    const result = getMonthRange(new Date(2024, 1, 10))
    expect(result.from).toBe('2024-02-01')
    expect(result.to).toBe('2024-02-29')
  })
})

describe('useTempoToday', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches today data on mount', async () => {
    mockGetToday.mockResolvedValue({
      success: true,
      data: { date: '2026-04-13', totalHours: 4, worklogs: [] },
    })
    const { result } = renderHook(() => useTempoToday())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.totalHours).toBe(4)
    expect(result.current.error).toBeNull()
  })

  it('uses provided date string', async () => {
    mockGetToday.mockResolvedValue({
      success: true,
      data: { date: '2026-04-10', totalHours: 0, worklogs: [] },
    })
    renderHook(() => useTempoToday('2026-04-10'))
    await waitFor(() => expect(mockGetToday).toHaveBeenCalledWith('2026-04-10'))
  })

  it('handles API error', async () => {
    mockGetToday.mockResolvedValue({ success: false, error: 'Tempo down' })
    const { result } = renderHook(() => useTempoToday())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Tempo down')
  })

  it('handles missing error message with fallback', async () => {
    mockGetToday.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTempoToday())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load worklogs')
  })

  it('refresh re-fetches data', async () => {
    mockGetToday.mockResolvedValue({
      success: true,
      data: { date: '2026-04-13', totalHours: 2, worklogs: [] },
    })
    const { result } = renderHook(() => useTempoToday())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetToday.mockResolvedValue({
      success: true,
      data: { date: '2026-04-13', totalHours: 6, worklogs: [] },
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.data?.totalHours).toBe(6)
  })
})

describe('useTempoMonth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches month data on mount', async () => {
    mockGetWeek.mockResolvedValue({
      success: true,
      data: { worklogs: [{ id: 1 }], issueSummaries: [{ issueKey: 'T-1' }], totalHours: 8 },
    })
    const { result } = renderHook(() => useTempoMonth('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.worklogs).toHaveLength(1)
    expect(result.current.totalHours).toBe(8)
  })

  it('handles API error', async () => {
    mockGetWeek.mockResolvedValue({ success: false, error: 'Failed' })
    const { result } = renderHook(() => useTempoMonth('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed')
  })

  it('provides fallback error message', async () => {
    mockGetWeek.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTempoMonth('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load month data')
  })
})

describe('useCapexMap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty map for empty keys', () => {
    const { result } = renderHook(() => useCapexMap([]))
    expect(result.current).toEqual({})
    expect(mockGetCapexMap).not.toHaveBeenCalled()
  })

  it('fetches capex data for provided keys', async () => {
    mockGetCapexMap.mockResolvedValue({ success: true, data: { 'P-1': true, 'P-2': false } })
    const { result } = renderHook(() => useCapexMap(['P-1', 'P-2']))
    await waitFor(() => expect(result.current).toEqual({ 'P-1': true, 'P-2': false }))
  })

  it('does not set capex map when result is unsuccessful', async () => {
    mockGetCapexMap.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useCapexMap(['P-1']))
    await waitFor(() => expect(mockGetCapexMap).toHaveBeenCalled())
    expect(result.current).toEqual({})
  })

  it('does not set capex map when result data is null', async () => {
    mockGetCapexMap.mockResolvedValue({ success: true, data: null })
    const { result } = renderHook(() => useCapexMap(['P-1']))
    await waitFor(() => expect(mockGetCapexMap).toHaveBeenCalled())
    expect(result.current).toEqual({})
  })

  it('skips stale capex result after unmount', async () => {
    let resolveCapex!: (v: unknown) => void
    mockGetCapexMap.mockReturnValue(new Promise(r => (resolveCapex = r)))
    const { unmount } = renderHook(() => useCapexMap(['P-1']))
    unmount()
    resolveCapex({ success: true, data: { 'P-1': true } })
  })
})

describe('useUserSchedule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches schedule on mount', async () => {
    const days = [{ date: '2026-04-13', requiredSeconds: 28800, type: 'WORKING_DAY' }]
    mockGetSchedule.mockResolvedValue({ success: true, data: days })
    const { result } = renderHook(() => useUserSchedule('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.schedule).toEqual(days)
  })

  it('handles schedule API error', async () => {
    mockGetSchedule.mockResolvedValue({ success: false, error: 'No access' })
    const { result } = renderHook(() => useUserSchedule('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('No access')
  })

  it('provides fallback error message', async () => {
    mockGetSchedule.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useUserSchedule('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load schedule')
  })

  it('skips stale schedule result after unmount', async () => {
    let resolveSchedule!: (v: unknown) => void
    mockGetSchedule.mockReturnValue(new Promise(r => (resolveSchedule = r)))
    const { unmount } = renderHook(() => useUserSchedule('2026-04-01', '2026-04-30'))
    unmount()
    resolveSchedule({ success: true, data: [] })
  })
})

describe('useTempoActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a worklog and calls onMutated', async () => {
    mockCreateWorklog.mockResolvedValue({ success: true })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.create({ issueKey: 'T-1', hours: 2, date: '2026-04-13' })
    })
    expect(mockCreateWorklog).toHaveBeenCalledWith({
      issueKey: 'T-1',
      hours: 2,
      date: '2026-04-13',
    })
    expect(onMutated).toHaveBeenCalled()
  })

  it('updates a worklog', async () => {
    mockUpdateWorklog.mockResolvedValue({ success: true })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.update(42, { hours: 3 })
    })
    expect(mockUpdateWorklog).toHaveBeenCalledWith(42, { hours: 3 })
    expect(onMutated).toHaveBeenCalled()
  })

  it('removes a worklog', async () => {
    mockDeleteWorklog.mockResolvedValue({ success: true })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.remove(42)
    })
    expect(mockDeleteWorklog).toHaveBeenCalledWith(42)
    expect(onMutated).toHaveBeenCalled()
  })

  it('does not call onMutated on failure', async () => {
    mockCreateWorklog.mockResolvedValue({ success: false })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.create({ issueKey: 'X', hours: 1, date: '2026-04-13' })
    })
    expect(onMutated).not.toHaveBeenCalled()
  })

  it('does not call onMutated when update fails', async () => {
    mockUpdateWorklog.mockResolvedValue({ success: false })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.update(42, { hours: 3 })
    })
    expect(onMutated).not.toHaveBeenCalled()
  })

  it('does not call onMutated when remove fails', async () => {
    mockDeleteWorklog.mockResolvedValue({ success: false })
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => {
      await result.current.remove(42)
    })
    expect(onMutated).not.toHaveBeenCalled()
  })

  it('update succeeds without onMutated callback', async () => {
    mockUpdateWorklog.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTempoActions())
    await act(async () => {
      await result.current.update(42, { hours: 3 })
    })
    expect(result.current.pending).toBe(false)
  })

  it('remove succeeds without onMutated callback', async () => {
    mockDeleteWorklog.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTempoActions())
    await act(async () => {
      await result.current.remove(42)
    })
    expect(result.current.pending).toBe(false)
  })

  it('sets pending during operations', async () => {
    let resolveCreate: (v: unknown) => void
    mockCreateWorklog.mockReturnValue(
      new Promise(r => {
        resolveCreate = r
      })
    )
    const { result } = renderHook(() => useTempoActions())
    expect(result.current.pending).toBe(false)

    let promise: Promise<unknown>
    act(() => {
      promise = result.current.create({ issueKey: 'X', hours: 1, date: '2026-04-13' })
    })
    expect(result.current.pending).toBe(true)

    await act(async () => {
      resolveCreate!({ success: true })
      await promise!
    })
    expect(result.current.pending).toBe(false)
  })
})
