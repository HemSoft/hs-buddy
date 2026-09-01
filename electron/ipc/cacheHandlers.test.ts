import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  read: vi.fn(),
  stats: vi.fn(),
  write: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../cache', () => ({
  initializeDataCache: mocks.initialize,
  readDataCacheEntry: mocks.read,
  getDataCacheStats: mocks.stats,
  writeDataCacheEntry: mocks.write,
  deleteDataCacheEntry: mocks.delete,
  clearDataCache: mocks.clear,
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
    mocks.write.mockReturnValue({ stats: { entryCount: 1, totalBytes: 4 }, removedKeys: [] })
    mocks.delete.mockReturnValue({ stats: { entryCount: 0, totalBytes: 0 }, removedKeys: ['key'] })
    mocks.clear.mockReturnValue({ stats: { entryCount: 0, totalBytes: 0 }, removedKeys: [] })
    registerCacheHandlers()
  })

  it('registers bounded cache IPC channels', () => {
    expect(Array.from(handlers.keys()).sort()).toEqual(
      [
        'cache:initialize',
        'cache:read',
        'cache:stats',
        'cache:write',
        'cache:delete',
        'cache:clear',
      ].sort()
    )
  })

  it('returns pruned startup entries', () => {
    const initialization = { entries: {}, stats: { entryCount: 0, totalBytes: 0 } }
    mocks.initialize.mockReturnValue(initialization)
    expect(handlers.get('cache:initialize')!()).toBe(initialization)
  })

  it('reads one entry and storage stats', () => {
    const entry = { data: 'value', fetchedAt: 1 }
    const stats = { entryCount: 1, totalBytes: 7 }
    mocks.read.mockReturnValue(entry)
    mocks.stats.mockReturnValue(stats)

    expect(handlers.get('cache:read')!({}, 'key')).toBe(entry)
    expect(mocks.read).toHaveBeenCalledWith('key')
    expect(handlers.get('cache:stats')!()).toBe(stats)
  })

  it('returns write, delete, and clear mutation details', () => {
    const entry = { data: 'test', fetchedAt: 1000 }

    expect(handlers.get('cache:write')!({}, 'key', entry)).toMatchObject({
      success: true,
      stats: { entryCount: 1, totalBytes: 4 },
    })
    expect(mocks.write).toHaveBeenCalledWith('key', entry)
    expect(handlers.get('cache:delete')!({}, 'key')).toMatchObject({
      success: true,
      removedKeys: ['key'],
    })
    expect(handlers.get('cache:clear')!()).toEqual({
      success: true,
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })
  })
})
