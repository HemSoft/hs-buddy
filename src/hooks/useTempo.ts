import { useState, useEffect, useCallback } from 'react'
import type {
  TempoDaySummary,
  TempoWorklog,
  TempoIssueSummary,
  TempoScheduleDay,
  CreateWorklogPayload,
  UpdateWorklogPayload,
} from '../types/tempo'
import { formatDateKey } from '../utils/dateUtils'

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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.tempo.getToday(date || todayStr())
    if (result.success && result.data) {
      setData(result.data)
    } else {
      setError(result.error || 'Failed to load worklogs')
    }
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}

// --- useTempoMonth ---

export function useTempoMonth(from: string, to: string) {
  const [worklogs, setWorklogs] = useState<TempoWorklog[]>([])
  const [issueSummaries, setIssueSummaries] = useState<TempoIssueSummary[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.tempo.getWeek(from, to)
    if (result.success && result.data) {
      setWorklogs(result.data.worklogs)
      setIssueSummaries(result.data.issueSummaries)
      setTotalHours(result.data.totalHours)
    } else {
      setError(result.error || 'Failed to load month data')
    }
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  return { worklogs, issueSummaries, totalHours, loading, error, refresh: load }
}

// --- useCapexMap ---

export function useCapexMap(issueKeys: string[]) {
  const [capexMap, setCapexMap] = useState<Record<string, boolean>>({})
  const keysKey = issueKeys.slice().sort().join(',')

  useEffect(() => {
    if (!issueKeys.length) {
      setCapexMap({})
      return
    }
    let stale = false
    window.tempo.getCapexMap(issueKeys).then(result => {
      if (!stale && result.success && result.data) setCapexMap(result.data)
    })
    return () => { stale = true }
  }, [keysKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return capexMap
}

// --- useUserSchedule ---

export function useUserSchedule(from: string, to: string) {
  const [schedule, setSchedule] = useState<TempoScheduleDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.tempo.getSchedule(from, to)
    if (result.success && result.data) {
      setSchedule(result.data)
    } else {
      setError(result.error || 'Failed to load schedule')
    }
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    let stale = false
    load().then(() => { if (stale) return })
    return () => { stale = true }
  }, [load])

  return { schedule, loading, error, refresh: load }
}

// --- useTempoActions ---

export function useTempoActions(onMutated?: () => void) {
  const [pending, setPending] = useState(false)

  const create = useCallback(
    async (payload: CreateWorklogPayload) => {
      setPending(true)
      const result = await window.tempo.createWorklog(payload)
      setPending(false)
      if (result.success) onMutated?.()
      return result
    },
    [onMutated]
  )

  const update = useCallback(
    async (worklogId: number, payload: UpdateWorklogPayload) => {
      setPending(true)
      const result = await window.tempo.updateWorklog(worklogId, payload)
      setPending(false)
      if (result.success) onMutated?.()
      return result
    },
    [onMutated]
  )

  const remove = useCallback(
    async (worklogId: number) => {
      setPending(true)
      const result = await window.tempo.deleteWorklog(worklogId)
      setPending(false)
      if (result.success) onMutated?.()
      return result
    },
    [onMutated]
  )

  return { create, update, remove, pending }
}
