import { describe, expect, it } from 'vitest'
import { TaskQueue, getTaskQueue } from './taskQueue'

describe('TaskQueue', () => {
  describe('enqueue and execute', () => {
    it('runs a single task and resolves with the result', async () => {
      const queue = new TaskQueue('test-q')
      const { promise } = queue.enqueue(async () => 42)
      expect(await promise).toBe(42)
    })

    it('passes an AbortSignal to the task', async () => {
      const queue = new TaskQueue('test-q')
      let receivedSignal: AbortSignal | null = null
      const { promise } = queue.enqueue(async (signal) => {
        receivedSignal = signal
        return 'ok'
      })
      await promise
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
      expect(receivedSignal!.aborted).toBe(false)
    })

    it('generates unique task IDs', () => {
      const queue = new TaskQueue('test-q')
      const { taskId: id1 } = queue.enqueue(async () => 1)
      const { taskId: id2 } = queue.enqueue(async () => 2)
      expect(id1).not.toBe(id2)
      expect(id1).toContain('test-q-')
    })
  })

  describe('concurrency', () => {
    it('serializes tasks by default (concurrency 1)', async () => {
      const queue = new TaskQueue('serial')
      const order: number[] = []

      const { promise: p1 } = queue.enqueue(async () => {
        order.push(1)
        return 1
      })
      const { promise: p2 } = queue.enqueue(async () => {
        order.push(2)
        return 2
      })

      await Promise.all([p1, p2])
      expect(order).toEqual([1, 2])
    })

    it('runs tasks concurrently with higher concurrency', async () => {
      const queue = new TaskQueue('concurrent', { concurrency: 2 })
      let running = 0
      let maxRunning = 0

      const makeTask = () =>
        queue.enqueue(async () => {
          running++
          maxRunning = Math.max(maxRunning, running)
          await new Promise(r => setTimeout(r, 10))
          running--
        })

      const tasks = [makeTask(), makeTask(), makeTask()]
      await Promise.all(tasks.map(t => t.promise))
      expect(maxRunning).toBe(2)
    })
  })

  describe('priority ordering', () => {
    it('runs higher priority tasks first', async () => {
      const queue = new TaskQueue('prio')
      const order: string[] = []

      // Fill the queue by occupying the single slot
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      queue.enqueue(async () => {
        await blocker
        order.push('blocker')
      })

      // Queue two tasks with different priorities while blocker holds the slot
      queue.enqueue(async () => { order.push('low') }, { priority: 1 })
      queue.enqueue(async () => { order.push('high') }, { priority: 10 })

      unblock!()
      // Wait for all to complete
      await new Promise(r => setTimeout(r, 50))
      expect(order).toEqual(['blocker', 'high', 'low'])
    })
  })

  describe('cancel', () => {
    it('cancels a pending task', async () => {
      const queue = new TaskQueue('cancel-test')

      // Block the slot
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: blockerPromise } = queue.enqueue(async () => { await blocker })

      // Enqueue a task that will be pending
      const { taskId, promise } = queue.enqueue(async () => 'should not run')

      const cancelled = queue.cancel(taskId)
      expect(cancelled).toBe(true)

      // The cancelled promise should reject with AbortError
      await expect(promise).rejects.toThrow('Task cancelled')

      unblock!()
      await blockerPromise
    })

    it('cancels a running task', async () => {
      const queue = new TaskQueue('cancel-running')

      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })

      const { taskId, promise } = queue.enqueue(async (signal) => {
        await blocker
        if (signal.aborted) throw new DOMException('Task cancelled', 'AbortError')
        return 'done'
      })

      // Give it a tick to start running
      await new Promise(r => setTimeout(r, 5))

      const cancelled = queue.cancel(taskId)
      expect(cancelled).toBe(true)

      unblock!()
      await expect(promise).rejects.toThrow()
    })

    it('returns false for already-completed task', async () => {
      const queue = new TaskQueue('cancel-miss')
      const { taskId, promise } = queue.enqueue(async () => 'done')
      await promise
      expect(queue.cancel(taskId)).toBe(false)
    })
  })

  describe('cancelAll', () => {
    it('cancels all pending and running tasks', async () => {
      const queue = new TaskQueue('cancel-all')

      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: p1 } = queue.enqueue(async () => { await blocker })

      const { promise: p2 } = queue.enqueue(async () => 'task2')
      const { promise: p3 } = queue.enqueue(async () => 'task3')

      queue.cancelAll()

      await expect(p2).rejects.toThrow('Task cancelled')
      await expect(p3).rejects.toThrow('Task cancelled')

      expect(queue.pendingCount).toBe(0)

      unblock!()
      await expect(p1).rejects.toThrow()
    })
  })

  describe('stats', () => {
    it('tracks completed tasks', async () => {
      const queue = new TaskQueue('stats-test')
      const { promise } = queue.enqueue(async () => 'ok')
      await promise

      const stats = queue.getStats()
      expect(stats.completed).toBe(1)
      expect(stats.pending).toBe(0)
      expect(stats.running).toBe(0)
    })

    it('tracks failed tasks', async () => {
      const queue = new TaskQueue('stats-fail')
      const { promise } = queue.enqueue(async () => {
        throw new Error('boom')
      })
      await expect(promise).rejects.toThrow('boom')

      const stats = queue.getStats()
      expect(stats.failed).toBe(1)
    })

    it('tracks cancelled tasks', async () => {
      const queue = new TaskQueue('stats-cancel')

      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: blockerPromise } = queue.enqueue(async () => { await blocker })

      const { taskId, promise } = queue.enqueue(async () => 'x')
      queue.cancel(taskId)
      await expect(promise).rejects.toThrow()

      const stats = queue.getStats()
      expect(stats.cancelled).toBeGreaterThanOrEqual(1)

      unblock!()
      await blockerPromise
    })
  })

  describe('property accessors', () => {
    it('pendingCount reflects queued tasks', async () => {
      const queue = new TaskQueue('props')
      // Create a blocking task
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: blockerPromise } = queue.enqueue(async () => { await blocker })
      const { promise: taskPromise } = queue.enqueue(async () => 'a')

      expect(queue.pendingCount).toBe(1)

      queue.cancelAll()
      unblock!()
      await expect(taskPromise).rejects.toThrow()
      await expect(blockerPromise).rejects.toThrow()
    })

    it('runningCount reflects executing tasks', async () => {
      const queue = new TaskQueue('run-count')
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      queue.enqueue(async () => { await blocker })

      // Give it a tick to start
      await new Promise(r => setTimeout(r, 5))
      expect(queue.runningCount).toBe(1)

      unblock!()
      await new Promise(r => setTimeout(r, 10))
      expect(queue.runningCount).toBe(0)
    })

    it('isEmpty is true when no tasks', async () => {
      const queue = new TaskQueue('empty')
      expect(queue.isEmpty).toBe(true)

      const { promise } = queue.enqueue(async () => 'x')
      expect(queue.isEmpty).toBe(false)

      await promise
      expect(queue.isEmpty).toBe(true)
    })
  })

  describe('task naming', () => {
    it('getRunningTaskName returns the running task name', async () => {
      const queue = new TaskQueue('naming')
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      queue.enqueue(async () => { await blocker }, { name: 'my-task' })

      await new Promise(r => setTimeout(r, 5))
      expect(queue.getRunningTaskName()).toBe('my-task')

      unblock!()
      await new Promise(r => setTimeout(r, 10))
      expect(queue.getRunningTaskName()).toBeNull()
    })

    it('getPendingTaskNames lists queued task names', async () => {
      const queue = new TaskQueue('pending-names')
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: bp } = queue.enqueue(async () => { await blocker })
      const { promise: ap } = queue.enqueue(async () => {}, { name: 'alpha' })
      const { promise: btp } = queue.enqueue(async () => {}, { name: 'beta' })

      expect(queue.getPendingTaskNames()).toEqual(['alpha', 'beta'])

      queue.cancelAll()
      unblock!()
      await expect(ap).rejects.toThrow()
      await expect(btp).rejects.toThrow()
      await expect(bp).rejects.toThrow()
    })

    it('hasTaskWithName finds pending and running tasks', async () => {
      const queue = new TaskQueue('has-name')
      let unblock: () => void
      const blocker = new Promise<void>(r => { unblock = r })
      const { promise: rp } = queue.enqueue(async () => { await blocker }, { name: 'running-task' })
      const { promise: pp } = queue.enqueue(async () => {}, { name: 'pending-task' })

      await new Promise(r => setTimeout(r, 5))
      expect(queue.hasTaskWithName('running-task')).toBe(true)
      expect(queue.hasTaskWithName('pending-task')).toBe(true)
      expect(queue.hasTaskWithName('nonexistent')).toBe(false)

      queue.cancelAll()
      unblock!()
      await expect(pp).rejects.toThrow()
      await expect(rp).rejects.toThrow()
    })
  })

  describe('callbacks', () => {
    it('fires onTaskStart and onTaskComplete callbacks', async () => {
      const starts: string[] = []
      const completes: string[] = []

      const queue = new TaskQueue('cb', {
        onTaskStart: (_id, name) => starts.push(name || 'unnamed'),
        onTaskComplete: (_id, name) => completes.push(name || 'unnamed'),
      })

      const { promise } = queue.enqueue(async () => 'ok', { name: 'my-job' })
      await promise

      expect(starts).toEqual(['my-job'])
      expect(completes).toEqual(['my-job'])
    })

    it('fires onTaskError for failed tasks', async () => {
      const errors: string[] = []

      const queue = new TaskQueue('cb-err', {
        onTaskError: (_id, error) => errors.push(String(error)),
      })

      const { promise } = queue.enqueue(async () => {
        throw new Error('test-error')
      })
      await expect(promise).rejects.toThrow('test-error')

      expect(errors).toEqual(['Error: test-error'])
    })
  })
})

describe('getTaskQueue', () => {
  it('returns the same queue for the same name', () => {
    const q1 = getTaskQueue('shared-q')
    const q2 = getTaskQueue('shared-q')
    expect(q1).toBe(q2)
  })

  it('returns different queues for different names', () => {
    const q1 = getTaskQueue('queue-a')
    const q2 = getTaskQueue('queue-b')
    expect(q1).not.toBe(q2)
  })
})
