import { app } from 'electron'
import path from 'node:path'
import {
  createPersistedCacheEntry,
  getDataCacheStorageStats,
  getReplacementSiblingKeys,
  isIncomingCacheVersionSuperseded,
  isStartupCriticalCacheKey,
  normalizeAndPruneDataCache,
  type DataCacheStorageStats,
  type PersistedCacheEntry,
  type PersistedDataCache,
} from '../src/services/dataCachePolicy'
import { readJsonFile, updateJsonFile, writeJsonFile } from './jsonFileStore'

const getDataCachePath = () => path.join(app.getPath('userData'), 'data-cache.json')

export interface DataCacheInitialization {
  entries: PersistedDataCache
  stats: DataCacheStorageStats
  removedKeys: string[]
}

export interface DataCacheMutationResult {
  stats: DataCacheStorageStats
  removedKeys: string[]
}

function emptyMutationResult(): DataCacheMutationResult {
  return { stats: { entryCount: 0, totalBytes: 0 }, removedKeys: [] }
}

function readPrunedDataCache(now: number): ReturnType<typeof normalizeAndPruneDataCache> {
  const raw = readJsonFile<unknown>(getDataCachePath(), {})
  const result = normalizeAndPruneDataCache(raw, now)
  if (result.changed) writeJsonFile(getDataCachePath(), result.cache)
  return result
}

export function initializeDataCache(now: number = Date.now()): DataCacheInitialization {
  try {
    const result = readPrunedDataCache(now)
    return {
      entries: Object.fromEntries(
        Object.entries(result.cache).filter(([key]) => isStartupCriticalCacheKey(key))
      ),
      stats: result.stats,
      removedKeys: result.removedKeys,
    }
  } catch (err: unknown) {
    console.error('[DataCache] Failed to initialize cache:', err)
    return { entries: {}, ...emptyMutationResult() }
  }
}

/** Main-process callers may inspect the bounded cache without sending it to the renderer. */
export function readDataCache(now: number = Date.now()): PersistedDataCache {
  try {
    return readPrunedDataCache(now).cache
  } catch (err: unknown) {
    console.error('[DataCache] Failed to read cache:', err)
    return {}
  }
}

export function readDataCacheEntry(
  key: string,
  now: number = Date.now()
): PersistedCacheEntry | null {
  let result: PersistedCacheEntry | null = null
  try {
    updateJsonFile<unknown>(getDataCachePath(), {}, raw => {
      const pruned = normalizeAndPruneDataCache(raw, now)
      const entry = pruned.cache[key]
      if (!entry) return pruned.cache
      result = { ...entry, lastAccessedAt: now }
      return { ...pruned.cache, [key]: result }
    })
  } catch (err: unknown) {
    console.error('[DataCache] Failed to read cache entry:', err)
  }
  return result
}

export function getDataCacheStats(now: number = Date.now()): DataCacheStorageStats {
  try {
    return readPrunedDataCache(now).stats
  } catch (err: unknown) {
    console.error('[DataCache] Failed to read cache stats:', err)
    return emptyMutationResult().stats
  }
}

export function writeDataCacheEntry(
  key: string,
  entry: Pick<PersistedCacheEntry, 'data' | 'fetchedAt'>,
  now: number = Date.now()
): DataCacheMutationResult {
  let result = emptyMutationResult()
  try {
    updateJsonFile<unknown>(getDataCachePath(), {}, raw => {
      const pruned = normalizeAndPruneDataCache(raw, now)
      const next: PersistedDataCache = { ...pruned.cache }
      if (isIncomingCacheVersionSuperseded(next, key)) {
        result = {
          stats: pruned.stats,
          removedKeys: Array.from(new Set([...pruned.removedKeys, key])).sort(),
        }
        return next
      }
      const replacedKeys = getReplacementSiblingKeys(next, key)
      for (const sibling of replacedKeys) delete next[sibling]
      next[key] = createPersistedCacheEntry(key, entry.data, entry.fetchedAt, now)

      const bounded = normalizeAndPruneDataCache(next, now)
      result = {
        stats: bounded.stats,
        removedKeys: Array.from(
          new Set([...pruned.removedKeys, ...replacedKeys, ...bounded.removedKeys])
        ).sort(),
      }
      return bounded.cache
    })
  } catch (err: unknown) {
    console.error('[DataCache] Failed to write cache:', err)
    throw err
  }
  return result
}

export function touchDataCacheEntries(
  keys: readonly string[],
  now: number = Date.now()
): DataCacheMutationResult {
  let result = emptyMutationResult()
  try {
    updateJsonFile<unknown>(getDataCachePath(), {}, raw => {
      const pruned = normalizeAndPruneDataCache(raw, now)
      const next: PersistedDataCache = { ...pruned.cache }
      for (const key of new Set(keys)) {
        const entry = next[key]
        if (entry) next[key] = { ...entry, lastAccessedAt: now }
      }
      const bounded = normalizeAndPruneDataCache(next, now)
      result = {
        stats: bounded.stats,
        removedKeys: Array.from(new Set([...pruned.removedKeys, ...bounded.removedKeys])).sort(),
      }
      return bounded.cache
    })
  } catch (err: unknown) {
    console.error('[DataCache] Failed to touch cache entries:', err)
    throw err
  }
  return result
}

export function deleteDataCacheEntry(
  key: string,
  now: number = Date.now()
): DataCacheMutationResult {
  let result = emptyMutationResult()
  try {
    updateJsonFile<unknown>(getDataCachePath(), {}, raw => {
      const pruned = normalizeAndPruneDataCache(raw, now)
      const next = { ...pruned.cache }
      const existed = key in next
      delete next[key]
      result = {
        stats: getDataCacheStorageStats(next),
        removedKeys: Array.from(new Set([...pruned.removedKeys, ...(existed ? [key] : [])])).sort(),
      }
      return next
    })
  } catch (err: unknown) {
    console.error('[DataCache] Failed to delete cache entry:', err)
    throw err
  }
  return result
}

export function clearDataCache(): DataCacheMutationResult {
  try {
    writeJsonFile(getDataCachePath(), {})
  } catch (err: unknown) {
    console.error('[DataCache] Failed to clear cache:', err)
    throw err
  }
  return emptyMutationResult()
}
