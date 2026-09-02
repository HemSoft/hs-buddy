import { describe, expect, it } from 'vitest'
import {
  DATA_CACHE_BYTE_LIMIT,
  DATA_CACHE_ENTRY_LIMIT,
  createPersistedCacheEntry,
  getDataCacheStorageStats,
  getCacheTtlMs,
  getReplacementSiblingKeys,
  isIncomingCacheVersionSuperseded,
  isStartupCriticalCacheKey,
  normalizeAndPruneDataCache,
} from './dataCachePolicy'

const NOW = Date.UTC(2026, 8, 1)

function entry(key: string, data: unknown, fetchedAt = NOW, accessedAt = fetchedAt) {
  return createPersistedCacheEntry(key, data, fetchedAt, accessedAt)
}

describe('data cache normalization', () => {
  it('migrates legacy entries and repairs corrupted metadata', () => {
    const result = normalizeAndPruneDataCache(
      {
        legacy: { data: { ok: true }, fetchedAt: NOW - 100 },
        repaired: {
          data: 'value',
          fetchedAt: NOW - 50,
          schemaVersion: -7,
          lastAccessedAt: 'broken',
          serializedBytes: Number.NaN,
        },
      },
      NOW
    )

    expect(result.cache.legacy).toMatchObject({
      schemaVersion: 1,
      lastAccessedAt: NOW - 100,
    })
    expect(result.cache.repaired).toMatchObject({
      schemaVersion: 1,
      lastAccessedAt: NOW - 50,
    })
    expect(result.cache.repaired.serializedBytes).toBeGreaterThan(0)
  })

  it('removes expired entries using data-class TTLs', () => {
    expect(getCacheTtlMs('repo-commit:org/repo/sha')).toBeLessThan(
      getCacheTtlMs('org-overview:org')
    )
    expect(getCacheTtlMs('pr-checks:org/repo/123')).toBe(24 * 60 * 60 * 1000)
    const result = normalizeAndPruneDataCache(
      {
        'repo-commit:org/repo/old': entry(
          'repo-commit:org/repo/old',
          'detail',
          NOW - getCacheTtlMs('repo-commit:org/repo/old')
        ),
        'org-overview:org': entry('org-overview:org', 'summary', NOW - 2 * 24 * 60 * 60 * 1000),
      },
      NOW
    )

    expect(result.cache).not.toHaveProperty('repo-commit:org/repo/old')
    expect(result.cache).toHaveProperty('org-overview:org')
    expect(getCacheTtlMs('repo-commits:org/repo')).toBe(3 * 24 * 60 * 60 * 1000)
    expect(getCacheTtlMs('seen-prs:my-prs')).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('drops invalid entries and accepts non-object cache input', () => {
    expect(normalizeAndPruneDataCache(null, NOW).cache).toEqual({})
    expect(
      normalizeAndPruneDataCache(
        {
          missingData: { fetchedAt: NOW },
          missingTime: { data: 'value' },
          infiniteTime: { data: 'value', fetchedAt: Number.POSITIVE_INFINITY },
          arrayEntry: [],
        },
        NOW
      ).cache
    ).toEqual({})
  })

  it('measures undefined data as serialized null', () => {
    expect(createPersistedCacheEntry('undefined', undefined, NOW, NOW).serializedBytes).toBe(4)
  })
})

describe('data cache limits and versioning', () => {
  it('keeps only the highest key schema version in each family', () => {
    const result = normalizeAndPruneDataCache(
      {
        'user-activity:v2:org/alice': entry('user-activity:v2:org/alice', 'old'),
        'user-activity:v3:org/alice': entry('user-activity:v3:org/alice', 'new'),
        'user-activity:v2:org/bob': entry('user-activity:v2:org/bob', 'other-user'),
      },
      NOW
    )

    expect(result.cache).not.toHaveProperty('user-activity:v2:org/alice')
    expect(result.cache).toHaveProperty('user-activity:v3:org/alice')
    expect(result.cache).toHaveProperty('user-activity:v2:org/bob')
  })

  it('uses deterministic LRU order and protects startup summaries first', () => {
    const raw: Record<string, unknown> = {}
    for (let index = 0; index < DATA_CACHE_ENTRY_LIMIT; index += 1) {
      const key = `detail-${String(index).padStart(3, '0')}`
      raw[key] = entry(key, index, NOW, NOW + index)
    }
    raw['org-overview:critical'] = entry('org-overview:critical', 'summary', NOW, NOW - 1000)

    const result = normalizeAndPruneDataCache(raw, NOW)

    expect(result.stats.entryCount).toBe(DATA_CACHE_ENTRY_LIMIT)
    expect(result.cache).toHaveProperty('org-overview:critical')
    expect(result.cache).not.toHaveProperty('detail-000')
  })

  it('breaks equal-access LRU ties by fetch time and then lexical key', () => {
    const raw: Record<string, unknown> = {}
    for (let index = 0; index < DATA_CACHE_ENTRY_LIMIT - 2; index += 1) {
      const key = `newer-${String(index).padStart(3, '0')}`
      raw[key] = entry(key, index, NOW + 1, NOW + 1)
    }
    raw.beta = entry('beta', 'b', NOW, NOW)
    raw.alpha = entry('alpha', 'a', NOW, NOW)
    raw.older = entry('older', 'old', NOW - 1, NOW)

    const result = normalizeAndPruneDataCache(raw, NOW)

    expect(result.cache).not.toHaveProperty('older')
    expect(result.cache).toHaveProperty('alpha')
    expect(result.cache).toHaveProperty('beta')
  })

  it('enforces the serialized-byte limit', () => {
    const raw: Record<string, unknown> = {}
    for (let index = 0; index < 20; index += 1) {
      const key = `blob-${String(index).padStart(2, '0')}`
      raw[key] = entry(key, 'x'.repeat(700_000), NOW, NOW + index)
    }

    const result = normalizeAndPruneDataCache(raw, NOW)

    expect(result.stats.totalBytes).toBeLessThanOrEqual(DATA_CACHE_BYTE_LIMIT)
    expect(result.cache).not.toHaveProperty('blob-00')
    expect(result.cache).toHaveProperty('blob-19')
  })
})

describe('data cache replacement and startup behavior', () => {
  it('identifies version and account-fingerprint siblings replaced by writes', () => {
    const cache = {
      'user-activity:v2:org/alice': {},
      'user-activity:v3:org/alice': {},
      'pr:my-prs:old-fingerprint': {},
      'pr:needs-review:keep': {},
    }

    expect(getReplacementSiblingKeys(cache, 'user-activity:v3:org/alice')).toEqual([
      'user-activity:v2:org/alice',
    ])
    expect(getReplacementSiblingKeys(cache, 'pr:my-prs:new-fingerprint')).toEqual([
      'pr:my-prs:old-fingerprint',
    ])
    expect(isIncomingCacheVersionSuperseded(cache, 'user-activity:v2:org/alice')).toBe(true)
    expect(isIncomingCacheVersionSuperseded(cache, 'user-activity:v4:org/alice')).toBe(false)
  })

  it('bounds startup hydration with thousands of stale detail entries', () => {
    const raw: Record<string, unknown> = {
      'pr:my-prs:current': entry('pr:my-prs:current', [{ id: 1 }]),
      'org-overview:HemSoft': entry('org-overview:HemSoft', { repos: 10 }),
      'seen-prs:my-prs': entry('seen-prs:my-prs', ['pr-1']),
    }
    for (let index = 0; index < 3_000; index += 1) {
      const key = `repo-commit:HemSoft/hs-buddy/${index}`
      raw[key] = entry(key, 'x'.repeat(2_000), NOW - 2 * 24 * 60 * 60 * 1000)
    }

    const result = normalizeAndPruneDataCache(raw, NOW)
    const startup = Object.fromEntries(
      Object.entries(result.cache).filter(([key]) => isStartupCriticalCacheKey(key))
    )

    expect(result.stats.entryCount).toBe(3)
    expect(Object.keys(startup)).toEqual([
      'pr:my-prs:current',
      'org-overview:HemSoft',
      'seen-prs:my-prs',
    ])
    expect(JSON.stringify(startup).length).toBeLessThan(10_000)
  })

  it('reports count and serialized bytes for a normalized cache', () => {
    const cache = {
      one: entry('one', 'value'),
      two: entry('two', 2),
    }
    expect(getDataCacheStorageStats(cache)).toEqual({ entryCount: 2, totalBytes: 8 })
  })
})
