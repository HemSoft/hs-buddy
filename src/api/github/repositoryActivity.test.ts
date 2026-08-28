import { expect, it } from 'vitest'
import { buildRepositoryActivity, type RepositoryActivitySource } from './repositoryActivity'

type SearchResult = Parameters<typeof buildRepositoryActivity>[1]

function makeRepo(name: string, isArchived = false): RepositoryActivitySource {
  return {
    name,
    fullName: `user1/${name}`,
    url: `https://github.com/user1/${name}`,
    isArchived,
  }
}

function makeItem(
  repo: string,
  number: number,
  updatedAt: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    number,
    title: `${repo} item ${number}`,
    html_url: `https://github.com/user1/${repo}/issues/${number}`,
    repository_url: `https://api.github.com/repos/user1/${repo}`,
    state: 'open',
    updated_at: updatedAt,
    ...overrides,
  }
}

function fulfilled(items: object[], totalCount = items.length): SearchResult {
  return {
    status: 'fulfilled',
    value: { data: { items, total_count: totalCount } },
  } as unknown as SearchResult
}

it('sorts tied repositories by name and excludes archived repositories', () => {
  const updatedAt = '2026-08-27T12:00:00Z'
  const issues = fulfilled([
    makeItem('zeta', 2, updatedAt),
    makeItem('alpha', 1, updatedAt),
    makeItem('archived', 9, '2026-08-27T14:00:00Z'),
  ])

  const result = buildRepositoryActivity(
    [makeRepo('zeta'), makeRepo('alpha'), makeRepo('archived', true)],
    issues,
    fulfilled([]),
    '2026-08-27T15:00:00Z'
  )

  expect(result.repositories.map(repo => repo.name)).toEqual(['alpha', 'zeta'])
  expect(result.fetchedAt).toBe('2026-08-27T15:00:00Z')
})

it('uses the newest item across both lanes and preserves pull-request states', () => {
  const issues = fulfilled([
    makeItem('new', 3, '2026-08-27T13:00:00Z', { state: 'closed' }),
    makeItem('old', 1, '2026-08-27T10:00:00Z'),
  ])
  const pullRequests = fulfilled(
    [
      makeItem('old', 4, '2026-08-27T14:00:00Z', {
        state: 'closed',
        pull_request: { merged_at: '2026-08-27T14:00:00Z' },
      }),
      makeItem('new', 5, '2026-08-27T12:00:00Z', {
        draft: true,
        pull_request: { merged_at: null },
      }),
    ],
    8
  )

  const result = buildRepositoryActivity([makeRepo('new'), makeRepo('old')], issues, pullRequests)

  expect(result.repositories.map(repo => repo.name)).toEqual(['old', 'new'])
  expect(result.repositories[0].pullRequests[0].state).toBe('merged')
  expect(result.repositories[1].pullRequests[0].state).toBe('draft')
  expect(result.hasMore).toBe(true)
})

it('keeps the available lane when the other activity search fails', () => {
  const rejected = {
    status: 'rejected',
    reason: new Error('Issues unavailable'),
  } as const
  const pullRequests = fulfilled([
    makeItem('buddy', 6, '2026-08-27T14:00:00Z', {
      pull_request: { merged_at: null },
    }),
  ])

  const result = buildRepositoryActivity([makeRepo('buddy')], rejected, pullRequests)

  expect(result.issuesAvailable).toBe(false)
  expect(result.pullRequestsAvailable).toBe(true)
  expect(result.repositories[0].pullRequests).toHaveLength(1)
})

it('limits each lane to four newest items and the workbench to six repositories', () => {
  const repos = Array.from({ length: 7 }, (_, index) => makeRepo(`repo-${index}`))
  const issues = fulfilled(
    repos.flatMap((repo, repoIndex) =>
      Array.from({ length: 5 }, (_, itemIndex) =>
        makeItem(
          repo.name,
          repoIndex * 10 + itemIndex,
          `2026-08-${String(repoIndex + 1).padStart(2, '0')}T0${itemIndex}:00:00Z`
        )
      )
    )
  )

  const result = buildRepositoryActivity(repos, issues, fulfilled([]))

  expect(result.repositories).toHaveLength(6)
  expect(result.repositories.every(repo => repo.issues.length === 4)).toBe(true)
  expect(result.hasMore).toBe(true)
})
