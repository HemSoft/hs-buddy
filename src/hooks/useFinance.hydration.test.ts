import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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

/**
 * Hydration of the watchlist from electron-store over IPC: what the
 * authoritative config may and may not override after first paint.
 */
function resetMocks(): void {
  vi.clearAllMocks()
  localStorage.clear()
  mockFetchQuote.mockResolvedValue({ success: true, quote: QUOTE_AAPL })
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'config:get-finance-watchlist') {
      return Promise.resolve(null)
    }
    return Promise.resolve({ success: true })
  })
}

describe('useFinance hydration from IPC', () => {
  beforeEach(resetMocks)
  afterEach(() => vi.restoreAllMocks())

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

  it('sanitizes non-string and empty entries from IPC watchlist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve(['nvda', 123, '', '   ', 'MSFT'])
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.watchlist).toEqual(['NVDA', 'MSFT']))
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
})

describe('useFinance hydration of empty and corrupt lists', () => {
  beforeEach(resetMocks)
  afterEach(() => vi.restoreAllMocks())

  it('clears the watchlist when the config holds an explicitly empty array', async () => {
    // The last symbol was removed (here or in the native app) and [] was
    // persisted; hydration must honour that instead of resurrecting the cache.
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve([])
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.watchlist).toEqual([]))
    expect(result.current.loading).toBe(false)
    expect(result.current.quotes).toEqual([])
    expect(JSON.parse(localStorage.getItem('finance:watchlist') ?? 'null')).toEqual([])
  })

  it('does not clear watchlist when the config list has no usable entry', async () => {
    localStorage.setItem('finance:watchlist', JSON.stringify(['^GSPC', 'AAPL']))
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-finance-watchlist') {
        return Promise.resolve([123, '', '   '])
      }
      return Promise.resolve({ success: true })
    })
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Corrupt, not emptied: the persisted list stays
    expect(result.current.watchlist).toEqual(['^GSPC', 'AAPL'])
  })
})
