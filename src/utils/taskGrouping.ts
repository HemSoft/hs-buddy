import type { TodoistTask } from '../types/todoist'

/** Extract and normalize the ISO date (YYYY-MM-DD) from a task's due field. */
function extractDueDate(task: TodoistTask): string {
  const raw = task.due?.date ?? ''
  return raw.length > 10 ? raw.slice(0, 10) : raw
}

/** Group tasks by their ISO date (YYYY-MM-DD), skipping tasks without a due date. */
export function groupTasksByDate(tasks: TodoistTask[]): Map<string, TodoistTask[]> {
  const grouped = new Map<string, TodoistTask[]>()
  for (const task of tasks) {
    const date = extractDueDate(task)
    if (!date) continue
    const bucket = grouped.get(date) ?? []
    bucket.push(task)
    grouped.set(date, bucket)
  }
  return grouped
}
