import { describe, expect, it } from 'vitest'
import { getUniqueOrgs, mapRepoPRToPullRequest } from './githubSidebarUtils'
import type { RepoPullRequest } from '../../../api/github'

/* ── getUniqueOrgs ──────────────────────────────────────────────── */
describe('getUniqueOrgs', () => {
  it('returns sorted unique orgs', () => {
    const accounts = [
      { org: 'beta-org' },
      { org: 'alpha-org' },
      { org: 'beta-org' },
      { org: 'gamma-org' },
    ]
    expect(getUniqueOrgs(accounts)).toEqual(['alpha-org', 'beta-org', 'gamma-org'])
  })

  it('filters out undefined orgs', () => {
    const accounts = [{ org: 'real-org' }, { org: undefined }, {}]
    expect(getUniqueOrgs(accounts)).toEqual(['real-org'])
  })

  it('returns empty array for no accounts', () => {
    expect(getUniqueOrgs([])).toEqual([])
  })

  it('returns empty array when all orgs are undefined', () => {
    expect(getUniqueOrgs([{}, { org: undefined }])).toEqual([])
  })

  it('handles single account', () => {
    expect(getUniqueOrgs([{ org: 'solo' }])).toEqual(['solo'])
  })
})

/* ── mapRepoPRToPullRequest ─────────────────────────────────────── */
describe('mapRepoPRToPullRequest', () => {
  const basePR: RepoPullRequest = {
    number: 42,
    title: 'Fix the thing',
    author: 'alice',
    authorAvatarUrl: 'https://example.com/avatar.png',
    url: 'https://github.com/org/repo/pull/42',
    state: 'open',
    approvalCount: 2,
    assigneeCount: 1,
    iApproved: true,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-16T12:00:00Z',
    headBranch: 'feature/fix',
    baseBranch: 'main',
    labels: [],
    draft: false,
  }

  it('maps all fields correctly', () => {
    const result = mapRepoPRToPullRequest(basePR, 'my-org')

    expect(result.source).toBe('GitHub')
    expect(result.repository).toBe('repo')
    expect(result.id).toBe(42)
    expect(result.title).toBe('Fix the thing')
    expect(result.author).toBe('alice')
    expect(result.authorAvatarUrl).toBe('https://example.com/avatar.png')
    expect(result.url).toBe('https://github.com/org/repo/pull/42')
    expect(result.state).toBe('open')
    expect(result.approvalCount).toBe(2)
    expect(result.assigneeCount).toBe(1)
    expect(result.iApproved).toBe(true)
    expect(result.created).toEqual(new Date('2026-01-15T10:00:00Z'))
    expect(result.updatedAt).toBe('2026-01-16T12:00:00Z')
    expect(result.headBranch).toBe('feature/fix')
    expect(result.baseBranch).toBe('main')
    expect(result.date).toBe('2026-01-16T12:00:00Z')
    expect(result.org).toBe('my-org')
  })

  it('uses createdAt as date when updatedAt is empty', () => {
    const pr = { ...basePR, updatedAt: '' }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.date).toBe('2026-01-15T10:00:00Z')
  })

  it('handles empty createdAt', () => {
    const pr = { ...basePR, createdAt: '' }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.created).toBeNull()
  })

  it('defaults null avatarUrl to undefined', () => {
    const pr = { ...basePR, authorAvatarUrl: null }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.authorAvatarUrl).toBeUndefined()
  })

  it('defaults null optional numbers to zero', () => {
    const pr = {
      ...basePR,
      approvalCount: undefined,
      assigneeCount: undefined,
      iApproved: undefined,
    } as unknown as RepoPullRequest

    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.approvalCount).toBe(0)
    expect(result.assigneeCount).toBe(0)
    expect(result.iApproved).toBe(false)
  })

  it('extracts repository name from URL path segment', () => {
    const pr = { ...basePR, url: 'https://github.com/acme/widgets/pull/7' }
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.repository).toBe('widgets')
  })

  it('falls back to full URL when path segment missing', () => {
    const pr = { ...basePR, url: '' }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.repository).toBe('')
  })
})
