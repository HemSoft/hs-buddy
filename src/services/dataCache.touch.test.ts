import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ...globalThis.window,
  ipcRenderer: { invoke: mockInvoke },
})

const { dataCache } = await import('./dataCache')

function deferred<T>(): {
  promise: Promise<T>
  reject: (reason: unknown) => void
} {
  let reject!: (reason: unknown) => void
  return {
    promise: new Promise<T>((_resolve, fail) => (reject = fail)),
    reject,
  }
}

beforeEach(async () => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
  await dataCache.clear()
})

describe('dataCache touch batching', () => {
  it('batches memory hits into one persisted access-time update', async () => {
    vi.useFakeTimers()
    try {
      dataCache.set('one', 'value', 1000)
      dataCache.set('two', 'value', 1000)
      mockInvoke.mockClear()

      dataCache.get('one')
      dataCache.get('one')
      dataCache.get('two')
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith('cache:touch', ['one', 'two'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries batched access-time persistence failures', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      dataCache.set('touch-error', 'value', 1000)
      mockInvoke.mockReset()
      mockInvoke.mockRejectedValueOnce(new Error('touch failed')).mockResolvedValue(undefined)

      dataCache.get('touch-error')
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenLastCalledWith('cache:touch', ['touch-error'])
      expect(spy).toHaveBeenCalledWith(
        '[DataCache] Failed to persist access times:',
        expect.any(Error)
      )
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('dataCache touch retry cancellation', () => {
  it('does not retry a failed touch after a successful clear', async () => {
    vi.useFakeTimers()
    const touch = deferred<unknown>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      dataCache.set('cleared-touch', 'value')
      mockInvoke.mockReset()
      dataCache.get('cleared-touch')
      mockInvoke
        .mockImplementationOnce(() => touch.promise)
        .mockResolvedValueOnce({
          success: true,
          stats: { entryCount: 0, totalBytes: 0 },
          removedKeys: [],
        })

      await vi.advanceTimersByTimeAsync(1000)
      await expect(dataCache.clear()).resolves.toBe(true)
      touch.reject(new Error('late touch failure'))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('does not retry a failed touch for a deleted key', async () => {
    vi.useFakeTimers()
    const touch = deferred<unknown>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      dataCache.set('deleted-touch', 'value')
      mockInvoke.mockReset()
      dataCache.get('deleted-touch')
      mockInvoke
        .mockImplementationOnce(() => touch.promise)
        .mockResolvedValueOnce({
          success: true,
          stats: { entryCount: 0, totalBytes: 0 },
          removedKeys: ['deleted-touch'],
        })

      await vi.advanceTimersByTimeAsync(1000)
      dataCache.delete('deleted-touch')
      touch.reject(new Error('late touch failure'))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('lets an emptied touch batch expire without IPC', async () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      dataCache.set('repo-detail:expired-touch', 'value', now - 2 * 24 * 60 * 60 * 1000)
      dataCache.get('repo-detail:expired-touch')
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce(null)

      await expect(dataCache.getOrLoad('repo-detail:expired-touch')).resolves.toBeNull()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith('cache:read', 'repo-detail:expired-touch')
    } finally {
      vi.useRealTimers()
    }
  })
})
