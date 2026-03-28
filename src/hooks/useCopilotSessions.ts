import { useState, useCallback } from 'react'
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

  const scan = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result: SessionScanResult = await window.copilotSessions.scan()
      setSessions(result.sessions)
      setTotals(result.totals)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan sessions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { sessions, totals, isLoading, error, scan }
}

export function useCopilotSessionDetail() {
  const [session, setSession] = useState<CopilotSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (sessionId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.copilotSessions.getSession(sessionId)
      setSession(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { session, isLoading, error, load }
}
