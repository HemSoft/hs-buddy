import { execSync } from 'child_process'
import type { TodoistTask, TodoistProject } from '../../src/types/todoist'
import { groupTasksByDate } from '../../src/utils/taskGrouping'
import {
  shouldCheckWindowsMachineScope,
  buildPowershellEnvCommand,
} from '../../src/utils/envLookup'

const TODOIST_BASE = 'https://api.todoist.com/api/v1'

// --- Env resolution (shared with tempoClient via envLookup utils) ---

const ALLOWED_TODOIST_ENV_NAMES = new Set(['TODOIST_API_TOKEN'])
const envCache = new Map<string, string>()

function getEnv(name: string): string | undefined {
  if (envCache.has(name)) return envCache.get(name)

  if (shouldCheckWindowsMachineScope(process.platform, name, ALLOWED_TODOIST_ENV_NAMES)) {
    try {
      const val = execSync(buildPowershellEnvCommand(name), {
        encoding: 'utf8',
        timeout: 5000,
      }).trim()
      if (val) {
        envCache.set(name, val)
        return val
      }
    } catch {
      /* fall through */
    }
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
    return (await res.json()) as T
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
  const data = await apiGet<{ results: TodoistTask[]; next_cursor: string | null }>(
    '/tasks/filter',
    { query: filter }
  )
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

const SHORT_MONTHS = [
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

function formatFilterDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`
}

/** Fetch tasks for the next `days` days plus any overdue, grouped by ISO date. */
export async function fetchUpcoming(days: number = 7): Promise<Map<string, TodoistTask[]>> {
  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() + days)

  const filter = `(overdue | due before: ${formatFilterDate(end)})`
  const tasks = await fetchTasks(filter)
  return groupTasksByDate(tasks)
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
