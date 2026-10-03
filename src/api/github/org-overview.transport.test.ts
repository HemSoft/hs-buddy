import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrgOverview } from './orgs'

const transport = vi.hoisted(() => ({
  listForOrg: vi.fn(),
  listCommits: vi.fn(),
  paginate: vi.fn(),
  search: vi.fn(),
}))
vi.mock('./shared', async importOriginal => ({
  ...(await importOriginal<typeof import('./shared')>()),
  withFirstAvailableAccount: async <T>(
    _config: unknown,
    _owner: string,
    operation: (client: unknown, username: string) => Promise<T>
  ) =>
    operation(
      {
        repos: { listForOrg: transport.listForOrg, listCommits: transport.listCommits },
        paginate: transport.paginate,
        search: { issuesAndPullRequests: transport.search },
      },
      'fixture-user'
    ),
}))

const config = { accounts: [] }
const owner = 'fixture-owner'
const now = new Date('2026-10-01T16:00:00Z')
const repository = {
  name: 'fixture-repository',
  full_name: 'fixture-owner/fixture-repository',
  html_url: 'https://github.com/fixture-owner/fixture-repository',
  private: false,
  pushed_at: '2026-10-01T14:00:00Z',
  stargazers_count: 2,
  forks_count: 1,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  transport.listForOrg.mockResolvedValue({ data: [repository] })
  transport.search.mockResolvedValue({ data: { total_count: 3 } })
})
afterEach(() => vi.useRealTimers())

describe('contributor identity through the public organization overview', () => {
  it.each([
    {
      name: 'login wins over author name',
      author: {
        login: 'fixture-login',
        avatar_url: 'https://example.test/avatar',
        html_url: 'https://github.com/fixture-login',
      },
      commitAuthor: { name: 'Ignored name' },
      login: 'fixture-login',
      avatarUrl: 'https://example.test/avatar',
      url: 'https://github.com/fixture-login',
    },
    {
      name: 'null login uses commit author name',
      author: null,
      commitAuthor: { name: 'Fallback name' },
      login: 'Fallback name',
      avatarUrl: null,
      url: null,
    },
    {
      name: 'empty identities use unknown',
      author: { login: '' },
      commitAuthor: { name: '' },
      login: 'unknown',
      avatarUrl: null,
      url: null,
    },
    {
      name: 'absent author uses unknown',
      author: undefined,
      commitAuthor: undefined,
      login: 'unknown',
      avatarUrl: null,
      url: null,
    },
  ])(
    '$name and aggregates repeated commits',
    async ({ author, commitAuthor, login, avatarUrl, url }) => {
      const commit = { author, commit: { author: commitAuthor } }
      transport.paginate.mockResolvedValue([commit, commit])
      const result = await fetchOrgOverview(config, owner)
      expect(result).toMatchObject({
        authenticatedAs: 'fixture-user',
        isUserNamespace: false,
        metrics: {
          org: owner,
          repoCount: 1,
          activeReposToday: 1,
          commitsToday: 2,
          totalStars: 2,
          totalForks: 1,
          topContributorsToday: [{ login, avatarUrl, url, commits: 2 }],
        },
      })
      const midnight = new Date(now)
      midnight.setHours(0, 0, 0, 0)
      expect(transport.paginate).toHaveBeenCalledExactlyOnceWith(transport.listCommits, {
        owner,
        repo: repository.name,
        since: midnight.toISOString(),
        per_page: 100,
      })
    }
  )
})
