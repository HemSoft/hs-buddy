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

  it('keeps the newer schedule when the previous date range resolves last', async () => {
    const aprilDays = [{ date: '2026-04-13', requiredSeconds: 28800, type: 'WORKING_DAY' }]
    const mayDays = [{ date: '2026-05-01', requiredSeconds: 0, type: 'HOLIDAY' }]
    let resolveApril!: (value: { success: boolean; data: typeof aprilDays }) => void
    let resolveMay!: (value: { success: boolean; data: typeof mayDays }) => void
    mockGetSchedule
      .mockReturnValueOnce(new Promise(resolve => (resolveApril = resolve)))
      .mockReturnValueOnce(new Promise(resolve => (resolveMay = resolve)))

    const { result, rerender } = renderHook(({ from, to }) => useUserSchedule(from, to), {
      initialProps: { from: '2026-04-01', to: '2026-04-30' },
    })
    rerender({ from: '2026-05-01', to: '2026-05-31' })

    await act(async () => resolveMay({ success: true, data: mayDays }))
    expect(result.current.schedule).toEqual(mayDays)
    await act(async () => resolveApril({ success: true, data: aprilDays }))
    expect(result.current.schedule).toEqual(mayDays)
    expect(result.current.loading).toBe(false)
  })

  it('ignores a stale failure after the current date range succeeds', async () => {
    const mayDays = [{ date: '2026-05-01', requiredSeconds: 0, type: 'HOLIDAY' }]
    let resolveApril!: (value: { success: boolean; error: string }) => void
    let resolveMay!: (value: { success: boolean; data: typeof mayDays }) => void
    mockGetSchedule
      .mockReturnValueOnce(new Promise(resolve => (resolveApril = resolve)))
      .mockReturnValueOnce(new Promise(resolve => (resolveMay = resolve)))

    const { result, rerender } = renderHook(({ from, to }) => useUserSchedule(from, to), {
      initialProps: { from: '2026-04-01', to: '2026-04-30' },
    })
    rerender({ from: '2026-05-01', to: '2026-05-31' })

    await act(async () => resolveMay({ success: true, data: mayDays }))
    await act(async () => resolveApril({ success: false, error: 'April failed' }))
    expect(result.current.schedule).toEqual(mayDays)
    expect(result.current.error).toBeNull()
  })

  it('refreshes the current date range', async () => {
    const initialDays = [{ date: '2026-04-13', requiredSeconds: 28800, type: 'WORKING_DAY' }]
    const refreshedDays = [{ date: '2026-04-14', requiredSeconds: 28800, type: 'WORKING_DAY' }]
    mockGetSchedule
      .mockResolvedValueOnce({ success: true, data: initialDays })
      .mockResolvedValueOnce({ success: true, data: refreshedDays })
    const { result } = renderHook(() => useUserSchedule('2026-04-01', '2026-04-30'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.refresh())

    expect(mockGetSchedule).toHaveBeenLastCalledWith('2026-04-01', '2026-04-30')
    expect(result.current.schedule).toEqual(refreshedDays)
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const readCases = [
  {
    name: 'today',
    mock: mockGetToday,
    useRead: (date: string) => {
      const state = useTempoToday(date)
      return { ...state, value: state.data }
    },
    data: { date: '2026-05-01', totalHours: 8, worklogs: [] },
    fallback: 'Failed to load worklogs',
  },
  {
    name: 'month',
    mock: mockGetWeek,
    useRead: (date: string) => {
      const state = useTempoMonth(date, '2026-05-31')
      return { ...state, value: state.totalHours }
    },
    data: { worklogs: [], issueSummaries: [], totalHours: 8 },
    fallback: 'Failed to load month data',
  },
  {
    name: 'schedule',
    mock: mockGetSchedule,
    useRead: (date: string) => {
      const state = useUserSchedule(date, '2026-05-31')
      return { ...state, value: state.schedule }
    },
    data: [{ date: '2026-05-01', requiredSeconds: 28800, type: 'WORKING_DAY' }],
    fallback: 'Failed to load schedule',
  },
]

describe.each(readCases)('$name IPC recovery', ({ mock, useRead, data, fallback }) => {
  beforeEach(() => vi.resetAllMocks())

  it.each([new Error('IPC disconnected'), 'unexpected rejection'])(
    'clears loading and exposes an error after rejection: %s',
    async reason => {
      mock.mockRejectedValueOnce(reason)
      const { result } = renderHook(() => useRead('2026-04-01'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.error).toBe(reason instanceof Error ? reason.message : fallback)
      mock.mockResolvedValueOnce({ success: true, data })
      await act(async () => result.current.refresh())
      expect(result.current.error).toBeNull()
      expect(result.current.loading).toBe(false)
    }
  )

  it('ignores the first mount request during StrictMode effect replay', async () => {
    const old = deferred<unknown>()
    const current = deferred<unknown>()
    mock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { result } = renderHook(() => useRead('2026-04-01'), {
      reactStrictMode: true,
    })
    expect(mock).toHaveBeenCalledTimes(2)
    await act(async () => old.reject(new Error('discarded mount')))
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => current.resolve({ success: true, data }))
    expect(result.current.loading).toBe(false)
  })

  it.each(['success', 'failure', 'rejection'])(
    'keeps the new range loading when a stale request settles with %s',
    async outcome => {
      const old = deferred<unknown>()
      const current = deferred<unknown>()
      mock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
      const { result, rerender } = renderHook(({ date }) => useRead(date), {
        initialProps: { date: '2026-04-01' },
      })
      rerender({ date: '2026-05-01' })
      const before = result.current.value
      await act(async () => {
        if (outcome === 'rejection') old.reject(new Error('stale rejection'))
        else
          old.resolve(
            outcome === 'success'
              ? { success: true, data }
              : { success: false, error: 'stale failure' }
          )
      })
      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()
      expect(result.current.value).toEqual(before)
      await act(async () => current.resolve({ success: true, data }))
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    }
  )

  it('ignores an older refresh that resolves after the current request', async () => {
    const old = deferred<unknown>()
    mock.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data })
    const { result } = renderHook(() => useRead('2026-04-01'))
    await act(async () => result.current.refresh())
    const current = result.current
    await act(async () => old.resolve({ success: false, error: 'late failure' }))
    expect(result.current).toBe(current)
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it.each(['success', 'rejection'])('ignores %s after unmount', async outcome => {
    const request = deferred<unknown>()
    mock.mockReturnValueOnce(request.promise)
    const { result, unmount } = renderHook(() => useRead('2026-04-01'))
    const before = result.current
    unmount()
    await act(async () => {
      if (outcome === 'rejection') request.reject(new Error('unmounted'))
      else request.resolve({ success: true, data })
    })
    expect(result.current).toBe(before)
  })
})

const actionCases = [
  {
    name: 'create',
    mock: mockCreateWorklog,
    invoke: (actions: ReturnType<typeof useTempoActions>) =>
      actions.create({ issueKey: 'T-1', hours: 2, date: '2026-04-13' }),
  },
  {
    name: 'update',
    mock: mockUpdateWorklog,
    invoke: (actions: ReturnType<typeof useTempoActions>) => actions.update(42, { hours: 3 }),
  },
  {
    name: 'remove',
    mock: mockDeleteWorklog,
    invoke: (actions: ReturnType<typeof useTempoActions>) => actions.remove(42),
  },
]

describe.each(actionCases)('$name IPC recovery', ({ mock, invoke }) => {
  beforeEach(() => vi.resetAllMocks())

  it.each([new Error('IPC disconnected'), undefined])(
    'returns failure and clears pending on rejection: %s',
    async reason => {
      const request = deferred<never>()
      mock.mockReturnValueOnce(request.promise)
      const onMutated = vi.fn()
      const { result } = renderHook(() => useTempoActions(onMutated))
      let operation!: ReturnType<typeof invoke>
      act(() => {
        operation = invoke(result.current)
      })
      expect(result.current.pending).toBe(true)
      await act(async () => {
        request.reject(reason)
        expect(await operation).toEqual({
          success: false,
          error: reason instanceof Error ? reason.message : 'Failed to save worklog changes',
        })
      })
      expect(result.current.pending).toBe(false)
      expect(onMutated).not.toHaveBeenCalled()
    }
  )

  it.each([true, false])('preserves the resolved response object: success=%s', async success => {
    const response = { success, data: { id: 42 }, error: success ? undefined : 'returned failure' }
    mock.mockResolvedValueOnce(response)
    const onMutated = vi.fn()
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => expect(await invoke(result.current)).toBe(response))
    expect(result.current.pending).toBe(false)
    expect(onMutated).toHaveBeenCalledTimes(success ? 1 : 0)
  })

  it('clears pending without misreporting a callback exception as an IPC failure', async () => {
    mock.mockResolvedValueOnce({ success: true })
    const onMutated = vi.fn(() => {
      throw new Error('refresh failed')
    })
    const { result } = renderHook(() => useTempoActions(onMutated))
    await act(async () => expect(invoke(result.current)).rejects.toThrow('refresh failed'))
    expect(result.current.pending).toBe(false)
    expect(onMutated).toHaveBeenCalledTimes(1)
  })

  it('keeps pending while another write is outstanding', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useTempoActions())
    let firstOperation!: ReturnType<typeof invoke>
    let secondOperation!: ReturnType<typeof invoke>
    act(() => {
      firstOperation = invoke(result.current)
      secondOperation = invoke(result.current)
    })
    await act(async () => {
      first.reject(new Error('first failed'))
      await firstOperation
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      second.resolve({ success: true })
      await secondOperation
    })
    expect(result.current.pending).toBe(false)
  })

  it.each(['success', 'rejection'])(
    'does not notify or update after unmount: %s',
    async outcome => {
      const request = deferred<unknown>()
      mock.mockReturnValueOnce(request.promise)
      const onMutated = vi.fn()
      const { result, unmount } = renderHook(() => useTempoActions(onMutated))
      let operation!: ReturnType<typeof invoke>
      act(() => {
        operation = invoke(result.current)
      })
      const before = result.current
      unmount()
      await act(async () => {
        if (outcome === 'rejection') request.reject(new Error('unmounted'))
        else request.resolve({ success: true })
        await operation
      })
      expect(onMutated).not.toHaveBeenCalled()
      expect(result.current).toBe(before)
    }
  )
})
