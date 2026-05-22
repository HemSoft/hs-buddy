import type { PRConfig } from '../../types/pullRequest'
import { graphql, type Octokit, getTokenForOwner, withFirstAvailableAccount } from './shared'
import { DAY } from '../../utils/dateUtils'
import { isNotFoundError } from '../../utils/errorUtils'
import {
  type ContributionWeek,
  type UserPRSummary,
  type UserEvent,
  type OrgRepoSlim,
  mapSearchItemToUserPR,
  mapRawEventToUserEvent,
  countEventCommitsToday,
  extractRepoFromUrl,
  extractUserBasicInfo,
  extractUserStatusInfo,
  buildContributionData,
  mapRawRepoSlim,
} from './userHelpers'

// Re-export all pure helpers so existing consumers don't break
export {
  EVENT_LABELS,
  eventSummary,
  assignContributionColor,
  computeQuartiles,
  collectDailyCounts,
  buildContributionCalendar,
  buildContributionData,
  extractRepoFromUrl,
  mapSearchItemToUserPR,
  buildEventId,
  mapRawEventToUserEvent,
  countEventCommitsToday,
  extractUserBasicInfo,
  resolveStatusFields,
  extractUserStatusInfo,
  mapRawRepoSlim,
} from './userHelpers'

export type { ContributionWeek, UserPRSummary, UserEvent } from './userHelpers'

/** Summary of a user's recent activity within an org, fetched on-demand. */
export interface UserActivitySummary {
  /** The user's full display name (from their GitHub profile) */
  name: string | null
  /** Profile bio */
  bio: string | null
  /** Company field from profile */
  company: string | null
  /** Location field from profile */
  location: string | null
  /** GitHub status message (e.g. "On vacation") */
  statusMessage: string | null
  /** GitHub status emoji */
  statusEmoji: string | null
  /** When the GitHub account was created */
  createdAt: string | null
  /** Org role: admin | member */
  orgRole: string | null
  /** Team names the user belongs to in this org */
  teams: string[]
  /** PRs authored by the user (recent, across the org) */
  recentPRsAuthored: UserPRSummary[]
  /** PRs reviewed by the user (recent, across the org) */
  recentPRsReviewed: UserPRSummary[]
  /** Recent public events for the user */
  recentEvents: UserEvent[]
  /** Total open PRs authored */
  openPRCount: number
  /** Total merged PRs authored (last 90 days) */
  mergedPRCount: number
  /** Repos the user has pushed to recently */
  activeRepos: string[]
  /** Number of commits authored today in the org */
  commitsToday: number
  /** Total contributions in the last year */
  totalContributions: number | null
  /** Weekly contribution calendar data for the heatmap */
  contributionWeeks: ContributionWeek[] | null
  /** Where the contribution data comes from: GraphQL API or org-wide search API */
  contributionSource: 'graphql' | 'org-activity'
}

// ── Internal helpers for fetchUserActivity ───────────────────────────

/* v8 ignore start -- repo/user enumeration; requires real API */
async function paginateRepoSlims(
  octokit: Octokit,
  namespace: string,
  kind: 'org' | 'user'
): Promise<OrgRepoSlim[]> {
  const repos: OrgRepoSlim[] = []
  const perPage = 100
  let hasMore = true

  for (let page = 1; hasMore; page++) {
    const response =
      kind === 'org'
        ? await octokit.repos.listForOrg({
            org: namespace,
            type: 'all',
            sort: 'full_name',
            direction: 'asc',
            per_page: perPage,
            page,
          })
        : await octokit.repos.listForUser({
            username: namespace,
            type: 'owner',
            sort: 'full_name',
            direction: 'asc',
            per_page: perPage,
            page,
          })

    for (const repo of response.data) {
      repos.push(mapRawRepoSlim(repo))
    }

    hasMore = response.data.length >= perPage
  }

  return repos
}

async function fetchOrgOrUserRepos(
  octokit: Octokit,
  namespace: string
): Promise<{ repos: OrgRepoSlim[] }> {
  try {
    const repos = await paginateRepoSlims(octokit, namespace, 'org')
    return { repos }
  } catch (error: unknown) {
    if (!isNotFoundError(error)) throw error
    console.info(`Namespace '${namespace}' is not an org, trying user repos...`)
    const repos = await paginateRepoSlims(octokit, namespace, 'user')
    return { repos }
  }
}
/* v8 ignore stop */

/* v8 ignore start -- commit counting and search pagination; requires real API */
async function countRepoCommitsInternal(
  octokit: Octokit,
  org: string,
  repos: OrgRepoSlim[],
  startOfDayIso: string,
  login: string
): Promise<number> {
  let total = 0
  for (const repo of repos) {
    try {
      const commits = await octokit.paginate(octokit.repos.listCommits, {
        owner: org,
        repo: repo.name,
        since: startOfDayIso,
        per_page: 100,
      })
      total += commits.filter(commit => commit.author?.login === login).length
    } catch (_: unknown) {
      // Ignore per-repo failures and fall back to the events feed if needed.
    }
  }
  return total
}

async function searchActivityDatesInternal(
  octokit: Octokit,
  org: string,
  login: string
): Promise<string[]> {
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const since = yearAgo.toISOString().split('T')[0]

  const paginateSearch = async <S extends string>(
    searchFn: (opts: {
      q: string
      sort: S
      per_page: number
      page: number
    }) => Promise<{ data: { items: unknown[] } }>,
    q: string,
    sort: S,
    extractDate: (item: Record<string, unknown>) => string | undefined
  ): Promise<string[]> => {
    const dates: string[] = []
    let page = 1
    const maxPages = 10
    while (page <= maxPages) {
      const result = await searchFn({ q, sort, per_page: 100, page })
      for (const item of result.data.items) {
        const date = extractDate(item as Record<string, unknown>)
        if (date) dates.push(date)
      }
      if (result.data.items.length < 100) break
      page++
    }
    return dates
  }

  const [commitDates, prDates, issueDates] = await Promise.all([
    paginateSearch(
      opts => octokit.search.commits(opts),
      `org:${org} author:${login} committer-date:>=${since}`,
      'committer-date',
      extractCommitSearchDate
    ).catch(() => [] as string[]),
    paginateSearch(
      opts => octokit.search.issuesAndPullRequests(opts),
      `org:${org} is:pr author:${login} created:>=${since}`,
      'created',
      (item: Record<string, unknown>) => item.created_at as string | undefined
    ).catch(() => [] as string[]),
    paginateSearch(
      opts => octokit.search.issuesAndPullRequests(opts),
      `org:${org} is:issue author:${login} created:>=${since}`,
      'created',
      (item: Record<string, unknown>) => item.created_at as string | undefined
    ).catch(() => [] as string[]),
  ])

  return [...commitDates, ...prDates, ...issueDates]
}
/* v8 ignore stop */

// ── Domain Functions ─────────────────────────────────────────────────

async function fetchUserProfileGraph(config: PRConfig['github'], owner: string, login: string) {
  try {
    const token = await getTokenForOwner(config, owner)
    return await graphql<{
      user: {
        name: string | null
        bio: string | null
        company: string | null
        location: string | null
        createdAt: string
        status: { emoji: string | null; message: string | null } | null
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number
            weeks: Array<{
              contributionDays: Array<{
                contributionCount: number
                date: string
                color: string
              }>
            }>
          }
        }
      } | null
      viewer: { login: string }
    }>(
      `
        query ($login: String!) {
          user(login: $login) {
            name
            bio
            company
            location
            createdAt
            status {
              emoji
              message
            }
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                    color
                  }
                }
              }
            }
          }
          viewer {
            login
          }
        }
      `,
      {
        login,
        headers: { authorization: `token ${token}` },
      }
    )
  } catch (_: unknown) {
    return null
  }
}

async function fetchUserTeamNames(config: PRConfig['github'], owner: string, login: string) {
  try {
    const token = await getTokenForOwner(config, owner)
    const memberTeams: string[] = []
    let cursor: string | null = null
    let hasNextPage = true
    while (hasNextPage) {
      const result: {
        organization: {
          teams: {
            nodes: Array<{ name: string }>
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
          }
        }
      } = await graphql(
        `
          query ($org: String!, $login: String!, $cursor: String) {
            organization(login: $org) {
              teams(first: 100, userLogins: [$login], after: $cursor) {
                nodes {
                  name
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        {
          org: owner,
          login,
          cursor,
          headers: { authorization: `token ${token}` },
        }
      )
      memberTeams.push(...result.organization.teams.nodes.map(t => t.name))
      hasNextPage = result.organization.teams.pageInfo.hasNextPage
      cursor = result.organization.teams.pageInfo.endCursor
    }
    return memberTeams
  } catch (_: unknown) {
    return [] as string[]
  }
}

function extractCommitSearchDate(item: Record<string, unknown>): string | undefined {
  const commit = item.commit as
    | { committer?: { date?: string }; author?: { date?: string } }
    | undefined
  return commit?.committer?.date ?? commit?.author?.date
}

async function buildUserActivitySummary(
  octokit: Octokit,
  config: PRConfig['github'],
  owner: string,
  login: string,
  maxEvents: number,
  maxPRs: number
): Promise<UserActivitySummary> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * DAY).toISOString().split('T')[0]

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startOfDayIso = startOfDay.toISOString()

  const emptySearch = { data: { total_count: 0, items: [] } } as const

  const [
    authoredOpen,
    authoredMerged,
    reviewed,
    events,
    repoSource,
    userProfile,
    orgMembership,
    userTeams,
    contributionDates,
  ] = await Promise.all([
    octokit.search
      .issuesAndPullRequests({
        q: `org:${owner} is:pr author:${login} is:open`,
        per_page: maxPRs,
        sort: 'updated',
        order: 'desc',
      })
      .catch(() => emptySearch),
    octokit.search
      .issuesAndPullRequests({
        q: `org:${owner} is:pr author:${login} is:merged merged:>=${ninetyDaysAgo}`,
        per_page: maxPRs,
        sort: 'updated',
        order: 'desc',
      })
      .catch(() => emptySearch),
    octokit.search
      .issuesAndPullRequests({
        q: `org:${owner} is:pr reviewed-by:${login} -author:${login} sort:updated`,
        per_page: 10,
        sort: 'updated',
        order: 'desc',
      })
      .catch(() => emptySearch),
    octokit.activity
      .listPublicEventsForUser({
        username: login,
        per_page: maxEvents,
      })
      .catch(() => ({ data: [] as Array<Record<string, unknown>> })),
    fetchOrgOrUserRepos(octokit, owner).catch(() => null),
    fetchUserProfileGraph(config, owner, login),
    octokit.orgs.getMembershipForUser({ org: owner, username: login }).catch(() => null),
    fetchUserTeamNames(config, owner, login),
    searchActivityDatesInternal(octokit, owner, login).catch(() => [] as string[]),
  ])

  const recentPRsAuthored = [
    ...authoredOpen.data.items.map(mapSearchItemToUserPR),
    ...authoredMerged.data.items.map(mapSearchItemToUserPR),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, maxPRs)

  const orgPrefix = `${owner}/`
  const recentEvents: UserEvent[] = (events.data as Array<Record<string, unknown>>)
    .map(evt => mapRawEventToUserEvent(evt, orgPrefix))
    .filter((evt): evt is UserEvent => evt !== null)

  const eventCommitsToday = countEventCommitsToday(
    events.data as Array<Record<string, unknown>>,
    orgPrefix,
    startOfDayIso
  )

  const recentlyPushedRepos = (repoSource?.repos ?? []).filter(
    repo => repo.pushedAt && new Date(repo.pushedAt).getTime() >= startOfDay.getTime()
  )

  const repoCommitsToday = await countRepoCommitsInternal(
    octokit,
    owner,
    recentlyPushedRepos,
    startOfDayIso,
    login
  )

  const commitsToday = Math.max(repoCommitsToday, eventCommitsToday)
  const activeRepoSet = new Set<string>()
  recentEvents.forEach(e => {
    if (e.repo) activeRepoSet.add(e.repo)
  })
  recentPRsAuthored.forEach(pr => {
    if (pr.repo) activeRepoSet.add(pr.repo)
  })
  reviewed.data.items.forEach((item: Record<string, unknown>) => {
    if (typeof item.repository_url === 'string') {
      const repo = extractRepoFromUrl(item.repository_url)
      if (repo) activeRepoSet.add(repo)
    }
  })

  const userObj = userProfile?.user
  return {
    ...extractUserBasicInfo(userObj),
    ...extractUserStatusInfo(userObj),
    orgRole: orgMembership?.data?.role ?? null,
    teams: userTeams,
    recentPRsAuthored,
    recentPRsReviewed: reviewed.data.items.map(mapSearchItemToUserPR),
    recentEvents,
    openPRCount: authoredOpen.data.total_count,
    mergedPRCount: authoredMerged.data.total_count,
    activeRepos: Array.from(activeRepoSet),
    commitsToday,
    ...buildContributionData(contributionDates, userProfile),
  }
}

/**
 * Fetch a summary of a user's recent activity within an org.
 * Uses the search API for PRs, repo history for commit counts, and the events API for recent activity.
 */
/* v8 ignore start */
export async function fetchUserActivity(
  config: PRConfig['github'],
  owner: string,
  login: string,
  maxEvents = 100,
  maxPRs = 15
): Promise<UserActivitySummary> {
  return withFirstAvailableAccount(
    config,
    owner,
    octokit => buildUserActivitySummary(octokit, config, owner, login, maxEvents, maxPRs),
    `fetch user activity for ${login} in ${owner}`
  )
}
/* v8 ignore stop */
