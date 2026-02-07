import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const getDataCachePath = () => path.join(app.getPath('userData'), 'data-cache.json')

export function readDataCache(): Record<string, { data: unknown; fetchedAt: number }> {
  try {
    const cachePath = getDataCachePath()
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch (err) {
    console.error('[DataCache] Failed to read cache:', err)
  }
  return {}
}

export function writeDataCacheEntry(key: string, entry: { data: unknown; fetchedAt: number }): void {
  try {
    const cache = readDataCache()
    cache[key] = entry
    writeFileSync(getDataCachePath(), JSON.stringify(cache))
  } catch (err) {
    console.error('[DataCache] Failed to write cache:', err)
  }
}

export function clearDataCache(): void {
  try {
    writeFileSync(getDataCachePath(), '{}')
  } catch (err) {
    console.error('[DataCache] Failed to clear cache:', err)
  }
}
