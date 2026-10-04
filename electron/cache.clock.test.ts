import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/mock/userData' } }))
vi.mock('./jsonFileStore', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  updateJsonFile: vi.fn(),
}))

import {
  initializeDataCache,
  readDataCache,
  getDataCacheStats,
  writeDataCacheEntry,
  touchDataCacheEntries,
  deleteDataCacheEntry,
} from './cache'
import { readJsonFile, writeJsonFile, updateJsonFile } from './jsonFileStore'

const NOW = Date.UTC(2026, 9, 3, 12)
const DAY = 24 * 60 * 60 * 1000
let disk: Record<string, unknown>

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  disk = {
    'pr:my-prs:account': { data: [1], fetchedAt: NOW - 1 },
    'repo-detail:expired': { data: 'old', fetchedAt: NOW - DAY },
    'repo-detail:live': { data: 'ok', fetchedAt: NOW - DAY + 1 },
  }
  vi.mocked(readJsonFile).mockImplementation(() => disk)
  vi.mocked(writeJsonFile).mockImplementation((_path, value) => {
    disk = value as typeof disk
  })
  vi.mocked(updateJsonFile).mockImplementation((_path, _fallback, update) => {
    disk = update(disk) as typeof disk
  })
})

afterEach(() => vi.restoreAllMocks())

it('initializes using the wall clock, persists expiry, and hydrates only startup entries', () => {
  expect(initializeDataCache()).toEqual({
    entries: {
      'pr:my-prs:account': {
        data: [1],
        fetchedAt: NOW - 1,
        schemaVersion: 1,
        lastAccessedAt: NOW - 1,
        serializedBytes: 3,
      },
    },
    stats: { entryCount: 2, totalBytes: 7 },
    removedKeys: ['repo-detail:expired'],
  })
  expect(Object.keys(disk)).toEqual(['pr:my-prs:account', 'repo-detail:live'])
})

it('reads using the wall clock and persists the exact TTL boundary removal', () => {
  expect(readDataCache()).toEqual({
    'pr:my-prs:account': {
      data: [1],
      fetchedAt: NOW - 1,
      schemaVersion: 1,
      lastAccessedAt: NOW - 1,
      serializedBytes: 3,
    },
    'repo-detail:live': {
      data: 'ok',
      fetchedAt: NOW - DAY + 1,
      schemaVersion: 1,
      lastAccessedAt: NOW - DAY + 1,
      serializedBytes: 4,
    },
  })
  expect(disk).not.toHaveProperty('repo-detail:expired')
  expect(writeJsonFile).toHaveBeenCalledTimes(1)
})

it('reports statistics after pruning by the default wall clock', () => {
  expect(getDataCacheStats()).toEqual({ entryCount: 2, totalBytes: 7 })
  expect(disk).not.toHaveProperty('repo-detail:expired')
})

it('writes the default access time while preserving the caller fetch time and pruning expiry', () => {
  expect(writeDataCacheEntry('new', { data: 'new', fetchedAt: NOW - 10 })).toEqual({
    stats: { entryCount: 3, totalBytes: 12 },
    removedKeys: ['repo-detail:expired'],
  })
  expect(disk.new).toEqual({
    data: 'new',
    fetchedAt: NOW - 10,
    schemaVersion: 1,
    lastAccessedAt: NOW,
    serializedBytes: 5,
  })
  expect(disk).not.toHaveProperty('repo-detail:expired')
})

it('touches only requested live entries using the default wall clock', () => {
  expect(touchDataCacheEntries(['repo-detail:live', 'repo-detail:live', 'missing'])).toEqual({
    stats: { entryCount: 2, totalBytes: 7 },
    removedKeys: ['repo-detail:expired'],
  })
  expect(disk['repo-detail:live']).toMatchObject({
    fetchedAt: NOW - DAY + 1,
    lastAccessedAt: NOW,
  })
  expect(disk['pr:my-prs:account']).toMatchObject({ lastAccessedAt: NOW - 1 })
  expect(disk).not.toHaveProperty('missing')
  expect(disk).not.toHaveProperty('repo-detail:expired')
})

it('deletes the requested entry and clock-expired entries with accurate remaining statistics', () => {
  expect(deleteDataCacheEntry('pr:my-prs:account')).toEqual({
    stats: { entryCount: 1, totalBytes: 4 },
    removedKeys: ['pr:my-prs:account', 'repo-detail:expired'],
  })
  expect(Object.keys(disk)).toEqual(['repo-detail:live'])
})
