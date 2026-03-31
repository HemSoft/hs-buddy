import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAssistantContext, serializeContext } from './useAssistantContext'

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
  it('returns welcome context for null activeViewId', () => {
    const { result } = renderHook(() => useAssistantContext(null))
    expect(result.current.viewType).toBe('welcome')
    expect(result.current.viewId).toBeNull()
    expect(result.current.summary).toBe('The user is on the Welcome screen.')
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
