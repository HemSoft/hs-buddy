import { useState, useCallback, useRef, useEffect } from 'react'
import type { CopilotSession, SessionScanResult, SessionTotals } from '../types/copilotSession'

const EMPTY_TOTALS: SessionTotals = {
  totalSessions: 0,
  totalRequests: 0,
  totalPromptTokens: 0,
  totalOutputTokens: 0,
  totalToolCalls: 0,
  totalDurationMs: 0,
  modelUsage: {},
  toolUsage: {},
}

export function useCopilotSessions() {
  const [sessions, setSessions] = useState<CopilotSession[]>([])
  const [totals, setTotals] = useState<SessionTotals>(EMPTY_TOTALS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const scan = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result: SessionScanResult = await window.copilotSessions.scan()
      if (mountedRef.current) {
        setSessions(result.sessions)
        setTotals(result.totals)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to scan sessions')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  return { sessions, totals, isLoading, error, scan }
}

export function useCopilotSessionDetail() {
  const [session, setSession] = useState<CopilotSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async (sessionId: string) => {
    const thisRequest = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.copilotSessions.getSession(sessionId)
      if (requestIdRef.current === thisRequest) {
        setSession(result)
      }
    } catch (err) {
      if (requestIdRef.current === thisRequest) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      }
    } finally {
      if (requestIdRef.current === thisRequest) {
        setIsLoading(false)
      }
    }
  }, [])

  return { session, isLoading, error, load }
}
