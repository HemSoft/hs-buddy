import { app } from 'electron'
import path from 'node:path'
import { readJsonFile, updateJsonFile, writeJsonFile } from './jsonFileStore'

const getDataCachePath = () => path.join(app.getPath('userData'), 'data-cache.json')
type DataCache = Record<string, { data: unknown; fetchedAt: number }>

export function readDataCache(): DataCache {
  try {
    return readJsonFile(getDataCachePath(), {})
  } catch (err: unknown) {
    console.error('[DataCache] Failed to read cache:', err)
  }
  return {}
}

export function writeDataCacheEntry(
  key: string,
  entry: { data: unknown; fetchedAt: number }
): void {
  try {
    updateJsonFile(getDataCachePath(), {} as DataCache, cache => ({
      ...cache,
      [key]: entry,
    }))
  } catch (err: unknown) {
    console.error('[DataCache] Failed to write cache:', err)
  }
}

export function deleteDataCacheEntry(key: string): void {
  try {
    updateJsonFile(getDataCachePath(), {} as DataCache, cache => {
      const next = { ...cache }
      delete next[key]
      return next
    })
  } catch (err: unknown) {
    console.error('[DataCache] Failed to delete cache entry:', err)
  }
}

export function clearDataCache(): void {
  try {
    writeJsonFile(getDataCachePath(), {})
  } catch (err: unknown) {
    console.error('[DataCache] Failed to clear cache:', err)
  }
}
