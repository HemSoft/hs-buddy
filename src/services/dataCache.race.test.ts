import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ...globalThis.window,
  ipcRenderer: { invoke: mockInvoke },
})

const { dataCache } = await import('./dataCache')

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  return {
    promise: new Promise<T>((done, fail) => {
      resolve = done
      reject = fail
    }),
    resolve,
    reject,
  }
}

async function resetCache(): Promise<void> {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
  await dataCache.clear()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dataCache mutation ordering races', () => {
  beforeEach(resetCache)

  it('ignores an older eviction response after the key is recreated', async () => {
    dataCache.set('unchanged-eviction', 'remove-me')
    await Promise.resolve()
    const firstWrite = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce({
        success: true,
        stats: { entryCount: 1, totalBytes: 5 },
        removedKeys: [],
      })

    dataCache.set('recreated', 'old')
    dataCache.set('recreated', 'new')
    await vi.waitFor(() => expect(dataCache.get('recreated')?.data).toBe('new'))
    firstWrite.resolve({
      success: true,
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: ['recreated', 'unchanged-eviction'],
    })
    await Promise.resolve()

    expect(dataCache.get('recreated')?.data).toBe('new')
    expect(dataCache.get('unchanged-eviction')).toBeNull()
  })

  it('tracks overlapping exact-key reads until both complete', async () => {
    const firstRead = deferred<null>()
    const secondRead = deferred<null>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => firstRead.promise)
      .mockImplementationOnce(() => secondRead.promise)

    const first = dataCache.getOrLoad('shared-key')
    const second = dataCache.getOrLoad('shared-key')
    firstRead.resolve(null)
    await expect(first).resolves.toBeNull()
    secondRead.resolve(null)
    await expect(second).resolves.toBeNull()
  })
})

describe('dataCache pending-load mutation races', () => {
  beforeEach(resetCache)

  it('applies an eviction to a load that began before the evicting mutation', async () => {
    const read = deferred<unknown>()
    const write = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => read.promise)
      .mockImplementationOnce(() => write.promise)

    const loading = dataCache.getOrLoad<string>('evicted-pending-load')
    dataCache.set('eviction-trigger', 'value')
    read.resolve({
      data: 'loaded-before-eviction',
      fetchedAt: Date.now(),
      schemaVersion: 1,
      lastAccessedAt: Date.now(),
      serializedBytes: 22,
    })
    await expect(loading).resolves.toEqual(
      expect.objectContaining({ data: 'loaded-before-eviction' })
    )

    write.resolve({ success: true, removedKeys: ['evicted-pending-load'] })
    await vi.waitFor(() => expect(dataCache.get('evicted-pending-load')).toBeNull())
  })

  it('does not restore a pending schema sibling after replacement', async () => {
    const oldRead = deferred<{
      data: string
      fetchedAt: number
      schemaVersion: number
      lastAccessedAt: number
      serializedBytes: number
    }>()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => oldRead.promise).mockResolvedValue(undefined)

    const loading = dataCache.getOrLoad<string>('user-activity:v2:org/alice')
    dataCache.set('user-activity:v3:org/alice', 'new')
    oldRead.resolve({
      data: 'old',
      fetchedAt: Date.now(),
      schemaVersion: 2,
      lastAccessedAt: Date.now(),
      serializedBytes: 5,
    })

    await expect(loading).resolves.toBeNull()
    expect(dataCache.get('user-activity:v2:org/alice')).toBeNull()
    expect(dataCache.get('user-activity:v3:org/alice')?.data).toBe('new')
  })
})

describe('dataCache clear ordering races', () => {
  beforeEach(resetCache)

  it('serializes overlapping clear requests', async () => {
    const firstClear = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => firstClear.promise).mockResolvedValueOnce(undefined)

    const firstResult = dataCache.clear()
    const secondResult = dataCache.clear()
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    firstClear.resolve(undefined)
    await expect(firstResult).resolves.toBe(true)
    await expect(secondResult).resolves.toBe(true)
    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual(['cache:clear', 'cache:clear'])
  })

  it('preserves and persists an entry created while clear is in flight', async () => {
    const clearing = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => clearing.promise)
      .mockResolvedValue({
        success: true,
        stats: { entryCount: 1, totalBytes: 7 },
        removedKeys: [],
      })

    const clearResult = dataCache.clear()
    dataCache.set('post-clear', 'fresh')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    clearing.resolve({
      success: true,
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })

    await expect(clearResult).resolves.toBe(true)
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
    expect(mockInvoke.mock.calls[1]).toEqual([
      'cache:write',
      'post-clear',
      expect.objectContaining({ data: 'fresh' }),
    ])
    expect(dataCache.get('post-clear')?.data).toBe('fresh')
  })
})

describe('dataCache clear and lazy-read outcomes', () => {
  beforeEach(resetCache)

  it('rejects a pre-clear lazy read that resolves while clear is pending', async () => {
    const read = deferred<{
      data: string
      fetchedAt: number
      schemaVersion: number
      lastAccessedAt: number
      serializedBytes: number
    }>()
    const clearing = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => read.promise)
      .mockImplementationOnce(() => clearing.promise)

    const loading = dataCache.getOrLoad<string>('pending-before-clear')
    const clearResult = dataCache.clear()
    read.resolve({
      data: 'stale',
      fetchedAt: Date.now(),
      schemaVersion: 1,
      lastAccessedAt: Date.now(),
      serializedBytes: 7,
    })

    clearing.resolve(undefined)
    await expect(clearResult).resolves.toBe(true)
    await expect(loading).resolves.toBeNull()
    expect(dataCache.get('pending-before-clear')).toBeNull()
  })

  it('accepts a pre-clear lazy read after the clear fails', async () => {
    const read = deferred<unknown>()
    const clearing = deferred<unknown>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => read.promise)
      .mockImplementationOnce(() => clearing.promise)

    const loading = dataCache.getOrLoad<string>('pending-before-failed-clear')
    const clearResult = dataCache.clear()
    read.resolve({
      data: 'still-persisted',
      fetchedAt: Date.now(),
      schemaVersion: 1,
      lastAccessedAt: Date.now(),
      serializedBytes: 15,
    })
    clearing.reject(new Error('disk clear failed'))

    await expect(clearResult).resolves.toBe(false)
    await expect(loading).resolves.toEqual(expect.objectContaining({ data: 'still-persisted' }))
    spy.mockRestore()
  })

  it('does not install a load after a clear starts between validation continuations', async () => {
    const read = deferred<unknown>()
    const clearing = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => read.promise)
      .mockImplementationOnce(() => clearing.promise)

    const loading = dataCache.getOrLoad<string>('validated-before-clear')
    read.resolve({
      data: 'stale',
      fetchedAt: Date.now(),
      schemaVersion: 1,
      lastAccessedAt: Date.now(),
      serializedBytes: 7,
    })
    await Promise.resolve()
    const clearResult = dataCache.clear()
    clearing.resolve(undefined)

    await expect(clearResult).resolves.toBe(true)
    await loading
    expect(dataCache.get('validated-before-clear')).toBeNull()
  })
})

describe('dataCache clear mutation barriers', () => {
  beforeEach(resetCache)

  it('preserves an existing entry refreshed while clear is in flight', async () => {
    dataCache.set('refreshed-during-clear', 'old')
    const clearing = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => clearing.promise).mockResolvedValue(undefined)

    const clearResult = dataCache.clear()
    dataCache.set('refreshed-during-clear', 'new')
    clearing.resolve(undefined)

    await expect(clearResult).resolves.toBe(true)
    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
    expect(dataCache.get('refreshed-during-clear')?.data).toBe('new')
  })

  it('does not persist a pre-clear write after its touch barrier resolves', async () => {
    const touch = deferred<unknown>()
    dataCache.set('touch-before-clear', 'value')
    await Promise.resolve()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => touch.promise).mockResolvedValueOnce(undefined)

    dataCache.get('touch-before-clear')
    dataCache.set('write-before-clear', 'value')
    await expect(dataCache.clear()).resolves.toBe(true)
    touch.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual(['cache:touch', 'cache:clear'])
    expect(dataCache.get('write-before-clear')).toBeNull()
  })
})

describe('dataCache post-barrier mutation validation', () => {
  beforeEach(resetCache)

  it('does not persist a write deleted while its touch barrier is pending', async () => {
    const touch = deferred<unknown>()
    dataCache.set('deleted-during-write', 'old')
    await Promise.resolve()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => touch.promise).mockResolvedValueOnce(undefined)

    dataCache.get('deleted-during-write')
    dataCache.set('deleted-during-write', 'new')
    dataCache.delete('deleted-during-write')
    touch.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual(['cache:touch', 'cache:delete'])
    expect(dataCache.get('deleted-during-write')).toBeNull()
  })

  it('does not persist a write cleared re-entrantly by its subscriber', async () => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValueOnce(undefined)
    let reentrantClear: Promise<boolean> | undefined
    const unsubscribe = dataCache.subscribe(key => {
      if (key !== 'reentrant-clear') return
      unsubscribe()
      reentrantClear = dataCache.clear()
    })

    dataCache.set('reentrant-clear', 'value')
    await expect(reentrantClear).resolves.toBe(true)
    await Promise.resolve()

    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual(['cache:clear'])
    expect(dataCache.get('reentrant-clear')).toBeNull()
  })

  it('persists a pre-clear write after a failed clear releases its touch barrier', async () => {
    const touch = deferred<unknown>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dataCache.set('touch-before-failed-clear', 'value')
    await Promise.resolve()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => touch.promise)
      .mockRejectedValueOnce(new Error('disk clear failed'))
      .mockResolvedValueOnce(undefined)

    dataCache.get('touch-before-failed-clear')
    dataCache.set('write-before-failed-clear', 'value')
    await expect(dataCache.clear()).resolves.toBe(false)
    touch.resolve(undefined)

    await vi.waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(3))
    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual([
      'cache:touch',
      'cache:clear',
      'cache:write',
    ])
    spy.mockRestore()
  })

  it('waits for an active clear before starting a lazy read', async () => {
    const clearing = deferred<unknown>()
    mockInvoke.mockReset()
    mockInvoke.mockImplementationOnce(() => clearing.promise).mockResolvedValueOnce(null)

    const clearResult = dataCache.clear()
    const loading = dataCache.getOrLoad('read-during-clear')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    clearing.resolve(undefined)

    await expect(clearResult).resolves.toBe(true)
    await expect(loading).resolves.toBeNull()
    expect(mockInvoke.mock.calls[1]).toEqual(['cache:read', 'read-during-clear'])
  })
})

describe('dataCache clear and touch barriers', () => {
  beforeEach(resetCache)

  it('waits for a clear that starts during the touch barrier', async () => {
    const touch = deferred<unknown>()
    const clearing = deferred<unknown>()
    dataCache.set('touch-crossing-clear', 'value')
    await Promise.resolve()
    mockInvoke.mockReset()
    mockInvoke
      .mockImplementationOnce(() => touch.promise)
      .mockImplementationOnce(() => clearing.promise)

    dataCache.get('touch-crossing-clear')
    dataCache.set('write-crossing-clear', 'value')
    const clearResult = dataCache.clear()
    touch.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()
    expect(mockInvoke).toHaveBeenCalledTimes(2)

    clearing.resolve(undefined)
    await expect(clearResult).resolves.toBe(true)
    await Promise.resolve()
    expect(mockInvoke.mock.calls.map(call => call[0])).toEqual(['cache:touch', 'cache:clear'])
  })

  it('discards only the deleted entry from queued access touches', async () => {
    vi.useFakeTimers()
    try {
      await resetCache()
      dataCache.set('deleted-touch', 'value')
      dataCache.set('retained-touch', 'value')
      mockInvoke.mockClear()
      dataCache.get('deleted-touch')
      dataCache.get('retained-touch')
      dataCache.delete('deleted-touch')
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenCalledWith('cache:delete', 'deleted-touch')
      expect(mockInvoke).toHaveBeenCalledWith('cache:touch', ['retained-touch'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries an in-flight touch that fails while a failed clear is pending', async () => {
    vi.useFakeTimers()
    const touch = deferred<unknown>()
    const clear = deferred<unknown>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await resetCache()
      dataCache.set('touch-after-failed-clear', 'value')
      await Promise.resolve()
      mockInvoke.mockReset()
      mockInvoke
        .mockImplementationOnce(() => touch.promise)
        .mockImplementationOnce(() => clear.promise)
        .mockResolvedValueOnce(undefined)

      dataCache.get('touch-after-failed-clear')
      await vi.advanceTimersByTimeAsync(1000)
      const clearResult = dataCache.clear()
      touch.reject(new Error('touch failed'))
      await Promise.resolve()
      expect(mockInvoke).toHaveBeenCalledTimes(2)

      clear.reject(new Error('disk clear failed'))
      await expect(clearResult).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockInvoke).toHaveBeenCalledTimes(3)
      expect(mockInvoke.mock.calls[2]).toEqual(['cache:touch', ['touch-after-failed-clear']])
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }
  })
})
