import { useState, useCallback } from 'react'
import type { TodoistTask, TodoistProject, DayGroup } from '../types/todoist'
import { formatDateKey, MONTH_SHORT, WEEKDAY_SHORT } from '../utils/dateUtils'
import { useIsMounted } from './useIsMounted'

function formatDayLabel(dateStr: string): string {
  const today = formatDateKey(new Date())
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = formatDateKey(tomorrow)

  if (dateStr === today) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'

  const d = new Date(dateStr + 'T00:00:00')
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function collectOverdueTasks(data: Record<string, unknown>, todayStr: string): TodoistTask[] {
  const overdueTasks: TodoistTask[] = []
  for (const [dateKey, tasks] of Object.entries(data)) {
    if (dateKey < todayStr) {
      overdueTasks.push(...(tasks as TodoistTask[]))
    }
  }
  return overdueTasks
}

function buildDayGroups(
  data: Record<string, unknown>,
  overdueTasks: TodoistTask[],
  days: number
): DayGroup[] {
  const groups: DayGroup[] = []

  if (overdueTasks.length > 0) {
    overdueTasks.sort((a, b) => b.priority - a.priority || a.order - b.order)
    groups.push({ date: 'overdue', label: 'Overdue', tasks: overdueTasks })
  }

  const start = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const tasks = (data[dateStr] ?? []) as TodoistTask[]
    tasks.sort((a, b) => b.priority - a.priority || a.order - b.order)
    groups.push({ date: dateStr, label: formatDayLabel(dateStr), tasks })
  }

  return groups
}

export function useTodoistUpcoming(days: number = 7) {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useIsMounted()

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.todoist.getUpcoming(days)
      if (!mountedRef.current) return
      if (!result.success) {
        setError(result.error ?? 'Failed to fetch tasks')
        return
      }
      const data = result.data ?? {}

      const todayStr_ = formatDateKey(new Date())
      const overdueTasks = collectOverdueTasks(data, todayStr_)
      const groups = buildDayGroups(data, overdueTasks, days)
      setDayGroups(groups)
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [days, mountedRef])

  return { dayGroups, isLoading, error, refresh }
}

export function useTodoistProjects() {
  const [projects, setProjects] = useState<TodoistProject[]>([])
  const mountedRef = useIsMounted()

  const load = useCallback(async () => {
    try {
      const result = await window.todoist.getProjects()
      if (mountedRef.current && result.success && result.data) {
        setProjects(result.data)
      }
    } catch {
      /* ignore */
    }
  }, [mountedRef])

  return { projects, load }
}

export function useTaskActions(onRefresh: () => void) {
  const complete = useCallback(
    async (taskId: string) => {
      const result = await window.todoist.completeTask(taskId)
      if (result.success) onRefresh()
      return result
    },
    [onRefresh]
  )

  const reopen = useCallback(
    async (taskId: string) => {
      const result = await window.todoist.reopenTask(taskId)
      if (result.success) onRefresh()
      return result
    },
    [onRefresh]
  )

  const create = useCallback(
    async (params: {
      content: string
      due_date?: string
      priority?: number
      project_id?: string
      description?: string
    }) => {
      const result = await window.todoist.createTask(params)
      if (result.success) onRefresh()
      return result
    },
    [onRefresh]
  )

  const remove = useCallback(
    async (taskId: string) => {
      const result = await window.todoist.deleteTask(taskId)
      if (result.success) onRefresh()
      return result
    },
    [onRefresh]
  )

  return { complete, reopen, create, remove }
}
