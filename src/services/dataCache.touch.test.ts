import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ...globalThis.window,
  ipcRenderer: { invoke: mockInvoke },
})

const { dataCache } = await import('./dataCache')

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  return {
    promise: new Promise<T>((done, fail) => {
      resolve = done
      reject = fail
    }),
    resolve,
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
      dataCache.set('one', 'value')
      dataCache.set('two', 'value')
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
      dataCache.set('touch-error', 'value')
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

  it('persists queued access times before a write can trigger LRU pruning', async () => {
    const touch = deferred<unknown>()
    dataCache.set('recently-used', 'value')
    dataCache.set('also-used', 'value')
    await Promise.resolve()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => touch.promise).mockResolvedValue(undefined)

    dataCache.get('recently-used')
    dataCache.set('new-entry', 'value')
    dataCache.get('also-used')
    dataCache.set('second-new-entry', 'value')

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('cache:touch', ['recently-used'])
    touch.resolve(undefined)
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(4))
    expect(mockInvoke.mock.calls[1]).toEqual(['cache:touch', ['also-used']])
    expect(mockInvoke.mock.calls.slice(2).map(call => call[0])).toEqual([
      'cache:write',
      'cache:write',
    ])
  })
})

describe('dataCache touch retry cancellation', () => {
  it('ignores a successful touch response after clear completes', async () => {
    vi.useFakeTimers()
    const touch = deferred<unknown>()
    try {
      dataCache.set('cleared-successful-touch', 'value')
      mockInvoke.mockReset()
      dataCache.get('cleared-successful-touch')
      mockInvoke.mockImplementationOnce(() => touch.promise).mockResolvedValueOnce(undefined)

      await vi.advanceTimersByTimeAsync(1000)
      await expect(dataCache.clear()).resolves.toBe(true)
      touch.resolve({
        success: true,
        stats: { entryCount: 99, totalBytes: 999 },
        removedKeys: [],
      })
      await Promise.resolve()

      await expect(dataCache.getStorageStats()).resolves.toEqual({
        entryCount: 0,
        totalBytes: 0,
      })
    } finally {
      vi.useRealTimers()
    }
  })

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
