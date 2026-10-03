import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUserActivity } from './users'

const transport = vi.hoisted(() => ({
  graphql: vi.fn(),
  token: vi.fn(),
  listForOrg: vi.fn(),
  listForUser: vi.fn(),
  listCommits: vi.fn(),
  paginate: vi.fn(),
  searchIssues: vi.fn(),
  searchCommits: vi.fn(),
  events: vi.fn(),
  membership: vi.fn(),
}))
vi.mock('./shared', async importOriginal => ({
  ...(await importOriginal<typeof import('./shared')>()),
  graphql: transport.graphql,
  getTokenForOwner: transport.token,
  withFirstAvailableAccount: async <T>(
    _config: unknown,
    _owner: string,
    operation: (client: unknown, username: string) => Promise<T>
  ) =>
    operation(
      {
        repos: {
          listForOrg: transport.listForOrg,
          listForUser: transport.listForUser,
          listCommits: transport.listCommits,
        },
        paginate: transport.paginate,
        search: { issuesAndPullRequests: transport.searchIssues, commits: transport.searchCommits },
        activity: { listPublicEventsForUser: transport.events },
        orgs: { getMembershipForUser: transport.membership },
      },
      'fixture-user'
    ),
}))

const config = { accounts: [] }
const owner = 'fixture-owner'
const login = 'fixture-user'
const repository = {
  name: 'fixture-repository',
  full_name: 'fixture-owner/fixture-repository',
  html_url: 'https://github.com/fixture-owner/fixture-repository',
  pushed_at: '2026-10-01T14:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T16:00:00Z'))
  transport.token.mockResolvedValue('fixture-token')
  transport.graphql.mockImplementation(async (query: string) =>
    query.includes('organization(')
      ? {
          organization: { teams: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
        }
      : { user: null, viewer: { login } }
  )
  transport.listForOrg.mockResolvedValue({ data: [] })
  transport.listForUser.mockResolvedValue({ data: [repository] })
  transport.paginate.mockResolvedValue([{ author: { login } }])
  transport.searchIssues.mockResolvedValue({ data: { total_count: 0, items: [] } })
  transport.searchCommits.mockResolvedValue({ data: { items: [] } })
  transport.events.mockResolvedValue({ data: [] })
  transport.membership.mockResolvedValue({ data: { role: 'member' } })
})
afterEach(() => vi.useRealTimers())

describe('namespace fallback through public user activity', () => {
  it('counts repository commits from the organization without calling user repositories', async () => {
    transport.listForOrg.mockResolvedValue({ data: [repository] })
    const result = await fetchUserActivity(config, owner, login)
    expect(result).toMatchObject({ commitsToday: 1, orgRole: 'member', teams: [] })
    expect(transport.listForUser).not.toHaveBeenCalled()
    expect(transport.paginate).toHaveBeenCalledWith(
      transport.listCommits,
      expect.objectContaining({ owner, repo: repository.name })
    )
  })

  it('uses user repositories only after an organization 404', async () => {
    transport.listForOrg.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
    expect(await fetchUserActivity(config, owner, login)).toMatchObject({
      commitsToday: 1,
      orgRole: 'member',
    })
    expect(transport.listForOrg).toHaveBeenCalledTimes(1)
    expect(transport.listForUser).toHaveBeenCalledExactlyOnceWith({
      username: owner,
      type: 'owner',
      sort: 'full_name',
      direction: 'asc',
      per_page: 100,
      page: 1,
    })
  })

  it.each([403, 500, undefined])(
    'does not switch namespaces for status %s and preserves public graceful degradation',
    async status => {
      transport.listForOrg.mockRejectedValue(
        Object.assign(new Error('Fixture namespace failure'), { status })
      )
      const result = await fetchUserActivity(config, owner, login)
      expect(result).toMatchObject({
        commitsToday: 0,
        activeRepos: [],
        orgRole: 'member',
        teams: [],
        recentPRsAuthored: [],
        recentPRsReviewed: [],
      })
      expect(transport.listForUser).not.toHaveBeenCalled()
      expect(transport.paginate).not.toHaveBeenCalled()
    }
  )
})

describe('commit author-date fallback through public user activity', () => {
  it('prefers committer date, uses author date when absent, and skips missing dates', async () => {
    transport.searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            commit: {
              committer: { date: '2026-09-29T12:00:00Z' },
              author: { date: '2026-09-28T12:00:00Z' },
            },
          },
          { commit: { author: { date: '2026-09-30T12:00:00Z' } } },
          { commit: { author: {} } },
          { commit: {} },
          {},
        ],
      },
    })
    const result = await fetchUserActivity(config, owner, login)
    expect(result).toMatchObject({ totalContributions: 2, contributionSource: 'org-activity' })
    const activeDays = result.contributionWeeks
      ?.flatMap(week => week.contributionDays)
      .filter(day => day.contributionCount > 0)
      .map(day => ({ date: day.date, count: day.contributionCount }))
    expect(activeDays).toEqual([
      { date: '2026-09-29', count: 1 },
      { date: '2026-09-30', count: 1 },
    ])
    expect(transport.searchCommits).toHaveBeenCalledExactlyOnceWith({
      q: 'org:fixture-owner author:fixture-user committer-date:>=2025-10-01',
      sort: 'committer-date',
      per_page: 100,
      page: 1,
    })
  })

  it('does not manufacture contributions when every commit lacks a date', async () => {
    transport.searchCommits.mockResolvedValue({
      data: { items: [{ commit: { author: {} } }, { commit: {} }, {}] },
    })
    expect(await fetchUserActivity(config, owner, login)).toMatchObject({
      totalContributions: null,
      contributionWeeks: null,
      contributionSource: 'org-activity',
    })
  })
})
