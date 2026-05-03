import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  RalphRunInfo,
  RalphLaunchConfig,
  RalphLaunchResult,
  RalphStopResult,
} from '../types/ralph'

const POLL_INTERVAL_MS = 3_000

/** Hook for managing ralph loop state with IPC + real-time push events. */
export function useRalphLoops() {
  const [runs, setRuns] = useState<RalphRunInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.ralph.list()
      if (!mountedRef.current) return
      if (Array.isArray(result)) {
        setRuns(result)
        setError(null)
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to list loops')
    } finally {
      if (mountedRef.current) setLoading(false)
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
    return () => clearInterval(timer)
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

  return { runs, loading, error, launch, stop, refresh }
}
