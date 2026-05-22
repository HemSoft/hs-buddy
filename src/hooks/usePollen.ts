import { useState, useEffect, useCallback, useRef } from 'react'
import { safeGetJson, safeSetJson, safeRemoveItem } from '../utils/storage'
import { IPC_INVOKE } from '../ipc/contracts'

export interface PollenSpecies {
  code: string
  displayName: string
  index: number
  category: string
  inSeason: boolean
  type: 'TREE' | 'GRASS' | 'WEED'
}

export interface PollenData {
  tree: number
  grass: number
  weed: number
  species: PollenSpecies[]
  healthRecommendations: string[]
}

interface PollenCache {
  data: PollenData
  timestamp: number
  version: number
  location: { latitude: number; longitude: number }
}

interface PollenState {
  data: PollenData | null
  loading: boolean
  error: string | null
}

const POLLEN_CACHE_KEY = 'pollen:cache'
const POLLEN_CACHE_VERSION = 1
const POLLEN_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

/** Pollen index labels (Google UPI 0-5 scale) */
export const POLLEN_LABELS = ['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'] as const

type PollenLevel = (typeof POLLEN_LABELS)[number]

export function getPollenLabel(index: number): PollenLevel {
  const clamped = Math.max(0, Math.min(5, Math.round(index)))
  return POLLEN_LABELS[clamped]
}

export function getPollenColor(index: number): string {
  if (index <= 0) return 'var(--text-muted)'
  if (index <= 1) return '#4caf50' // green
  if (index <= 2) return '#8bc34a' // light green
  if (index <= 3) return '#ffc107' // amber
  if (index <= 4) return '#ff9800' // orange
  return '#f44336' // red
}

const COORD_TOLERANCE = 0.01 // ~1km

function isLocationChanged(cached: PollenCache, lat: number, lon: number): boolean {
  return (
    Math.abs(cached.location.latitude - lat) > COORD_TOLERANCE ||
    Math.abs(cached.location.longitude - lon) > COORD_TOLERANCE
  )
}

function readPollenCache(lat: number, lon: number): PollenData | null {
  const cached = safeGetJson<PollenCache>(POLLEN_CACHE_KEY)
  if (!cached) return null
  if ((cached.version ?? 0) < POLLEN_CACHE_VERSION) return null
  if (Date.now() - cached.timestamp > POLLEN_CACHE_TTL_MS) return null
  if (isLocationChanged(cached, lat, lon)) return null
  return cached.data
}

function writePollenCache(data: PollenData, lat: number, lon: number): void {
  safeSetJson(POLLEN_CACHE_KEY, {
    data,
    timestamp: Date.now(),
    version: POLLEN_CACHE_VERSION,
    location: { latitude: lat, longitude: lon },
  })
}

export function clearPollenCache(): void {
  safeRemoveItem(POLLEN_CACHE_KEY)
}

interface PollenFetchResult {
  success: boolean
  data?: PollenData
  error?: string
}

function resolvePollenState(result: PollenFetchResult, lat: number, lon: number): PollenState {
  if (result.success && result.data) {
    writePollenCache(result.data, lat, lon)
    return { data: result.data, loading: false, error: null }
  }
  if (result.error === 'no-api-key') {
    return { data: null, loading: false, error: null }
  }
  return { data: null, loading: false, error: result.error ?? 'Pollen fetch failed' }
}

/**
 * Hook that fetches pollen data from Google Pollen API via the main process.
 * Requires a Google Cloud API key configured in Settings → Weather.
 * Returns null data (no error) when no API key is configured.
 */
export function usePollen(location: { latitude: number; longitude: number } | null) {
  const [state, setState] = useState<PollenState>({ data: null, loading: false, error: null })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!location) return

    const { latitude, longitude } = location

    const cached = readPollenCache(latitude, longitude)
    if (cached) {
      setState({ data: cached, loading: false, error: null })
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = (await window.ipcRenderer.invoke(IPC_INVOKE.POLLEN_FETCH_CURRENT, {
        latitude,
        longitude,
      })) as PollenFetchResult

      if (!mountedRef.current) return
      setState(resolvePollenState(result, latitude, longitude))
    } catch (_: unknown) {
      if (mountedRef.current) {
        setState({ data: null, loading: false, error: null })
      }
    }
  }, [location])

  // Fetch on mount and when location changes
  useEffect(() => {
    if (location) {
      refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude])

  return { ...state, refresh }
}
