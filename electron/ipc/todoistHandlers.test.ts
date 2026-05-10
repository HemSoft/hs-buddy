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

  describe('todoist:reopen-task', () => {
    it('reopens a task and returns success', async () => {
      mockReopenTask.mockResolvedValue(undefined)
      const result = await handlers.get('todoist:reopen-task')!({}, 'task-456')
      expect(mockReopenTask).toHaveBeenCalledWith('task-456')
      expect(result).toEqual({ success: true })
    })

    it('returns error when reopen fails', async () => {
      mockReopenTask.mockRejectedValue(new Error('Server error'))
      const result = await handlers.get('todoist:reopen-task')!({}, 'task-456')
      expect(result).toEqual({ success: false, error: 'Server error' })
    })
  })

  describe('todoist:create-task', () => {
    const invoke = (...args: unknown[]) => handlers.get('todoist:create-task')!({}, ...args)

    it('creates a task with valid content', async () => {
      mockCreateTask.mockResolvedValue({ id: 'new-task', content: 'Buy groceries' })
      const result = await invoke({ content: 'Buy groceries', priority: 1 })
      expect(mockCreateTask).toHaveBeenCalledWith({ content: 'Buy groceries', priority: 1 })
      expect(result).toEqual({ success: true, data: { id: 'new-task', content: 'Buy groceries' } })
    })

    it('rejects empty content', async () => {
      const result = await invoke({ content: '   ' })
      expect(result).toEqual({ success: false, error: 'Task content cannot be empty' })
      expect(mockCreateTask).not.toHaveBeenCalled()
    })

    it('trims content before creating', async () => {
      mockCreateTask.mockResolvedValue({ id: 't1', content: 'Trimmed' })
      await invoke({ content: '  Trimmed  ' })
      expect(mockCreateTask).toHaveBeenCalledWith({ content: 'Trimmed' })
    })

    it('returns error when creation fails', async () => {
      mockCreateTask.mockRejectedValue(new Error('Rate limited'))
      const result = await invoke({ content: 'Valid task' })
      expect(result).toEqual({ success: false, error: 'Rate limited' })
    })
  })

  describe('todoist:update-task', () => {
    it('updates a task and returns success', async () => {
      mockUpdateTask.mockResolvedValue({ id: 't1', content: 'Updated' })
      const result = await handlers.get('todoist:update-task')!(
        {},
        { taskId: 't1', params: { content: 'Updated' } }
      )
      expect(mockUpdateTask).toHaveBeenCalledWith('t1', { content: 'Updated' })
      expect(result).toEqual({ success: true, data: { id: 't1', content: 'Updated' } })
    })

    it('returns error when update fails', async () => {
      mockUpdateTask.mockRejectedValue(new Error('Not found'))
      const result = await handlers.get('todoist:update-task')!({}, { taskId: 't1', params: {} })
      expect(result).toEqual({ success: false, error: 'Not found' })
    })
  })

  describe('todoist:delete-task', () => {
    it('deletes a task and returns success', async () => {
      mockDeleteTask.mockResolvedValue(undefined)
      const result = await handlers.get('todoist:delete-task')!({}, 'task-to-delete')
      expect(mockDeleteTask).toHaveBeenCalledWith('task-to-delete')
      expect(result).toEqual({ success: true })
    })

    it('returns error when deletion fails', async () => {
      mockDeleteTask.mockRejectedValue(new Error('Forbidden'))
      const result = await handlers.get('todoist:delete-task')!({}, 'task-to-delete')
      expect(result).toEqual({ success: false, error: 'Forbidden' })
    })
  })

  describe('todoist:get-projects', () => {
    it('returns project list', async () => {
      mockFetchProjects.mockResolvedValue([{ id: 'p1', name: 'Inbox' }])
      const result = await handlers.get('todoist:get-projects')!({})
      expect(mockFetchProjects).toHaveBeenCalled()
      expect(result).toEqual({ success: true, data: [{ id: 'p1', name: 'Inbox' }] })
    })

    it('returns error when fetch fails', async () => {
      mockFetchProjects.mockRejectedValue(new Error('Auth failed'))
      const result = await handlers.get('todoist:get-projects')!({})
      expect(result).toEqual({ success: false, error: 'Auth failed' })
    })
  })
})
