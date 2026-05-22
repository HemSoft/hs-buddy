import React, { useState, useEffect, useCallback, useRef } from 'react'
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

const POLLEN_COLORS: ReadonlyArray<{ max: number; color: string }> = [
  { max: 0, color: 'var(--text-muted)' },
  { max: 1, color: '#4caf50' },
  { max: 2, color: '#8bc34a' },
  { max: 3, color: '#ffc107' },
  { max: 4, color: '#ff9800' },
]

export function getPollenColor(index: number): string {
  return POLLEN_COLORS.find(c => index <= c.max)?.color ?? '#f44336'
}

const COORD_TOLERANCE = 0.01 // ~1km

function readPollenCache(lat: number, lon: number): PollenData | null {
  const cached = safeGetJson<PollenCache>(POLLEN_CACHE_KEY)
  if (!cached) return null
  if ((cached.version ?? 0) < POLLEN_CACHE_VERSION) return null
  if (Date.now() - cached.timestamp > POLLEN_CACHE_TTL_MS) return null
  // Invalidate if location changed
  if (
    Math.abs(cached.location.latitude - lat) > COORD_TOLERANCE ||
    Math.abs(cached.location.longitude - lon) > COORD_TOLERANCE
  ) {
    return null
  }
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

function applyPollenResult(
  result: PollenFetchResult,
  latitude: number,
  longitude: number,
  setState: React.Dispatch<React.SetStateAction<PollenState>>
): void {
  if (result.success && result.data) {
    writePollenCache(result.data, latitude, longitude)
    setState({ data: result.data, loading: false, error: null })
    return
  }
  if (result.error === 'no-api-key') {
    setState({ data: null, loading: false, error: null })
    return
  }
  setState(prev => ({
    data: prev.data,
    loading: false,
    error: result.error ?? 'Pollen fetch failed',
  }))
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

    // Check cache first
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
      applyPollenResult(result, latitude, longitude, setState)
    } catch (_: unknown) {
      // IPC unavailable (test env, non-Electron) → silent no-op
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
