import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
}))

vi.mock('./jsonFileStore', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  updateJsonFile: vi.fn(),
}))

import {
  clearDataCache,
  deleteDataCacheEntry,
  getDataCacheStats,
  initializeDataCache,
  readDataCache,
  readDataCacheEntry,
  writeDataCacheEntry,
} from './cache'
import { readJsonFile, updateJsonFile, writeJsonFile } from './jsonFileStore'

const NOW = Date.UTC(2026, 8, 1)

describe('cache', () => {
  let disk: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    disk = {}
    vi.mocked(readJsonFile).mockImplementation(() => disk)
    vi.mocked(writeJsonFile).mockImplementation((_path, value) => {
      disk = value as Record<string, unknown>
    })
    vi.mocked(updateJsonFile).mockImplementation((_path, _fallback, update) => {
      disk = update(disk) as Record<string, unknown>
    })
  })

  it('migrates and persists legacy entries while hydrating only startup summaries', () => {
    disk = {
      'pr:my-prs:account': { data: [1], fetchedAt: NOW - 100 },
      'repo-commit:org/repo/sha': { data: { files: [] }, fetchedAt: NOW - 100 },
    }

    const result = initializeDataCache(NOW)

    expect(result.entries).toHaveProperty('pr:my-prs:account')
    expect(result.entries).not.toHaveProperty('repo-commit:org/repo/sha')
    expect(result.stats.entryCount).toBe(2)
    expect(writeJsonFile).toHaveBeenCalledTimes(1)
  })

  it('bounds renderer startup hydration from a thousands-entry stale fixture', () => {
    disk = {
      'pr:my-prs:account': { data: [{ id: 1 }], fetchedAt: NOW },
      'org-overview:HemSoft': { data: { repositories: 10 }, fetchedAt: NOW },
      'pr-files:HemSoft/hs-buddy/630': { data: 'x'.repeat(50_000), fetchedAt: NOW },
      'repo-detail:HemSoft/hs-buddy': { data: 'x'.repeat(50_000), fetchedAt: NOW },
    }
    for (let index = 0; index < 3_000; index += 1) {
      disk[`repo-commit:HemSoft/hs-buddy/${index}`] = {
        data: 'x'.repeat(2_000),
        fetchedAt: NOW - 2 * 24 * 60 * 60 * 1000,
      }
    }

    const result = initializeDataCache(NOW)

    expect(Object.keys(result.entries)).toEqual(['pr:my-prs:account', 'org-overview:HemSoft'])
    expect(JSON.stringify(result.entries).length).toBeLessThan(10_000)
    expect(result.stats.entryCount).toBe(4)
    expect(result.stats.totalBytes).toBeLessThanOrEqual(10 * 1024 * 1024)
  })

  it('loads one detail entry on demand and updates its last-access time', () => {
    writeDataCacheEntry('repo-commit:org/repo/sha', { data: { files: [] }, fetchedAt: NOW }, NOW)

    const result = readDataCacheEntry('repo-commit:org/repo/sha', NOW + 50)

    expect(result).toMatchObject({ data: { files: [] }, lastAccessedAt: NOW + 50 })
    expect(readDataCacheEntry('missing', NOW + 100)).toBeNull()
  })

  it('replaces superseded schema and account-fingerprint siblings', () => {
    writeDataCacheEntry('user-activity:v2:org/alice', { data: 'old', fetchedAt: NOW }, NOW)
    const schemaResult = writeDataCacheEntry(
      'user-activity:v3:org/alice',
      { data: 'new', fetchedAt: NOW },
      NOW + 1
    )
    writeDataCacheEntry('pr:my-prs:old-account', { data: [1], fetchedAt: NOW }, NOW + 2)
    const accountResult = writeDataCacheEntry(
      'pr:my-prs:new-account',
      { data: [2], fetchedAt: NOW },
      NOW + 3
    )

    expect(schemaResult.removedKeys).toContain('user-activity:v2:org/alice')
    expect(accountResult.removedKeys).toContain('pr:my-prs:old-account')
    expect(readDataCache(NOW + 3)).toHaveProperty('user-activity:v3:org/alice')
    expect(readDataCache(NOW + 3)).toHaveProperty('pr:my-prs:new-account')
  })

  it('does not let an older schema write replace a newer entry', () => {
    writeDataCacheEntry('user-activity:v3:org/alice', { data: 'new', fetchedAt: NOW }, NOW)

    const result = writeDataCacheEntry(
      'user-activity:v2:org/alice',
      { data: 'old', fetchedAt: NOW },
      NOW + 1
    )

    expect(result.removedKeys).toContain('user-activity:v2:org/alice')
    expect(readDataCache(NOW + 1)).toMatchObject({
      'user-activity:v3:org/alice': { data: 'new' },
    })
  })

  it('preserves sequential writes made in the same event-loop turn', () => {
    writeDataCacheEntry('one', { data: 1, fetchedAt: NOW }, NOW)
    writeDataCacheEntry('two', { data: 2, fetchedAt: NOW }, NOW)

    expect(readDataCache(NOW)).toMatchObject({
      one: { data: 1 },
      two: { data: 2 },
    })
  })

  it('deletes one entry and returns updated stats', () => {
    writeDataCacheEntry('one', { data: 1, fetchedAt: NOW }, NOW)
    writeDataCacheEntry('two', { data: 2, fetchedAt: NOW }, NOW)

    const result = deleteDataCacheEntry('one', NOW)

    expect(result.removedKeys).toContain('one')
    expect(result.stats.entryCount).toBe(1)
    expect(readDataCache(NOW)).not.toHaveProperty('one')
  })

  it('reports persisted entry count and serialized size', () => {
    writeDataCacheEntry('one', { data: 'value', fetchedAt: NOW }, NOW)

    expect(getDataCacheStats(NOW)).toEqual({ entryCount: 1, totalBytes: 7 })
  })

  it('clears the cache file', () => {
    disk = { key: { data: 'value', fetchedAt: NOW } }

    expect(clearDataCache()).toEqual({
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })
    expect(disk).toEqual({})
  })

  it('returns safe fallbacks when storage operations fail', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(readJsonFile).mockImplementation(() => {
      throw new Error('read error')
    })
    vi.mocked(updateJsonFile).mockImplementation(() => {
      throw new Error('update error')
    })
    vi.mocked(writeJsonFile).mockImplementation(() => {
      throw new Error('write error')
    })

    expect(initializeDataCache(NOW).entries).toEqual({})
    expect(readDataCache(NOW)).toEqual({})
    expect(readDataCacheEntry('key', NOW)).toBeNull()
    expect(getDataCacheStats(NOW)).toEqual({ entryCount: 0, totalBytes: 0 })
    expect(writeDataCacheEntry('key', { data: null, fetchedAt: NOW }, NOW)).toEqual({
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })
    expect(deleteDataCacheEntry('key', NOW)).toEqual({
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })
    expect(clearDataCache()).toEqual({
      stats: { entryCount: 0, totalBytes: 0 },
      removedKeys: [],
    })
    expect(errorSpy).toHaveBeenCalled()
  })
})
