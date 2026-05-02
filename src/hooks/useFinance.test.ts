import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { readWatchlist, useFinance } from './useFinance'

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

describe('readWatchlist', () => {
  beforeEach(() => localStorage.clear())

  it('returns default watchlist when nothing stored', () => {
    const list = readWatchlist()
    expect(list).toContain('^GSPC')
    expect(list).toHaveLength(4)
  })

  it('returns stored watchlist', () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['AAPL', 'GOOG']))
    expect(readWatchlist()).toEqual(['AAPL', 'GOOG'])
  })

  it('falls back to default for corrupt data', () => {
    localStorage.setItem('finance:watchlist', '{invalid')
    expect(readWatchlist()).toContain('^GSPC')
  })

  it('falls back to default when stored value is truthy but not an array', () => {
    localStorage.setItem('finance:watchlist', JSON.stringify({ not: 'array' }))
    const list = readWatchlist()
    expect(list).toContain('^GSPC')
    expect(list).toHaveLength(4)
  })

  it('returns empty array for persisted empty watchlist', () => {
    localStorage.setItem('finance:watchlist', '[]')
    expect(readWatchlist()).toEqual([])
  })
})

describe('useFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetchQuote.mockResolvedValue({ success: true, quote: QUOTE_AAPL })
    // Default: IPC returns nothing useful so it doesn't override local state.
    // Individual tests override this when they care about the IPC load.
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        // Return a non-array so sanitizer rejects → no override
        return Promise.resolve(null)
      }
      return Promise.resolve({ success: true })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in loading state when no cache', () => {
    const { result } = renderHook(() => useFinance())
    expect(result.current.loading).toBe(true)
    expect(result.current.quotes).toEqual([])
  })

  it('initializes from valid cache', () => {
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now(), version: 3 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.loading).toBe(false)
    expect(result.current.quotes).toHaveLength(1)
  })

  it('initializes lastFetchedAt from cache timestamp', () => {
    const cacheTs = Date.now() - 5 * 60_000
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: cacheTs, version: 3 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.lastFetchedAt).toBe(cacheTs)
  })

  it('sets lastFetchedAt to null when no cache', () => {
    const { result } = renderHook(() => useFinance())
    expect(result.current.lastFetchedAt).toBeNull()
  })

  it('updates lastFetchedAt on successful fetch', async () => {
    const before = Date.now()
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.lastFetchedAt).toBeGreaterThanOrEqual(before)
  })

  it('preserves lastFetchedAt on failed fetch', async () => {
    const cacheTs = Date.now() - 5 * 60_000
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: cacheTs, version: 3 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.lastFetchedAt).toBe(cacheTs)

    // Make subsequent fetch fail
    mockFetchQuote.mockResolvedValue({ success: false, error: 'API down' })
    await act(async () => {
      try {
        await result.current.refresh()
      } catch (_: unknown) {
        /* expected */
      }
    })
    expect(result.current.lastFetchedAt).toBe(cacheTs)
  })

  it('ignores expired cache', () => {
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now() - 20 * 60 * 1000, version: 2 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.loading).toBe(true)
  })

  it('ignores old cache version', () => {
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now(), version: 1 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.loading).toBe(true)
  })

  it('fetches quotes on mount when no cache', async () => {
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchQuote).toHaveBeenCalled()
  })

  it('handles all-symbol fetch failure', async () => {
    mockFetchQuote.mockResolvedValue({ success: false, error: 'API down' })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('handles finance bridge unavailable', async () => {
    const orig = window.finance
    Object.defineProperty(window, 'finance', { value: {}, writable: true, configurable: true })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('Finance bridge unavailable')
    Object.defineProperty(window, 'finance', { value: orig, writable: true, configurable: true })
  })

  it('adds a new symbol to watchlist', async () => {
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.addSymbol('TSLA')
    })
    expect(result.current.watchlist).toContain('TSLA')
  })

  it('uppercases added symbols', async () => {
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.addSymbol('tsla')
    })
    expect(result.current.watchlist).toContain('TSLA')
  })

  it('ignores empty symbol', async () => {
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = result.current.watchlist.length
    act(() => {
      result.current.addSymbol('  ')
    })
    expect(result.current.watchlist).toHaveLength(before)
  })

  it('removes a symbol from watchlist', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({
        quotes: [{ ...QUOTE_AAPL, symbol: '^GSPC' }, QUOTE_AAPL],
        timestamp: Date.now(),
        version: 2,
      })
    )
    const { result } = renderHook(() => useFinance())
    act(() => {
      result.current.removeSymbol('AAPL')
    })
    expect(result.current.watchlist).not.toContain('AAPL')
  })

  it('removeSymbol removes quote from state', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({
        quotes: [{ ...QUOTE_AAPL, symbol: '^GSPC' }, QUOTE_AAPL],
        timestamp: Date.now(),
        version: 3,
      })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.quotes).toHaveLength(2)
    act(() => {
      result.current.removeSymbol('AAPL')
    })
    expect(result.current.quotes.every(q => q.symbol !== 'AAPL')).toBe(true)
    expect(result.current.watchlist).not.toContain('AAPL')
  })

  it('handles rejected fetchQuote promises', async () => {
    mockFetchQuote.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('ignores duplicate symbol in addSymbol', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now(), version: 3 })
    )
    const { result } = renderHook(() => useFinance())
    const before = result.current.watchlist.length
    act(() => {
      result.current.addSymbol('AAPL')
    })
    expect(result.current.watchlist).toHaveLength(before)
  })

  it('handles partial fetch failure (some symbols succeed)', async () => {
    mockFetchQuote.mockImplementation(async (sym: string) => {
      if (sym === '^GSPC') return { success: true, quote: { ...QUOTE_AAPL, symbol: '^GSPC' } }
      return { success: false, error: `No data for ${sym}` }
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Should still have the successful quote, no error since partial success
    expect(result.current.quotes.length).toBeGreaterThanOrEqual(1)
    expect(result.current.error).toBeNull()
  })

  it('ignores cache with version 0 (undefined version)', () => {
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now() })
    )
    const { result } = renderHook(() => useFinance())
    // version is undefined, so (undefined ?? 0) < 3 → true → returns null → loading
    expect(result.current.loading).toBe(true)
  })

  it('skips fetch on mount when valid cache exists', async () => {
    localStorage.setItem(
      'finance:cache',
      JSON.stringify({ quotes: [QUOTE_AAPL], timestamp: Date.now(), version: 3 })
    )
    const { result } = renderHook(() => useFinance())
    expect(result.current.loading).toBe(false)
    // The mount effect checks readCache() and skips refresh when cache is valid
    expect(mockFetchQuote).not.toHaveBeenCalled()
  })

  it('persists watchlist via IPC when adding a symbol', async () => {
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.addSymbol('TSLA')
    })
    expect(mockInvoke).toHaveBeenCalledWith(
      'config:set-finance-watchlist',
      expect.arrayContaining(['TSLA'])
    )
  })

  it('persists watchlist via IPC when removing a symbol', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.removeSymbol('AAPL')
    })
    expect(mockInvoke).toHaveBeenCalledWith(
      'config:set-finance-watchlist',
      expect.not.arrayContaining(['AAPL'])
    )
  })

  it('hydrates watchlist from IPC on mount when localStorage is empty', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve(['NVDA', 'MSFT'])
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.watchlist).toEqual(['NVDA', 'MSFT']))
    // localStorage should now be primed with the IPC values
    expect(JSON.parse(localStorage.getItem('finance:watchlist') ?? '[]')).toEqual(['NVDA', 'MSFT'])
  })

  it('does not override local mutation when IPC load resolves later', async () => {
    let resolveIpc: ((v: unknown) => void) | null = null
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return new Promise(resolve => {
          resolveIpc = resolve
        })
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    // User adds a symbol BEFORE IPC load resolves
    act(() => {
      result.current.addSymbol('TSLA')
    })
    expect(result.current.watchlist).toContain('TSLA')

    // Now IPC resolves with stale data — must not clobber the user's add
    await act(async () => {
      resolveIpc?.(['NVDA'])
      await Promise.resolve()
    })
    expect(result.current.watchlist).toContain('TSLA')
  })

  it('does not clear watchlist when IPC returns empty array', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve([])
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Defensive: empty IPC response must not wipe the user's persisted list
    expect(result.current.watchlist).toEqual(['^GSPC', 'AAPL'])
  })

  it('logs warning when IPC persist rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:set-finance-watchlist') {
        return Promise.reject(new Error('IPC write failed'))
      }
      if (channel === 'config:get-finance-watchlist') return Promise.resolve(null)
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.addSymbol('TSLA')
    })
    // Flush the rejected promise's .catch handler
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        '[useFinance] Failed to persist watchlist via IPC:',
        expect.any(Error)
      )
    )
  })

  it('skips update when IPC returns identical watchlist', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve(['^GSPC', 'AAPL'])
      }
      return Promise.resolve({ success: true })
    })

    // Install spies BEFORE rendering so every side effect is tracked
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const fetchCallsBefore = mockFetchQuote.mock.calls.length

    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Flush any pending IPC microtasks
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Initial mount triggers refresh() for the 2-symbol watchlist
    const initialFetchCount = mockFetchQuote.mock.calls.length - fetchCallsBefore
    expect(initialFetchCount).toBe(2) // one per symbol on mount
    // No EXTRA fetches from the IPC path — the identical-watchlist skip prevents a second refresh()
    // (if skip logic regressed, we'd see 4 calls instead of 2)

    // No localStorage writes for the watchlist key — skip prevents persist
    const watchlistWrites = setItemSpy.mock.calls.filter(([key]) => key === 'finance:watchlist')
    expect(watchlistWrites).toHaveLength(0)
    // No cache removal — skip prevents safeRemoveItem(CACHE_KEY)
    const cacheRemovals = removeItemSpy.mock.calls.filter(([key]) => key === 'finance:cache')
    expect(cacheRemovals).toHaveLength(0)

    expect(result.current.watchlist).toEqual(['^GSPC', 'AAPL'])
  })

  it('logs warning when IPC config load rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.reject(new Error('IPC read failed'))
      }
      return Promise.resolve({ success: true })
    })
    renderHook(() => useFinance())
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        '[useFinance] Failed to load watchlist from config store:',
        expect.any(Error)
      )
    )
  })

  it('survives missing ipcRenderer gracefully', async () => {
    const orig = window.ipcRenderer
    Object.defineProperty(window, 'ipcRenderer', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // addSymbol must not throw when IPC is unavailable
    expect(() =>
      act(() => {
        result.current.addSymbol('XYZ')
      })
    ).not.toThrow()
    expect(result.current.watchlist).toContain('XYZ')
    Object.defineProperty(window, 'ipcRenderer', {
      value: orig,
      writable: true,
      configurable: true,
    })
  })
})
