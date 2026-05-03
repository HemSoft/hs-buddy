import type { PRConfig } from '../../types/pullRequest'
import {
  graphql,
  type Octokit,
  getTokenForOwner,
  withFirstAvailableAccount,
  capitalize,
} from './shared'
import { DAY } from '../../utils/dateUtils'
import { isNotFoundError } from '../../utils/errorUtils'

// ── Types ────────────────────────────────────────────────────────────

interface ContributionDay {
  date: string
  contributionCount: number
  color: string
}

export interface ContributionWeek {
  contributionDays: ContributionDay[]
}

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

export interface UserPRSummary {
  number: number
  title: string
  repo: string
  state: 'open' | 'closed' | 'merged'
  createdAt: string
  updatedAt: string
  url: string
}

export interface UserEvent {
  id: string
  type: string
  repo: string
  createdAt: string
  /** Short human-readable description */
  summary: string
}

// ── Constants ────────────────────────────────────────────────────────

export const EVENT_LABELS: Record<string, string> = {
  PullRequestReviewEvent: 'Reviewed a pull request',
  IssueCommentEvent: 'Commented on an issue',
  WatchEvent: 'Starred a repository',
  ForkEvent: 'Forked a repository',
  ReleaseEvent: 'Published a release',
}

/** Minimal shape for GitHub API event payloads used by event formatters. */
interface GitHubEventPayload {
  size?: number
  action?: string
  ref_type?: string
}

/** Minimal shape for a GitHub API event object used in this module. */
interface GitHubEvent {
  id?: string
  type?: string
  repo?: { name?: string }
  payload?: GitHubEventPayload
  created_at?: string
}

function describePushEvent(evt: GitHubEvent): string {
  const size = evt.payload?.size ?? 0
  return `Pushed ${size} commit${size !== 1 ? 's' : ''}`
}

function describeActionEvent(evt: GitHubEvent, noun: string): string {
  const action = evt.payload?.action ?? 'updated'
  return `${capitalize(action)} ${noun}`
}

function describeRefEvent(verb: string, evt: GitHubEvent): string {
  return `${verb} a ${evt.payload?.ref_type ?? 'ref'}`
}

const DYNAMIC_EVENT_FORMATTERS: Record<string, (evt: GitHubEvent) => string> = {
  PushEvent: describePushEvent,
  PullRequestEvent: evt => describeActionEvent(evt, 'pull request'),
  IssuesEvent: evt => describeActionEvent(evt, 'an issue'),
  CreateEvent: evt => describeRefEvent('Created', evt),
  DeleteEvent: evt => describeRefEvent('Deleted', evt),
}

/** GitHub light-theme contribution colors for the 5 levels (0–4). */
const CONTRIB_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] as const

// ── Helpers ──────────────────────────────────────────────────────────

export function eventSummary(evt: GitHubEvent): string {
  const evtType = evt.type
  if (!evtType) return 'Activity'
  const fixed = EVENT_LABELS[evtType]
  if (fixed) return fixed
  const formatter = DYNAMIC_EVENT_FORMATTERS[evtType]
  if (formatter) return formatter(evt)
  return evtType.replace(/Event$/, '') || 'Activity'
}

/** Assign quartile-based contribution colors from daily counts. */
export function assignContributionColor(count: number, quartiles: number[]): string {
  if (count === 0) return CONTRIB_COLORS[0]
  if (count <= quartiles[0]) return CONTRIB_COLORS[1]
  if (count <= quartiles[1]) return CONTRIB_COLORS[2]
  if (count <= quartiles[2]) return CONTRIB_COLORS[3]
  return CONTRIB_COLORS[4]
}

/** Compute quartile boundaries (25th, 50th, 75th percentile) from non-zero counts. */
export function computeQuartiles(counts: number[]): number[] {
  const nonZero = counts.filter(c => c > 0).sort((a, b) => a - b)
  if (nonZero.length === 0) return [1, 2, 3]
  const q = (p: number) => nonZero[Math.min(Math.floor(p * nonZero.length), nonZero.length - 1)]
  return [q(0.25), q(0.5), q(0.75)]
}

/* v8 ignore start -- API response null-guards in event/repo mapping helpers */

/** Extract repo name from a GitHub API repository_url. */
function extractRepoFromUrl(repoUrl: string): string {
  const parts = repoUrl.split('/')
  return parts.slice(-2).join('/')
}

/** Minimal shape for a GitHub search API item used in PR mapping. */
interface SearchItemForUserPR {
  number: number
  title: string
  repository_url: string
  pull_request?: { merged_at?: string | null } | null
  state: string
  created_at: string
  updated_at: string
  html_url: string
}

/** Map a GitHub search API item to a UserPRSummary. */
function mapSearchItemToUserPR(item: SearchItemForUserPR): UserPRSummary {
  return {
    number: item.number,
    title: item.title,
    repo: extractRepoFromUrl(item.repository_url),
    state: item.pull_request?.merged_at ? 'merged' : item.state === 'open' ? 'open' : 'closed',
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    url: item.html_url,
  }
}

/** Map a raw GitHub event to a UserEvent. */
function buildEventId(evt: Record<string, unknown>, repoName: string): string {
  return String(evt.id ?? `${evt.type ?? 'Unknown'}:${repoName}:${evt.created_at ?? ''}`)
}

function mapRawEventToUserEvent(evt: Record<string, unknown>, orgPrefix: string): UserEvent | null {
  const repoObj = evt.repo as { name?: string } | undefined
  const repoName = repoObj?.name
  if (!repoName?.startsWith(orgPrefix)) return null
  const ghEvent: GitHubEvent = {
    id: evt.id as string | undefined,
    type: evt.type as string | undefined,
    repo: repoObj,
    payload: evt.payload as GitHubEventPayload | undefined,
    created_at: evt.created_at as string | undefined,
  }
  return {
    id: buildEventId(evt, repoName),
    type: ghEvent.type ?? 'Unknown',
    repo: repoName,
    createdAt: ghEvent.created_at ?? '',
    summary: eventSummary(ghEvent),
  }
}

/** Count commits from PushEvents that occurred today in the org. */
function countEventCommitsToday(
  events: Array<Record<string, unknown>>,
  orgPrefix: string,
  startOfDayIso: string
): number {
  return events
    .filter(evt => {
      const repo = evt.repo as { name?: string } | undefined
      return (
        evt.type === 'PushEvent' &&
        repo?.name?.startsWith(orgPrefix) &&
        typeof evt.created_at === 'string' &&
        evt.created_at >= startOfDayIso
      )
    })
    .reduce((sum, evt) => {
      const size = (evt.payload as Record<string, unknown> | undefined)?.size
      return sum + (typeof size === 'number' ? size : 1)
    }, 0)
}

/* v8 ignore stop */

/** Minimal shape for the GraphQL user profile response used for contribution data. */
interface GraphQLUserProfile {
  user?: {
    name?: string | null
    bio?: string | null
    company?: string | null
    location?: string | null
    createdAt?: string | null
    status?: { message?: string | null; emoji?: string | null } | null
    contributionsCollection?: {
      contributionCalendar?: {
        totalContributions: number
        weeks: ContributionWeek[]
      } | null
    } | null
  } | null
}

function resolveGraphqlCalendar(userProfile: GraphQLUserProfile | null) {
  return userProfile?.user?.contributionsCollection?.contributionCalendar ?? null
}

/**
 * Build a contribution calendar from an array of activity date strings.
 * Produces the same ContributionWeek[] structure as the GitHub GraphQL API,
 * with weeks aligned to Sundays.
 */
function collectDailyCounts(commitDates: string[]): Map<string, number> {
  const dateCounts = new Map<string, number>()
  for (const d of commitDates) {
    const day = d.split('T')[0]
    dateCounts.set(day, (dateCounts.get(day) ?? 0) + 1)
  }
  return dateCounts
}

export function buildContributionCalendar(commitDates: string[]): {
  totalContributions: number
  weeks: ContributionWeek[]
} {
  const dateCounts = collectDailyCounts(commitDates)

  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 1)
  // Align start to Sunday
  start.setDate(start.getDate() - start.getDay())

  // First pass — collect all daily counts
  const allDays: Array<{ date: string; count: number }> = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const dateStr = cursor.toISOString().split('T')[0]
    allDays.push({ date: dateStr, count: dateCounts.get(dateStr) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  const quartiles = computeQuartiles(allDays.map(d => d.count))

  // Second pass — build weeks with colors
  const weeks: ContributionWeek[] = []
  let weekDays: ContributionDay[] = []
  for (const { date, count } of allDays) {
    weekDays.push({
      date,
      contributionCount: count,
      color: assignContributionColor(count, quartiles),
    })
    if (weekDays.length === 7) {
      weeks.push({ contributionDays: weekDays })
      weekDays = []
    }
  }
  if (weekDays.length > 0) {
    weeks.push({ contributionDays: weekDays })
  }

  return { totalContributions: commitDates.length, weeks }
}

/** Build contribution calendar/source data from search dates and GraphQL profile. */
function buildContributionData(
  contributionDates: string[],
  userProfile: GraphQLUserProfile | null
): {
  totalContributions: number | null
  contributionWeeks: ContributionWeek[] | null
  contributionSource: 'graphql' | 'org-activity'
} {
  const graphqlCalendar = resolveGraphqlCalendar(userProfile)
  const graphqlTotal = graphqlCalendar?.totalContributions ?? 0

  if (contributionDates.length > 0 && contributionDates.length >= graphqlTotal) {
    const derived = buildContributionCalendar(contributionDates)
    return {
      totalContributions: derived.totalContributions,
      contributionWeeks: derived.weeks,
      contributionSource: 'org-activity',
    }
  }

  if (graphqlCalendar) {
    return {
      totalContributions: graphqlTotal,
      contributionWeeks: graphqlCalendar.weeks,
      contributionSource: 'graphql',
    }
  }

  return {
    totalContributions: null,
    contributionWeeks: null,
    contributionSource: 'org-activity',
  }
}

/** Extract basic user profile fields from a GraphQL user profile response. */
function extractUserBasicInfo(user: GraphQLUserProfile['user']): {
  name: string | null
  bio: string | null
  company: string | null
  location: string | null
} {
  if (!user) return { name: null, bio: null, company: null, location: null }
  return {
    name: user.name ?? null,
    bio: user.bio ?? null,
    company: user.company ?? null,
    location: user.location ?? null,
  }
}

/* v8 ignore start -- API response null-guards in user status mapping */
function resolveStatusFields(
  status: { message?: string | null; emoji?: string | null } | null | undefined
): {
  statusMessage: string | null
  statusEmoji: string | null
} {
  if (!status) return { statusMessage: null, statusEmoji: null }
  return {
    statusMessage: status.message ?? null,
    statusEmoji: status.emoji ?? null,
  }
}
/* v8 ignore stop */

/** Extract status and createdAt from a GraphQL user profile response. */
function extractUserStatusInfo(user: GraphQLUserProfile['user']): {
  statusMessage: string | null
  statusEmoji: string | null
  createdAt: string | null
} {
  if (!user) return { statusMessage: null, statusEmoji: null, createdAt: null }
  return {
    ...resolveStatusFields(user.status),
    createdAt: user.createdAt ?? null,
  }
}

// ── Internal helpers for fetchUserActivity ───────────────────────────

/** Minimal repo shape needed for activity queries. */
interface OrgRepoSlim {
  name: string
  pushedAt: string | null
}

function mapRawRepoSlim(repo: { name: string; pushed_at?: string | null }): OrgRepoSlim {
  return { name: repo.name, pushedAt: repo.pushed_at ?? null }
}

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
      (item: Record<string, unknown>) => {
        const commit = item.commit as
          | { committer?: { date?: string }; author?: { date?: string } }
          | undefined
        return commit?.committer?.date ?? commit?.author?.date
      }
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
    async octokit => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * DAY).toISOString().split('T')[0]

      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const startOfDayIso = startOfDay.toISOString()

      const emptySearch = { data: { total_count: 0, items: [] } } as const

      // Parallel: authored PRs (open + recently merged), reviewed PRs, events, repo history, user profile, org membership, teams, contribution dates
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
        (async () => {
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
        })(),
        octokit.orgs.getMembershipForUser({ org: owner, username: login }).catch(() => null),
        (async () => {
          try {
            const token = await getTokenForOwner(config, owner)
            const memberTeams: string[] = []
            let cursor: string | null = null
            let hasNextPage = true
            // Single paginated GraphQL query filtered by userLogins avoids N+1 REST calls
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
        })(),
        // Fetch all contribution dates (commits + PRs + issues) via search API
        searchActivityDatesInternal(octokit, owner, login).catch(() => [] as string[]),
      ])

      const recentPRsAuthored = [
        ...authoredOpen.data.items.map(mapSearchItemToUserPR),
        ...authoredMerged.data.items.map(mapSearchItemToUserPR),
      ]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, maxPRs)

      // Filter events to only those in the org
      const orgPrefix = `${owner}/`
      const recentEvents: UserEvent[] = (events.data as Array<Record<string, unknown>>)
        .map(evt => mapRawEventToUserEvent(evt, orgPrefix))
        .filter((evt): evt is UserEvent => evt !== null)

      // Count commits today from PushEvents in the org
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

      // Collect unique repos from events + authored PRs + reviewed PRs
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
    },
    `fetch user activity for ${login} in ${owner}`
  )
}
/* v8 ignore stop */
