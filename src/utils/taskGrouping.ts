import type { TodoistTask } from '../types/todoist'

/** Group tasks by their ISO date (YYYY-MM-DD), skipping tasks without a due date. */
export function groupTasksByDate(tasks: TodoistTask[]): Map<string, TodoistTask[]> {
  const grouped = new Map<string, TodoistTask[]>()
  for (const task of tasks) {
    const raw = task.due?.date ?? ''
    if (!raw) continue
    const date = raw.length > 10 ? raw.slice(0, 10) : raw
    const bucket = grouped.get(date) ?? []
    bucket.push(task)
    grouped.set(date, bucket)
  }
  return grouped
}
