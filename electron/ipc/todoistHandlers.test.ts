import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchUpcoming = vi.fn()
const mockFetchTasks = vi.fn()
const mockFetchProjects = vi.fn()
const mockCompleteTask = vi.fn()
const mockReopenTask = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()
const mockDeleteTask = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('../services/todoistClient', () => ({
  fetchUpcoming: (...args: unknown[]) => mockFetchUpcoming(...args),
  fetchTasks: (...args: unknown[]) => mockFetchTasks(...args),
  fetchProjects: (...args: unknown[]) => mockFetchProjects(...args),
  completeTask: (...args: unknown[]) => mockCompleteTask(...args),
  reopenTask: (...args: unknown[]) => mockReopenTask(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}))

import { ipcMain } from 'electron'
import { registerTodoistHandlers } from './todoistHandlers'

describe('todoistHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerTodoistHandlers()
  })

  it('registers all expected channels', () => {
    expect(handlers.has('todoist:get-upcoming')).toBe(true)
    expect(handlers.has('todoist:get-today')).toBe(true)
    expect(handlers.has('todoist:complete-task')).toBe(true)
  })

  describe('todoist:get-upcoming', () => {
    const invoke = (...args: unknown[]) => handlers.get('todoist:get-upcoming')!({}, ...args)

    it('fetches upcoming tasks and serializes Map to object', async () => {
      const mockMap = new Map([
        ['2026-01-01', [{ id: '1', content: 'Task 1' }]],
        ['2026-01-02', [{ id: '2', content: 'Task 2' }]],
      ])
      mockFetchUpcoming.mockResolvedValue(mockMap)

      const result = await invoke(7)
      expect(result).toEqual({
        success: true,
        data: {
          '2026-01-01': [{ id: '1', content: 'Task 1' }],
          '2026-01-02': [{ id: '2', content: 'Task 2' }],
        },
      })
    })

    it('clamps days between 1 and 30', async () => {
      mockFetchUpcoming.mockResolvedValue(new Map())
      await invoke(0)
      expect(mockFetchUpcoming).toHaveBeenCalledWith(1) // min is 1

      await invoke(100)
      expect(mockFetchUpcoming).toHaveBeenCalledWith(30) // max is 30
    })

    it('defaults to 7 days when not provided', async () => {
      mockFetchUpcoming.mockResolvedValue(new Map())
      await invoke()
      expect(mockFetchUpcoming).toHaveBeenCalledWith(7)
    })

    it('returns error when service throws', async () => {
      mockFetchUpcoming.mockRejectedValue(new Error('API error'))
      const result = await invoke(7)
      expect(result).toEqual({ success: false, error: 'API error' })
    })
  })

  describe('todoist:get-today', () => {
    it('fetches today tasks', async () => {
      mockFetchTasks.mockResolvedValue([{ id: '1', content: 'Do thing' }])
      const result = await handlers.get('todoist:get-today')!({})
      expect(result).toEqual({ success: true, data: [{ id: '1', content: 'Do thing' }] })
      expect(mockFetchTasks).toHaveBeenCalledWith('today')
    })
  })

  describe('todoist:complete-task', () => {
    it('completes a task and returns success', async () => {
      mockCompleteTask.mockResolvedValue(undefined)
      const result = await handlers.get('todoist:complete-task')!({}, 'task-123')
      expect(mockCompleteTask).toHaveBeenCalledWith('task-123')
      expect(result).toEqual({ success: true })
    })

    it('returns error when completion fails', async () => {
      mockCompleteTask.mockRejectedValue(new Error('Not found'))
      const result = await handlers.get('todoist:complete-task')!({}, 'bad-id')
      expect(result).toEqual({ success: false, error: 'Not found' })
    })
  })
})
