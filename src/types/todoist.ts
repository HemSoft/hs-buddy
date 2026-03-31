/** Todoist API v1 types */

export interface TodoistTask {
  id: string
  content: string
  description: string
  project_id: string
  priority: 1 | 2 | 3 | 4
  due: {
    date: string
    datetime?: string
    string: string
    timezone?: string
  } | null
  labels: string[]
  is_completed: boolean
  created_at: string
  order: number
}

export interface TodoistProject {
  id: string
  name: string
  color: string
  parent_id: string | null
  order: number
}

export interface DayGroup {
  date: string // ISO date YYYY-MM-DD
  label: string // "Today", "Tomorrow", "Wed, Apr 2"
  tasks: TodoistTask[]
}
