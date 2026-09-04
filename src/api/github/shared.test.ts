import type { Octokit } from '@octokit/rest'
import { describe, expect, it, vi } from 'vitest'
import {
  parseLabels,
  mapPRLabel,
  capitalize,
  ensureCallback,
  pickFirst,
  mapUserAuthorFields,
  resolveCommentAuthor,
  includesLoginIgnoreCase,
  mapReactionGroups,
  batchProcess,
  clearOrgAvatarCache,
  getOrgAvatarCacheEntry,
  mapCommitFileToDiffFile,
  mapReviewCommentFields,
  resolveOrgAvatar,
  buildOctokitOptions,
  buildGraphqlOptions,
} from './shared'

describe('buildOctokitOptions', () => {
  it('bounds requests and does not retry authentication failures', () => {
    const options = buildOctokitOptions('HemSoft', 'token')

    expect(options.request?.timeout).toBe(15_000)
    expect(options.retry?.doNotRetry).toContain(401)
  })

  it('uses a distinct throttle group for each GitHub account', () => {
    const hemSoft = buildOctokitOptions('HemSoft', 'token')
    const secondAccount = buildOctokitOptions('second-account', 'token')

    expect(hemSoft.throttle?.id).toBe('hs-buddy:hemsoft')
    expect(secondAccount.throttle?.id).toBe('hs-buddy:second-account')
    expect(hemSoft.throttle?.id).not.toBe(secondAccount.throttle?.id)
  })

  it('rejects server-directed throttle waits beyond the request budget', () => {
    const options = buildOctokitOptions('HemSoft', 'token')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requestOptions = { method: 'GET', url: '/rate_limit' }
    const onRateLimit = options.throttle?.onRateLimit
    const onSecondaryRateLimit = options.throttle?.onSecondaryRateLimit

    if (!onRateLimit || !onSecondaryRateLimit) throw new Error('Missing throttle callbacks')

    try {
      expect(onRateLimit(16, requestOptions as never, {} as never, 0)).toBe(false)
      expect(onSecondaryRateLimit(16, requestOptions as never, {} as never, 0)).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('buildGraphqlOptions', () => {
  it('bounds standalone GraphQL requests', () => {
    expect(buildGraphqlOptions().request.timeout).toBe(15_000)
  })
})

describe('mapPRLabel', () => {
  it('maps a plain string to a label with default color', () => {
    expect(mapPRLabel('bug')).toEqual({ name: 'bug', color: '808080' })
  })

  it('maps an object with name and color', () => {
    expect(mapPRLabel({ name: 'feature', color: 'ff0000' })).toEqual({
      name: 'feature',
      color: 'ff0000',
    })
  })

  it('uses default color when color is null', () => {
    expect(mapPRLabel({ name: 'fix', color: null })).toEqual({ name: 'fix', color: '808080' })
  })

  it('uses default color when color is undefined', () => {
    expect(mapPRLabel({ name: 'docs' })).toEqual({ name: 'docs', color: '808080' })
  })

  it('uses empty string when name is undefined', () => {
    expect(mapPRLabel({ color: 'aabbcc' })).toEqual({ name: '', color: 'aabbcc' })
  })

  it('uses defaults for empty object', () => {
    expect(mapPRLabel({})).toEqual({ name: '', color: '808080' })
  })
})

describe('parseLabels', () => {
  it('maps a mixed array of strings and objects', () => {
    const result = parseLabels(['bug', { name: 'feature', color: 'ff0000' }])
    expect(result).toEqual([
      { name: 'bug', color: '808080' },
      { name: 'feature', color: 'ff0000' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(parseLabels([])).toEqual([])
  })
})

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  it('handles already capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })

  it('handles empty string', () => {
    expect(capitalize('')).toBe('')
  })
})

describe('ensureCallback', () => {
  it('returns the provided callback', () => {
    const cb = () => {}
    expect(ensureCallback(cb)).toBe(cb)
  })

  it('returns a no-op function when undefined', () => {
    const result = ensureCallback()
    expect(typeof result).toBe('function')
    // Should not throw when called
    result({
      currentAccount: 1,
      totalAccounts: 1,
      accountName: 'test',
      org: 'org',
      status: 'done',
    })
  })
})

describe('pickFirst', () => {
  it('returns the first value when both are provided', () => {
    expect(pickFirst('a', 'b')).toBe('a')
  })

  it('returns the second value when first is null', () => {
    expect(pickFirst(null, 'b')).toBe('b')
  })

  it('returns the second value when first is undefined', () => {
    expect(pickFirst(undefined, 'b')).toBe('b')
  })

  it('returns null when both are null', () => {
    expect(pickFirst(null, null)).toBeNull()
  })

  it('returns null when both are undefined', () => {
    expect(pickFirst(undefined, undefined)).toBeNull()
  })

  it('returns the first value even if it is falsy but defined', () => {
    expect(pickFirst(0, 1)).toBe(0)
    expect(pickFirst('', 'fallback')).toBe('')
    expect(pickFirst(false, true)).toBe(false)
  })
})

describe('mapUserAuthorFields', () => {
  it('maps a user object with login and avatar', () => {
    expect(mapUserAuthorFields({ login: 'alice', avatar_url: 'https://avatar' })).toEqual({
      author: 'alice',
      authorAvatarUrl: 'https://avatar',
    })
  })

  it('returns unknown and null for null user', () => {
    expect(mapUserAuthorFields(null)).toEqual({ author: 'unknown', authorAvatarUrl: null })
  })

  it('returns unknown and null for undefined user', () => {
    expect(mapUserAuthorFields(undefined)).toEqual({ author: 'unknown', authorAvatarUrl: null })
  })

  it('handles user with missing login', () => {
    expect(mapUserAuthorFields({ avatar_url: 'https://avatar' })).toEqual({
      author: 'unknown',
      authorAvatarUrl: 'https://avatar',
    })
  })

  it('handles user with missing avatar_url', () => {
    expect(mapUserAuthorFields({ login: 'bob' })).toEqual({
      author: 'bob',
      authorAvatarUrl: null,
    })
  })
})

describe('resolveCommentAuthor', () => {
  it('extracts login and avatarUrl from GraphQL author node', () => {
    expect(resolveCommentAuthor({ login: 'alice', avatarUrl: 'https://avatar' })).toEqual({
      author: 'alice',
      authorAvatarUrl: 'https://avatar',
    })
  })

  it('returns unknown and null for null author', () => {
    expect(resolveCommentAuthor(null)).toEqual({ author: 'unknown', authorAvatarUrl: null })
  })

  it('returns unknown and null for undefined author', () => {
    expect(resolveCommentAuthor(undefined)).toEqual({ author: 'unknown', authorAvatarUrl: null })
  })
})

describe('includesLoginIgnoreCase', () => {
  it('finds a matching login case-insensitively', () => {
    expect(includesLoginIgnoreCase(['Alice', 'Bob'], 'alice')).toBe(true)
  })

  it('finds exact case match', () => {
    expect(includesLoginIgnoreCase(['Alice'], 'Alice')).toBe(true)
  })

  it('returns false for no match', () => {
    expect(includesLoginIgnoreCase(['Alice', 'Bob'], 'charlie')).toBe(false)
  })

  it('returns false for null target', () => {
    expect(includesLoginIgnoreCase(['Alice'], null)).toBe(false)
  })

  it('returns false for empty logins array', () => {
    expect(includesLoginIgnoreCase([], 'alice')).toBe(false)
  })
})

describe('mapReactionGroups', () => {
  it('maps reaction groups with counts', () => {
    const groups = [
      { content: 'THUMBS_UP', viewerHasReacted: true, users: { totalCount: 3 } },
      { content: 'HEART', viewerHasReacted: false, users: { totalCount: 1 } },
    ]
    const result = mapReactionGroups(groups)
    expect(result).toHaveLength(8)
    expect(result.find(r => r.content === 'THUMBS_UP')).toEqual({
      content: 'THUMBS_UP',
      count: 3,
      viewerHasReacted: true,
    })
    expect(result.find(r => r.content === 'HEART')).toEqual({
      content: 'HEART',
      count: 1,
      viewerHasReacted: false,
    })
  })

  it('returns all zeroes for null groups', () => {
    const result = mapReactionGroups(null)
    expect(result).toHaveLength(8)
    result.forEach(r => {
      expect(r.count).toBe(0)
      expect(r.viewerHasReacted).toBe(false)
    })
  })

  it('returns all zeroes for undefined groups', () => {
    const result = mapReactionGroups(undefined)
    expect(result).toHaveLength(8)
  })

  it('returns all zeroes for empty groups array', () => {
    const result = mapReactionGroups([])
    expect(result).toHaveLength(8)
    result.forEach(r => {
      expect(r.count).toBe(0)
      expect(r.viewerHasReacted).toBe(false)
    })
  })

  it('includes all 8 supported reaction types', () => {
    const result = mapReactionGroups([])
    const contents = result.map(r => r.content)
    expect(contents).toEqual([
      'THUMBS_UP',
      'THUMBS_DOWN',
      'LAUGH',
      'HOORAY',
      'CONFUSED',
      'HEART',
      'ROCKET',
      'EYES',
    ])
  })
})

describe('batchProcess', () => {
  it('processes all items in batches', async () => {
    const processed: number[] = []
    await batchProcess([1, 2, 3, 4, 5], async item => {
      processed.push(item)
    })
    expect(processed).toEqual([1, 2, 3, 4, 5])
  })

  it('limits in-flight work to the custom batch size', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await batchProcess(
      [1, 2, 3, 4, 5],
      async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise(resolve => setTimeout(resolve, 0))
        inFlight -= 1
      },
      2
    )

    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('preserves source indexes across multiple batches', async () => {
    const results: string[] = []

    await batchProcess(
      ['first', 'second', 'third', 'fourth'],
      async (item, index) => {
        results[index] = item
      },
      2
    )

    expect(results).toEqual(['first', 'second', 'third', 'fourth'])
  })

  it('propagates failures without starting a later batch', async () => {
    const started: number[] = []

    await expect(
      batchProcess(
        [1, 2, 3],
        async item => {
          started.push(item)
          if (item === 2) throw new Error('rate limited')
        },
        2
      )
    ).rejects.toThrow('rate limited')

    expect(started).toEqual([1, 2])
  })

  it('handles empty array', async () => {
    const processed: number[] = []
    await batchProcess([], async item => {
      processed.push(item)
    })
    expect(processed).toEqual([])
  })

  it('uses default batch size of 10', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const processed: number[] = []
    await batchProcess(items, async item => {
      processed.push(item)
    })
    expect(processed).toHaveLength(25)
  })
})

describe('resolveOrgAvatar', () => {
  it('shares a successful in-flight lookup across accounts', async () => {
    clearOrgAvatarCache()
    let resolveSuccessfulLookup!: (value: { data: { avatar_url: string } }) => void
    const successfulLookup = new Promise<{ data: { avatar_url: string } }>(resolve => {
      resolveSuccessfulLookup = resolve
    })
    const successfulClient = {
      orgs: { get: vi.fn(() => successfulLookup) },
      users: { getByUsername: vi.fn() },
    } as unknown as Octokit
    const failingClient = {
      orgs: { get: vi.fn() },
      users: { getByUsername: vi.fn() },
    } as unknown as Octokit

    const successfulResult = resolveOrgAvatar(successfulClient, 'shared-org')
    const failedResult = resolveOrgAvatar(failingClient, 'shared-org')

    resolveSuccessfulLookup({ data: { avatar_url: 'https://avatars/shared-org' } })
    await expect(successfulResult).resolves.toBe('https://avatars/shared-org')
    await expect(failedResult).resolves.toBe('https://avatars/shared-org')
    expect(failingClient.orgs.get).not.toHaveBeenCalled()
    expect(failingClient.users.getByUsername).not.toHaveBeenCalled()
    expect(getOrgAvatarCacheEntry('shared-org')).toBe('https://avatars/shared-org')
  })

  it('durably caches null only when both org and user lookups are definitive 404s', async () => {
    clearOrgAvatarCache()
    const notFoundClient = {
      orgs: { get: vi.fn(() => Promise.reject({ status: 404 })) },
      users: { getByUsername: vi.fn(() => Promise.reject({ status: 404 })) },
    } as unknown as Octokit

    await expect(resolveOrgAvatar(notFoundClient, 'missing-org')).resolves.toBeNull()
    expect(getOrgAvatarCacheEntry('missing-org')).toBeNull()

    // A later call must not re-hit the network: the negative result is cached.
    await expect(resolveOrgAvatar(notFoundClient, 'missing-org')).resolves.toBeNull()
    expect(notFoundClient.orgs.get).toHaveBeenCalledTimes(1)
    expect(notFoundClient.users.getByUsername).toHaveBeenCalledTimes(1)
  })

  it('does not durably cache a transient failure and retries successfully later', async () => {
    clearOrgAvatarCache()
    const orgsGet = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ data: { avatar_url: 'https://avatars/retried-org' } })
    const usersGetByUsername = vi.fn().mockRejectedValueOnce({ status: 503 })
    const flakyClient = {
      orgs: { get: orgsGet },
      users: { getByUsername: usersGetByUsername },
    } as unknown as Octokit

    // First call: rate-limited org lookup, then a server error on user lookup.
    await expect(resolveOrgAvatar(flakyClient, 'flaky-org')).resolves.toBeNull()
    expect(getOrgAvatarCacheEntry('flaky-org')).toBeUndefined()

    // Second call: no cached negative result, so it retries and succeeds.
    await expect(resolveOrgAvatar(flakyClient, 'flaky-org')).resolves.toBe(
      'https://avatars/retried-org'
    )
    expect(getOrgAvatarCacheEntry('flaky-org')).toBe('https://avatars/retried-org')
    expect(orgsGet).toHaveBeenCalledTimes(2)
  })

  it('does not durably cache when the org lookup fails definitively but the user lookup is transient', async () => {
    clearOrgAvatarCache()
    const mixedClient = {
      orgs: { get: vi.fn(() => Promise.reject({ status: 404 })) },
      users: { getByUsername: vi.fn(() => Promise.reject({ status: 500 })) },
    } as unknown as Octokit

    await expect(resolveOrgAvatar(mixedClient, 'mixed-org')).resolves.toBeNull()
    expect(getOrgAvatarCacheEntry('mixed-org')).toBeUndefined()
  })
})

describe('mapCommitFileToDiffFile', () => {
  it('maps all fields from a raw commit file', () => {
    const raw = {
      filename: 'src/main.ts',
      previous_filename: 'src/old.ts',
      status: 'renamed',
      additions: 10,
      deletions: 5,
      changes: 15,
      patch: '@@ -1,3 +1,3 @@',
      blob_url: 'https://github.com/repo/blob/abc/src/main.ts',
    }
    expect(mapCommitFileToDiffFile(raw)).toEqual({
      filename: 'src/main.ts',
      previousFilename: 'src/old.ts',
      status: 'renamed',
      additions: 10,
      deletions: 5,
      changes: 15,
      patch: '@@ -1,3 +1,3 @@',
      blobUrl: 'https://github.com/repo/blob/abc/src/main.ts',
    })
  })

  it('provides defaults for missing optional fields', () => {
    const raw = { filename: 'README.md' }
    expect(mapCommitFileToDiffFile(raw)).toEqual({
      filename: 'README.md',
      previousFilename: null,
      status: 'modified',
      additions: 0,
      deletions: 0,
      changes: 0,
      patch: null,
      blobUrl: null,
    })
  })
})

describe('mapReviewCommentFields', () => {
  it('maps a GraphQL comment node to PRReviewComment', () => {
    const comment = {
      id: 'c1',
      author: { login: 'reviewer', avatarUrl: 'https://avatar' },
      body: 'Looks good',
      bodyHTML: '<p>Looks good</p>',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      url: 'https://github.com/repo/pull/1#comment-1',
      diffHunk: '@@ -1,3 +1,3 @@',
      reactionGroups: [],
    }
    const result = mapReviewCommentFields(comment, mapReactionGroups)
    expect(result).toEqual({
      id: 'c1',
      author: 'reviewer',
      authorAvatarUrl: 'https://avatar',
      body: 'Looks good',
      bodyHtml: '<p>Looks good</p>',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      url: 'https://github.com/repo/pull/1#comment-1',
      diffHunk: '@@ -1,3 +1,3 @@',
      reactions: expect.any(Array),
    })
  })

  it('handles null/missing optional fields', () => {
    const comment = {
      id: 'c2',
      author: null,
      body: '',
      bodyHTML: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      url: 'https://example.com',
      diffHunk: null,
      reactionGroups: null,
    }
    const result = mapReviewCommentFields(comment, mapReactionGroups)
    expect(result.author).toBe('unknown')
    expect(result.authorAvatarUrl).toBeNull()
    expect(result.body).toBe('')
    expect(result.bodyHtml).toBeNull()
    expect(result.diffHunk).toBeNull()
    expect(result.reactions).toHaveLength(8)
  })
})
