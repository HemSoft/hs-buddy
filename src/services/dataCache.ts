/**
 * Bounded persistent data cache.
 *
 * Startup hydrates only critical PR and organization summaries. Large list and detail
 * payloads remain on disk until getOrLoad() requests their exact key.
 */

import { MS_PER_MINUTE } from '../constants'
import { IPC_INVOKE } from '../ipc/contracts'
import {
  createPersistedCacheEntry,
  getReplacementSiblingKeys,
  isIncomingCacheVersionSuperseded,
  type DataCacheStorageStats,
  type PersistedCacheEntry,
  type PersistedDataCache,
} from './dataCachePolicy'

export interface CacheEntry<T = unknown> {
  data: T
  fetchedAt: number
  schemaVersion?: number
  lastAccessedAt?: number
  serializedBytes?: number
}

type CacheListener = (key: string) => void

interface CacheInitializationResult {
  entries: PersistedDataCache
  stats: DataCacheStorageStats
  removedKeys: string[]
}

interface CacheMutationResult {
  success: boolean
  stats?: DataCacheStorageStats
  removedKeys?: string[]
}

const memoryCache: PersistedDataCache = {}
const listeners: Set<CacheListener> = new Set()
let initialized = false
let storageStats: DataCacheStorageStats = { entryCount: 0, totalBytes: 0 }

function notifyListeners(key: string): void {
  for (const listener of listeners) {
    try {
      listener(key)
    } catch (err: unknown) {
      console.error('[DataCache] Listener error:', err)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCacheEntry(value: unknown): value is PersistedCacheEntry {
  return (
    isRecord(value) &&
    'data' in value &&
    typeof value.fetchedAt === 'number' &&
    typeof value.schemaVersion === 'number' &&
    typeof value.lastAccessedAt === 'number' &&
    typeof value.serializedBytes === 'number'
  )
}

function removeMemoryKeys(keys: readonly string[]): void {
  for (const key of keys) {
    if (!(key in memoryCache)) continue
    delete memoryCache[key]
    notifyListeners(key)
  }
}

function applyMutationResult(result: unknown): void {
  if (!isRecord(result)) return
  const mutation = result as unknown as CacheMutationResult
  if (mutation.stats) storageStats = mutation.stats
  if (Array.isArray(mutation.removedKeys)) removeMemoryKeys(mutation.removedKeys)
}

export const dataCache = {
  /** Initialize critical startup entries after main-process pruning. */
  async initialize(): Promise<void> {
    if (initialized) return
    try {
      const result = (await window.ipcRenderer.invoke(
        IPC_INVOKE.CACHE_INITIALIZE
      )) as CacheInitializationResult | null
      if (result && isRecord(result.entries)) {
        Object.assign(memoryCache, result.entries)
        storageStats = result.stats
      }
      initialized = true
      console.log(
        '[DataCache] Initialized with',
        Object.keys(memoryCache).length,
        'startup entries from',
        storageStats.entryCount,
        'persisted entries'
      )
    } catch (err: unknown) {
      console.error('[DataCache] Failed to initialize:', err)
      initialized = true
    }
  },

  /** Return an entry already loaded into renderer memory. */
  get<T = unknown>(key: string): CacheEntry<T> | null {
    const entry = memoryCache[key] as CacheEntry<T> | undefined
    if (!entry) return null
    entry.lastAccessedAt = Date.now()
    return entry
  },

  /** Load one persisted entry on demand when it was not part of startup hydration. */
  async getOrLoad<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    const existing = this.get<T>(key)
    if (existing) return existing
    try {
      const loaded = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_READ, key)
      if (!isCacheEntry(loaded)) return null
      memoryCache[key] = loaded
      return loaded as CacheEntry<T>
    } catch (err: unknown) {
      console.error('[DataCache] Failed to load cache entry:', err)
      return null
    }
  },

  /** Store data in memory immediately and persist it through the bounded main-process cache. */
  set<T>(key: string, data: T, fetchedAt: number = Date.now()): void {
    if (isIncomingCacheVersionSuperseded(memoryCache, key)) return
    const accessedAt = Date.now()
    const replacedKeys = getReplacementSiblingKeys(memoryCache, key)
    removeMemoryKeys(replacedKeys)
    memoryCache[key] = createPersistedCacheEntry(key, data, fetchedAt, accessedAt)
    notifyListeners(key)

    window.ipcRenderer
      .invoke(IPC_INVOKE.CACHE_WRITE, key, { data, fetchedAt })
      .then(applyMutationResult)
      .catch(err => {
        console.error('[DataCache] Failed to persist to disk:', err)
      })
  },

  isFresh(key: string, maxAgeMs: number): boolean {
    const entry = memoryCache[key]
    if (!entry) return false
    return Date.now() - entry.fetchedAt < maxAgeMs
  },

  subscribe(listener: CacheListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  isInitialized(): boolean {
    return initialized
  },

  delete(key: string): void {
    delete memoryCache[key]
    const deleteRequest = window.ipcRenderer.invoke(IPC_INVOKE.CACHE_DELETE, key)
    notifyListeners(key)
    deleteRequest.then(applyMutationResult).catch(err => {
      console.error('[DataCache] Failed to delete from disk:', err)
    })
  },

  async clear(): Promise<void> {
    const keys = Object.keys(memoryCache)
    for (const key of keys) delete memoryCache[key]
    try {
      const result = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_CLEAR)
      applyMutationResult(result)
      storageStats = { entryCount: 0, totalBytes: 0 }
    } catch (err: unknown) {
      console.error('[DataCache] Failed to clear disk cache:', err)
    }
    for (const key of keys) notifyListeners(key)
  },

  async getStorageStats(): Promise<DataCacheStorageStats> {
    try {
      const stats = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_STATS)
      if (
        isRecord(stats) &&
        typeof stats.entryCount === 'number' &&
        typeof stats.totalBytes === 'number'
      ) {
        storageStats = stats as unknown as DataCacheStorageStats
      }
    } catch (err: unknown) {
      console.error('[DataCache] Failed to read storage stats:', err)
    }
    return storageStats
  },

  getStats(): Record<string, { ageMs: number; ageFormatted: string }> {
    const now = Date.now()
    const stats: Record<string, { ageMs: number; ageFormatted: string }> = {}
    for (const [key, entry] of Object.entries(memoryCache)) {
      const ageMs = now - entry.fetchedAt
      const minutes = Math.floor(ageMs / MS_PER_MINUTE)
      const hours = Math.floor(minutes / 60)
      stats[key] = {
        ageMs,
        ageFormatted: hours > 0 ? `${hours}h ${minutes % 60}m ago` : `${minutes}m ago`,
      }
    }
    return stats
  },
}
