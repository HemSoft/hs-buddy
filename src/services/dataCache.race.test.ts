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
} {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>(done => {
      resolve = done
    }),
    resolve,
  }
}

async function resetCache(): Promise<void> {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
  await dataCache.clear()
}

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
})
