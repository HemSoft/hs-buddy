import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { expect } from 'vitest'
import { mapRepoPRToPullRequest } from '../utils/prMapper'
import type { RepoPullRequest } from '../api/github'
import type { PullRequest } from '../types/pullRequest'

const feature = await loadFeature('src/features/pr-mapper.feature')

/** A PR-like object that allows nullable fields for edge-case testing. */
type PartialRepoPR = Omit<
  RepoPullRequest,
  | 'createdAt'
  | 'updatedAt'
  | 'approvalCount'
  | 'assigneeCount'
  | 'iApproved'
  | 'changesRequestedCount'
  | 'threadsUnaddressed'
> & {
  createdAt: string | null
  updatedAt: string | null
  approvalCount: number | undefined
  assigneeCount: number | undefined
  iApproved: boolean | undefined
  changesRequestedCount: number | undefined
  threadsUnaddressed: number | null | undefined
}

function basePR(overrides: Partial<RepoPullRequest> = {}): RepoPullRequest {
  return {
    number: 1,
    title: 'Default',
    author: 'user',
    authorAvatarUrl: '',
    url: 'https://github.com/org/repo/pull/1',
    state: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    headBranch: 'feature',
    baseBranch: 'main',
    approvalCount: 0,
    assigneeCount: 0,
    changesRequestedCount: 0,
    threadsUnaddressed: null,
    iApproved: false,
    draft: false,
    labels: [],
    ...overrides,
  }
}

function partialPR(overrides: Partial<PartialRepoPR> = {}): PartialRepoPR {
  return {
    ...basePR(),
    ...overrides,
  }
}

describeFeature(feature, ({ Scenario }) => {
  let apiPR: RepoPullRequest
  let partialApiPR: PartialRepoPR
  let mapped: PullRequest
  let org: string

  Scenario('Map a complete PR with all fields', ({ Given, When, Then, And }) => {
    Given('a GitHub API PR response for repo "org/my-repo" number 42', () => {
      apiPR = basePR({
        number: 42,
        url: 'https://github.com/org/my-repo/pull/42',
      })
    })
    And('the PR has title "Fix bug" by author "testuser"', () => {
      apiPR.title = 'Fix bug'
      apiPR.author = 'testuser'
    })
    And('the PR has state "open" with 2 approvals', () => {
      apiPR.state = 'open'
      apiPR.approvalCount = 2
    })
    And('the PR was created at "2026-01-15T10:00:00Z"', () => {
      apiPR.createdAt = '2026-01-15T10:00:00Z'
    })
    And('the PR was updated at "2026-01-16T12:00:00Z"', () => {
      apiPR.updatedAt = '2026-01-16T12:00:00Z'
    })
    When('the PR is mapped to the app type for org "my-org"', () => {
      org = 'my-org'
      mapped = mapRepoPRToPullRequest(apiPR, org)
    })
    Then('the mapped PR source should be "GitHub"', () => {
      expect(mapped.source).toBe('GitHub')
    })
    And('the mapped repository should be "my-repo"', () => {
      expect(mapped.repository).toBe('my-repo')
    })
    And('the mapped id should be 42', () => {
      expect(mapped.id).toBe(42)
    })
    And('the mapped author should be "testuser"', () => {
      expect(mapped.author).toBe('testuser')
    })
    And('the mapped org should be "my-org"', () => {
      expect(mapped.org).toBe('my-org')
    })
    And('the mapped date should be "2026-01-16T12:00:00Z"', () => {
      expect(mapped.date).toBe('2026-01-16T12:00:00Z')
    })
  })

  Scenario('Null createdAt produces null created date', ({ Given, When, Then, And }) => {
    Given('a partial PR response for repo "org/repo" number 10', () => {
      partialApiPR = partialPR({ number: 10, url: 'https://github.com/org/repo/pull/10' })
    })
    And('the PR has no createdAt', () => {
      partialApiPR.createdAt = null
    })
    When('the PR is mapped to the app type for org "org"', () => {
      mapped = mapRepoPRToPullRequest(partialApiPR as RepoPullRequest, 'org')
    })
    Then('the mapped created should be null', () => {
      expect(mapped.created).toBeNull()
    })
  })

  Scenario('Missing updatedAt falls back to createdAt for date', ({ Given, When, Then, And }) => {
    Given('a partial PR response for repo "org/repo" number 10', () => {
      partialApiPR = partialPR({ number: 10, url: 'https://github.com/org/repo/pull/10' })
    })
    And('the PR was created at "2026-02-01T08:00:00Z"', () => {
      partialApiPR.createdAt = '2026-02-01T08:00:00Z'
    })
    And('the PR has no updatedAt', () => {
      partialApiPR.updatedAt = null
    })
    When('the PR is mapped to the app type for org "org"', () => {
      mapped = mapRepoPRToPullRequest(partialApiPR as RepoPullRequest, 'org')
    })
    Then('the mapped date should be "2026-02-01T08:00:00Z"', () => {
      expect(mapped.date).toBe('2026-02-01T08:00:00Z')
    })
  })

  Scenario('Undefined counts default to zero', ({ Given, When, Then, And }) => {
    Given('a partial PR response for repo "org/repo" number 5', () => {
      partialApiPR = partialPR({ number: 5, url: 'https://github.com/org/repo/pull/5' })
    })
    And('the PR has undefined approvalCount and assigneeCount', () => {
      partialApiPR.approvalCount = undefined
      partialApiPR.assigneeCount = undefined
      partialApiPR.iApproved = undefined
    })
    When('the PR is mapped to the app type for org "org"', () => {
      mapped = mapRepoPRToPullRequest(partialApiPR as RepoPullRequest, 'org')
    })
    Then('the mapped approvalCount should be 0', () => {
      expect(mapped.approvalCount).toBe(0)
    })
    And('the mapped assigneeCount should be 0', () => {
      expect(mapped.assigneeCount).toBe(0)
    })
    And('the mapped iApproved should be false', () => {
      expect(mapped.iApproved).toBe(false)
    })
  })
})
