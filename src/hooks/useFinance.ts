import { useState, useEffect, useCallback, useRef } from 'react'

export interface QuoteData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  previousClose: number
}

interface FinanceState {
  quotes: QuoteData[]
  loading: boolean
  error: string | null
}

const CACHE_KEY = 'finance:cache'
const CACHE_VERSION = 2
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const WATCHLIST_KEY = 'finance:watchlist'

const DEFAULT_WATCHLIST = ['^GSPC', '^IXIC', '^DJI', 'BTC-USD']

function readCache(): { quotes: QuoteData[]; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { quotes: QuoteData[]; timestamp: number; version?: number }
      if ((parsed.version ?? 0) < CACHE_VERSION) return null
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) return parsed
    }
  } catch {
    // corrupt or unavailable
  }
  return null
}

function writeCache(quotes: QuoteData[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ quotes, timestamp: Date.now(), version: CACHE_VERSION })
    )
  } catch {
    // localStorage unavailable
  }
}

export function readWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as string[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // corrupt or unavailable
  }
  return DEFAULT_WATCHLIST
}

function writeWatchlist(symbols: string[]) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols))
  } catch {
    // localStorage unavailable
  }
}

async function fetchQuotes(symbols: string[]): Promise<QuoteData[]> {
  if (!window.finance?.fetchQuote) {
    throw new Error('Finance bridge unavailable — restart the app')
  }

  const results: QuoteData[] = []
  const errors: string[] = []

  const settled = await Promise.allSettled(
    symbols.map(async symbol => {
      const result = await window.finance.fetchQuote(symbol)
      if (result.success && result.quote) return result.quote
      errors.push(result.error ?? `No data for ${symbol}`)
      return null
    })
  )
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value)
    } else if (result.status === 'rejected') {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
  }

  // If every symbol failed, throw so the caller sees the error
  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors[0])
  }

  return results
}

export function useFinance() {
  const [watchlist, setWatchlistState] = useState<string[]>(readWatchlist)

  const [state, setState] = useState<FinanceState>(() => {
    const cached = readCache()
    return cached
      ? { quotes: cached.quotes, loading: false, error: null }
      : { quotes: [], loading: true, error: null }
  })

  const abortRef = useRef(false)

  const refresh = useCallback((symbols?: string[]) => {
    const list = symbols ?? readWatchlist()
    abortRef.current = false

    setState(prev => ({ ...prev, loading: true, error: null }))

    fetchQuotes(list)
      .then(quotes => {
        if (!abortRef.current) {
          writeCache(quotes)
          setState({ quotes, loading: false, error: null })
        }
      })
      .catch(err => {
        if (!abortRef.current) {
          setState(prev => ({
            quotes: prev.quotes,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to fetch quotes',
          }))
        }
      })
  }, [])

  const addSymbol = useCallback(
    (symbol: string) => {
      const upper = symbol.toUpperCase().trim()
      if (!upper) return

      const current = readWatchlist()
      if (current.includes(upper)) return

      const next = [...current, upper]
      writeWatchlist(next)
      setWatchlistState(next)

      try {
        localStorage.removeItem(CACHE_KEY)
      } catch {
        /* noop */
      }
      refresh(next)
    },
    [refresh]
  )

  const removeSymbol = useCallback((symbol: string) => {
    const current = readWatchlist()
    const next = current.filter(s => s !== symbol)
    writeWatchlist(next)
    setWatchlistState(next)

    setState(prev => ({
      ...prev,
      quotes: prev.quotes.filter(q => q.symbol !== symbol),
    }))
  }, [])

  useEffect(() => {
    if (!readCache()) {
      refresh()
    }
    return () => {
      abortRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, watchlist, refresh: () => refresh(), addSymbol, removeSymbol }
}
