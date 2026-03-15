import { describe, expect, it } from 'vitest'
import { createPRDetailViewId, parsePRDetailRoute } from './prDetailView'
import type { PullRequest } from '../types/pullRequest'

const basePR: PullRequest = {
  source: 'GitHub',
  repository: 'owner/repo',
  id: 42,
  title: 'Fix bug',
  author: 'testuser',
  authorAvatarUrl: 'https://example.com/avatar.png',
  url: 'https://github.com/owner/repo/pull/42',
  state: 'open',
  approvalCount: 1,
  assigneeCount: 2,
  iApproved: false,
  created: new Date('2024-01-15T10:30:00.000Z'),
  updatedAt: '2024-01-16T12:00:00Z',
  headBranch: 'feature/fix-bug',
  baseBranch: 'main',
  date: '2024-01-15',
  orgAvatarUrl: 'https://example.com/org.png',
  org: 'test-org',
}

function decodePRDetailViewId(viewId: string) {
  const encoded = viewId.replace('pr-detail:', '').split('?section=')[0]
  return JSON.parse(decodeURIComponent(encoded))
}

describe('createPRDetailViewId', () => {
  it('returns a pr-detail view id without a section by default', () => {
    const result = createPRDetailViewId(basePR)

    expect(result).toMatch(/^pr-detail:/)
    expect(result).not.toContain('?section=')
  })

  it('does not include a section parameter when section is null', () => {
    const result = createPRDetailViewId(basePR, null)

    expect(result).not.toContain('?section=')
  })

  it('appends the provided section to the view id', () => {
    const result = createPRDetailViewId(basePR, 'commits')

    expect(result).toContain('?section=commits')
  })

  it('encodes the PR info as URI-encoded JSON', () => {
    const decoded = decodePRDetailViewId(createPRDetailViewId(basePR))

    expect(decoded.repository).toBe('owner/repo')
    expect(decoded.id).toBe(42)
    expect(decoded.author).toBe('testuser')
    expect(decoded.authorAvatarUrl).toBe('https://example.com/avatar.png')
  })

  it('converts the created date to an ISO string', () => {
    const decoded = decodePRDetailViewId(createPRDetailViewId(basePR))

    expect(decoded.created).toBe('2024-01-15T10:30:00.000Z')
  })

  it('stores created as null when the PR created date is null', () => {
    const decoded = decodePRDetailViewId(createPRDetailViewId({ ...basePR, created: null }))

    expect(decoded.created).toBeNull()
  })

  it('stores created as null when the PR created date is invalid', () => {
    const decoded = decodePRDetailViewId(
      createPRDetailViewId({ ...basePR, created: new Date('not-a-date') })
    )

    expect(decoded.created).toBeNull()
  })

  it('defaults missing optional fields to empty strings or null where applicable', () => {
    const decoded = decodePRDetailViewId(
      createPRDetailViewId({
        ...basePR,
        updatedAt: undefined,
        headBranch: undefined,
        baseBranch: undefined,
        orgAvatarUrl: undefined,
        org: undefined,
      })
    )

    expect(decoded.updatedAt).toBeNull()
    expect(decoded.headBranch).toBe('')
    expect(decoded.baseBranch).toBe('')
    expect(decoded.orgAvatarUrl).toBeUndefined()
    expect(decoded.org).toBeUndefined()
  })
})

describe('parsePRDetailRoute', () => {
  it('returns null for an empty string', () => {
    expect(parsePRDetailRoute('')).toBeNull()
  })

  it('returns null for a non pr-detail route', () => {
    expect(parsePRDetailRoute('repo-detail:owner/repo')).toBeNull()
  })

  it('returns null for malformed encoded data', () => {
    expect(parsePRDetailRoute('pr-detail:not%20valid%20json')).toBeNull()
  })

  it('returns null for a pr-detail route with no payload', () => {
    expect(parsePRDetailRoute('pr-detail:')).toBeNull()
  })

  it('parses a valid view id into PR details', () => {
    const result = parsePRDetailRoute(createPRDetailViewId(basePR))

    expect(result).not.toBeNull()
    expect(result?.pr.repository).toBe('owner/repo')
    expect(result?.pr.id).toBe(42)
    expect(result?.pr.title).toBe('Fix bug')
    expect(result?.pr.author).toBe('testuser')
    expect(result?.pr.state).toBe('open')
  })

  it('returns a null section when no section parameter is present', () => {
    const result = parsePRDetailRoute(createPRDetailViewId(basePR))

    expect(result?.section).toBeNull()
  })

  it.each([
    'conversation',
    'commits',
    'checks',
    'files-changed',
    'ai-reviews',
  ] as const)('returns %s when the section is valid', (section) => {
    const result = parsePRDetailRoute(createPRDetailViewId(basePR, section))

    expect(result?.section).toBe(section)
  })

  it('returns a null section for an invalid section value', () => {
    const result = parsePRDetailRoute(`${createPRDetailViewId(basePR)}?section=invalid-section`)

    expect(result).not.toBeNull()
    expect(result?.section).toBeNull()
  })
})

describe('createPRDetailViewId and parsePRDetailRoute', () => {
  it('preserves PR fields through a round trip', () => {
    const result = parsePRDetailRoute(createPRDetailViewId(basePR, 'files-changed'))

    expect(result).toEqual({
      pr: {
        source: 'GitHub',
        repository: 'owner/repo',
        id: 42,
        title: 'Fix bug',
        author: 'testuser',
        authorAvatarUrl: 'https://example.com/avatar.png',
        url: 'https://github.com/owner/repo/pull/42',
        state: 'open',
        approvalCount: 1,
        assigneeCount: 2,
        iApproved: false,
        created: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-16T12:00:00Z',
        headBranch: 'feature/fix-bug',
        baseBranch: 'main',
        date: '2024-01-15',
        orgAvatarUrl: 'https://example.com/org.png',
        org: 'test-org',
      },
      section: 'files-changed',
    })
  })

  it('preserves null and empty optional fields through a round trip', () => {
    const result = parsePRDetailRoute(
      createPRDetailViewId({
        ...basePR,
        authorAvatarUrl: undefined,
        created: null,
        updatedAt: null,
        headBranch: undefined,
        baseBranch: undefined,
        orgAvatarUrl: undefined,
        org: undefined,
      })
    )

    expect(result).not.toBeNull()
    expect(result?.pr.created).toBeNull()
    expect(result?.pr.updatedAt).toBeNull()
    expect(result?.pr.headBranch).toBe('')
    expect(result?.pr.baseBranch).toBe('')
    expect(result?.pr.authorAvatarUrl).toBeUndefined()
    expect(result?.pr.orgAvatarUrl).toBeUndefined()
    expect(result?.pr.org).toBeUndefined()
  })
})
