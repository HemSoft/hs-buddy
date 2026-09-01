import { ipcMain } from 'electron'
import {
  initializeDataCache,
  readDataCacheEntry,
  touchDataCacheEntries,
  getDataCacheStats,
  writeDataCacheEntry,
  deleteDataCacheEntry,
  clearDataCache,
} from '../cache'
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerCacheHandlers(): void {
  ipcMain.handle(IPC_INVOKE.CACHE_INITIALIZE, () => initializeDataCache())

  ipcMain.handle(IPC_INVOKE.CACHE_READ, (_event, key: string) => readDataCacheEntry(key))

  ipcMain.handle(IPC_INVOKE.CACHE_TOUCH, (_event, keys: string[]) => {
    return { success: true, ...touchDataCacheEntries(keys) }
  })

  ipcMain.handle(IPC_INVOKE.CACHE_STATS, () => getDataCacheStats())

  ipcMain.handle(
    IPC_INVOKE.CACHE_WRITE,
    (_event, key: string, entry: { data: unknown; fetchedAt: number }) => {
      return { success: true, ...writeDataCacheEntry(key, entry) }
    }
  )

  ipcMain.handle(IPC_INVOKE.CACHE_DELETE, (_event, key: string) => {
    return { success: true, ...deleteDataCacheEntry(key) }
  })

  ipcMain.handle(IPC_INVOKE.CACHE_CLEAR, () => {
    return { success: true, ...clearDataCache() }
  })
}
