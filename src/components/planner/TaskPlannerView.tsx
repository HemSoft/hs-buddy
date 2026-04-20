import { useEffect, useState, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Plus,
  Circle,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useTodoistUpcoming, useTodoistProjects, useTaskActions } from '../../hooks/useTodoist'
import type { TodoistTask, DayGroup, TodoistProject } from '../../types/todoist'
import './TaskPlannerView.css'

const PRIORITY_COLORS: Record<number, string> = {
  4: '#d1453b', // P1 red
  3: '#eb8909', // P2 orange
  2: '#246fe0', // P3 blue
  1: 'var(--vscode-foreground)', // P4 default
}

function PriorityDot({ priority }: { priority: number }) {
  if (priority <= 1) return null
  return (
    <span
      className="planner-priority-dot"
      style={{
        backgroundColor: PRIORITY_COLORS[priority],
        boxShadow: `0 0 4px ${PRIORITY_COLORS[priority]}`,
      }}
      title={`Priority ${5 - priority}`}
    />
  )
}

function TaskRow({
  task,
  projectMap,
  onComplete,
}: {
  task: TodoistTask
  projectMap: Map<string, TodoistProject>
  onComplete: (taskId: string) => void
}) {
  const project = projectMap.get(task.project_id)
  return (
    <div className="planner-task-row" data-priority={task.priority}>
      <button
        className="planner-task-check"
        onClick={() => onComplete(task.id)}
        aria-label={`Complete task: ${task.content}`}
        title="Complete task"
      >
        <Circle size={16} className="circle-icon" />
        <Check size={14} className="check-icon" />
      </button>
      <div className="planner-task-content">
        <PriorityDot priority={task.priority} />
        <span className="planner-task-text">{task.content}</span>
        {project && <span className="planner-task-project">{project.name}</span>}
        {task.labels.length > 0 && (
          <span className="planner-task-labels">
            {task.labels.map(l => (
              <span key={l} className="planner-label-tag">
                {l}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function AddTaskInline({
  date,
  onAdd,
  onCancel,
}: {
  date: string
  onAdd: (content: string, date: string) => void
  onCancel: () => void
}) {
  const [content, setContent] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (trimmed) onAdd(trimmed, date)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    /* v8 ignore start */
    if (e.key === 'Escape') onCancel()
    /* v8 ignore stop */
  }

  return (
    <form className="planner-add-form" onSubmit={handleSubmit}>
      <input
        className="planner-add-input"
        placeholder="Task name"
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button type="submit" className="planner-add-submit" disabled={!content.trim()}>
        Add
      </button>
      <button type="button" className="planner-add-cancel" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

function DaySection({
  group,
  projectMap,
  onComplete,
  onCreate,
}: {
  group: DayGroup
  projectMap: Map<string, TodoistProject>
  onComplete: (taskId: string) => void
  onCreate: (content: string, date: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const isToday = group.label === 'Today'
  const isOverdue = group.label === 'Overdue'
  const toggleCollapsed = useCallback(() => setCollapsed(current => !current), [])

  return (
    <div
      className={`planner-day-section ${isToday ? 'planner-day-today' : ''} ${isOverdue ? 'planner-day-overdue' : ''}`}
    >
      <div className="planner-day-header">
        <button
          type="button"
          className="planner-day-toggle"
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden />
          ) : (
            <ChevronDown size={14} aria-hidden />
          )}
          <span className="planner-day-label">{group.label}</span>
          {group.date !== 'overdue' && <span className="planner-day-date">{group.date}</span>}
          <span className="planner-day-count">{group.tasks.length}</span>
        </button>
        <button
          type="button"
          className="planner-day-add-btn"
          onClick={() => setAdding(true)}
          aria-label="Add task"
          title="Add task"
        >
          <Plus size={14} />
        </button>
      </div>
      {!collapsed && (
        <div className="planner-day-tasks">
          {group.tasks.length === 0 && !adding && <div className="planner-empty-day">No tasks</div>}
          {group.tasks.map(task => (
            <TaskRow key={task.id} task={task} projectMap={projectMap} onComplete={onComplete} />
          ))}
          {adding && (
            <AddTaskInline
              date={group.date}
              onAdd={(content, date) => {
                onCreate(content, date)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

type PlannerMode = 'today' | 'upcoming' | 'projects'

export function TaskPlannerView({ mode = 'upcoming' }: { mode?: PlannerMode }) {
  const days = mode === 'today' ? 1 : 7
  const { dayGroups, isLoading, error, refresh } = useTodoistUpcoming(days)
  const { projects, load: loadProjects } = useTodoistProjects()
  const { complete, create } = useTaskActions(refresh)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const actionErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    refresh()
    loadProjects()
  }, [refresh, loadProjects])

  // Auto-refresh every 60s
  useEffect(() => {
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  // Clear stale completingIds when day groups are refreshed
  useEffect(() => {
    setCompletingIds(new Set())
  }, [dayGroups])

  useEffect(() => {
    return () => {
      if (actionErrorTimeoutRef.current) {
        clearTimeout(actionErrorTimeoutRef.current)
      }
    }
  }, [])

  const projectMap = new Map<string, TodoistProject>()
  for (const p of projects) projectMap.set(p.id, p)

  const showActionError = useCallback((message: string) => {
    if (actionErrorTimeoutRef.current) {
      clearTimeout(actionErrorTimeoutRef.current)
    }

    setActionError(message)
    actionErrorTimeoutRef.current = setTimeout(() => {
      setActionError(null)
      actionErrorTimeoutRef.current = null
    }, 5000)
  }, [])

  const handleComplete = useCallback(
    async (taskId: string) => {
      setCompletingIds(prev => new Set(prev).add(taskId))
      try {
        const result = await complete(taskId)
        /* v8 ignore start */
        if (!result.success) showActionError(result.error ?? 'Failed to complete task')
        /* v8 ignore stop */
      } catch (err) {
        showActionError(err instanceof Error ? err.message : 'Failed to complete task')
      }
      // Don't clear completingIds — refresh will replace dayGroups without the task
    },
    [complete, showActionError]
  )

  const handleCreate = useCallback(
    async (content: string, date: string) => {
      try {
        const result = await create({ content, due_date: date })
        /* v8 ignore start */
        if (!result.success) showActionError(result.error ?? 'Failed to create task')
        /* v8 ignore stop */
      } catch (err) {
        showActionError(err instanceof Error ? err.message : 'Failed to create task')
      }
    },
    [create, showActionError]
  )

  const totalTasks = dayGroups.reduce((n, g) => n + g.tasks.length, 0)

  const heading = mode === 'today' ? 'Today' : 'Upcoming'

  return (
    <div className="planner-view">
      <div className="planner-header">
        <h2>{heading}</h2>
        <div className="planner-header-meta">
          <span className="planner-task-total">{totalTasks} tasks</span>
          <button
            className="planner-refresh-btn"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Refresh tasks"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {(error || actionError) && (
        <div className="planner-error">
          <AlertCircle size={14} />
          <span>{error || actionError}</span>
        </div>
      )}

      <div className="planner-day-list">
        {mode === 'today' && dayGroups.length > 0 ? (
          // Today mode: flat task list, no day section card
          <div className="planner-today-flat">
            {dayGroups[0].tasks.filter(t => !completingIds.has(t.id)).length === 0 ? (
              <div className="planner-empty-day">No tasks for today</div>
            ) : (
              dayGroups[0].tasks
                .filter(t => !completingIds.has(t.id))
                .map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectMap={projectMap}
                    onComplete={handleComplete}
                  />
                ))
            )}
          </div>
        ) : (
          dayGroups.map(group => (
            <DaySection
              key={group.date}
              group={{ ...group, tasks: group.tasks.filter(t => !completingIds.has(t.id)) }}
              projectMap={projectMap}
              onComplete={handleComplete}
              onCreate={handleCreate}
            />
          ))
        )}
      </div>
    </div>
  )
}
