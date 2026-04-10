import { useState, useCallback, useRef } from 'react'
import type { CopilotSession, SessionScanResult, SessionSummary } from '../types/copilotSession'
import { useIsMounted } from './useIsMounted'

export function useCopilotSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useIsMounted()

  const scan = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result: SessionScanResult = await window.copilotSessions.scan()
      if (mountedRef.current) {
        setSessions(result.sessions)
        setTotalCount(result.totalCount)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to scan sessions')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [mountedRef])

  return { sessions, totalCount, isLoading, error, scan }
}

export function useCopilotSessionDetail() {
  const [session, setSession] = useState<CopilotSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async (filePath: string) => {
    const thisRequest = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.copilotSessions.getSession(filePath)
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
