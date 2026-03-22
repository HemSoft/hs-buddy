import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  TempoDaySummary,
  TempoWorklog,
  TempoIssueSummary,
  TempoAccount,
  CreateWorklogPayload,
  UpdateWorklogPayload,
} from '../types/tempo'
import { formatDateKey } from '../utils/dateUtils'

function todayStr(): string {
  return formatDateKey(new Date())
}

/** Get Monday of the week containing `date` */
export function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatDateKey(d)
}

/** Get Friday (or Sunday if you want 7 days) of the week containing `date` */
export function getWeekEnd(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 0 : 5 - day
  d.setDate(d.getDate() + diff)
  return formatDateKey(d)
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

// --- useTempoWeek ---

export function useTempoWeek(weekStart: string, weekEnd: string) {
  const [worklogs, setWorklogs] = useState<TempoWorklog[]>([])
  const [issueSummaries, setIssueSummaries] = useState<TempoIssueSummary[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.tempo.getWeek(weekStart, weekEnd)
    if (result.success && result.data) {
      setWorklogs(result.data.worklogs)
      setIssueSummaries(result.data.issueSummaries)
      setTotalHours(result.data.totalHours)
    } else {
      setError(result.error || 'Failed to load week data')
    }
    setLoading(false)
  }, [weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  return { worklogs, issueSummaries, totalHours, loading, error, refresh: load }
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

// --- useTempoAccounts ---

export function useTempoAccounts() {
  const [accounts, setAccounts] = useState<TempoAccount[]>([])
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    window.tempo.getAccounts().then(result => {
      if (result.success && result.data) setAccounts(result.data)
    })
  }, [])

  return accounts
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
