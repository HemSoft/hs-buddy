import { describe, expect, it } from 'vitest'
import { buildAddressCommentsPrompt } from './assistantPrompts'

describe('buildAddressCommentsPrompt', () => {
  const defaultParams = {
    prId: 42,
    org: 'my-org',
    repository: 'my-repo',
    url: 'https://github.com/my-org/my-repo/pull/42',
  }

  it('returns the expected multiline prompt', () => {
    expect(buildAddressCommentsPrompt(defaultParams)).toBe(
      [
        'Address the unresolved review comments on PR #42 in my-org/my-repo (https://github.com/my-org/my-repo/pull/42).',
        '',
        'For each unresolved review thread:',
        '1. Fetch the thread and understand what the reviewer is asking for.',
        '2. Implement the requested change in the codebase.',
        '3. Reply to the thread with a brief summary of what you changed (e.g., "Fixed — replaced X with Y in `file.ts`.").',
        '4. Mark the thread as resolved.',
        '',
        'After addressing all threads, push the changes and confirm the final status.',
      ].join('\n')
    )
  })

  it('includes the PR number in the opening line', () => {
    expect(buildAddressCommentsPrompt(defaultParams)).toContain('PR #42')
  })

  it('includes the org and repository identifier', () => {
    expect(buildAddressCommentsPrompt(defaultParams)).toContain('my-org/my-repo')
  })

  it('includes the PR URL', () => {
    expect(buildAddressCommentsPrompt(defaultParams)).toContain(
      'https://github.com/my-org/my-repo/pull/42'
    )
  })

  it('contains all four numbered instruction steps', () => {
    const result = buildAddressCommentsPrompt(defaultParams)

    expect(result).toContain('1. Fetch the thread')
    expect(result).toContain('2. Implement the requested change')
    expect(result).toContain('3. Reply to the thread')
    expect(result).toContain('4. Mark the thread as resolved')
  })

  it('ends with the push and confirm instruction', () => {
    expect(
      buildAddressCommentsPrompt(defaultParams).endsWith(
        'After addressing all threads, push the changes and confirm the final status.'
      )
    ).toBe(true)
  })

  it('handles large PR numbers', () => {
    expect(buildAddressCommentsPrompt({ ...defaultParams, prId: 99_999 })).toContain('PR #99999')
  })

  it('handles org and repo names with hyphens and underscores', () => {
    const result = buildAddressCommentsPrompt({
      prId: 7,
      org: 'my-cool_org',
      repository: 'super-repo_v2',
      url: 'https://github.com/my-cool_org/super-repo_v2/pull/7',
    })

    expect(result).toContain('my-cool_org/super-repo_v2')
    expect(result).toContain('PR #7')
  })
})
