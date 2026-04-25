import { describe, expect, it } from 'vitest'
import type { TodoistTask } from '../types/todoist'
import { groupTasksByDate } from './taskGrouping'

function makeTask(overrides: Partial<TodoistTask> = {}): TodoistTask {
  return {
    id: '1',
    content: 'Test task',
    description: '',
    project_id: 'p1',
    priority: 1,
    due: { date: '2025-01-15', string: 'Jan 15' },
    labels: [],
    is_completed: false,
    created_at: '2025-01-01T00:00:00Z',
    order: 0,
    ...overrides,
  }
}

describe('groupTasksByDate', () => {
  it('groups tasks by their ISO date', () => {
    const tasks = [
      makeTask({ id: '1', due: { date: '2025-01-15', string: 'Jan 15' } }),
      makeTask({ id: '2', due: { date: '2025-01-16', string: 'Jan 16' } }),
      makeTask({ id: '3', due: { date: '2025-01-15', string: 'Jan 15' } }),
    ]
    const result = groupTasksByDate(tasks)
    expect(result.size).toBe(2)
    expect(result.get('2025-01-15')?.map(t => t.id)).toEqual(['1', '3'])
    expect(result.get('2025-01-16')?.map(t => t.id)).toEqual(['2'])
  })

  it('skips tasks with null due date', () => {
    const tasks = [makeTask({ id: '1', due: null }), makeTask({ id: '2' })]
    const result = groupTasksByDate(tasks)
    expect(result.size).toBe(1)
    expect(result.get('2025-01-15')?.map(t => t.id)).toEqual(['2'])
  })

  it('skips tasks with empty due date string', () => {
    const tasks = [makeTask({ id: '1', due: { date: '', string: '' } })]
    const result = groupTasksByDate(tasks)
    expect(result.size).toBe(0)
  })

  it('truncates datetime strings longer than 10 chars', () => {
    const tasks = [makeTask({ id: '1', due: { date: '2025-01-15T10:00:00Z', string: 'Jan 15' } })]
    const result = groupTasksByDate(tasks)
    expect(result.has('2025-01-15')).toBe(true)
    expect(result.has('2025-01-15T10:00:00Z')).toBe(false)
  })

  it('keeps short date strings as-is', () => {
    const tasks = [makeTask({ id: '1', due: { date: '2025-01-15', string: 'Jan 15' } })]
    const result = groupTasksByDate(tasks)
    expect(result.has('2025-01-15')).toBe(true)
  })

  it('returns empty map for empty input', () => {
    expect(groupTasksByDate([]).size).toBe(0)
  })

  it('handles exactly 10-char date strings', () => {
    const tasks = [makeTask({ id: '1', due: { date: '2025-01-15', string: '' } })]
    const result = groupTasksByDate(tasks)
    expect(result.get('2025-01-15')?.length).toBe(1)
  })
})
