import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockGetToday = vi.fn()
const mockGetWeek = vi.fn()
const mockGetSchedule = vi.fn()
const mockCreateWorklog = vi.fn()
const mockUpdateWorklog = vi.fn()
const mockDeleteWorklog = vi.fn()

Object.defineProperty(window, 'tempo', {
  value: {
    getToday: mockGetToday,
    getWeek: mockGetWeek,
    getSchedule: mockGetSchedule,
    createWorklog: mockCreateWorklog,
    updateWorklog: mockUpdateWorklog,
    deleteWorklog: mockDeleteWorklog,
  },
  writable: true,
  configurable: true,
})

import { useTempoToday, useTempoMonth, useUserSchedule, useTempoActions } from './useTempo'

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
})

describe.each(readCases)('$name unmount recovery', ({ mock, useRead, data }) => {
  beforeEach(() => vi.resetAllMocks())

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
})

describe.each(actionCases)('$name mutation races', ({ mock, invoke }) => {
  beforeEach(() => vi.resetAllMocks())

  it('notifies the current date-range callback when a write finishes after rerender', async () => {
    const request = deferred<unknown>()
    mock.mockReturnValueOnce(request.promise)
    const previousCallback = vi.fn()
    const currentCallback = vi.fn()
    const { result, rerender } = renderHook(({ onMutated }) => useTempoActions(onMutated), {
      initialProps: { onMutated: previousCallback },
    })
    let operation!: ReturnType<typeof invoke>
    act(() => {
      operation = invoke(result.current)
    })
    rerender({ onMutated: currentCallback })
    await act(async () => {
      request.resolve({ success: true })
      await operation
    })
    expect(previousCallback).not.toHaveBeenCalled()
    expect(currentCallback).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(false)
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
