import { describe, it, expect } from 'vitest'
import { getUniqueOrgs, mapRepoPRToPullRequest } from './useGitHubSidebarData'
import type { RepoPullRequest } from '../../../api/github'

describe('getUniqueOrgs', () => {
  it('returns empty array for empty accounts', () => {
    expect(getUniqueOrgs([])).toEqual([])
  })

  it('extracts unique orgs from accounts', () => {
    const accounts = [{ org: 'alpha' }, { org: 'beta' }, { org: 'alpha' }]
    expect(getUniqueOrgs(accounts)).toEqual(['alpha', 'beta'])
  })

  it('filters out undefined orgs', () => {
    const accounts = [{ org: 'alpha' }, { org: undefined }, {}]
    expect(getUniqueOrgs(accounts)).toEqual(['alpha'])
  })

  it('sorts orgs alphabetically', () => {
    const accounts = [{ org: 'zebra' }, { org: 'apple' }, { org: 'mango' }]
    expect(getUniqueOrgs(accounts)).toEqual(['apple', 'mango', 'zebra'])
  })

  it('handles single account', () => {
    expect(getUniqueOrgs([{ org: 'solo' }])).toEqual(['solo'])
  })

  it('handles all undefined orgs', () => {
    expect(getUniqueOrgs([{}, { org: undefined }])).toEqual([])
  })
})

describe('mapRepoPRToPullRequest', () => {
  const basePR: RepoPullRequest = {
    number: 42,
    title: 'Fix the thing',
    state: 'open',
    author: 'alice',
    authorAvatarUrl: 'https://avatar.example.com/alice',
    url: 'https://github.com/acme/webapp/pull/42',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    labels: [{ name: 'bug', color: 'ff0000' }],
    draft: false,
    headBranch: 'fix-thing',
    baseBranch: 'main',
    assigneeCount: 1,
    approvalCount: 2,
    iApproved: true,
  }

  it('maps basic PR fields', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')

    expect(result.id).toBe(42)
    expect(result.title).toBe('Fix the thing')
    expect(result.state).toBe('open')
    expect(result.author).toBe('alice')
    expect(result.url).toBe('https://github.com/acme/webapp/pull/42')
    expect(result.org).toBe('acme')
  })

  it('maps source as GitHub', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.source).toBe('GitHub')
  })

  it('extracts repository from URL', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.repository).toBe('webapp')
  })

  it('maps approval and assignee counts', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.approvalCount).toBe(2)
    expect(result.assigneeCount).toBe(1)
    expect(result.iApproved).toBe(true)
  })

  it('maps branch info', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.headBranch).toBe('fix-thing')
    expect(result.baseBranch).toBe('main')
  })

  it('creates Date from createdAt', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.created).toBeInstanceOf(Date)
  })

  it('maps updatedAt and date', () => {
    const result = mapRepoPRToPullRequest(basePR, 'acme')
    expect(result.updatedAt).toBe('2025-01-02T00:00:00Z')
    expect(result.date).toBe('2025-01-02T00:00:00Z')
  })

  it('handles null authorAvatarUrl', () => {
    const pr = { ...basePR, authorAvatarUrl: null }
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.authorAvatarUrl).toBeUndefined()
  })

  it('defaults approvalCount to 0 when undefined', () => {
    const pr = { ...basePR, approvalCount: undefined } as unknown as RepoPullRequest
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.approvalCount).toBe(0)
  })

  it('defaults iApproved to false when undefined', () => {
    const pr = { ...basePR, iApproved: undefined } as unknown as RepoPullRequest
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.iApproved).toBe(false)
  })

  it('uses date fallback when updatedAt is missing', () => {
    const pr = { ...basePR, updatedAt: '' }
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.date).toBe('2025-01-01T00:00:00Z')
  })

  it('handles missing createdAt', () => {
    const pr = { ...basePR, createdAt: '' }
    const result = mapRepoPRToPullRequest(pr, 'acme')
    expect(result.created).toBeNull()
  })
})
