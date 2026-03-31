import { execSync } from 'child_process'
import type { TodoistTask, TodoistProject } from '../../src/types/todoist'

const TODOIST_BASE = 'https://api.todoist.com/api/v1'

// --- Env resolution (same pattern as tempoClient) ---

const envCache = new Map<string, string>()

function getEnv(name: string): string | undefined {
  if (envCache.has(name)) return envCache.get(name)

  if (process.platform === 'win32') {
    try {
      const escapedName = name.replace(/'/g, "''")
      const val = execSync(
        `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${escapedName}','Machine')"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()
      if (val) {
        envCache.set(name, val)
        return val
      }
    } catch { /* fall through */ }
  }

  const val = process.env[name]
  if (val) {
    envCache.set(name, val)
    return val
  }
  return undefined
}

function getToken(): string {
  const token = getEnv('TODOIST_API_TOKEN')
  if (!token) throw new Error('TODOIST_API_TOKEN environment variable not set')
  return token
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  }
}

// --- In-memory project cache ---

let cachedProjects: TodoistProject[] | null = null
let projectsCachedAt = 0
const PROJECTS_CACHE_TTL = 5 * 60 * 1000

// --- API helpers ---

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${TODOIST_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url.toString(), { headers: headers(), signal: controller.signal })
    if (!res.ok) throw new Error(`Todoist API error (${res.status})`)
    return await res.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`${TODOIST_BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Todoist API error (${res.status})`)
    // close/reopen return 200 with null body in v1
    const text = await res.text()
    if (!text || text === 'null') return undefined as unknown as T
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function apiDelete(path: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`${TODOIST_BASE}${path}`, {
      method: 'DELETE',
      headers: headers(),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Todoist API error (${res.status})`)
  } finally {
    clearTimeout(timeout)
  }
}

// --- Public API ---

export async function fetchTasks(filter: string): Promise<TodoistTask[]> {
  const data = await apiGet<{ results: TodoistTask[]; next_cursor: string | null }>('/tasks/filter', { query: filter })
  return data.results
}

export async function fetchProjects(): Promise<TodoistProject[]> {
  const now = Date.now()
  if (cachedProjects && now - projectsCachedAt < PROJECTS_CACHE_TTL) return cachedProjects
  const data = await apiGet<{ results: TodoistProject[]; next_cursor: string | null }>('/projects')
  cachedProjects = data.results
  projectsCachedAt = now
  return cachedProjects
}

/** Fetch tasks for the next `days` days plus any overdue, grouped by ISO date. */
export async function fetchUpcoming(days: number = 7): Promise<Map<string, TodoistTask[]>> {
  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() + days)

  const formatFilter = (d: Date) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`
  }

  const filter = `(overdue | due before: ${formatFilter(end)})`
  const tasks = await fetchTasks(filter)

  const grouped = new Map<string, TodoistTask[]>()
  for (const task of tasks) {
    const raw = task.due?.date ?? ''
    if (!raw) continue
    // Normalise datetime strings (e.g. "2026-03-30T08:00:00") to date-only
    const date = raw.length > 10 ? raw.slice(0, 10) : raw
    const bucket = grouped.get(date) ?? []
    bucket.push(task)
    grouped.set(date, bucket)
  }
  return grouped
}

export async function completeTask(taskId: string): Promise<void> {
  await apiPost(`/tasks/${encodeURIComponent(taskId)}/close`)
}

export async function reopenTask(taskId: string): Promise<void> {
  await apiPost(`/tasks/${encodeURIComponent(taskId)}/reopen`)
}

export async function createTask(params: {
  content: string
  due_date?: string
  priority?: number
  project_id?: string
  description?: string
}): Promise<TodoistTask> {
  return apiPost<TodoistTask>('/tasks', params)
}

export async function updateTask(
  taskId: string,
  params: { content?: string; due_date?: string; priority?: number; description?: string }
): Promise<TodoistTask> {
  return apiPost<TodoistTask>(`/tasks/${encodeURIComponent(taskId)}`, params)
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiDelete(`/tasks/${encodeURIComponent(taskId)}`)
}
