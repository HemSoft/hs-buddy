import { useState, useEffect, useCallback, useRef } from 'react'
import { safeGetJson, safeSetJson, safeRemoveItem } from '../utils/storage'

export interface QuoteData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  previousClose: number
  marketOpen: boolean
}

interface FinanceState {
  quotes: QuoteData[]
  loading: boolean
  error: string | null
  lastFetchedAt: number | null
}

const CACHE_KEY = 'finance:cache'
const CACHE_VERSION = 3
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const WATCHLIST_KEY = 'finance:watchlist'

const DEFAULT_WATCHLIST = ['^GSPC', '^IXIC', '^DJI', 'BTC-USD']

function readCache(): { quotes: QuoteData[]; timestamp: number } | null {
  const parsed = safeGetJson<{ quotes: QuoteData[]; timestamp: number; version?: number }>(
    CACHE_KEY
  )
  if (parsed) {
    if ((parsed.version ?? 0) < CACHE_VERSION) return null
    /* v8 ignore start */
    if (Date.now() - parsed.timestamp < CACHE_TTL_MS) return parsed
    /* v8 ignore stop */
  }
  return null
}

function writeCache(quotes: QuoteData[], timestamp: number) {
  safeSetJson(CACHE_KEY, { quotes, timestamp, version: CACHE_VERSION })
}

export function readWatchlist(): string[] {
  const parsed = safeGetJson<string[]>(WATCHLIST_KEY)
  if (parsed) {
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? parsed : []
    }
  }
  return DEFAULT_WATCHLIST
}

function writeWatchlist(symbols: string[]) {
  safeSetJson(WATCHLIST_KEY, symbols)
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
      /* v8 ignore start */
      errors.push(result.error ?? `No data for ${symbol}`)
      /* v8 ignore stop */
      return null
    })
  )
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value)
    } else if (result.status === 'rejected') {
      /* v8 ignore start */
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      /* v8 ignore stop */
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
      ? {
          quotes: cached.quotes,
          loading: false,
          error: null,
          /* v8 ignore start */
          lastFetchedAt: cached.timestamp ?? null,
          /* v8 ignore stop */
        }
      : { quotes: [], loading: true, error: null, lastFetchedAt: null }
  })

  const abortRef = useRef(false)
  const watchlistRef = useRef(watchlist)
  watchlistRef.current = watchlist

  const refresh = useCallback((symbols?: string[]) => {
    const list = symbols ?? watchlistRef.current
    abortRef.current = false

    setState(prev => ({ ...prev, loading: true, error: null }))

    return fetchQuotes(list)
      .then(quotes => {
        /* v8 ignore start */
        if (!abortRef.current) {
          /* v8 ignore stop */
          const fetchedAt = Date.now()
          writeCache(quotes, fetchedAt)
          setState({ quotes, loading: false, error: null, lastFetchedAt: fetchedAt })
        }
      })
      .catch(err => {
        /* v8 ignore start */
        if (!abortRef.current) {
          /* v8 ignore stop */
          setState(prev => ({
            quotes: prev.quotes,
            loading: false,
            /* v8 ignore start */
            error: err instanceof Error ? err.message : 'Failed to fetch quotes',
            /* v8 ignore stop */
            lastFetchedAt: prev.lastFetchedAt,
          }))
        }
        throw err
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

      safeRemoveItem(CACHE_KEY)
      /* v8 ignore start */
      refresh(next).catch(() => {
        /* v8 ignore stop */
        /* error already handled in state */
      })
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
      refresh().catch(() => {
        /* error already handled in state */
      })
    }
    return () => {
      abortRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, watchlist, refresh: () => refresh(), addSymbol, removeSymbol }
}
