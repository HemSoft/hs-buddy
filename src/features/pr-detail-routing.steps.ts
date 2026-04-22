import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { expect } from 'vitest'
import {
  createPRDetailViewId,
  parsePRDetailRoute,
  type PRDetailSection,
} from '../utils/prDetailView'
import type { PullRequest } from '../types/pullRequest'

const feature = await loadFeature('src/features/pr-detail-routing.feature')

function makePR(repo: string, id: number, title: string): PullRequest {
  return {
    source: 'GitHub',
    repository: repo,
    id,
    title,
    author: 'user',
    url: `https://github.com/org/${repo}/pull/${id}`,
    state: 'open',
    approvalCount: 0,
    assigneeCount: 0,
    iApproved: false,
    created: new Date('2026-01-01T00:00:00Z'),
    date: '2026-01-01T00:00:00Z',
  }
}

describeFeature(feature, ({ Scenario }) => {
  let pr: PullRequest
  let viewId: string
  let parsed: ReturnType<typeof parsePRDetailRoute>

  Scenario('Round-trip a PR detail view ID without section', ({ Given, When, Then, And }) => {
    Given('a pull request with repo "my-repo" id 42 title "Fix login"', () => {
      pr = makePR('my-repo', 42, 'Fix login')
    })
    When('a view ID is created without a section', () => {
      viewId = createPRDetailViewId(pr)
    })
    And('the view ID is parsed back', () => {
      parsed = parsePRDetailRoute(viewId)
    })
    Then('the parsed PR repository should be "my-repo"', () => {
      expect(parsed!.pr.repository).toBe('my-repo')
    })
    And('the parsed PR id should be 42', () => {
      expect(parsed!.pr.id).toBe(42)
    })
    And('the parsed PR title should be "Fix login"', () => {
      expect(parsed!.pr.title).toBe('Fix login')
    })
    And('the parsed section should be null', () => {
      expect(parsed!.section).toBeNull()
    })
  })

  Scenario('Round-trip a PR detail view ID with section', ({ Given, When, Then, And }) => {
    Given('a pull request with repo "my-repo" id 42 title "Fix login"', () => {
      pr = makePR('my-repo', 42, 'Fix login')
    })
    When('a view ID is created with section "files-changed"', () => {
      viewId = createPRDetailViewId(pr, 'files-changed')
    })
    And('the view ID is parsed back', () => {
      parsed = parsePRDetailRoute(viewId)
    })
    Then('the parsed section should be "files-changed"', () => {
      expect(parsed!.section).toBe('files-changed')
    })
  })

  Scenario('Parse returns null for non-PR view IDs', ({ Given, When, Then }) => {
    Given('a view ID "dashboard:main"', () => {
      viewId = 'dashboard:main'
    })
    When('the view ID is parsed', () => {
      parsed = parsePRDetailRoute(viewId)
    })
    Then('the result should be null', () => {
      expect(parsed).toBeNull()
    })
  })

  Scenario('Parse returns null for empty string', ({ Given, When, Then }) => {
    Given('a view ID ""', () => {
      viewId = ''
    })
    When('the view ID is parsed', () => {
      parsed = parsePRDetailRoute(viewId)
    })
    Then('the result should be null', () => {
      expect(parsed).toBeNull()
    })
  })

  Scenario('Invalid section is ignored', ({ Given, When, Then, And }) => {
    Given('a pull request with repo "repo" id 1 title "Test"', () => {
      pr = makePR('repo', 1, 'Test')
    })
    When('a view ID is created with section "files-changed"', () => {
      viewId = createPRDetailViewId(pr, 'files-changed')
    })
    And('the section in the view ID is replaced with "invalid-section"', () => {
      viewId = viewId.replace('?section=files-changed', '?section=invalid-section')
    })
    And('the view ID is parsed back', () => {
      parsed = parsePRDetailRoute(viewId)
    })
    Then('the parsed section should be null', () => {
      expect(parsed!.section).toBeNull()
    })
  })

  Scenario('All valid sections are preserved', ({ Given, Then }) => {
    Given('a pull request with repo "repo" id 1 title "Test"', () => {
      pr = makePR('repo', 1, 'Test')
    })
    Then(
      'view ID round-trips should preserve these sections:',
      (_ctx, table: { section: string }[]) => {
        for (const row of table) {
          const section = row.section as PRDetailSection
          const id = createPRDetailViewId(pr, section)
          const result = parsePRDetailRoute(id)
          expect(result!.section, `section "${section}" should round-trip`).toBe(section)
        }
      }
    )
  })
})
