/**
 * Persistent Data Cache Service
 * 
 * Provides in-memory caching with automatic disk persistence via electron-store IPC.
 * Data survives app restarts — hydrated from disk on initialization, written through
 * on every set operation.
 * 
 * Usage:
 *   await dataCache.initialize()  // Call once before rendering
 *   dataCache.get('my-prs')       // Read (sync, from memory)
 *   dataCache.set('my-prs', data) // Write (sync in memory, async to disk)
 *   dataCache.isFresh('my-prs', 15 * 60 * 1000)  // Check staleness
 */

export interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number;
}

type CacheListener = (key: string) => void;

const memoryCache: Record<string, CacheEntry> = {};
const listeners: Set<CacheListener> = new Set();
let initialized = false;

export const dataCache = {
  /**
   * Initialize the cache by loading persisted data from disk.
   * Must be called once before any component mounts.
   */
  async initialize(): Promise<void> {
    if (initialized) return;
    try {
      const cached = await window.ipcRenderer.invoke('cache:read-all');
      if (cached && typeof cached === 'object') {
        Object.assign(memoryCache, cached);
      }
      initialized = true;
      console.log('[DataCache] Initialized with', Object.keys(memoryCache).length, 'cached entries:', Object.keys(memoryCache).join(', '));
    } catch (err) {
      console.error('[DataCache] Failed to initialize:', err);
      initialized = true; // Mark as init'd to avoid blocking app startup
    }
  },

  /**
   * Get a cached entry by key. Returns null if not found.
   * This is a synchronous read from the in-memory cache.
   */
  get<T = unknown>(key: string): CacheEntry<T> | null {
    return (memoryCache[key] as CacheEntry<T>) || null;
  },

  /**
   * Store data in the cache. Updates memory immediately and persists to disk async.
   * Notifies all subscribers of the update.
   */
  set<T>(key: string, data: T, fetchedAt: number = Date.now()): void {
    memoryCache[key] = { data, fetchedAt };
    
    // Notify listeners (for components that need to react to cache updates)
    for (const listener of listeners) {
      try {
        listener(key);
      } catch (err) {
        console.error('[DataCache] Listener error:', err);
      }
    }

    // Persist to disk asynchronously (fire and forget)
    window.ipcRenderer.invoke('cache:write', key, { data, fetchedAt }).catch(err => {
      console.error('[DataCache] Failed to persist to disk:', err);
    });
  },

  /**
   * Check if a cache entry exists and is within the max age.
   */
  isFresh(key: string, maxAgeMs: number): boolean {
    const entry = memoryCache[key];
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < maxAgeMs;
  },

  /**
   * Subscribe to cache updates. Returns an unsubscribe function.
   * Listener is called with the cache key that was updated.
   */
  subscribe(listener: CacheListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Check if the cache has been initialized from disk.
   */
  isInitialized(): boolean {
    return initialized;
  },

  /**
   * Clear all cached data (memory + disk).
   */
  async clear(): Promise<void> {
    for (const key of Object.keys(memoryCache)) {
      delete memoryCache[key];
    }
    try {
      await window.ipcRenderer.invoke('cache:clear');
    } catch (err) {
      console.error('[DataCache] Failed to clear disk cache:', err);
    }
  },

  /**
   * Get all cache keys and their ages (useful for debugging).
   */
  getStats(): Record<string, { ageMs: number; ageFormatted: string }> {
    const now = Date.now();
    const stats: Record<string, { ageMs: number; ageFormatted: string }> = {};
    for (const [key, entry] of Object.entries(memoryCache)) {
      const ageMs = now - entry.fetchedAt;
      const minutes = Math.floor(ageMs / 60000);
      const hours = Math.floor(minutes / 60);
      stats[key] = {
        ageMs,
        ageFormatted: hours > 0
          ? `${hours}h ${minutes % 60}m ago`
          : `${minutes}m ago`,
      };
    }
    return stats;
  },
};
