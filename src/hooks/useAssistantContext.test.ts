import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAssistantContext, serializeContext } from './useAssistantContext'
import { createPRDetailViewId, type PRDetailSection } from '../utils/prDetailView'
import type { PullRequest } from '../types/pullRequest'

const routePR: PullRequest = {
  source: 'GitHub',
  repository: 'owner/repo',
  id: 42,
  title: 'Fix context',
  author: 'testuser',
  url: 'https://github.com/owner/repo/pull/42',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: null,
  date: null,
}

describe('serializeContext', () => {
  it('includes summary in context', () => {
    const result = serializeContext({
      viewType: 'pr-detail',
      viewId: 'pr-detail:myorg:repo:42',
      summary: 'Pull Request #42 in myorg/repo',
      metadata: {},
    })
    expect(result).toContain('Pull Request #42 in myorg/repo')
    expect(result).toContain('Buddy Assistant')
  })

  it('includes repo info when owner and repo are in metadata', () => {
    const result = serializeContext({
      viewType: 'pr-detail',
      viewId: 'pr-detail:myorg:repo:42',
      summary: 'PR #42',
      metadata: { owner: 'myorg', repo: 'my-repo' },
    })
    expect(result).toContain('Repository: myorg/my-repo')
  })

  it('omits repo line when metadata lacks owner/repo', () => {
    const result = serializeContext({
      viewType: 'other',
      viewId: 'settings',
      summary: 'Settings',
      metadata: {},
    })
    expect(result).not.toContain('Repository:')
  })

  it('always ends with help instruction', () => {
    const result = serializeContext({
      viewType: 'other',
      viewId: null,
      summary: 'Home',
      metadata: {},
    })
    expect(result).toContain("Answer questions about what's on screen")
  })
})

describe('useAssistantContext', () => {
  it.each<[string, string, string, Record<string, string>]>([
    [
      'pr-detail:owner/repo/42',
      'pr-detail',
      'Pull Request #42 in owner/repo',
      { owner: 'owner', repo: 'repo', prNumber: '42' },
    ],
    [
      'pr-detail:owner/repo',
      'pr-detail',
      'Pull Request # in owner/repo',
      { owner: 'owner', repo: 'repo', prNumber: '' },
    ],
    [
      'pr-detail:owner',
      'pr-detail',
      'Pull Request # in owner/',
      { owner: 'owner', repo: '', prNumber: '' },
    ],
    ['pr-detail:', 'pr-detail', 'Pull Request # in /', { owner: '', repo: '', prNumber: '' }],
    [
      'pr-detail:/repo/42',
      'pr-detail',
      'Pull Request #42 in /repo',
      { owner: '', repo: 'repo', prNumber: '42' },
    ],
    [
      'repo-detail:owner/repo',
      'repo-detail',
      'Repository owner/repo',
      { owner: 'owner', repo: 'repo' },
    ],
    ['repo-detail:owner', 'repo-detail', 'Repository owner/', { owner: 'owner', repo: '' }],
    ['repo-detail:', 'repo-detail', 'Repository /', { owner: '', repo: '' }],
    ['repo-detail:/repo', 'repo-detail', 'Repository /repo', { owner: '', repo: 'repo' }],
    [
      'repo-commits:owner/repo',
      'repo-commits',
      'Commits for owner/repo',
      { owner: 'owner', repo: 'repo' },
    ],
    ['repo-commits:owner', 'repo-commits', 'Commits for owner/', { owner: 'owner', repo: '' }],
    ['repo-commits:', 'repo-commits', 'Commits for /', { owner: '', repo: '' }],
    ['repo-commits:/repo', 'repo-commits', 'Commits for /repo', { owner: '', repo: 'repo' }],
    [
      'repo-commit:owner/repo/abc1234567',
      'repo-commit',
      'Commit abc1234 in owner/repo',
      { owner: 'owner', repo: 'repo', sha: 'abc1234567' },
    ],
    [
      'repo-commit:owner/repo',
      'repo-commit',
      'Commit  in owner/repo',
      { owner: 'owner', repo: 'repo', sha: '' },
    ],
    [
      'repo-commit:owner',
      'repo-commit',
      'Commit  in owner/',
      { owner: 'owner', repo: '', sha: '' },
    ],
    ['repo-commit:', 'repo-commit', 'Commit  in /', { owner: '', repo: '', sha: '' }],
    [
      'repo-commit:/repo/abc1234567',
      'repo-commit',
      'Commit abc1234 in /repo',
      { owner: '', repo: 'repo', sha: 'abc1234567' },
    ],
    [
      'repo-issue:owner/repo/5',
      'repo-issue',
      'Issue #5 in owner/repo',
      { owner: 'owner', repo: 'repo', issueNumber: '5' },
    ],
    [
      'repo-issue:owner/repo',
      'repo-issue',
      'Issue # in owner/repo',
      { owner: 'owner', repo: 'repo', issueNumber: '' },
    ],
    [
      'repo-issue:owner',
      'repo-issue',
      'Issue # in owner/',
      { owner: 'owner', repo: '', issueNumber: '' },
    ],
    ['repo-issue:', 'repo-issue', 'Issue # in /', { owner: '', repo: '', issueNumber: '' }],
    [
      'repo-issue:/repo/5',
      'repo-issue',
      'Issue #5 in /repo',
      { owner: '', repo: 'repo', issueNumber: '5' },
    ],
    [
      'repo-issues-closed:owner/repo',
      'repo-issues',
      'Closed issues for owner/repo',
      { owner: 'owner', repo: 'repo', issueState: 'closed' },
    ],
    [
      'repo-issues-closed:owner',
      'repo-issues',
      'Closed issues for owner/',
      { owner: 'owner', repo: '', issueState: 'closed' },
    ],
    [
      'repo-issues-closed:',
      'repo-issues',
      'Closed issues for /',
      { owner: '', repo: '', issueState: 'closed' },
    ],
    [
      'repo-issues-closed:/repo',
      'repo-issues',
      'Closed issues for /repo',
      { owner: '', repo: 'repo', issueState: 'closed' },
    ],
    [
      'repo-issues:owner/repo',
      'repo-issues',
      'Open issues for owner/repo',
      { owner: 'owner', repo: 'repo', issueState: 'open' },
    ],
    [
      'repo-issues:owner',
      'repo-issues',
      'Open issues for owner/',
      { owner: 'owner', repo: '', issueState: 'open' },
    ],
    [
      'repo-issues:',
      'repo-issues',
      'Open issues for /',
      { owner: '', repo: '', issueState: 'open' },
    ],
    [
      'repo-issues:/repo',
      'repo-issues',
      'Open issues for /repo',
      { owner: '', repo: 'repo', issueState: 'open' },
    ],
    [
      'repo-prs-closed:owner/repo',
      'repo-prs',
      'Closed pull requests for owner/repo',
      { owner: 'owner', repo: 'repo', prState: 'closed' },
    ],
    [
      'repo-prs-closed:owner',
      'repo-prs',
      'Closed pull requests for owner/',
      { owner: 'owner', repo: '', prState: 'closed' },
    ],
    [
      'repo-prs-closed:',
      'repo-prs',
      'Closed pull requests for /',
      { owner: '', repo: '', prState: 'closed' },
    ],
    [
      'repo-prs-closed:/repo',
      'repo-prs',
      'Closed pull requests for /repo',
      { owner: '', repo: 'repo', prState: 'closed' },
    ],
    [
      'repo-prs:owner/repo',
      'repo-prs',
      'Open pull requests for owner/repo',
      { owner: 'owner', repo: 'repo', prState: 'open' },
    ],
    [
      'repo-prs:owner',
      'repo-prs',
      'Open pull requests for owner/',
      { owner: 'owner', repo: '', prState: 'open' },
    ],
    ['repo-prs:', 'repo-prs', 'Open pull requests for /', { owner: '', repo: '', prState: 'open' }],
    [
      'repo-prs:/repo',
      'repo-prs',
      'Open pull requests for /repo',
      { owner: '', repo: 'repo', prState: 'open' },
    ],
  ])('preserves the exact context for view ID %s', (viewId, viewType, summary, metadata) => {
    const { result } = renderHook(() => useAssistantContext(viewId))
    expect(result.current).toEqual({ viewType, viewId, summary, metadata })
  })

  it.each<PRDetailSection | null>([
    null,
    'conversation',
    'commits',
    'checks',
    'files-changed',
    'ai-reviews',
  ])('parses the actual encoded PR route for section %s', section => {
    const viewId = createPRDetailViewId(routePR, section)
    const { result } = renderHook(() => useAssistantContext(viewId))
    expect(result.current).toEqual({
      viewType: 'pr-detail',
      viewId,
      summary: 'Pull Request #42 in owner/repo',
      metadata: { owner: 'owner', repo: 'repo', prNumber: '42' },
    })
    expect(serializeContext(result.current)).toContain(
      'The user is currently viewing: Pull Request #42 in owner/repo'
    )
    expect(serializeContext(result.current)).toContain('Repository: owner/repo')
  })

  it.each<[Partial<PullRequest>, string, string]>([
    [{ org: 'other-org' }, 'owner', 'repo'],
    [{ repository: 'repo', org: 'test-org' }, 'test-org', 'repo'],
    [{ repository: 'repo' }, 'owner', 'repo'],
    [{ repository: '', url: 'invalid-url' }, '', ''],
  ])('uses the shared repository identity policy for %j', (overrides, owner, repo) => {
    const viewId = createPRDetailViewId({ ...routePR, ...overrides })
    const { result } = renderHook(() => useAssistantContext(viewId))
    expect(result.current).toEqual({
      viewType: 'pr-detail',
      viewId,
      summary: `Pull Request #42 in ${owner}/${repo}`,
      metadata: { owner, repo, prNumber: '42' },
    })
  })

  it('keeps the same PR context when the encoded route section changes', () => {
    const viewId = createPRDetailViewId(routePR)
    const { result, rerender } = renderHook(
      ({ activeViewId }) => useAssistantContext(activeViewId),
      { initialProps: { activeViewId: viewId } }
    )
    const original = result.current
    const checksViewId = createPRDetailViewId(routePR, 'checks')
    rerender({ activeViewId: checksViewId })
    expect(result.current).toEqual({ ...original, viewId: checksViewId })
  })

  it.each([null, {}, [], 42, { ...routePR, repository: null }])(
    'does not crash or invent a PR number for malformed encoded payload %j',
    payload => {
      const viewId = `pr-detail:${encodeURIComponent(JSON.stringify(payload))}`
      const { result } = renderHook(() => useAssistantContext(viewId))
      expect(result.current.viewId).toBe(viewId)
      expect(result.current.metadata.prNumber).toBe('')
      expect(result.current.metadata.repo).toBe('')
    }
  )

  it('returns welcome context for null activeViewId', () => {
    const { result } = renderHook(() => useAssistantContext(null))
    expect(result.current.viewType).toBe('welcome')
    expect(result.current.viewId).toBeNull()
    expect(result.current.summary).toBe('No tab is open.')
  })

  it('returns welcome context for dashboard viewId', () => {
    const { result } = renderHook(() => useAssistantContext('dashboard'))
    expect(result.current.viewType).toBe('welcome')
    expect(result.current.viewId).toBe('dashboard')
    expect(result.current.summary).toBe('The user is on the Dashboard screen.')
  })

  it('parses pr-detail: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('pr-detail:myorg/myrepo/42'))
    expect(result.current.viewType).toBe('pr-detail')
    expect(result.current.viewId).toBe('pr-detail:myorg/myrepo/42')
    expect(result.current.summary).toContain('#42')
    expect(result.current.metadata).toMatchObject({
      owner: 'myorg',
      repo: 'myrepo',
      prNumber: '42',
    })
  })

  it('parses repo-detail: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-detail:owner/repo'))
    expect(result.current.viewType).toBe('repo-detail')
    expect(result.current.summary).toContain('owner/repo')
    expect(result.current.metadata).toMatchObject({ owner: 'owner', repo: 'repo' })
  })

  it('parses repo-commits: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-commits:owner/repo'))
    expect(result.current.viewType).toBe('repo-commits')
    expect(result.current.summary).toContain('Commits')
  })

  it('parses repo-commit: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-commit:owner/repo/abc1234567'))
    expect(result.current.viewType).toBe('repo-commit')
    expect(result.current.summary).toContain('abc1234')
    expect(result.current.metadata).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      sha: 'abc1234567',
    })
  })

  it('parses repo-issue: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-issue:owner/repo/5'))
    expect(result.current.viewType).toBe('repo-issue')
    expect(result.current.summary).toContain('#5')
    expect(result.current.metadata).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      issueNumber: '5',
    })
  })

  it('parses repo-issues-closed: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-issues-closed:owner/repo'))
    expect(result.current.viewType).toBe('repo-issues')
    expect(result.current.summary).toContain('Closed issues')
    expect(result.current.metadata).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      issueState: 'closed',
    })
  })

  it('parses repo-issues: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-issues:owner/repo'))
    expect(result.current.viewType).toBe('repo-issues')
    expect(result.current.summary).toContain('Open issues')
    expect(result.current.metadata).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      issueState: 'open',
    })
  })

  it('parses repo-prs-closed: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-prs-closed:owner/repo'))
    expect(result.current.viewType).toBe('repo-prs')
    expect(result.current.summary).toContain('Closed pull requests')
    expect(result.current.metadata).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      prState: 'closed',
    })
  })

  it('parses repo-prs: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('repo-prs:owner/repo'))
    expect(result.current.viewType).toBe('repo-prs')
    expect(result.current.summary).toContain('Open pull requests')
    expect(result.current.metadata).toMatchObject({ owner: 'owner', repo: 'repo', prState: 'open' })
  })

  it('parses copilot-result: prefix', () => {
    const { result } = renderHook(() => useAssistantContext('copilot-result:abc'))
    expect(result.current.viewType).toBe('copilot-result')
    expect(result.current.summary).toContain('Copilot result')
  })

  it('maps pr-my-prs to pr-list', () => {
    const { result } = renderHook(() => useAssistantContext('pr-my-prs'))
    expect(result.current.viewType).toBe('pr-list')
    expect(result.current.summary).toBe('My Pull Requests')
  })

  it('maps pr-needs-review to pr-list', () => {
    const { result } = renderHook(() => useAssistantContext('pr-needs-review'))
    expect(result.current.viewType).toBe('pr-list')
    expect(result.current.summary).toBe('PRs Needing Review')
  })

  it('maps pr-recently-merged to pr-list', () => {
    const { result } = renderHook(() => useAssistantContext('pr-recently-merged'))
    expect(result.current.viewType).toBe('pr-list')
    expect(result.current.summary).toBe('Recently Merged PRs')
  })

  it('maps unknown pr- prefix to pr-list with fallback summary', () => {
    const { result } = renderHook(() => useAssistantContext('pr-unknown'))
    expect(result.current.viewType).toBe('pr-list')
    expect(result.current.summary).toBe('Pull Requests')
  })

  it('returns other viewType for unrecognized viewId', () => {
    const { result } = renderHook(() => useAssistantContext('settings'))
    expect(result.current.viewType).toBe('other')
    expect(result.current.viewId).toBe('settings')
    expect(result.current.summary).toBe('Viewing: settings')
  })
})
