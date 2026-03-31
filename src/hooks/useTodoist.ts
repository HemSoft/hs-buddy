import { useState, useCallback, useRef, useEffect } from 'react'
import type { TodoistTask, TodoistProject, DayGroup } from '../types/todoist'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(dateStr: string): string {
  const today = todayStr()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  if (dateStr === today) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'

  const d = new Date(dateStr + 'T00:00:00')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`
}

export function useTodoistUpcoming(days: number = 7) {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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

      // Collect overdue tasks (dates before today)
      const todayStr_ = todayStr()
      const overdueTasks: TodoistTask[] = []
      for (const [dateKey, tasks] of Object.entries(data)) {
        if (dateKey < todayStr_) {
          overdueTasks.push(...(tasks as TodoistTask[]))
        }
      }

      const groups: DayGroup[] = []

      // Overdue group (if any)
      if (overdueTasks.length > 0) {
        overdueTasks.sort((a, b) => b.priority - a.priority || a.order - b.order)
        groups.push({ date: 'overdue', label: 'Overdue', tasks: overdueTasks })
      }

      // Build day groups for the next N days (always show all days, even empty)
      const start = new Date()
      for (let i = 0; i < days; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const tasks = (data[dateStr] ?? []) as TodoistTask[]
        // Sort by priority (4=highest) descending, then order
        tasks.sort((a, b) => b.priority - a.priority || a.order - b.order)
        groups.push({ date: dateStr, label: formatDayLabel(dateStr), tasks })
      }
      setDayGroups(groups)
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [days])

  return { dayGroups, isLoading, error, refresh }
}

export function useTodoistProjects() {
  const [projects, setProjects] = useState<TodoistProject[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const result = await window.todoist.getProjects()
      if (mountedRef.current && result.success && result.data) {
        setProjects(result.data)
      }
    } catch {
      /* ignore */
    }
  }, [])

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
