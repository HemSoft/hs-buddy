import { useState, useEffect, useRef, useCallback } from 'react'
import { formatDistanceToNow, formatSecondsCountdown } from '../utils/dateUtils'

interface AutoRefreshSettings {
  enabled: boolean
  intervalMinutes: number
}

const STORAGE_PREFIX = 'card-refresh:'
const LAST_REFRESHED_PREFIX = 'card-last-refreshed:'

export const INTERVAL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
]

const ALLOWED_INTERVALS = new Set(INTERVAL_OPTIONS.map(o => o.value))

function readSettings(cardId: string, defaultInterval: number): AutoRefreshSettings {
  const fallback: AutoRefreshSettings = {
    enabled: false,
    intervalMinutes: ALLOWED_INTERVALS.has(defaultInterval) ? defaultInterval : 0,
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${cardId}`)
    if (raw) {
      const parsed = JSON.parse(raw) as AutoRefreshSettings
      if (
        typeof parsed.enabled === 'boolean' &&
        typeof parsed.intervalMinutes === 'number' &&
        Number.isFinite(parsed.intervalMinutes) &&
        ALLOWED_INTERVALS.has(parsed.intervalMinutes)
      ) {
        // Normalize: enabled requires a positive interval
        return {
          ...parsed,
          enabled: parsed.enabled && parsed.intervalMinutes > 0,
        }
      }
      // Corrupt entry — reset to fallback
      localStorage.setItem(`${STORAGE_PREFIX}${cardId}`, JSON.stringify(fallback))
    }
  } catch {
    // corrupt or unavailable
  }
  return fallback
}

function writeSettings(cardId: string, settings: AutoRefreshSettings) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${cardId}`, JSON.stringify(settings))
  } catch {
    // localStorage unavailable
  }
}

function readLastRefreshed(cardId: string): number | null {
  try {
    const raw = localStorage.getItem(`${LAST_REFRESHED_PREFIX}${cardId}`)
    if (raw) {
      const ts = Number(raw)
      if (Number.isFinite(ts) && ts > 0) return ts
    }
  } catch {
    // corrupt or unavailable
  }
  return null
}

function writeLastRefreshed(cardId: string, ts: number) {
  try {
    localStorage.setItem(`${LAST_REFRESHED_PREFIX}${cardId}`, String(ts))
  } catch {
    // localStorage unavailable
  }
}

/**
 * Manages periodic auto-refresh for a dashboard card.
 * Settings are persisted per card in localStorage, defaulting to off.
 *
 * Returns status indicators (last refreshed, countdown to next) using
 * the same formatting utilities as useBackgroundStatus.
 *
 * @param paused - When true, timer ticks are skipped (e.g. while a fetch is in flight).
 */
export function useAutoRefresh(
  cardId: string,
  refreshFn: () => void | Promise<void>,
  defaultIntervalMin = 15,
  paused = false
) {
  const [settings, setSettings] = useState(() => readSettings(cardId, defaultIntervalMin))
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => readLastRefreshed(cardId))
  const refreshRef = useRef(refreshFn)
  refreshRef.current = refreshFn
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const stampRefresh = useCallback(() => {
    const now = Date.now()
    setLastRefreshedAt(now)
    writeLastRefreshed(cardId, now)
  }, [cardId])

  // Stable refresh callback — calls the underlying function and stamps on success.
  const refresh = useCallback(() => {
    try {
      const result = refreshRef.current()
      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            if (mountedRef.current) stampRefresh()
          },
          () => {
            /* failed — don't stamp */
          }
        )
      } else {
        stampRefresh()
      }
    } catch {
      // sync throw — don't stamp
    }
  }, [stampRefresh])

  useEffect(() => {
    if (!settings.enabled || settings.intervalMinutes <= 0) return
    const id = setInterval(() => {
      if (!pausedRef.current) refresh()
    }, settings.intervalMinutes * 60_000)
    return () => clearInterval(id)
  }, [settings.enabled, settings.intervalMinutes, refresh])

  const update = useCallback(
    (partial: Partial<AutoRefreshSettings>) => {
      setSettings(prev => {
        const merged = { ...prev, ...partial }
        // Normalize: clamp interval to allowed values, enforce enabled consistency
        if (
          merged.intervalMinutes !== undefined &&
          !ALLOWED_INTERVALS.has(merged.intervalMinutes)
        ) {
          merged.intervalMinutes = prev.intervalMinutes
        }
        merged.enabled = merged.enabled && merged.intervalMinutes > 0
        writeSettings(cardId, merged)
        return merged
      })
    },
    [cardId]
  )

  const setInterval_ = useCallback(
    (minutes: number) => {
      update({
        enabled: minutes > 0,
        intervalMinutes: minutes > 0 ? minutes : settings.intervalMinutes,
      })
    },
    [update, settings.intervalMinutes]
  )

  // Status indicators — 1-second timer for live countdown
  const [statusLabels, setStatusLabels] = useState({
    lastRefreshedLabel: null as string | null,
    nextRefreshSecs: null as number | null,
    nextRefreshLabel: null as string | null,
  })

  useEffect(() => {
    const compute = () => {
      const lastLabel = lastRefreshedAt ? formatDistanceToNow(lastRefreshedAt) : null

      let nextSecs: number | null = null
      let nextLabel: string | null = null
      if (settings.enabled && !paused && lastRefreshedAt && settings.intervalMinutes > 0) {
        const elapsed = Date.now() - lastRefreshedAt
        const remaining = Math.max(0, settings.intervalMinutes * 60_000 - elapsed)
        nextSecs = Math.ceil(remaining / 1000)
        nextLabel = nextSecs > 0 ? formatSecondsCountdown(nextSecs) : null
      }

      setStatusLabels(prev => {
        if (
          prev.lastRefreshedLabel === lastLabel &&
          prev.nextRefreshSecs === nextSecs &&
          prev.nextRefreshLabel === nextLabel
        ) {
          return prev
        }
        return {
          lastRefreshedLabel: lastLabel,
          nextRefreshSecs: nextSecs,
          nextRefreshLabel: nextLabel,
        }
      })
    }

    compute()
    // Tick every second only while a countdown can change;
    // otherwise tick every 30 seconds for "updated X ago" freshness.
    const shouldUseFastTick =
      settings.enabled && !paused && lastRefreshedAt != null && settings.intervalMinutes > 0
    const tickMs = shouldUseFastTick ? 1000 : 30_000
    const id = setInterval(compute, tickMs)
    return () => clearInterval(id)
  }, [settings.enabled, settings.intervalMinutes, lastRefreshedAt, paused])

  return {
    enabled: settings.enabled,
    intervalMinutes: settings.intervalMinutes,
    update,
    setInterval: setInterval_,
    /** Wrapped refresh that records the timestamp */
    refresh,
    /** Current selected value for the interval dropdown (0 = off, N = minutes) */
    selectedValue: settings.enabled ? settings.intervalMinutes : 0,
    /** Timestamp of the most recent refresh (manual or auto) */
    lastRefreshedAt,
    /** Human-readable "Updated Xm ago" */
    lastRefreshedLabel: statusLabels.lastRefreshedLabel,
    /** Seconds until the next auto-refresh fires */
    nextRefreshSecs: statusLabels.nextRefreshSecs,
    /** Human-readable countdown string, e.g. "12m 30s" */
    nextRefreshLabel: statusLabels.nextRefreshLabel,
  }
}
