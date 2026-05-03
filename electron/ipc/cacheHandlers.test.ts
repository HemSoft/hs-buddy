import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadDataCache = vi.fn()
const mockWriteDataCacheEntry = vi.fn()
const mockDeleteDataCacheEntry = vi.fn()
const mockClearDataCache = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('../cache', () => ({
  readDataCache: (...args: unknown[]) => mockReadDataCache(...args),
  writeDataCacheEntry: (...args: unknown[]) => mockWriteDataCacheEntry(...args),
  deleteDataCacheEntry: (...args: unknown[]) => mockDeleteDataCacheEntry(...args),
  clearDataCache: (...args: unknown[]) => mockClearDataCache(...args),
}))

import { ipcMain } from 'electron'
import { registerCacheHandlers } from './cacheHandlers'

describe('cacheHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerCacheHandlers()
  })

  it('registers all expected IPC channels', () => {
    expect(handlers.has('cache:read-all')).toBe(true)
    expect(handlers.has('cache:write')).toBe(true)
    expect(handlers.has('cache:delete')).toBe(true)
    expect(handlers.has('cache:clear')).toBe(true)
  })

  describe('cache:read-all', () => {
    it('returns the full cache contents', () => {
      const mockData = { key1: { data: 'val', fetchedAt: 1000 } }
      mockReadDataCache.mockReturnValue(mockData)
      const result = handlers.get('cache:read-all')!()
      expect(result).toEqual(mockData)
    })
  })

  describe('cache:write', () => {
    it('writes the entry and returns success', () => {
      const entry = { data: 'test', fetchedAt: 1000 }
      const result = handlers.get('cache:write')!({}, 'myKey', entry)
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith('myKey', entry)
      expect(result).toEqual({ success: true })
    })
  })

  describe('cache:delete', () => {
    it('deletes the entry and returns success', () => {
      const result = handlers.get('cache:delete')!({}, 'myKey')
      expect(mockDeleteDataCacheEntry).toHaveBeenCalledWith('myKey')
      expect(result).toEqual({ success: true })
    })
  })

  describe('cache:clear', () => {
    it('clears the cache and returns success', () => {
      const result = handlers.get('cache:clear')!()
      expect(mockClearDataCache).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })
})
