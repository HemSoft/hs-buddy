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
  getCacheTtlMs,
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

interface MutationContext {
  sequence: number
  keyRevisions: Map<string, number>
}

const memoryCache: PersistedDataCache = {}
const listeners: Set<CacheListener> = new Set()
let initialized = false
let storageStats: DataCacheStorageStats = { entryCount: 0, totalBytes: 0 }
const pendingTouchKeys = new Set<string>()
let touchTimer: ReturnType<typeof setTimeout> | null = null
let touchFlushPromise: Promise<void> | null = null
const keyRevisions = new Map<string, number>()
const pendingLoadCounts = new Map<string, number>()
let nextKeyRevision = 0
let clearAttemptRevision = 0
let lastSuccessfulClearAttemptRevision = 0
let mutationSequence = 0
let lastAppliedMutationSequence = 0
let clearGate: Promise<void> | null = null

async function waitForActiveClear(): Promise<void> {
  while (clearGate) await clearGate
}

function advanceKeyRevision(key: string): void {
  keyRevisions.set(key, ++nextKeyRevision)
}

function retainPendingLoad(key: string): void {
  pendingLoadCounts.set(key, (pendingLoadCounts.get(key) ?? 0) + 1)
}

function releasePendingLoad(key: string): void {
  const remaining = pendingLoadCounts.get(key)! - 1
  if (remaining > 0) pendingLoadCounts.set(key, remaining)
  else pendingLoadCounts.delete(key)
  cleanKeyRevision(key)
}

function cleanKeyRevision(key: string): void {
  if (
    !Object.hasOwn(memoryCache, key) &&
    !pendingLoadCounts.has(key) &&
    !pendingTouchKeys.has(key)
  ) {
    keyRevisions.delete(key)
  }
}

function evictExpiredMemoryEntry(key: string): void {
  const entry = memoryCache[key]
  if (!entry || Date.now() - entry.fetchedAt < getCacheTtlMs(key)) return
  advanceKeyRevision(key)
  pendingTouchKeys.delete(key)
  delete memoryCache[key]
  notifyListeners(key)
  cleanKeyRevision(key)
}

function createMutationContext(): MutationContext {
  return { sequence: ++mutationSequence, keyRevisions: new Map(keyRevisions) }
}

async function flushPendingTouches(): Promise<void> {
  touchTimer = null
  if (touchFlushPromise) {
    await touchFlushPromise
    await flushPendingTouches()
    return
  }
  const keys = Array.from(pendingTouchKeys)
  pendingTouchKeys.clear()
  if (keys.length === 0) return
  const context = createMutationContext()
  const touchClearAttemptRevision = clearAttemptRevision
  const operation = window.ipcRenderer
    .invoke(IPC_INVOKE.CACHE_TOUCH, keys)
    .then(async result => {
      if (clearGate) await waitForActiveClear()
      if (lastSuccessfulClearAttemptRevision <= touchClearAttemptRevision) {
        applyMutationResult(result, context)
      }
    })
    .catch(async err => {
      if (clearGate) await waitForActiveClear()
      if (lastSuccessfulClearAttemptRevision <= touchClearAttemptRevision) {
        for (const key of keys) {
          if (Object.hasOwn(memoryCache, key)) scheduleTouch(key)
        }
      }
      console.error('[DataCache] Failed to persist access times:', err)
    })
    .finally(() => {
      touchFlushPromise = null
    })
  touchFlushPromise = operation
  await operation
}

function scheduleTouch(key: string): void {
  pendingTouchKeys.add(key)
  touchTimer ??= setTimeout(() => void flushPendingTouches(), 1000)
}

function cancelPendingTouches(): void {
  pendingTouchKeys.clear()
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = null
}

function discardPendingTouches(keys: readonly string[]): void {
  for (const key of keys) pendingTouchKeys.delete(key)
  if (pendingTouchKeys.size === 0) cancelPendingTouches()
}

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
    const existed = Object.hasOwn(memoryCache, key)
    advanceKeyRevision(key)
    if (existed) {
      delete memoryCache[key]
      discardPendingTouches([key])
      notifyListeners(key)
    }
    cleanKeyRevision(key)
  }
}

function applyMutationResult(result: unknown, context?: MutationContext): void {
  if (!isRecord(result)) return
  const isStale = context && context.sequence < lastAppliedMutationSequence
  if (context && !isStale) lastAppliedMutationSequence = context.sequence
  const mutation = result as unknown as CacheMutationResult
  if (!isStale && mutation.stats) storageStats = mutation.stats
  if (Array.isArray(mutation.removedKeys)) {
    const removableKeys = context
      ? mutation.removedKeys.filter(
          key => (context.keyRevisions.get(key) ?? 0) === (keyRevisions.get(key) ?? 0)
        )
      : mutation.removedKeys
    removeMemoryKeys(removableKeys)
  }
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
        for (const [key, entry] of Object.entries(result.entries)) {
          advanceKeyRevision(key)
          memoryCache[key] = entry
        }
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
    evictExpiredMemoryEntry(key)
    const entry = memoryCache[key] as CacheEntry<T> | undefined
    if (!entry) return null
    const now = Date.now()
    entry.lastAccessedAt = now
    scheduleTouch(key)
    return entry
  },

  /** Load one persisted entry on demand when it was not part of startup hydration. */
  async getOrLoad<T = unknown>(key: string): Promise<CacheEntry<T> | null> {
    const activeClear = clearGate
    if (activeClear) await activeClear
    evictExpiredMemoryEntry(key)
    const existing = this.get<T>(key)
    if (existing) return existing
    const loadKeyRevision = keyRevisions.get(key) ?? 0
    const loadClearAttemptRevision = clearAttemptRevision
    retainPendingLoad(key)
    try {
      const loaded = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_READ, key)
      if (!isCacheEntry(loaded)) return null
      if (
        loadClearAttemptRevision !== clearAttemptRevision ||
        loadKeyRevision !== (keyRevisions.get(key) ?? 0)
      ) {
        return (memoryCache[key] as CacheEntry<T> | undefined) ?? null
      }
      loaded.lastAccessedAt = Date.now()
      advanceKeyRevision(key)
      memoryCache[key] = loaded
      scheduleTouch(key)
      return loaded as CacheEntry<T>
    } catch (err: unknown) {
      console.error('[DataCache] Failed to load cache entry:', err)
      return null
    } finally {
      releasePendingLoad(key)
    }
  },

  /** Store data in memory immediately and persist it through the bounded main-process cache. */
  set<T>(key: string, data: T, fetchedAt: number = Date.now()): void {
    if (isIncomingCacheVersionSuperseded(memoryCache, key)) return
    advanceKeyRevision(key)
    const writeKeyRevision = keyRevisions.get(key)!
    const writeClearAttemptRevision = clearAttemptRevision
    const accessedAt = Date.now()
    const knownKeys = Object.fromEntries([
      ...Object.keys(memoryCache).map(knownKey => [knownKey, null]),
      ...Array.from(pendingLoadCounts.keys()).map(knownKey => [knownKey, null]),
    ])
    const replacedKeys = getReplacementSiblingKeys(knownKeys, key)
    removeMemoryKeys(replacedKeys)
    memoryCache[key] = createPersistedCacheEntry(key, data, fetchedAt, accessedAt)
    notifyListeners(key)

    const persistWrite = async () => {
      if (clearGate) await waitForActiveClear()
      const touchBarrier =
        touchFlushPromise || pendingTouchKeys.size > 0 ? flushPendingTouches() : null
      if (touchBarrier) await touchBarrier
      if (clearGate) await waitForActiveClear()
      if (lastSuccessfulClearAttemptRevision > writeClearAttemptRevision) return
      if (keyRevisions.get(key) !== writeKeyRevision) return
      const context = createMutationContext()
      const result = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_WRITE, key, {
        data,
        fetchedAt,
      })
      applyMutationResult(result, context)
    }
    persistWrite().catch(err => {
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
    advanceKeyRevision(key)
    delete memoryCache[key]
    discardPendingTouches([key])
    cleanKeyRevision(key)
    const context = createMutationContext()
    const deleteRequest = window.ipcRenderer.invoke(IPC_INVOKE.CACHE_DELETE, key)
    notifyListeners(key)
    deleteRequest
      .then(result => {
        applyMutationResult(result, context)
      })
      .catch(err => {
        console.error('[DataCache] Failed to delete from disk:', err)
      })
  },

  async clear(): Promise<boolean> {
    if (clearGate) await waitForActiveClear()
    const revisionsAtStart = new Map(
      Object.keys(memoryCache).map(key => [key, keyRevisions.get(key)!] as const)
    )
    const pendingTouchesAtStart = new Map(
      Array.from(pendingTouchKeys, key => [key, keyRevisions.get(key)!] as const)
    )
    let releaseClear!: () => void
    clearGate = new Promise<void>(resolve => {
      releaseClear = resolve
    })
    const clearAttempt = ++clearAttemptRevision
    try {
      const result = await window.ipcRenderer.invoke(IPC_INVOKE.CACHE_CLEAR)
      lastSuccessfulClearAttemptRevision = clearAttempt
      const keys = Array.from(revisionsAtStart)
        .filter(([key, revision]) => keyRevisions.get(key)! === revision)
        .map(([key]) => key)
      const touchKeys = Array.from(pendingTouchesAtStart)
        .filter(([key, revision]) => keyRevisions.get(key)! === revision)
        .map(([key]) => key)
      discardPendingTouches(touchKeys)
      for (const key of keys) {
        advanceKeyRevision(key)
        delete memoryCache[key]
        cleanKeyRevision(key)
      }
      applyMutationResult(result)
      storageStats = { entryCount: 0, totalBytes: 0 }
      for (const key of keys) notifyListeners(key)
      return true
    } catch (err: unknown) {
      console.error('[DataCache] Failed to clear disk cache:', err)
      return false
    } finally {
      clearGate = null
      releaseClear()
    }
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
