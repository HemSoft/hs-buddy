import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import type {
  TempoDaySummary,
  TempoWorklog,
  TempoIssueSummary,
  TempoScheduleDay,
  CreateWorklogPayload,
  UpdateWorklogPayload,
  TempoResult,
} from '../types/tempo'
import { formatDateKey } from '../utils/dateUtils'

async function runTempoOperation<T>(
  operation: () => Promise<TempoResult<T>>,
  fallback: string
): Promise<TempoResult<T>> {
  try {
    return await operation()
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : fallback }
  }
}

function todayStr(): string {
  return formatDateKey(new Date())
}

/** Get first and last day of the month containing `date` */
export function getMonthRange(date: Date): { from: string; to: string } {
  const y = date.getFullYear()
  const m = date.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  return { from: formatDateKey(first), to: formatDateKey(last) }
}

// --- useTempoToday ---

export function useTempoToday(date?: string) {
  const [data, setData] = useState<TempoDaySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await runTempoOperation(
        () => window.tempo.getToday(date || todayStr()),
        'Failed to load worklogs'
      )
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to load worklogs')
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [date])

  useLayoutEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  return { data, loading, error, refresh: load }
}

// --- useTempoMonth ---

export function useTempoMonth(from: string, to: string) {
  const [worklogs, setWorklogs] = useState<TempoWorklog[]>([])
  const [issueSummaries, setIssueSummaries] = useState<TempoIssueSummary[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await runTempoOperation(
        () => window.tempo.getWeek(from, to),
        'Failed to load month data'
      )
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (result.success && result.data) {
        setWorklogs(result.data.worklogs)
        setIssueSummaries(result.data.issueSummaries)
        setTotalHours(result.data.totalHours)
      } else {
        setError(result.error || 'Failed to load month data')
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [from, to])

  useLayoutEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  return { worklogs, issueSummaries, totalHours, loading, error, refresh: load }
}

// --- useCapexMap ---

export function useCapexMap(issueKeys: string[]) {
  const [capexMap, setCapexMap] = useState<Record<string, boolean>>({})
  const keysKey = issueKeys.slice().sort().join(',')
  const stableIssueKeys = useMemo(() => (keysKey ? keysKey.split(',') : []), [keysKey])

  /* v8 ignore start */
  if (!issueKeys.length && Object.keys(capexMap).length > 0) {
    setCapexMap({})
  }
  /* v8 ignore stop */

  useEffect(() => {
    if (!stableIssueKeys.length) {
      return
    }
    let stale = false
    window.tempo.getCapexMap(stableIssueKeys).then(result => {
      if (!stale && result.success && result.data) setCapexMap(result.data)
    })
    return () => {
      stale = true
    }
  }, [stableIssueKeys])

  return capexMap
}

// --- useUserSchedule ---

export function useUserSchedule(from: string, to: string) {
  const [schedule, setSchedule] = useState<TempoScheduleDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await runTempoOperation(
        () => window.tempo.getSchedule(from, to),
        'Failed to load schedule'
      )
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (result.success && result.data) {
        setSchedule(result.data)
      } else {
        setError(result.error || 'Failed to load schedule')
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [from, to])

  useLayoutEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  return { schedule, loading, error, refresh: load }
}

// --- useTempoActions ---

export function useTempoActions(onMutated?: () => void) {
  const [pending, setPending] = useState(false)
  const activeRequests = useRef(new Set<symbol>())
  const onMutatedRef = useRef(onMutated)

  useLayoutEffect(() => {
    onMutatedRef.current = onMutated
  }, [onMutated])

  useLayoutEffect(() => {
    const requests = activeRequests.current
    return () => {
      requests.clear()
    }
  }, [])

  const run = useCallback(
    async <T>(operation: () => Promise<TempoResult<T>>): Promise<TempoResult<T>> => {
      const request = Symbol()
      activeRequests.current.add(request)
      setPending(true)
      try {
        const result = await runTempoOperation(operation, 'Failed to save worklog changes')
        if (activeRequests.current.has(request) && result.success) onMutatedRef.current?.()
        return result
      } finally {
        if (activeRequests.current.delete(request)) {
          setPending(activeRequests.current.size > 0)
        }
      }
    },
    []
  )

  const create = useCallback(
    (payload: CreateWorklogPayload) => run(() => window.tempo.createWorklog(payload)),
    [run]
  )
  const update = useCallback(
    (worklogId: number, payload: UpdateWorklogPayload) =>
      run(() => window.tempo.updateWorklog(worklogId, payload)),
    [run]
  )
  const remove = useCallback(
    (worklogId: number) => run(() => window.tempo.deleteWorklog(worklogId)),
    [run]
  )

  return { create, update, remove, pending }
}
