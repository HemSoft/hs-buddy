import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTodoistUpcoming, useTodoistProjects, useTaskActions } from './useTodoist'

const mockMountedRef = vi.hoisted(() => ({ current: true }))
vi.mock('./useIsMounted', () => ({
  useIsMounted: () => mockMountedRef,
}))

const mockGetUpcoming = vi.fn()
const mockGetProjects = vi.fn()
const mockCompleteTask = vi.fn()
const mockReopenTask = vi.fn()
const mockCreateTask = vi.fn()
const mockDeleteTask = vi.fn()

Object.defineProperty(window, 'todoist', {
  value: {
    getUpcoming: mockGetUpcoming,
    getProjects: mockGetProjects,
    completeTask: mockCompleteTask,
    reopenTask: mockReopenTask,
    createTask: mockCreateTask,
    deleteTask: mockDeleteTask,
  },
  writable: true,
  configurable: true,
})

// Pin time to noon on 2026-06-15 to avoid midnight/timezone flakiness
const FIXED_NOW = new Date('2026-06-15T12:00:00Z')

function todayKey(): string {
  return '2026-06-15'
}

function tomorrowKey(): string {
  return '2026-06-16'
}

function yesterdayKey(): string {
  return '2026-06-14'
}

describe('useTodoistUpcoming', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    vi.clearAllMocks()
    mockMountedRef.current = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial empty state', () => {
    const { result } = renderHook(() => useTodoistUpcoming())
    expect(result.current.dayGroups).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetches and groups tasks by day', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: { [todayKey()]: [{ id: '1', content: 'Task A', priority: 3, order: 0 }] },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.dayGroups.length).toBe(7)
    const todayGroup = result.current.dayGroups.find(g => g.label === 'Today')
    expect(todayGroup?.tasks).toHaveLength(1)
  })

  it('labels tomorrow correctly', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: { [tomorrowKey()]: [{ id: '2', content: 'Task B', priority: 1, order: 0 }] },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    const tomorrowGroup = result.current.dayGroups.find(g => g.label === 'Tomorrow')
    expect(tomorrowGroup?.tasks).toHaveLength(1)
  })

  it('groups overdue tasks separately', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: { [yesterdayKey()]: [{ id: '3', content: 'Overdue task', priority: 4, order: 0 }] },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    const overdueGroup = result.current.dayGroups.find(g => g.label === 'Overdue')
    expect(overdueGroup?.tasks).toHaveLength(1)
  })

  it('sorts tasks by priority descending then order', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: {
        [todayKey()]: [
          { id: '1', content: 'Low', priority: 1, order: 0 },
          { id: '2', content: 'High', priority: 4, order: 0 },
          { id: '3', content: 'Med', priority: 2, order: 1 },
        ],
      },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    const todayGroup = result.current.dayGroups.find(g => g.label === 'Today')!
    expect(todayGroup.tasks[0].content).toBe('High')
  })

  it('handles API error response', async () => {
    mockGetUpcoming.mockResolvedValue({ success: false, error: 'API down' })
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBe('API down')
  })

  it('handles thrown exceptions', async () => {
    mockGetUpcoming.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBe('Network error')
  })

  it('handles null data gracefully', async () => {
    mockGetUpcoming.mockResolvedValue({ success: true, data: null })
    const { result } = renderHook(() => useTodoistUpcoming(3))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.dayGroups.length).toBe(3)
  })

  it('uses fallback message when API error has no message', async () => {
    mockGetUpcoming.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBe('Failed to fetch tasks')
  })

  it('handles non-Error thrown exceptions', async () => {
    mockGetUpcoming.mockRejectedValue('string error')
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBe('string error')
  })

  it('skips state updates when unmounted after fetch', async () => {
    mockGetUpcoming.mockImplementation(async () => {
      mockMountedRef.current = false
      return {
        success: true,
        data: { [todayKey()]: [{ id: '1', content: 'A', priority: 1, order: 0 }] },
      }
    })
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.dayGroups).toEqual([])
  })

  it('sorts overdue tasks by priority desc then order asc', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: {
        [yesterdayKey()]: [
          { id: '1', content: 'Low prio', priority: 1, order: 2 },
          { id: '2', content: 'High prio', priority: 4, order: 1 },
          { id: '3', content: 'High prio early', priority: 4, order: 0 },
        ],
      },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    const overdueGroup = result.current.dayGroups.find(g => g.label === 'Overdue')!
    expect(overdueGroup.tasks[0].content).toBe('High prio early')
    expect(overdueGroup.tasks[1].content).toBe('High prio')
    expect(overdueGroup.tasks[2].content).toBe('Low prio')
  })

  it('sorts day group tasks by priority desc then order asc', async () => {
    mockGetUpcoming.mockResolvedValue({
      success: true,
      data: {
        [todayKey()]: [
          { id: '1', content: 'Low', priority: 1, order: 5 },
          { id: '2', content: 'High first', priority: 4, order: 0 },
          { id: '3', content: 'High second', priority: 4, order: 3 },
          { id: '4', content: 'Med', priority: 2, order: 1 },
        ],
      },
    })
    const { result } = renderHook(() => useTodoistUpcoming(7))
    await act(async () => {
      await result.current.refresh()
    })
    const todayGroup = result.current.dayGroups.find(g => g.label === 'Today')!
    expect(todayGroup.tasks.map(t => t.content)).toEqual([
      'High first',
      'High second',
      'Med',
      'Low',
    ])
  })

  it('skips error state when unmounted during catch', async () => {
    mockGetUpcoming.mockImplementation(async () => {
      mockMountedRef.current = false
      throw new Error('Network error')
    })
    const { result } = renderHook(() => useTodoistUpcoming())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.error).toBeNull()
  })
})

describe('useTodoistProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMountedRef.current = true
  })

  it('returns initial empty state', () => {
    const { result } = renderHook(() => useTodoistProjects())
    expect(result.current.projects).toEqual([])
  })

  it('loads projects on demand', async () => {
    mockGetProjects.mockResolvedValue({ success: true, data: [{ id: 'p1', name: 'Inbox' }] })
    const { result } = renderHook(() => useTodoistProjects())
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.projects).toHaveLength(1)
  })

  it('handles failure silently', async () => {
    mockGetProjects.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useTodoistProjects())
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.projects).toEqual([])
  })

  it('does not update projects when result is unsuccessful', async () => {
    mockGetProjects.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTodoistProjects())
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.projects).toEqual([])
  })

  it('does not update projects when data is null', async () => {
    mockGetProjects.mockResolvedValue({ success: true, data: null })
    const { result } = renderHook(() => useTodoistProjects())
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.projects).toEqual([])
  })
})

describe('useTaskActions', () => {
  beforeEach(() => vi.clearAllMocks())
  const onRefresh = vi.fn()

  it('completes a task and refreshes', async () => {
    mockCompleteTask.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.complete('t1')
    })
    expect(mockCompleteTask).toHaveBeenCalledWith('t1')
    expect(onRefresh).toHaveBeenCalled()
  })

  it('reopens a task and refreshes', async () => {
    mockReopenTask.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.reopen('t1')
    })
    expect(mockReopenTask).toHaveBeenCalledWith('t1')
  })

  it('creates a task and refreshes', async () => {
    mockCreateTask.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.create({ content: 'New', priority: 3 })
    })
    expect(mockCreateTask).toHaveBeenCalledWith({ content: 'New', priority: 3 })
  })

  it('removes a task and refreshes', async () => {
    mockDeleteTask.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.remove('t1')
    })
    expect(mockDeleteTask).toHaveBeenCalledWith('t1')
  })

  it('does not refresh on failure', async () => {
    mockCompleteTask.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.complete('t1')
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh when reopen fails', async () => {
    mockReopenTask.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.reopen('t1')
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh when create fails', async () => {
    mockCreateTask.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.create({ content: 'New' })
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh when remove fails', async () => {
    mockDeleteTask.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useTaskActions(onRefresh))
    await act(async () => {
      await result.current.remove('t1')
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
