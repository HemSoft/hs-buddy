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

interface UserSearchResult {
  data: {
    total_count: number
    items: Array<Record<string, unknown>>
  }
}

interface UserEventsResult {
  data: Array<Record<string, unknown>>
}

interface UserProfileResult {
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
        weeks: ContributionWeek[]
      }
    }
  } | null
  viewer: { login: string }
}

interface UserOrgMembershipResult {
  data: { role?: string | null }
}

interface UserActivityData {
  authoredOpen: UserSearchResult
  authoredMerged: UserSearchResult
  reviewed: UserSearchResult
  events: UserEventsResult
  repoSource: { repos: OrgRepoSlim[] } | null
  userProfile: UserProfileResult | null
  orgMembership: UserOrgMembershipResult | null
  userTeams: string[]
  contributionDates: string[]
}

const USER_PROFILE_QUERY = `
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
`

const USER_TEAMS_QUERY = `
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
`

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

function buildEmptySearchResult(): UserSearchResult {
  return { data: { total_count: 0, items: [] } }
}

function buildEmptyEventsResult(): UserEventsResult {
  return { data: [] }
}

function getNinetyDaysAgoIso(): string {
  return new Date(Date.now() - 90 * DAY).toISOString().split('T')[0]
}

function createStartOfDayState(): { startOfDay: Date; startOfDayIso: string } {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  return { startOfDay, startOfDayIso: startOfDay.toISOString() }
}

function resolveCommitterDate(
  commit: { committer?: { date?: string }; author?: { date?: string } } | undefined
): string | undefined {
  return commit?.committer?.date
}

function resolveAuthorDate(
  commit: { committer?: { date?: string }; author?: { date?: string } } | undefined
): string | undefined {
  return commit?.author?.date
}

function extractCommitSearchDate(item: Record<string, unknown>): string | undefined {
  const commit = item.commit as
    | { committer?: { date?: string }; author?: { date?: string } }
    | undefined
  return resolveCommitterDate(commit) ?? resolveAuthorDate(commit)
}

function fetchAuthoredOpenPullRequests(
  octokit: Octokit,
  owner: string,
  login: string,
  maxPRs: number
): Promise<UserSearchResult> {
  const emptySearch = buildEmptySearchResult()
  return octokit.search
    .issuesAndPullRequests({
      q: `org:${owner} is:pr author:${login} is:open`,
      per_page: maxPRs,
      sort: 'updated',
      order: 'desc',
    })
    .catch(() => emptySearch)
}

function fetchAuthoredMergedPullRequests(
  octokit: Octokit,
  owner: string,
  login: string,
  maxPRs: number,
  ninetyDaysAgo: string
): Promise<UserSearchResult> {
  const emptySearch = buildEmptySearchResult()
  return octokit.search
    .issuesAndPullRequests({
      q: `org:${owner} is:pr author:${login} is:merged merged:>=${ninetyDaysAgo}`,
      per_page: maxPRs,
      sort: 'updated',
      order: 'desc',
    })
    .catch(() => emptySearch)
}

function fetchReviewedPullRequests(
  octokit: Octokit,
  owner: string,
  login: string
): Promise<UserSearchResult> {
  const emptySearch = buildEmptySearchResult()
  return octokit.search
    .issuesAndPullRequests({
      q: `org:${owner} is:pr reviewed-by:${login} -author:${login} sort:updated`,
      per_page: 10,
      sort: 'updated',
      order: 'desc',
    })
    .catch(() => emptySearch)
}

function fetchUserEvents(
  octokit: Octokit,
  login: string,
  maxEvents: number
): Promise<UserEventsResult> {
  const emptyEvents = buildEmptyEventsResult()
  return octokit.activity
    .listPublicEventsForUser({
      username: login,
      per_page: maxEvents,
    })
    .catch(() => emptyEvents)
}

async function fetchUserProfile(
  config: PRConfig['github'],
  owner: string,
  login: string
): Promise<UserProfileResult | null> {
  try {
    const token = await getTokenForOwner(config, owner)
    return await graphql<UserProfileResult>(USER_PROFILE_QUERY, {
      login,
      headers: { authorization: `token ${token}` },
    })
  } catch (_: unknown) {
    return null
  }
}

async function fetchUserTeams(
  config: PRConfig['github'],
  owner: string,
  login: string
): Promise<string[]> {
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
      } = await graphql(USER_TEAMS_QUERY, {
        org: owner,
        login,
        cursor,
        headers: { authorization: `token ${token}` },
      })
      memberTeams.push(...result.organization.teams.nodes.map(team => team.name))
      hasNextPage = result.organization.teams.pageInfo.hasNextPage
      cursor = result.organization.teams.pageInfo.endCursor
    }
    return memberTeams
  } catch (_: unknown) {
    return []
  }
}

function buildRecentAuthoredPRs(
  authoredOpen: UserSearchResult,
  authoredMerged: UserSearchResult,
  maxPRs: number
): UserPRSummary[] {
  return [
    ...authoredOpen.data.items.map(mapSearchItemToUserPR),
    ...authoredMerged.data.items.map(mapSearchItemToUserPR),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, maxPRs)
}

function buildRecentEvents(events: Array<Record<string, unknown>>, orgPrefix: string): UserEvent[] {
  return events
    .map(evt => mapRawEventToUserEvent(evt, orgPrefix))
    .filter((evt): evt is UserEvent => evt !== null)
}

function resolveRepoSourceRepos(repoSource: { repos: OrgRepoSlim[] } | null): OrgRepoSlim[] {
  return repoSource?.repos ?? []
}

function isRepoPushedSince(repo: OrgRepoSlim, startOfDayMs: number): boolean {
  return Boolean(repo.pushedAt) && new Date(repo.pushedAt).getTime() >= startOfDayMs
}

function getRecentlyPushedRepos(
  repoSource: { repos: OrgRepoSlim[] } | null,
  startOfDay: Date
): OrgRepoSlim[] {
  return resolveRepoSourceRepos(repoSource).filter(repo =>
    isRepoPushedSince(repo, startOfDay.getTime())
  )
}

function addRepoIfPresent(activeRepoSet: Set<string>, repo: string | null | undefined): void {
  if (repo) activeRepoSet.add(repo)
}

function resolveReviewedRepo(item: Record<string, unknown>): string | null {
  if (typeof item.repository_url !== 'string') return null
  return extractRepoFromUrl(item.repository_url) || null
}

function collectActiveRepos(
  recentEvents: UserEvent[],
  recentPRsAuthored: UserPRSummary[],
  reviewedItems: Array<Record<string, unknown>>
): string[] {
  const activeRepoSet = new Set<string>()
  recentEvents.forEach(event => addRepoIfPresent(activeRepoSet, event.repo))
  recentPRsAuthored.forEach(pr => addRepoIfPresent(activeRepoSet, pr.repo))
  reviewedItems.forEach(item => addRepoIfPresent(activeRepoSet, resolveReviewedRepo(item)))
  return Array.from(activeRepoSet)
}

function resolveOrgRole(orgMembership: UserOrgMembershipResult | null): string | null {
  return orgMembership?.data?.role ?? null
}

function buildUserActivitySummary(
  userProfile: UserProfileResult | null,
  orgMembership: UserOrgMembershipResult | null,
  userTeams: string[],
  recentPRsAuthored: UserPRSummary[],
  recentPRsReviewed: UserPRSummary[],
  recentEvents: UserEvent[],
  openPRCount: number,
  mergedPRCount: number,
  activeRepos: string[],
  commitsToday: number,
  contributionDates: string[]
): UserActivitySummary {
  const userObj = userProfile?.user
  return {
    ...extractUserBasicInfo(userObj),
    ...extractUserStatusInfo(userObj),
    orgRole: resolveOrgRole(orgMembership),
    teams: userTeams,
    recentPRsAuthored,
    recentPRsReviewed,
    recentEvents,
    openPRCount,
    mergedPRCount,
    activeRepos,
    commitsToday,
    ...buildContributionData(contributionDates, userProfile),
  }
}

async function fetchUserActivityData(
  config: PRConfig['github'],
  octokit: Octokit,
  owner: string,
  login: string,
  maxEvents: number,
  maxPRs: number,
  ninetyDaysAgo: string
): Promise<UserActivityData> {
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
    fetchAuthoredOpenPullRequests(octokit, owner, login, maxPRs),
    fetchAuthoredMergedPullRequests(octokit, owner, login, maxPRs, ninetyDaysAgo),
    fetchReviewedPullRequests(octokit, owner, login),
    fetchUserEvents(octokit, login, maxEvents),
    fetchOrgOrUserRepos(octokit, owner).catch(() => null),
    fetchUserProfile(config, owner, login),
    octokit.orgs.getMembershipForUser({ org: owner, username: login }).catch(() => null),
    fetchUserTeams(config, owner, login),
    searchActivityDatesInternal(octokit, owner, login).catch(() => []),
  ])

  return {
    authoredOpen,
    authoredMerged,
    reviewed,
    events,
    repoSource,
    userProfile,
    orgMembership,
    userTeams,
    contributionDates,
  }
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

/**
 * Fetch a summary of a user's recent activity within an org.
 * Uses the search API for PRs, repo history for commit counts, and the events API for recent activity.
 */
/* v8 ignore start */
async function fetchUserActivityForAccount(
  config: PRConfig['github'],
  octokit: Octokit,
  owner: string,
  login: string,
  maxEvents: number,
  maxPRs: number
): Promise<UserActivitySummary> {
  const ninetyDaysAgo = getNinetyDaysAgoIso()
  const { startOfDay, startOfDayIso } = createStartOfDayState()
  const data = await fetchUserActivityData(
    config,
    octokit,
    owner,
    login,
    maxEvents,
    maxPRs,
    ninetyDaysAgo
  )
  const orgPrefix = `${owner}/`
  const recentPRsAuthored = buildRecentAuthoredPRs(data.authoredOpen, data.authoredMerged, maxPRs)
  const recentEvents = buildRecentEvents(data.events.data, orgPrefix)
  const eventCommitsToday = countEventCommitsToday(data.events.data, orgPrefix, startOfDayIso)
  const repoCommitsToday = await countRepoCommitsInternal(
    octokit,
    owner,
    getRecentlyPushedRepos(data.repoSource, startOfDay),
    startOfDayIso,
    login
  )

  return buildUserActivitySummary(
    data.userProfile,
    data.orgMembership,
    data.userTeams,
    recentPRsAuthored,
    data.reviewed.data.items.map(mapSearchItemToUserPR),
    recentEvents,
    data.authoredOpen.data.total_count,
    data.authoredMerged.data.total_count,
    collectActiveRepos(recentEvents, recentPRsAuthored, data.reviewed.data.items),
    Math.max(repoCommitsToday, eventCommitsToday),
    data.contributionDates
  )
}

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
    octokit => fetchUserActivityForAccount(config, octokit, owner, login, maxEvents, maxPRs),
    `fetch user activity for ${login} in ${owner}`
  )
}
/* v8 ignore stop */
