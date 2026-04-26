import { describe, it, expect } from 'vitest'
import { hasPRReviewMetadata, mapModelInfo, findAccountForOrgs } from './copilotPromptUtils'
import type { CopilotPromptRequest, PRReviewMetadata } from './copilotPromptUtils'

describe('hasPRReviewMetadata', () => {
  const baseRequest: CopilotPromptRequest = { prompt: 'Review this PR', category: 'pr-review' }
  const fullMetadata: PRReviewMetadata = {
    org: 'myorg',
    repo: 'myrepo',
    prNumber: 42,
    prUrl: 'https://github.com/myorg/myrepo/pull/42',
    prTitle: 'Fix bug',
  }

  it('returns true for complete PR review metadata', () => {
    expect(hasPRReviewMetadata(baseRequest, fullMetadata)).toBe(true)
  })

  it('returns false when category is not pr-review', () => {
    expect(hasPRReviewMetadata({ prompt: '', category: 'general' }, fullMetadata)).toBe(false)
  })

  it('returns false when metadata is undefined', () => {
    expect(hasPRReviewMetadata(baseRequest, undefined)).toBe(false)
  })

  it('returns false when org is missing', () => {
    expect(hasPRReviewMetadata(baseRequest, { ...fullMetadata, org: '' })).toBe(false)
  })

  it('returns false when repo is missing', () => {
    expect(hasPRReviewMetadata(baseRequest, { ...fullMetadata, repo: undefined })).toBe(false)
  })

  it('returns false when prNumber is missing', () => {
    expect(hasPRReviewMetadata(baseRequest, { ...fullMetadata, prNumber: undefined })).toBe(false)
  })

  it('returns false when prUrl is missing', () => {
    expect(hasPRReviewMetadata(baseRequest, { ...fullMetadata, prUrl: '' })).toBe(false)
  })

  it('returns false when prTitle is missing', () => {
    expect(hasPRReviewMetadata(baseRequest, { ...fullMetadata, prTitle: '' })).toBe(false)
  })

  it('returns false when prNumber is not a number', () => {
    expect(
      hasPRReviewMetadata(baseRequest, {
        ...fullMetadata,
        prNumber: 'not-a-number' as unknown as number,
      })
    ).toBe(false)
  })

  it('narrows the type on success (compile-time check)', () => {
    const request = baseRequest
    const metadata: PRReviewMetadata | undefined = fullMetadata
    if (hasPRReviewMetadata(request, metadata)) {
      // TypeScript should know these are required
      const _org: string = metadata.org
      const _repo: string = metadata.repo
      const _num: number = metadata.prNumber
      expect(_org).toBe('myorg')
      expect(_repo).toBe('myrepo')
      expect(_num).toBe(42)
    }
  })
})

describe('findAccountForOrgs', () => {
  const accounts = [
    { org: 'MyOrg', username: 'alice' },
    { org: 'OtherOrg', username: 'bob' },
  ]

  it('returns matching username for first matching org', () => {
    expect(findAccountForOrgs(accounts, ['myorg'])).toBe('alice')
  })

  it('matches case-insensitively', () => {
    expect(findAccountForOrgs(accounts, ['MYORG'])).toBe('alice')
  })

  it('returns first match when multiple orgs could match', () => {
    expect(findAccountForOrgs(accounts, ['otherorg', 'myorg'])).toBe('bob')
  })

  it('returns undefined when no org matches', () => {
    expect(findAccountForOrgs(accounts, ['nope'])).toBeUndefined()
  })

  it('returns undefined for empty orgs array', () => {
    expect(findAccountForOrgs(accounts, [])).toBeUndefined()
  })

  it('returns undefined for empty accounts array', () => {
    expect(findAccountForOrgs([], ['myorg'])).toBeUndefined()
  })

  it('preserves prompt-org ordering (first org wins)', () => {
    expect(findAccountForOrgs(accounts, ['myorg', 'otherorg'])).toBe('alice')
  })
})

describe('mapModelInfo', () => {
  it('maps all fields', () => {
    const result = mapModelInfo({
      id: 'gpt-4',
      name: 'GPT-4',
      policy: { state: 'disabled' },
      billing: { multiplier: 2 },
    })
    expect(result).toEqual({
      id: 'gpt-4',
      name: 'GPT-4',
      isDisabled: true,
      billingMultiplier: 2,
    })
  })

  it('defaults isDisabled to false', () => {
    const result = mapModelInfo({ id: 'gpt-4', name: 'GPT-4' })
    expect(result.isDisabled).toBe(false)
  })

  it('defaults billingMultiplier to 1', () => {
    const result = mapModelInfo({ id: 'gpt-4', name: 'GPT-4' })
    expect(result.billingMultiplier).toBe(1)
  })

  it('handles policy with non-disabled state', () => {
    const result = mapModelInfo({
      id: 'gpt-4',
      name: 'GPT-4',
      policy: { state: 'enabled' },
    })
    expect(result.isDisabled).toBe(false)
  })
})
