import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}))

vi.mock('./jsonFileStore', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  updateJsonFile: vi.fn(),
}))

import { readDataCache, writeDataCacheEntry, deleteDataCacheEntry, clearDataCache } from './cache'
import { readJsonFile, writeJsonFile, updateJsonFile } from './jsonFileStore'

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('readDataCache', () => {
    it('reads the cache file and returns its contents', () => {
      const mockData = { key1: { data: 'test', fetchedAt: 1000 } }
      vi.mocked(readJsonFile).mockReturnValue(mockData)
      const result = readDataCache()
      expect(result).toEqual(mockData)
      expect(readJsonFile).toHaveBeenCalledWith(expect.stringContaining('data-cache.json'), {})
    })

    it('returns empty object when readJsonFile throws', () => {
      vi.mocked(readJsonFile).mockImplementation(() => {
        throw new Error('read error')
      })
      const result = readDataCache()
      expect(result).toEqual({})
    })
  })

  describe('writeDataCacheEntry', () => {
    it('calls updateJsonFile with the correct key and entry', () => {
      const entry = { data: 'test', fetchedAt: 1000 }
      writeDataCacheEntry('myKey', entry)
      expect(updateJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('data-cache.json'),
        {},
        expect.any(Function)
      )
      // Execute the updater function to verify behavior
      const updater = vi.mocked(updateJsonFile).mock.calls[0][2]
      const existing = { otherKey: { data: 'old', fetchedAt: 500 } }
      const result = updater(existing)
      expect(result).toEqual({
        otherKey: { data: 'old', fetchedAt: 500 },
        myKey: entry,
      })
    })

    it('does not throw when updateJsonFile fails', () => {
      vi.mocked(updateJsonFile).mockImplementation(() => {
        throw new Error('write error')
      })
      expect(() => writeDataCacheEntry('key', { data: null, fetchedAt: 0 })).not.toThrow()
    })
  })

  describe('deleteDataCacheEntry', () => {
    it('calls updateJsonFile and removes the specified key', () => {
      deleteDataCacheEntry('toDelete')
      expect(updateJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('data-cache.json'),
        {},
        expect.any(Function)
      )
      // Execute the updater function
      const updater = vi.mocked(updateJsonFile).mock.calls[0][2]
      const existing = {
        toDelete: { data: 'x', fetchedAt: 100 },
        keep: { data: 'y', fetchedAt: 200 },
      }
      const result = updater(existing)
      expect(result).toEqual({ keep: { data: 'y', fetchedAt: 200 } })
      expect(result).not.toHaveProperty('toDelete')
    })

    it('does not throw when updateJsonFile fails', () => {
      vi.mocked(updateJsonFile).mockImplementation(() => {
        throw new Error('delete error')
      })
      expect(() => deleteDataCacheEntry('key')).not.toThrow()
    })
  })

  describe('clearDataCache', () => {
    it('writes an empty object to the cache file', () => {
      clearDataCache()
      expect(writeJsonFile).toHaveBeenCalledWith(expect.stringContaining('data-cache.json'), {})
    })

    it('does not throw when writeJsonFile fails', () => {
      vi.mocked(writeJsonFile).mockImplementation(() => {
        throw new Error('clear error')
      })
      expect(() => clearDataCache()).not.toThrow()
    })
  })
})
