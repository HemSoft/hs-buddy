import { bench, describe } from 'vitest'

// Simulates the cache layer's JSON serialization/deserialization at various scales.
// The real cache (electron/cache.ts) stores data as JSON on disk via readFileSync/writeFileSync.
// This benchmark measures the hot path: JSON.parse + JSON.stringify throughput.

function generateCachePayload(
  entryCount: number
): Record<string, { data: unknown; fetchedAt: number }> {
  const cache: Record<string, { data: unknown; fetchedAt: number }> = {}
  for (let i = 0; i < entryCount; i++) {
    cache[`key-${i}`] = {
      data: {
        id: i,
        name: `Item ${i}`,
        description: `A cached entry with index ${i} containing typical PR/issue metadata`,
        labels: ['bug', 'enhancement', 'good-first-issue'].slice(0, (i % 3) + 1),
        author: { login: `user-${i % 10}`, avatarUrl: `https://example.com/avatar/${i % 10}` },
        createdAt: Date.now() - i * 86400000,
        updatedAt: Date.now() - i * 3600000,
        stats: { additions: i * 10, deletions: i * 3, changedFiles: i % 20 },
      },
      fetchedAt: Date.now() - i * 60000,
    }
  }
  return cache
}

const small = generateCachePayload(10)
const medium = generateCachePayload(100)
const large = generateCachePayload(1000)

const smallJson = JSON.stringify(small)
const mediumJson = JSON.stringify(medium)
const largeJson = JSON.stringify(large)

describe('JSON.stringify (cache write)', () => {
  bench('10 entries', () => {
    JSON.stringify(small)
  })

  bench('100 entries', () => {
    JSON.stringify(medium)
  })

  bench('1000 entries', () => {
    JSON.stringify(large)
  })
})

describe('JSON.parse (cache read)', () => {
  bench('10 entries', () => {
    JSON.parse(smallJson)
  })

  bench('100 entries', () => {
    JSON.parse(mediumJson)
  })

  bench('1000 entries', () => {
    JSON.parse(largeJson)
  })
})

describe('cache entry lookup (post-parse)', () => {
  bench('direct key access on 1000-entry object', () => {
    const cache = JSON.parse(largeJson)
    // Simulate typical cache hit pattern: parse then lookup
    void cache['key-500']
  })
})
