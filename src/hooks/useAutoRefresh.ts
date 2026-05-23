import { useState, useEffect, useRef, useCallback } from 'react'
import { formatDistanceToNow, formatSecondsCountdown } from '../utils/dateUtils'
import { safeGetItem, safeSetItem, safeGetJson, safeSetJson } from '../utils/storage'

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

function isValidAutoRefreshSettings(
  parsed: AutoRefreshSettings
): parsed is AutoRefreshSettings & { enabled: boolean; intervalMinutes: number } {
  return (
    typeof parsed.enabled === 'boolean' &&
    typeof parsed.intervalMinutes === 'number' &&
    Number.isFinite(parsed.intervalMinutes) &&
    ALLOWED_INTERVALS.has(parsed.intervalMinutes)
  )
}

function readSettings(cardId: string, defaultInterval: number): AutoRefreshSettings {
  const fallback: AutoRefreshSettings = {
    enabled: false,
    intervalMinutes: ALLOWED_INTERVALS.has(defaultInterval) ? defaultInterval : 0,
  }
  const parsed = safeGetJson<AutoRefreshSettings>(`${STORAGE_PREFIX}${cardId}`)
  if (parsed && isValidAutoRefreshSettings(parsed)) {
    return { ...parsed, enabled: parsed.enabled && parsed.intervalMinutes > 0 }
  }
  return fallback
}

function isStoredSettingsCorrupt(cardId: string): boolean {
  const key = `${STORAGE_PREFIX}${cardId}`
  const raw = safeGetItem(key)
  if (raw === null) return false // Key doesn't exist — nothing to repair
  const parsed = safeGetJson<AutoRefreshSettings>(key)
  if (!parsed) return true // Raw exists but parse failed — corrupt JSON
  return !isValidAutoRefreshSettings(parsed)
}

function writeSettings(cardId: string, settings: AutoRefreshSettings) {
  safeSetJson(`${STORAGE_PREFIX}${cardId}`, settings)
}

function readLastRefreshed(cardId: string): number | null {
  const raw = safeGetItem(`${LAST_REFRESHED_PREFIX}${cardId}`)
  if (raw) {
    const ts = Number(raw)
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  return null
}

function writeLastRefreshed(cardId: string, ts: number) {
  safeSetItem(`${LAST_REFRESHED_PREFIX}${cardId}`, String(ts))
}

function isCountdownActive(
  enabled: boolean,
  paused: boolean,
  lastRefreshedAt: number | null,
  intervalMinutes: number
): boolean {
  return enabled && !paused && lastRefreshedAt != null && intervalMinutes > 0
}

interface StatusLabels {
  lastRefreshedLabel: string | null
  nextRefreshSecs: number | null
  nextRefreshLabel: string | null
}

function useRefreshStatusLabels(
  settings: AutoRefreshSettings,
  lastRefreshedAt: number | null,
  paused: boolean
): StatusLabels {
  const [statusLabels, setStatusLabels] = useState<StatusLabels>({
    lastRefreshedLabel: null,
    nextRefreshSecs: null,
    nextRefreshLabel: null,
  })

  useEffect(() => {
    const compute = () => {
      const lastLabel = lastRefreshedAt ? formatDistanceToNow(lastRefreshedAt) : null

      let nextSecs: number | null = null
      let nextLabel: string | null = null
      if (isCountdownActive(settings.enabled, paused, lastRefreshedAt, settings.intervalMinutes)) {
        const elapsed = Date.now() - lastRefreshedAt!
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
    const shouldUseFastTick = isCountdownActive(
      settings.enabled,
      paused,
      lastRefreshedAt,
      settings.intervalMinutes
    )
    const tickMs = shouldUseFastTick ? 1000 : 30_000
    const id = setInterval(compute, tickMs)
    return () => clearInterval(id)
  }, [settings.enabled, settings.intervalMinutes, lastRefreshedAt, paused])

  return statusLabels
}

function mergeSettings(
  prev: AutoRefreshSettings,
  partial: Partial<AutoRefreshSettings>,
  cardId: string
): AutoRefreshSettings {
  const merged = { ...prev, ...partial }
  if (merged.intervalMinutes !== undefined && !ALLOWED_INTERVALS.has(merged.intervalMinutes)) {
    merged.intervalMinutes = prev.intervalMinutes
  }
  merged.enabled = merged.enabled && merged.intervalMinutes > 0
  writeSettings(cardId, merged)
  return merged
}

/**
 * Manages periodic auto-refresh for a dashboard card.
 * Settings are persisted per card in localStorage, defaulting to off.
 *
 * @param paused - When true, timer ticks are skipped (e.g. while a fetch is in flight).
 */
export function useAutoRefresh(
  cardId: string,
  refreshFn: () => void | Promise<void>,
  defaultIntervalMin = 15,
  paused = false,
  externalTimestamp?: number | null
) {
  const [settings, setSettings] = useState(() => readSettings(cardId, defaultIntervalMin))
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => readLastRefreshed(cardId))

  useEffect(() => {
    if (isStoredSettingsCorrupt(cardId)) {
      writeSettings(cardId, settings)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId])

  const refreshRef = useRef(refreshFn)
  refreshRef.current = refreshFn
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const mountedRef = useRef(true)
  useEffect(
    () => () => {
      mountedRef.current = false
    },
    []
  )

  const stampRefresh = useCallback(() => {
    const now = Date.now()
    setLastRefreshedAt(now)
    writeLastRefreshed(cardId, now)
  }, [cardId])

  const refresh = useCallback(() => {
    try {
      const result = refreshRef.current()
      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            if (mountedRef.current) stampRefresh()
          },
          () => {}
        )
      } else {
        stampRefresh()
      }
    } catch (_: unknown) {
      /* sync throw — don't stamp */
    }
  }, [stampRefresh])

  useEffect(() => {
    if (!settings.enabled || settings.intervalMinutes <= 0) return
    const id = setInterval(() => {
      if (!pausedRef.current) refresh()
    }, settings.intervalMinutes * 60_000)
    return () => clearInterval(id)
  }, [settings.enabled, settings.intervalMinutes, refresh])

  useEffect(() => {
    if (
      externalTimestamp != null &&
      (lastRefreshedAt == null || externalTimestamp > lastRefreshedAt)
    ) {
      setLastRefreshedAt(externalTimestamp)
      writeLastRefreshed(cardId, externalTimestamp)
    }
  }, [externalTimestamp, lastRefreshedAt, cardId])

  const update = useCallback(
    (partial: Partial<AutoRefreshSettings>) => {
      setSettings(prev => mergeSettings(prev, partial, cardId))
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

  const statusLabels = useRefreshStatusLabels(settings, lastRefreshedAt, paused)

  return {
    enabled: settings.enabled,
    intervalMinutes: settings.intervalMinutes,
    update,
    setInterval: setInterval_,
    refresh,
    selectedValue: settings.enabled ? settings.intervalMinutes : 0,
    lastRefreshedAt,
    lastRefreshedLabel: statusLabels.lastRefreshedLabel,
    nextRefreshSecs: statusLabels.nextRefreshSecs,
    nextRefreshLabel: statusLabels.nextRefreshLabel,
  }
}
