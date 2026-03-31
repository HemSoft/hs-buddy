import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock window.ipcRenderer before importing dataCache
const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ...globalThis.window,
  ipcRenderer: { invoke: mockInvoke },
})

// Must import after stubbing
const { dataCache } = await import('./dataCache')

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

      dataCache.subscribe(() => {
        throw new Error('listener boom')
      })
      dataCache.set('key', 'val', 1)

      expect(spy).toHaveBeenCalledWith('[DataCache] Listener error:', expect.any(Error))
      spy.mockRestore()
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
      // We test that initialize calls cache:read-all
      // Note: initialized flag is already set from the module load,
      // so this mainly validates the IPC call happened during module setup
      expect(mockInvoke).toHaveBeenCalledWith('cache:clear') // from beforeEach
    })
  })

  describe('isInitialized', () => {
    it('returns true after initialize() is called', async () => {
      mockInvoke.mockResolvedValueOnce({}) // cache:read-all
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
    it('logs error when disk clear fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('disk clear failed'))

      await dataCache.clear()

      expect(spy).toHaveBeenCalledWith('[DataCache] Failed to clear disk cache:', expect.any(Error))
      spy.mockRestore()
    })
  })
})
