import { bench, describe } from 'vitest'
import { TaskQueue } from './taskQueue'

describe('TaskQueue enqueue + drain', () => {
  bench('enqueue 10 sync-resolving tasks (serial)', async () => {
    const q = new TaskQueue('bench', { concurrency: 1 })
    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      const { promise } = q.enqueue(async () => i)
      promises.push(promise)
    }
    await Promise.all(promises)
  })

  bench('enqueue 10 sync-resolving tasks (concurrent=5)', async () => {
    const q = new TaskQueue('bench', { concurrency: 5 })
    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      const { promise } = q.enqueue(async () => i)
      promises.push(promise)
    }
    await Promise.all(promises)
  })

  bench('enqueue 50 tasks with mixed priorities', async () => {
    const q = new TaskQueue('bench', { concurrency: 3 })
    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 50; i++) {
      const { promise } = q.enqueue(async () => i, { priority: i % 5 })
      promises.push(promise)
    }
    await Promise.all(promises)
  })
})

describe('TaskQueue cancel', () => {
  bench('cancel pending tasks (10 of 20)', async () => {
    const q = new TaskQueue('bench', { concurrency: 1 })
    const ids: string[] = []
    const promises: Promise<unknown>[] = []
    for (let i = 0; i < 20; i++) {
      const { taskId, promise } = q.enqueue(async () => i)
      ids.push(taskId)
      promises.push(promise.catch(() => {}))
    }
    // Cancel the last 10 (most are still pending)
    for (let i = 10; i < 20; i++) {
      q.cancel(ids[i])
    }
    await Promise.all(promises)
  })
})

describe('TaskQueue priority insertion', () => {
  bench('insert 100 prioritized tasks into queue', () => {
    const q = new TaskQueue('bench', { concurrency: 0 }) // concurrency 0 = nothing runs
    for (let i = 0; i < 100; i++) {
      q.enqueue(async () => i, { priority: Math.floor(Math.random() * 10) })
    }
  })
})
