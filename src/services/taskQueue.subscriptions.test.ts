import { describe, expect, it, vi } from 'vitest'
import { TaskQueue } from './taskQueue'

describe('TaskQueue transition notifications', () => {
  it('notifies once for enqueue, start, and completion transitions', async () => {
    const queue = new TaskQueue('notifications')
    const snapshots: ReturnType<TaskQueue['getSnapshot']>[] = []
    queue.subscribe(() => snapshots.push(queue.getSnapshot()))
    let completeTask: () => void
    const blocker = new Promise<void>(resolve => {
      completeTask = resolve
    })

    const { promise } = queue.enqueue(async () => blocker, { name: 'refresh' })

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toMatchObject({ pendingCount: 1, runningCount: 0 })
    expect(snapshots[1]).toMatchObject({ pendingCount: 0, runningCount: 1 })
    expect(snapshots[1].runningTaskNames).toEqual(['refresh'])

    completeTask!()
    await promise

    expect(snapshots).toHaveLength(3)
    expect(snapshots[2]).toMatchObject({
      pendingCount: 0,
      runningCount: 0,
      isEmpty: true,
    })
    expect(snapshots[2].stats.completed).toBe(1)
  })

  it('notifies once when a pending task is cancelled', async () => {
    const queue = new TaskQueue('pending-cancel-notification', { concurrency: 0 })
    const listener = vi.fn()
    queue.subscribe(listener)
    const { taskId, promise } = queue.enqueue(async () => 'unused')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(queue.cancel(taskId)).toBe(true)
    await expect(promise).rejects.toThrow('Task cancelled')

    expect(listener).toHaveBeenCalledTimes(2)
    expect(queue.getSnapshot().stats.cancelled).toBe(1)
  })

  it('notifies once when a running task settles as cancelled', async () => {
    const queue = new TaskQueue('running-cancel-notification')
    const listener = vi.fn()
    queue.subscribe(listener)
    let finishTask: () => void
    const blocker = new Promise<void>(resolve => {
      finishTask = resolve
    })
    const { taskId, promise } = queue.enqueue(async () => blocker)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(queue.cancel(taskId)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)

    finishTask!()
    await expect(promise).rejects.toThrow('Task cancelled')

    expect(listener).toHaveBeenCalledTimes(3)
    expect(queue.getSnapshot().stats.cancelled).toBe(1)
  })

  it('notifies once when a task fails', async () => {
    const queue = new TaskQueue('failure-notification')
    const listener = vi.fn()
    queue.subscribe(listener)
    const { promise } = queue.enqueue(async () => {
      throw new Error('failure')
    })

    await expect(promise).rejects.toThrow('failure')

    expect(listener).toHaveBeenCalledTimes(3)
    expect(queue.getSnapshot().stats.failed).toBe(1)
  })
})

describe('TaskQueue subscription lifecycle', () => {
  it('does not notify when cancelling an empty queue', () => {
    const queue = new TaskQueue('empty-cancel-all')
    const listener = vi.fn()
    queue.subscribe(listener)

    queue.cancelAll()

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps snapshot identity stable until the next transition', () => {
    const queue = new TaskQueue('stable-snapshot', { concurrency: 0 })
    const initial = queue.getSnapshot()
    expect(queue.getSnapshot()).toBe(initial)

    const { promise } = queue.enqueue(async () => 'unused')
    void promise.catch(() => {})

    const afterEnqueue = queue.getSnapshot()
    expect(afterEnqueue).not.toBe(initial)
    expect(queue.getSnapshot()).toBe(afterEnqueue)
    queue.cancelAll()
  })

  it('stops notifying an unsubscribed listener', () => {
    const queue = new TaskQueue('unsubscribe', { concurrency: 0 })
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)
    unsubscribe()

    const { promise } = queue.enqueue(async () => 'unused')
    void promise.catch(() => {})

    expect(listener).not.toHaveBeenCalled()
    queue.cancelAll()
  })
})
