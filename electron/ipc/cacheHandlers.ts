import { ipcMain } from 'electron'
import { readDataCache, writeDataCacheEntry, deleteDataCacheEntry, clearDataCache } from '../cache'
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerCacheHandlers(): void {
  ipcMain.handle(IPC_INVOKE.CACHE_READ_ALL, () => {
    return readDataCache()
  })

  ipcMain.handle(
    IPC_INVOKE.CACHE_WRITE,
    (_event, key: string, entry: { data: unknown; fetchedAt: number }) => {
      writeDataCacheEntry(key, entry)
      return { success: true }
    }
  )

  ipcMain.handle(IPC_INVOKE.CACHE_DELETE, (_event, key: string) => {
    deleteDataCacheEntry(key)
    return { success: true }
  })

  ipcMain.handle(IPC_INVOKE.CACHE_CLEAR, () => {
    clearDataCache()
    return { success: true }
  })
}
