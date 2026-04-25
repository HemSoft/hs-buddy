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

/**
 * Read the watchlist from the localStorage sync cache.
 *
 * NOTE: localStorage is only the synchronous first-paint cache. The
 * authoritative source is electron-store (loaded via IPC on mount). See
 * `useFinance` below for the full lifecycle. This pattern mirrors
 * `useDashboardCards` and is the project-wide convention for user
 * preferences that must survive across sessions.
 */
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

function sanitizeWatchlist(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const cleaned = raw
    .filter((s): s is string => typeof s === 'string')
    .map(s => s.toUpperCase().trim())
    .filter(s => s.length > 0)
  // Dedupe while preserving order
  const deduped = Array.from(new Set(cleaned))
  // Treat an empty result as invalid — a corrupt/zeroed config should never
  // silently wipe the user's watchlist. The IPC load path will keep whatever
  // is currently in state (defaults or localStorage cache).
  return deduped.length > 0 ? deduped : null
}

/** Extract the rejection message from a Promise.allSettled rejected entry. */
function rejectionMessage(reason: unknown): string {
  /* v8 ignore start */
  return reason instanceof Error ? reason.message : String(reason)
  /* v8 ignore stop */
}

async function fetchQuotes(symbols: string[]): Promise<QuoteData[]> {
  if (!window.finance?.fetchQuote) {
    throw new Error('Finance bridge unavailable — restart the app')
  }

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

  const results = settled.reduce<QuoteData[]>((acc, entry) => {
    if (entry.status === 'fulfilled' && entry.value) acc.push(entry.value)
    /* v8 ignore start */ else if (entry.status === 'rejected')
      errors.push(rejectionMessage(entry.reason))
    /* v8 ignore stop */
    return acc
  }, [])

  // If every symbol failed, throw so the caller sees the error
  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors[0])
  }

  return results
}

/**
 * Persist watchlist to electron-store via IPC. Fire-and-forget; failures are
 * logged but do not block the UI. The localStorage cache (already written by
 * the caller) ensures the next render still sees the new value.
 */
function persistWatchlist(symbols: string[]): void {
  /* v8 ignore start */
  if (!window.ipcRenderer?.invoke) return
  /* v8 ignore stop */
  window.ipcRenderer.invoke('config:set-finance-watchlist', symbols).catch((err: unknown) => {
    console.warn('[useFinance] Failed to persist watchlist via IPC:', err)
  })
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
  // Tracks whether the user has mutated the watchlist locally. If so, we must
  // NOT overwrite their changes when the async IPC load resolves.
  const mutatedRef = useRef(false)

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

      const current = watchlistRef.current
      if (current.includes(upper)) return

      const next = [...current, upper]
      mutatedRef.current = true
      writeWatchlist(next)
      persistWatchlist(next)
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
    const current = watchlistRef.current
    const next = current.filter(s => s !== symbol)
    mutatedRef.current = true
    writeWatchlist(next)
    persistWatchlist(next)
    setWatchlistState(next)

    setState(prev => ({
      ...prev,
      quotes: prev.quotes.filter(q => q.symbol !== symbol),
    }))
  }, [])

  // Async IPC load from electron-store (authoritative source). Mirrors the
  // useDashboardCards pattern: localStorage is the sync first-paint cache,
  // electron-store is the persistent source of truth across app restarts.
  useEffect(() => {
    let cancelled = false
    /* v8 ignore start */
    if (!window.ipcRenderer?.invoke) return
    /* v8 ignore stop */
    window.ipcRenderer
      .invoke('config:get-finance-watchlist')
      .then((raw: unknown) => {
        if (cancelled || mutatedRef.current) return
        const sanitized = sanitizeWatchlist(raw)
        if (sanitized === null) return
        const current = watchlistRef.current
        // Skip update if values match to avoid unnecessary refresh
        if (sanitized.length === current.length && sanitized.every((s, i) => s === current[i])) {
          return
        }
        writeWatchlist(sanitized)
        watchlistRef.current = sanitized
        setWatchlistState(sanitized)
        // Re-fetch quotes against the authoritative list
        safeRemoveItem(CACHE_KEY)
        /* v8 ignore start */
        refresh(sanitized).catch(() => {
          /* v8 ignore stop */
          /* error already handled in state */
        })
      })
      .catch((err: unknown) => {
        console.warn('[useFinance] Failed to load watchlist from config store:', err)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
