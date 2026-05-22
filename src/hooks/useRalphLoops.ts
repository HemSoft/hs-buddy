import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  RalphRunInfo,
  RalphLaunchConfig,
  RalphLaunchResult,
  RalphStopResult,
} from '../types/ralph'

const POLL_INTERVAL_MS = 3_000

function resolveRalphRefreshError(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to list loops'
}

function handleRalphRefreshSuccess(
  result: unknown,
  mountedRef: { current: boolean },
  setRuns: (value: RalphRunInfo[]) => void,
  setError: (value: string | null) => void
): void {
  if (!mountedRef.current) return
  if (Array.isArray(result)) {
    setRuns(result as RalphRunInfo[])
    setError(null)
  }
}

function handleRalphRefreshFailure(
  err: unknown,
  mountedRef: { current: boolean },
  setError: (value: string) => void
): void {
  if (!mountedRef.current) return
  setError(resolveRalphRefreshError(err))
}

function finalizeRalphRefresh(
  mountedRef: { current: boolean },
  setLoading: (value: boolean) => void
): void {
  if (mountedRef.current) setLoading(false)
}

/** Hook for managing ralph loop state with IPC + real-time push events. */
export function useRalphLoops() {
  const [runs, setRuns] = useState<RalphRunInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.ralph.list()
      handleRalphRefreshSuccess(result, mountedRef, setRuns, setError)
    } catch (err: unknown) {
      handleRalphRefreshFailure(err, mountedRef, setError)
    } finally {
      finalizeRalphRefresh(mountedRef, setLoading)
    }
  }, [])

  // Initial load
  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => {
      mountedRef.current = false
    }
  }, [refresh])

  // Real-time push from main process
  useEffect(() => {
    const handleUpdate = (...args: unknown[]) => {
      if (!mountedRef.current) return
      const updatedRun = args[0] as RalphRunInfo
      setRuns(prev => {
        const idx = prev.findIndex(r => r.runId === updatedRun.runId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updatedRun
          return next
        }
        return [updatedRun, ...prev]
      })
    }

    window.ralph.onStatusChange(handleUpdate)
    return () => {
      window.ralph.offStatusChange(handleUpdate)
    }
  }, [])

  // Fallback polling for any missed events
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'running' || r.status === 'pending')
    if (!hasActive) return

    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [runs, refresh])

  const launch = useCallback(
    async (config: RalphLaunchConfig): Promise<RalphLaunchResult> => {
      try {
        const result = await window.ralph.launch(config)
        if (result.success) await refresh()
        return result
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Launch failed' }
      }
    },
    [refresh]
  )

  const stop = useCallback(
    async (runId: string): Promise<RalphStopResult> => {
      try {
        const result = await window.ralph.stop(runId)
        if (result.success) await refresh()
        return result
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Stop failed' }
      }
    },
    [refresh]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { runs, loading, error, clearError, launch, stop, refresh }
}
