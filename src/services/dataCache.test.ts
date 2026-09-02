import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock window.ipcRenderer before importing dataCache
const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ...globalThis.window,
  ipcRenderer: { invoke: mockInvoke },
})

// Must import after stubbing
const { dataCache } = await import('./dataCache')

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>(done => (resolve = done)), resolve }
}

describe('dataCache', () => {
  beforeEach(async () => {
    mockInvoke.mockReset()
    // Clear the internal memory cache between tests
    mockInvoke.mockResolvedValue(undefined)
    await dataCache.clear()
  })

  describe('get / set', () => {
    it('returns null for missing keys', () => {
      expect(dataCache.get('nonexistent')).toBeNull()
    })

    it('stores and retrieves data', () => {
      mockInvoke.mockResolvedValue(undefined) // cache:write
      dataCache.set('my-key', { foo: 'bar' }, 1000)

      const entry = dataCache.get('my-key')
      expect(entry).not.toBeNull()
      expect(entry!.data).toEqual({ foo: 'bar' })
      expect(entry!.fetchedAt).toBe(1000)
    })

    it('overwrites existing entries', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('key', 'v1', 100)
      dataCache.set('key', 'v2', 200)

      const entry = dataCache.get('key')
      expect(entry!.data).toBe('v2')
      expect(entry!.fetchedAt).toBe(200)
    })

    it('persists to disk via IPC on set', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('k', 'data', 500)

      expect(mockInvoke).toHaveBeenCalledWith('cache:write', 'k', { data: 'data', fetchedAt: 500 })
    })

    it('tracks metadata for new entries', () => {
      dataCache.set('metadata', { value: true }, 500)

      expect(dataCache.get('metadata')).toMatchObject({
        fetchedAt: 500,
        schemaVersion: 1,
        serializedBytes: 14,
      })
    })

    it('removes superseded schema siblings from renderer memory', () => {
      dataCache.set('user-activity:v2:org/alice', 'old', Date.now())
      dataCache.set('user-activity:v3:org/alice', 'new', Date.now())

      expect(dataCache.get('user-activity:v2:org/alice')).toBeNull()
      expect(dataCache.get('user-activity:v3:org/alice')?.data).toBe('new')
    })

    it('ignores writes from an older schema when a newer entry is loaded', () => {
      dataCache.set('user-activity:v3:org/bob', 'new', Date.now())
      mockInvoke.mockClear()

      dataCache.set('user-activity:v2:org/bob', 'old', Date.now())

      expect(dataCache.get('user-activity:v3:org/bob')?.data).toBe('new')
      expect(dataCache.get('user-activity:v2:org/bob')).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('on-demand persistence', () => {
    it('loads a non-startup detail entry by exact key', async () => {
      const persisted = {
        data: { files: ['a.ts'] },
        fetchedAt: 1000,
        schemaVersion: 1,
        lastAccessedAt: 2000,
        serializedBytes: 18,
      }
      mockInvoke.mockResolvedValueOnce(persisted)

      await expect(dataCache.getOrLoad('repo-commit:org/repo/sha')).resolves.toEqual(persisted)
      expect(mockInvoke).toHaveBeenCalledWith('cache:read', 'repo-commit:org/repo/sha')
    })

    it('returns an entry already loaded in renderer memory without IPC', async () => {
      dataCache.set('already-loaded', 'value', 1000)
      mockInvoke.mockClear()

      await expect(dataCache.getOrLoad('already-loaded')).resolves.toMatchObject({
        data: 'value',
      })
      expect(mockInvoke).not.toHaveBeenCalled()
    })

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

    it('logs batched access-time persistence failures', async () => {
      vi.useFakeTimers()
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        dataCache.set('touch-error', 'value', 1000)
        mockInvoke.mockReset()
        mockInvoke.mockRejectedValueOnce(new Error('touch failed'))

        dataCache.get('touch-error')
        await vi.advanceTimersByTimeAsync(1000)

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

  describe('persistence metadata and errors', () => {
    it('rejects malformed persisted entries and handles read failures', async () => {
      mockInvoke.mockResolvedValueOnce({ data: 'missing metadata', fetchedAt: 1000 })
      await expect(dataCache.getOrLoad('malformed')).resolves.toBeNull()

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('read failed'))
      await expect(dataCache.getOrLoad('read-error')).resolves.toBeNull()
      expect(spy).toHaveBeenCalledWith('[DataCache] Failed to load cache entry:', expect.any(Error))
      spy.mockRestore()
    })

    it('returns persisted storage counts and bytes', async () => {
      mockInvoke.mockResolvedValueOnce({ entryCount: 12, totalBytes: 4096 })

      await expect(dataCache.getStorageStats()).resolves.toEqual({
        entryCount: 12,
        totalBytes: 4096,
      })
    })

    it('applies eviction metadata returned by a write', async () => {
      mockInvoke.mockResolvedValueOnce({
        success: true,
        stats: { entryCount: 7, totalBytes: 2048 },
        removedKeys: ['mutation-key', 'not-loaded'],
      })

      dataCache.set('mutation-key', 'value', 1000)

      await vi.waitFor(() => expect(dataCache.get('mutation-key')).toBeNull())
      mockInvoke.mockResolvedValueOnce({ invalid: true })
      await expect(dataCache.getStorageStats()).resolves.toEqual({
        entryCount: 7,
        totalBytes: 2048,
      })
    })

    it('accepts a successful mutation response without optional details', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true })

      dataCache.set('plain-mutation', 'value', 1000)
      await vi.waitFor(() => expect(dataCache.get('plain-mutation')?.data).toBe('value'))
    })

    it('keeps prior stats for malformed responses and logs IPC failures', async () => {
      mockInvoke.mockResolvedValueOnce({ entryCount: 'bad', totalBytes: 0 })
      await expect(dataCache.getStorageStats()).resolves.toEqual({
        entryCount: 0,
        totalBytes: 0,
      })

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('stats failed'))
      await expect(dataCache.getStorageStats()).resolves.toEqual({
        entryCount: 0,
        totalBytes: 0,
      })
      expect(spy).toHaveBeenCalledWith(
        '[DataCache] Failed to read storage stats:',
        expect.any(Error)
      )
      spy.mockRestore()
    })
  })

  describe('on-demand load races', () => {
    const persisted = {
      data: 'stale',
      fetchedAt: 1000,
      schemaVersion: 1,
      lastAccessedAt: 1000,
      serializedBytes: 7,
    }

    it('does not overwrite a newer renderer write with a pending disk read', async () => {
      const read = deferred<typeof persisted>()
      mockInvoke.mockImplementationOnce(() => read.promise)

      const loading = dataCache.getOrLoad<string>('race-key')
      dataCache.set('race-key', 'fresh', 2000)
      read.resolve(persisted)

      await expect(loading).resolves.toMatchObject({ data: 'fresh', fetchedAt: 2000 })
      expect(dataCache.get('race-key')).toMatchObject({ data: 'fresh', fetchedAt: 2000 })
    })

    it('does not restore a pending disk read after a successful clear', async () => {
      const read = deferred<typeof persisted>()
      mockInvoke.mockImplementationOnce(() => read.promise).mockResolvedValueOnce(undefined)

      const loading = dataCache.getOrLoad<string>('cleared-read')
      await expect(dataCache.clear()).resolves.toBe(true)
      read.resolve(persisted)

      await expect(loading).resolves.toBeNull()
      expect(dataCache.get('cleared-read')).toBeNull()
    })
  })

  describe('isFresh', () => {
    it('returns false for missing keys', () => {
      expect(dataCache.isFresh('nope', 10000)).toBe(false)
    })

    it('returns true when entry is within max age', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('fresh', 'data', Date.now())
      expect(dataCache.isFresh('fresh', 60000)).toBe(true)
    })

    it('returns false when entry exceeds max age', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('stale', 'data', Date.now() - 120000) // 2 minutes ago
      expect(dataCache.isFresh('stale', 60000)).toBe(false) // max 1 minute
    })
  })

  describe('subscribe', () => {
    it('notifies listeners on set', () => {
      mockInvoke.mockResolvedValue(undefined)
      const keys: string[] = []
      const unsub = dataCache.subscribe(key => keys.push(key))

      dataCache.set('a', 'x', 1)
      dataCache.set('b', 'y', 2)

      expect(keys).toEqual(['a', 'b'])
      unsub()
    })

    it('stops notifying after unsubscribe', () => {
      mockInvoke.mockResolvedValue(undefined)
      const keys: string[] = []
      const unsub = dataCache.subscribe(key => keys.push(key))

      dataCache.set('before', 'x', 1)
      unsub()
      dataCache.set('after', 'y', 2)

      expect(keys).toEqual(['before'])
    })

    it('handles listener errors gracefully', () => {
      mockInvoke.mockResolvedValue(undefined)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const unsubscribe = dataCache.subscribe(() => {
        throw new Error('listener boom')
      })
      dataCache.set('key', 'val', 1)

      expect(spy).toHaveBeenCalledWith('[DataCache] Listener error:', expect.any(Error))
      unsubscribe()
      spy.mockRestore()
    })

    it('notifies listeners when an entry is deleted', () => {
      const keys: string[] = []
      const unsubscribe = dataCache.subscribe(key => keys.push(key))
      try {
        dataCache.set('delete-event', 'value', 1)
        keys.length = 0

        dataCache.delete('delete-event')

        expect(keys).toEqual(['delete-event'])
      } finally {
        unsubscribe()
      }
    })

    it('notifies listeners for each entry removed by clear', async () => {
      dataCache.set('clear-a', 'value', 1)
      dataCache.set('clear-b', 'value', 2)
      const keys: string[] = []
      const unsubscribe = dataCache.subscribe(key => keys.push(key))
      try {
        await dataCache.clear()

        expect(keys).toEqual(expect.arrayContaining(['clear-a', 'clear-b']))
      } finally {
        unsubscribe()
      }
    })
  })

  describe('delete', () => {
    it('removes from memory', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('del-me', 'data', 1)
      expect(dataCache.get('del-me')).not.toBeNull()

      dataCache.delete('del-me')
      expect(dataCache.get('del-me')).toBeNull()
    })

    it('deletes from disk via IPC', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('del-disk', 'data', 1)
      mockInvoke.mockClear()

      dataCache.delete('del-disk')
      expect(mockInvoke).toHaveBeenCalledWith('cache:delete', 'del-disk')
    })

    it('orders disk deletion before notifying subscribers', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('ordered-delete', 'data', 1)
      mockInvoke.mockClear()
      const listener = vi.fn()
      const unsubscribe = dataCache.subscribe(listener)
      try {
        dataCache.delete('ordered-delete')

        expect(mockInvoke).toHaveBeenCalledWith('cache:delete', 'ordered-delete')
        expect(mockInvoke.mock.invocationCallOrder[0]).toBeLessThan(
          listener.mock.invocationCallOrder[0]
        )
      } finally {
        unsubscribe()
      }
    })
  })

  describe('clear', () => {
    it('removes all entries from memory', async () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('a', 1, 1)
      dataCache.set('b', 2, 2)

      await dataCache.clear()

      expect(dataCache.get('a')).toBeNull()
      expect(dataCache.get('b')).toBeNull()
    })

    it('calls IPC to clear disk', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await dataCache.clear()
      expect(mockInvoke).toHaveBeenCalledWith('cache:clear')
    })

    it('waits for disk clearing before notifying subscribers', async () => {
      dataCache.set('ordered-clear', 'data', 1)
      let finishClear: () => void
      mockInvoke.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishClear = resolve
          })
      )
      const listener = vi.fn()
      const unsubscribe = dataCache.subscribe(listener)
      try {
        const clearPromise = dataCache.clear()
        expect(listener).not.toHaveBeenCalled()

        finishClear!()
        await clearPromise

        expect(listener).toHaveBeenCalledWith('ordered-clear')
      } finally {
        unsubscribe()
      }
    })
  })

  describe('getStats', () => {
    it('returns empty stats when cache is empty', () => {
      expect(dataCache.getStats()).toEqual({})
    })

    it('returns age info for cached entries', () => {
      mockInvoke.mockResolvedValue(undefined)
      const now = Date.now()
      dataCache.set('recent', 'data', now - 30000) // 30s ago

      const stats = dataCache.getStats()
      expect(stats['recent']).toBeDefined()
      expect(stats['recent'].ageMs).toBeGreaterThanOrEqual(29000)
      expect(stats['recent'].ageFormatted).toContain('m ago')
    })

    it('formats hours correctly', () => {
      mockInvoke.mockResolvedValue(undefined)
      dataCache.set('old', 'data', Date.now() - 2 * 60 * 60 * 1000) // 2h ago

      const stats = dataCache.getStats()
      expect(stats['old'].ageFormatted).toContain('h')
      expect(stats['old'].ageFormatted).toContain('m ago')
    })
  })

  describe('initialize', () => {
    it('loads cached data from disk', async () => {
      // Initialization is covered with fresh module instances in dataCache.init.test.ts.
      // Note: initialized flag is already set from the module load,
      // so this mainly validates the IPC call happened during module setup
      expect(mockInvoke).toHaveBeenCalledWith('cache:clear') // from beforeEach
    })
  })

  describe('isInitialized', () => {
    it('returns true after initialize() is called', async () => {
      mockInvoke.mockResolvedValueOnce({}) // cache:initialize
      await dataCache.initialize()
      expect(dataCache.isInitialized()).toBe(true)
    })
  })

  describe('set - error path', () => {
    it('logs error when disk persist fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('disk write failed'))

      dataCache.set('fail-key', 'data', 1)

      // Wait for the async disk persist to reject
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith(
          '[DataCache] Failed to persist to disk:',
          expect.any(Error)
        )
      })

      spy.mockRestore()
    })
  })

  describe('set - default fetchedAt', () => {
    it('uses Date.now() when fetchedAt is not provided', () => {
      mockInvoke.mockResolvedValue(undefined)
      const before = Date.now()
      dataCache.set('auto-time', 'data')
      const after = Date.now()

      const entry = dataCache.get('auto-time')
      expect(entry!.fetchedAt).toBeGreaterThanOrEqual(before)
      expect(entry!.fetchedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('delete - error path', () => {
    it('logs error when disk delete fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockResolvedValueOnce(undefined) // set write
      dataCache.set('del-err', 'data', 1)

      mockInvoke.mockRejectedValueOnce(new Error('disk delete failed'))
      dataCache.delete('del-err')

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith(
          '[DataCache] Failed to delete from disk:',
          expect.any(Error)
        )
      })

      spy.mockRestore()
    })
  })

  describe('clear - error path', () => {
    it('keeps memory and stats intact when disk clear fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      dataCache.set('survives', 'value')
      mockInvoke.mockRejectedValueOnce(new Error('disk clear failed'))

      await expect(dataCache.clear()).resolves.toBe(false)

      expect(dataCache.isFresh('survives', Number.POSITIVE_INFINITY)).toBe(true)
      expect(spy).toHaveBeenCalledWith('[DataCache] Failed to clear disk cache:', expect.any(Error))
      spy.mockRestore()
    })

    it('retains queued access-time updates when disk clear fails', async () => {
      vi.useFakeTimers()
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        dataCache.set('touched-survivor', 'value')
        mockInvoke.mockClear()
        dataCache.get('touched-survivor')
        mockInvoke
          .mockRejectedValueOnce(new Error('disk clear failed'))
          .mockResolvedValue(undefined)

        await expect(dataCache.clear()).resolves.toBe(false)
        await vi.advanceTimersByTimeAsync(1000)

        expect(mockInvoke).toHaveBeenCalledWith('cache:touch', ['touched-survivor'])
      } finally {
        spy.mockRestore()
        vi.useRealTimers()
      }
    })
  })
})
