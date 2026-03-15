import { describe, expect, it } from 'vitest'
import { serializeContext } from './useAssistantContext'

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
