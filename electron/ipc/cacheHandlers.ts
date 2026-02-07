import { ipcMain } from 'electron'
import { readDataCache, writeDataCacheEntry, deleteDataCacheEntry, clearDataCache } from '../cache'

export function registerCacheHandlers(): void {
  ipcMain.handle('cache:read-all', () => {
    return readDataCache()
  })

  ipcMain.handle(
    'cache:write',
    (_event, key: string, entry: { data: unknown; fetchedAt: number }) => {
      writeDataCacheEntry(key, entry)
      return { success: true }
    }
  )

  ipcMain.handle('cache:delete', (_event, key: string) => {
    deleteDataCacheEntry(key)
    return { success: true }
  })

  ipcMain.handle('cache:clear', () => {
    clearDataCache()
    return { success: true }
  })
}
