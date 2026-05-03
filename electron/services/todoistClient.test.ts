import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}))

vi.mock('../../src/utils/envLookup', () => ({
  createEnvResolver: vi.fn(() => (name: string) => {
    if (name === 'TODOIST_API_TOKEN') return 'test-todoist-token'
    return undefined
  }),
}))

vi.mock('../../src/utils/taskGrouping', () => ({
  groupTasksByDate: vi.fn((tasks: unknown[]) => new Map([['2024-01-01', tasks]])),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('todoistClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  describe('fetchTasks', () => {
    it('sends GET request with correct filter query and auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: '1', content: 'Test' }], next_cursor: null }),
      })

      const { fetchTasks } = await import('./todoistClient')
      const result = await fetchTasks('today')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('https://api.todoist.com/api/v1/tasks/filter')
      expect(url).toContain('query=today')
      expect(opts.headers.Authorization).toBe('Bearer test-todoist-token')
      expect(result).toEqual([{ id: '1', content: 'Test' }])
    })

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { fetchTasks } = await import('./todoistClient')
      await expect(fetchTasks('today')).rejects.toThrow('Todoist API error (401)')
    })
  })

  describe('fetchProjects', () => {
    it('returns projects from API on first call', async () => {
      const projects = [{ id: 'p1', name: 'Inbox' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: projects, next_cursor: null }),
      })

      const { fetchProjects } = await import('./todoistClient')
      const result = await fetchProjects()
      expect(result).toEqual(projects)
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('returns cached projects on subsequent calls within TTL', async () => {
      const projects = [{ id: 'p1', name: 'Inbox' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: projects, next_cursor: null }),
      })

      const { fetchProjects } = await import('./todoistClient')
      await fetchProjects()
      const result = await fetchProjects()

      expect(result).toEqual(projects)
      expect(mockFetch).toHaveBeenCalledOnce()
    })
  })

  describe('completeTask', () => {
    it('sends POST to close endpoint with task ID', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('null') })

      const { completeTask } = await import('./todoistClient')
      await completeTask('task-123')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.todoist.com/api/v1/tasks/task-123/close')
      expect(opts.method).toBe('POST')
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const { completeTask } = await import('./todoistClient')
      await expect(completeTask('bad-id')).rejects.toThrow('Todoist API error (404)')
    })
  })

  describe('createTask', () => {
    it('sends POST with task parameters and returns created task', async () => {
      const created = { id: 'new-1', content: 'New task' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(created)),
      })

      const { createTask } = await import('./todoistClient')
      const result = await createTask({ content: 'New task', priority: 2 })

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.todoist.com/api/v1/tasks')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ content: 'New task', priority: 2 })
      expect(result).toEqual(created)
    })
  })

  describe('fetchUpcoming', () => {
    it('constructs date filter and groups results', async () => {
      const tasks = [{ id: '1', content: 'Due soon' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: tasks, next_cursor: null }),
      })

      const { fetchUpcoming } = await import('./todoistClient')
      const result = await fetchUpcoming(7)

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('overdue')
      expect(url).toContain('due+before')
      expect(result).toBeInstanceOf(Map)
    })
  })
})
