import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskPlannerView } from './TaskPlannerView'
import type { DayGroup, TodoistProject, TodoistTask } from '../../types/todoist'

const mocks = vi.hoisted(() => ({
  useTodoistUpcoming: vi.fn(),
  useTodoistProjects: vi.fn(),
  useTaskActions: vi.fn(),
  refresh: vi.fn(),
  loadProjects: vi.fn(),
  complete: vi.fn(),
  create: vi.fn(),
}))

vi.mock('../../hooks/useTodoist', () => ({
  useTodoistUpcoming: (days?: number) => mocks.useTodoistUpcoming(days),
  useTodoistProjects: () => mocks.useTodoistProjects(),
  useTaskActions: (onRefresh: () => void) => mocks.useTaskActions(onRefresh),
}))

function makeTask(overrides: Partial<TodoistTask> = {}): TodoistTask {
  return {
    id: 'task-1',
    content: 'Plan sprint',
    description: '',
    project_id: 'project-1',
    priority: 4,
    due: {
      date: '2026-04-01',
      string: 'today',
    },
    labels: ['focus'],
    is_completed: false,
    created_at: '2026-04-01T09:00:00Z',
    order: 1,
    ...overrides,
  }
}

function makeGroup(overrides: Partial<DayGroup> = {}): DayGroup {
  return {
    date: '2026-04-01',
    label: 'Today',
    tasks: [],
    ...overrides,
  }
}

function makeProject(overrides: Partial<TodoistProject> = {}): TodoistProject {
  return {
    id: 'project-1',
    name: 'Work',
    color: 'blue',
    parent_id: null,
    order: 1,
    ...overrides,
  }
}

describe('TaskPlannerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T10:00:00Z'))

    mocks.useTodoistUpcoming.mockReturnValue({
      dayGroups: [makeGroup({ tasks: [makeTask()] })],
      isLoading: false,
      error: null,
      refresh: mocks.refresh,
    })
    mocks.useTodoistProjects.mockReturnValue({
      projects: [makeProject()],
      load: mocks.loadProjects,
    })
    mocks.useTaskActions.mockReturnValue({
      complete: mocks.complete,
      create: mocks.create,
    })
    mocks.complete.mockResolvedValue({ success: true })
    mocks.create.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders upcoming tasks, project metadata, and priority markers', () => {
    mocks.useTodoistUpcoming.mockReturnValue({
      dayGroups: [
        makeGroup({ tasks: [makeTask()] }),
        makeGroup({ date: '2026-04-02', label: 'Tomorrow', tasks: [] }),
      ],
      isLoading: false,
      error: null,
      refresh: mocks.refresh,
    })

    render(<TaskPlannerView />)

    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.getByText('1 tasks')).toBeInTheDocument()
    expect(screen.getByText('Plan sprint')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('focus')).toBeInTheDocument()
    expect(screen.getByTitle('Priority 1')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(mocks.useTodoistUpcoming).toHaveBeenCalledWith(7)
    expect(mocks.loadProjects).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes on mount, on demand, and on the 60 second interval', () => {
    render(<TaskPlannerView />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh tasks' }))
    expect(mocks.refresh).toHaveBeenCalledTimes(2)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(mocks.refresh).toHaveBeenCalledTimes(3)
  })

  it('shows loading and hook error states', () => {
    mocks.useTodoistUpcoming.mockReturnValue({
      dayGroups: [makeGroup({ tasks: [] })],
      isLoading: true,
      error: 'Todoist offline',
      refresh: mocks.refresh,
    })

    const { container } = render(<TaskPlannerView />)

    expect(screen.getByRole('button', { name: 'Refresh tasks' })).toBeDisabled()
    expect(screen.getByText('Todoist offline')).toBeInTheDocument()
    expect(container.querySelector('.spinning')).toBeInTheDocument()
  })

  it('completes a task, hides it immediately, and shows returned action errors', async () => {
    mocks.complete.mockResolvedValueOnce({ success: false, error: 'Could not complete task' })

    render(<TaskPlannerView />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete task: Plan sprint' }))
    })

    expect(mocks.complete).toHaveBeenCalledWith('task-1')
    expect(screen.queryByText('Plan sprint')).not.toBeInTheDocument()
    expect(screen.getByText('Could not complete task')).toBeInTheDocument()
  })

  it('shows thrown action errors and clears them after five seconds', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('Network unavailable'))

    render(<TaskPlannerView />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete task: Plan sprint' }))
    })

    expect(screen.getByText('Network unavailable')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByText('Network unavailable')).not.toBeInTheDocument()
  })

  it('renders the today mode empty state and requests a single day', () => {
    mocks.useTodoistUpcoming.mockReturnValue({
      dayGroups: [makeGroup({ tasks: [] })],
      isLoading: false,
      error: null,
      refresh: mocks.refresh,
    })

    render(<TaskPlannerView mode="today" />)

    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText('No tasks for today')).toBeInTheDocument()
    expect(mocks.useTodoistUpcoming).toHaveBeenCalledWith(1)
  })

  it('supports collapsing day sections and cancelling inline creation', () => {
    render(<TaskPlannerView />)

    fireEvent.click(screen.getByRole('button', { name: /Today 2026-04-01 1/i }))
    expect(screen.queryByText('Plan sprint')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Today 2026-04-01 1/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(screen.getByPlaceholderText('Task name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const input = screen.getByPlaceholderText('Task name')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument()
  })

  it('creates a task from the inline form and surfaces create failures', async () => {
    mocks.create.mockResolvedValueOnce({ success: false, error: 'Could not create task' })

    render(<TaskPlannerView />)

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    fireEvent.change(screen.getByPlaceholderText('Task name'), {
      target: { value: 'Write release notes' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })

    expect(mocks.create).toHaveBeenCalledWith({
      content: 'Write release notes',
      due_date: '2026-04-01',
    })
    expect(screen.getByText('Could not create task')).toBeInTheDocument()
  })
})
