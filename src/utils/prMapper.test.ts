import { describe, it, expect } from 'vitest'
import { mapRepoPRToPullRequest } from './prMapper'
import type { RepoPullRequest } from '../api/github'

const mockPR: RepoPullRequest = {
  number: 42,
  title: 'Fix bug',
  author: 'testuser',
  authorAvatarUrl: 'https://avatar.url/testuser',
  url: 'https://github.com/org/repo-name/pull/42',
  state: 'open',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-16T12:00:00Z',
  headBranch: 'fix/bug-42',
  baseBranch: 'main',
  approvalCount: 2,
  assigneeCount: 1,
  iApproved: true,
  draft: false,
  labels: [],
}

describe('mapRepoPRToPullRequest', () => {
  it('maps RepoPullRequest to PullRequest with correct fields', () => {
    const result = mapRepoPRToPullRequest(mockPR, 'my-org')

    expect(result).toEqual({
      source: 'GitHub',
      repository: 'repo-name',
      id: 42,
      title: 'Fix bug',
      author: 'testuser',
      authorAvatarUrl: 'https://avatar.url/testuser',
      url: 'https://github.com/org/repo-name/pull/42',
      state: 'open',
      approvalCount: 2,
      assigneeCount: 1,
      iApproved: true,
      created: new Date('2026-01-15T10:00:00Z'),
      updatedAt: '2026-01-16T12:00:00Z',
      headBranch: 'fix/bug-42',
      baseBranch: 'main',
      date: '2026-01-16T12:00:00Z',
      org: 'my-org',
    })
  })

  it('handles null createdAt', () => {
    const pr = { ...mockPR, createdAt: null as unknown as string }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.created).toBeNull()
  })

  it('falls back to createdAt when updatedAt is missing', () => {
    const pr = { ...mockPR, updatedAt: null as unknown as string }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.date).toBe('2026-01-15T10:00:00Z')
  })

  it('handles missing approvalCount/assigneeCount', () => {
    const pr = {
      ...mockPR,
      approvalCount: undefined as unknown as number,
      assigneeCount: undefined as unknown as number,
      iApproved: undefined as unknown as boolean,
    }
    const result = mapRepoPRToPullRequest(pr, 'org')
    expect(result.approvalCount).toBe(0)
    expect(result.assigneeCount).toBe(0)
    expect(result.iApproved).toBe(false)
  })
})
