import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { readWatchlist, useFinance } from './useFinance'

const mockFetchQuote = vi.fn()
Object.defineProperty(window, 'finance', {
  value: { fetchQuote: mockFetchQuote },
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

  it('handles rejected fetchQuote promises', async () => {
    mockFetchQuote.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useFinance())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })
})
