import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { expect } from 'vitest'
import { TaskQueue } from '../services/taskQueue'

const feature = await loadFeature('src/features/task-queue.feature')

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('Execute tasks serially by default', ({ Given, When, Then }) => {
    let queue: TaskQueue
    const executionOrder: number[] = []

    Given('a task queue with default options', () => {
      queue = new TaskQueue('serial-test')
    })
    When('3 tasks are enqueued', async () => {
      const promises = [1, 2, 3].map(i => {
        const { promise } = queue.enqueue(async () => {
          executionOrder.push(i)
          await delay(10)
          return i
        }, { name: `task-${i}` })
        return promise
      })
      await Promise.all(promises)
    })
    Then('tasks should execute one at a time in FIFO order', () => {
      expect(executionOrder).toEqual([1, 2, 3])
    })
  })

  Scenario('Run tasks concurrently when configured', ({ Given, When, Then }) => {
    let queue: TaskQueue
    let maxConcurrent = 0
    let currentConcurrent = 0

    Given('a task queue with concurrency of 2', () => {
      queue = new TaskQueue('concurrent-test', { concurrency: 2 })
    })
    When('3 tasks are enqueued', async () => {
      const promises = [1, 2, 3].map(i => {
        const { promise } = queue.enqueue(async () => {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          await delay(20)
          currentConcurrent--
          return i
        }, { name: `task-${i}` })
        return promise
      })
      await Promise.all(promises)
    })
    Then('at most 2 tasks should run simultaneously', () => {
      expect(maxConcurrent).toBe(2)
    })
  })

  Scenario('Higher priority tasks execute first', ({ Given, When, Then, And }) => {
    let queue: TaskQueue
    const executionOrder: string[] = []
    let gateResolve: () => void

    Given('a task queue with concurrency of 1', () => {
      queue = new TaskQueue('priority-test', { concurrency: 1 })
    })
    And('a running task is occupying the queue', () => {
      const gatePromise = new Promise<void>(resolve => { gateResolve = resolve })
      queue.enqueue(async () => {
        await gatePromise
        executionOrder.push('blocker')
      }, { name: 'blocker' })
    })
    When('a low-priority task and a high-priority task are enqueued', () => {
      queue.enqueue(async () => {
        executionOrder.push('low')
      }, { name: 'low', priority: 1 })
      queue.enqueue(async () => {
        executionOrder.push('high')
      }, { name: 'high', priority: 10 })
    })
    And('the running task completes', async () => {
      gateResolve!()
      await delay(50)
    })
    Then('the high-priority task should execute before the low-priority task', () => {
      const highIdx = executionOrder.indexOf('high')
      const lowIdx = executionOrder.indexOf('low')
      expect(highIdx).toBeLessThan(lowIdx)
    })
  })

  Scenario('Cancel a pending task', ({ Given, When, Then, And }) => {
    let queue: TaskQueue
    let pendingTaskId: string
    let pendingPromise: Promise<unknown>
    let taskExecuted = false
    let gateResolve: () => void

    Given('a task queue with concurrency of 1', () => {
      queue = new TaskQueue('cancel-test', { concurrency: 1 })
    })
    And('a running task is occupying the queue', () => {
      const gatePromise = new Promise<void>(resolve => { gateResolve = resolve })
      queue.enqueue(async () => { await gatePromise }, { name: 'blocker' })
    })
    And('a second task is pending', () => {
      const { taskId, promise } = queue.enqueue(async () => {
        taskExecuted = true
      }, { name: 'to-cancel' })
      pendingTaskId = taskId
      pendingPromise = promise
    })
    When('the pending task is cancelled', () => {
      queue.cancel(pendingTaskId)
    })
    Then('its promise should reject with "Task cancelled"', async () => {
      await expect(pendingPromise).rejects.toThrow('Task cancelled')
      // Release the blocker so the queue can drain
      gateResolve!()
    })
    And('the cancelled task should never execute', async () => {
      await delay(30)
      expect(taskExecuted).toBe(false)
    })
  })

  Scenario('Abort signal sent to running task on cancel', ({ Given, When, Then, And }) => {
    let queue: TaskQueue
    let taskId: string
    let signalAborted = false

    Given('a task queue with concurrency of 1', () => {
      queue = new TaskQueue('abort-test', { concurrency: 1 })
    })
    And('a task is running that checks its abort signal', () => {
      const { taskId: id } = queue.enqueue(async (signal) => {
        signal.addEventListener('abort', () => { signalAborted = true })
        await delay(200)
      }, { name: 'abortable' })
      taskId = id
    })
    When('the running task is cancelled', async () => {
      await delay(10) // Let task start
      queue.cancel(taskId)
    })
    Then('the abort signal should be triggered', async () => {
      await delay(20)
      expect(signalAborted).toBe(true)
    })
  })
})
