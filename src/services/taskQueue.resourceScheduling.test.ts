import { describe, expect, it, vi } from 'vitest'
import { TaskQueue } from './taskQueue'

describe('TaskQueue resource scheduling', () => {
  it('serializes a shared resource while an unrelated task progresses', async () => {
    const queue = new TaskQueue('resource-aware', { concurrency: 2 })
    let releaseFirst: (() => void) | undefined
    const firstBlocker = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const first = queue.enqueue(async () => firstBlocker, {
      serializationKey: 'pull-request-list',
    })
    const secondExecutor = vi.fn().mockResolvedValue('second')
    const second = queue.enqueue(secondExecutor, {
      serializationKey: 'pull-request-list',
    })
    const unrelated = queue.enqueue(async () => 'overview')

    try {
      await expect(unrelated.promise).resolves.toBe('overview')
      expect(secondExecutor).not.toHaveBeenCalled()
      releaseFirst!()
      await first.promise
      await expect(second.promise).resolves.toBe('second')
    } finally {
      releaseFirst!()
      await first.promise
    }
  })

  it('cancels a shared task only after every subscriber releases it', async () => {
    const queue = new TaskQueue('shared-subscribers')
    let sharedSignal: AbortSignal | undefined
    const original = queue.enqueue(
      signal => {
        sharedSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError'))
          )
        })
      },
      { name: 'overview', deduplicate: true }
    )
    const duplicate = queue.enqueue(async () => 'duplicate', {
      name: 'overview',
      deduplicate: true,
    })

    expect(duplicate.promise).toBe(original.promise)
    expect(original.release()).toBe(true)
    expect(original.release()).toBe(false)
    expect(sharedSignal?.aborted).toBe(false)
    expect(duplicate.release()).toBe(true)
    expect(sharedSignal?.aborted).toBe(true)
    await expect(original.promise).rejects.toThrow('cancelled')
  })

  it('does not release a task after it has completed', async () => {
    const queue = new TaskQueue('completed-subscriber')
    const task = queue.enqueue(async () => 'done')

    await expect(task.promise).resolves.toBe('done')
    expect(task.release()).toBe(false)
  })
})
