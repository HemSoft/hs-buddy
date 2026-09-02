const DATA_CACHE_SCHEMA_VERSION = 1
export const DATA_CACHE_ENTRY_LIMIT = 200
export const DATA_CACHE_BYTE_LIMIT = 10 * 1024 * 1024

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface PersistedCacheEntry<T = unknown> {
  data: T
  fetchedAt: number
  schemaVersion: number
  lastAccessedAt: number
  serializedBytes: number
}

export type PersistedDataCache = Record<string, PersistedCacheEntry>

export interface DataCacheStorageStats {
  entryCount: number
  totalBytes: number
}

export interface PrunedDataCache {
  cache: PersistedDataCache
  removedKeys: string[]
  changed: boolean
  stats: DataCacheStorageStats
}

const STARTUP_PREFIXES = [
  'pr:',
  'org-overview:',
  'org-repos:',
  'repo-counts:',
  'seen-prs:',
] as const
const DETAIL_PREFIXES = [
  'repo-commit:',
  'pr-files:',
  'pr-checks:',
  'repo-detail:',
  'repo-issue:',
  'user-activity:',
] as const
const LIST_PREFIXES = [
  'repo-commits:',
  'repo-prs:',
  'repo-issues:',
  'org-members:',
  'org-teams:',
  'team-members:',
] as const

function startsWithOneOf(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => key.startsWith(prefix))
}

export function isStartupCriticalCacheKey(key: string): boolean {
  return startsWithOneOf(key, STARTUP_PREFIXES)
}

export function getCacheTtlMs(key: string): number {
  if (startsWithOneOf(key, DETAIL_PREFIXES)) return DAY_MS
  if (startsWithOneOf(key, LIST_PREFIXES)) return 3 * DAY_MS
  if (key.startsWith('seen-prs:')) return 30 * DAY_MS
  return 7 * DAY_MS
}

function getCacheKeySchemaVersion(key: string): number {
  const match = /(?:^|:)v(\d+)(?=:|$)/.exec(key)
  return match ? Number(match[1]) : DATA_CACHE_SCHEMA_VERSION
}

function getSerializedBytes(data: unknown): number {
  const serialized: unknown = JSON.stringify(data)
  return new TextEncoder().encode(typeof serialized === 'string' ? serialized : 'null').byteLength
}

export function createPersistedCacheEntry<T>(
  key: string,
  data: T,
  fetchedAt: number,
  accessedAt: number
): PersistedCacheEntry<T> {
  return {
    data,
    fetchedAt,
    schemaVersion: getCacheKeySchemaVersion(key),
    lastAccessedAt: accessedAt,
    serializedBytes: getSerializedBytes(data),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEntry(key: string, value: unknown, now: number): PersistedCacheEntry | null {
  if (!isRecord(value) || !('data' in value)) return null
  if (typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt)) return null

  const lastAccessedAt =
    typeof value.lastAccessedAt === 'number' && Number.isFinite(value.lastAccessedAt)
      ? value.lastAccessedAt
      : value.fetchedAt
  const normalized = createPersistedCacheEntry(key, value.data, value.fetchedAt, lastAccessedAt)

  if (now - normalized.fetchedAt >= getCacheTtlMs(key)) return null
  return normalized
}

function versionedFamily(key: string): { family: string; version: number } | null {
  const match = /^(.*):v(\d+):(.*)$/.exec(key)
  if (!match) return null
  return { family: `${match[1]}:${match[3]}`, version: Number(match[2]) }
}

export function getReplacementSiblingKeys(
  cache: Readonly<Record<string, unknown>>,
  key: string
): string[] {
  const versioned = versionedFamily(key)
  if (versioned) {
    return Object.keys(cache).filter(candidate => {
      if (candidate === key) return false
      return versionedFamily(candidate)?.family === versioned.family
    })
  }

  const prFingerprint = /^pr:([^:]+):/.exec(key)
  if (prFingerprint) {
    const prefix = `pr:${prFingerprint[1]}:`
    return Object.keys(cache).filter(candidate => candidate !== key && candidate.startsWith(prefix))
  }

  return []
}

export function isIncomingCacheVersionSuperseded(
  cache: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  const incoming = versionedFamily(key)
  if (!incoming) return false
  return Object.keys(cache).some(candidate => {
    const existing = versionedFamily(candidate)
    return existing?.family === incoming.family && existing.version > incoming.version
  })
}

function removeSupersededVersions(cache: PersistedDataCache, removed: Set<string>): void {
  const highestVersions = new Map<string, number>()
  for (const key of Object.keys(cache)) {
    const versioned = versionedFamily(key)
    if (!versioned) continue
    highestVersions.set(
      versioned.family,
      Math.max(versioned.version, highestVersions.get(versioned.family) ?? 0)
    )
  }

  for (const key of Object.keys(cache)) {
    const versioned = versionedFamily(key)
    if (!versioned) continue
    if (versioned.version < highestVersions.get(versioned.family)!) {
      delete cache[key]
      removed.add(key)
    }
  }
}

function getStorageStats(cache: PersistedDataCache): DataCacheStorageStats {
  return {
    entryCount: Object.keys(cache).length,
    totalBytes: Object.values(cache).reduce((total, entry) => total + entry.serializedBytes, 0),
  }
}

function evictionOrder(cache: PersistedDataCache): string[] {
  return Object.keys(cache).sort((left, right) => {
    const protection =
      Number(isStartupCriticalCacheKey(left)) - Number(isStartupCriticalCacheKey(right))
    if (protection !== 0) return protection
    const access = cache[left].lastAccessedAt - cache[right].lastAccessedAt
    if (access !== 0) return access
    const fetched = cache[left].fetchedAt - cache[right].fetchedAt
    if (fetched !== 0) return fetched
    return left < right ? -1 : 1
  })
}

export function normalizeAndPruneDataCache(
  rawCache: unknown,
  now: number = Date.now()
): PrunedDataCache {
  const rawRecord = isRecord(rawCache) ? rawCache : {}
  const cache: PersistedDataCache = {}
  const removed = new Set<string>()

  for (const [key, value] of Object.entries(rawRecord)) {
    const normalized = normalizeEntry(key, value, now)
    if (normalized) cache[key] = normalized
    else removed.add(key)
  }

  removeSupersededVersions(cache, removed)

  const stats = getStorageStats(cache)
  for (const key of evictionOrder(cache)) {
    if (stats.entryCount <= DATA_CACHE_ENTRY_LIMIT && stats.totalBytes <= DATA_CACHE_BYTE_LIMIT) {
      break
    }
    stats.entryCount -= 1
    stats.totalBytes -= cache[key].serializedBytes
    delete cache[key]
    removed.add(key)
  }

  const normalizedJson = JSON.stringify(cache)
  const rawJson = JSON.stringify(rawCache)
  return {
    cache,
    removedKeys: Array.from(removed).sort(),
    changed: normalizedJson !== rawJson,
    stats,
  }
}

export function getDataCacheStorageStats(cache: PersistedDataCache): DataCacheStorageStats {
  return getStorageStats(cache)
}
