import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useFinance } from './useFinance'

const mockFetchQuote = vi.fn()
Object.defineProperty(window, 'finance', {
  value: { fetchQuote: mockFetchQuote },
  writable: true,
  configurable: true,
})

const mockInvoke = vi.fn()
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

const QUOTE_AAPL = {
  symbol: 'AAPL',
  name: 'Apple Inc',
  price: 150,
  change: 2,
  changePercent: 1.35,
  previousClose: 148,
  marketOpen: true,
}

const QUOTE_TSLA = { ...QUOTE_AAPL, symbol: 'TSLA', name: 'Tesla Inc' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function arrangeOverlappingRefreshes() {
  localStorage.setItem('finance:watchlist', JSON.stringify(['AAPL']))
  const mountQuote = deferred<unknown>()
  const refreshedAapl = deferred<unknown>()
  const refreshedTsla = deferred<unknown>()

  mockFetchQuote
    .mockImplementationOnce(() => mountQuote.promise)
    .mockImplementationOnce(() => refreshedAapl.promise)
    .mockImplementationOnce(() => refreshedTsla.promise)

  return { mountQuote, refreshedAapl, refreshedTsla }
}

async function resolveNewerRefresh(
  refreshedAapl: ReturnType<typeof deferred<unknown>>,
  refreshedTsla: ReturnType<typeof deferred<unknown>>
) {
  await act(async () => {
    refreshedAapl.resolve({ success: true, quote: QUOTE_AAPL })
    refreshedTsla.resolve({ success: true, quote: QUOTE_TSLA })
  })
}

describe('useFinance refresh ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockInvoke.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a newer watchlist refresh when the mount refresh resolves last', async () => {
    const { mountQuote, refreshedAapl, refreshedTsla } = arrangeOverlappingRefreshes()
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(mockFetchQuote).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addSymbol('TSLA')
    })
    await waitFor(() => expect(mockFetchQuote).toHaveBeenCalledTimes(3))
    await resolveNewerRefresh(refreshedAapl, refreshedTsla)
    await waitFor(() => expect(result.current.loading).toBe(false))

    const refreshedAt = result.current.lastFetchedAt
    expect(result.current.quotes).toEqual([QUOTE_AAPL, QUOTE_TSLA])

    await act(async () => {
      mountQuote.resolve({
        success: true,
        quote: { ...QUOTE_AAPL, price: QUOTE_AAPL.price - 10 },
      })
    })

    expect(result.current.quotes).toEqual([QUOTE_AAPL, QUOTE_TSLA])
    expect(result.current.lastFetchedAt).toBe(refreshedAt)
    expect(JSON.parse(localStorage.getItem('finance:cache') ?? '{}').quotes).toEqual([
      QUOTE_AAPL,
      QUOTE_TSLA,
    ])
  })

  it('ignores a stale rejected refresh after a newer refresh succeeds', async () => {
    const { mountQuote, refreshedAapl, refreshedTsla } = arrangeOverlappingRefreshes()
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(mockFetchQuote).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.addSymbol('TSLA')
    })
    await waitFor(() => expect(mockFetchQuote).toHaveBeenCalledTimes(3))
    await resolveNewerRefresh(refreshedAapl, refreshedTsla)
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      mountQuote.reject(new Error('stale request failed'))
    })

    expect(result.current.error).toBeNull()
    expect(result.current.quotes).toEqual([QUOTE_AAPL, QUOTE_TSLA])
  })
})
