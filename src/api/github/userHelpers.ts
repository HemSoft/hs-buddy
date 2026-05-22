import { capitalize } from './shared'

// ── Types ────────────────────────────────────────────────────────────

interface ContributionDay {
  date: string
  contributionCount: number
  color: string
}

export interface ContributionWeek {
  contributionDays: ContributionDay[]
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

/** Minimal repo shape needed for activity queries. */
export interface OrgRepoSlim {
  name: string
  pushedAt: string | null
}

// ── Constants ────────────────────────────────────────────────────────

export const EVENT_LABELS: Record<string, string> = {
  PullRequestReviewEvent: 'Reviewed a pull request',
  IssueCommentEvent: 'Commented on an issue',
  WatchEvent: 'Starred a repository',
  ForkEvent: 'Forked a repository',
  ReleaseEvent: 'Published a release',
}

/** GitHub light-theme contribution colors for the 5 levels (0–4). */
const CONTRIB_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] as const

// ── Event Formatters ─────────────────────────────────────────────────

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

export function eventSummary(evt: GitHubEvent): string {
  const evtType = evt.type
  if (!evtType) return 'Activity'
  const fixed = EVENT_LABELS[evtType]
  if (fixed) return fixed
  const formatter = DYNAMIC_EVENT_FORMATTERS[evtType]
  if (formatter) return formatter(evt)
  return evtType.replace(/Event$/, '') || 'Activity'
}

// ── Contribution Helpers ─────────────────────────────────────────────

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

export function collectDailyCounts(commitDates: string[]): Map<string, number> {
  const dateCounts = new Map<string, number>()
  for (const d of commitDates) {
    const day = d.split('T')[0]
    dateCounts.set(day, (dateCounts.get(day) ?? 0) + 1)
  }
  return dateCounts
}

function buildContributionDayCounts(
  dateCounts: Map<string, number>
): Array<{ date: string; count: number }> {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())

  const allDays: Array<{ date: string; count: number }> = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    allDays.push({ date: dateStr, count: dateCounts.get(dateStr) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return allDays
}

function buildContributionWeeks(
  allDays: Array<{ date: string; count: number }>,
  quartiles: number[]
): ContributionWeek[] {
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
  return weeks
}

export function buildContributionCalendar(commitDates: string[]): {
  totalContributions: number
  weeks: ContributionWeek[]
} {
  const allDays = buildContributionDayCounts(collectDailyCounts(commitDates))
  const quartiles = computeQuartiles(allDays.map(d => d.count))
  return {
    totalContributions: commitDates.length,
    weeks: buildContributionWeeks(allDays, quartiles),
  }
}

function resolveGraphqlCalendar(userProfile: GraphQLUserProfile | null) {
  return userProfile?.user?.contributionsCollection?.contributionCalendar ?? null
}

function resolveGraphqlContributionTotal(
  graphqlCalendar: { totalContributions: number } | null
): number {
  return graphqlCalendar?.totalContributions ?? 0
}

function shouldUseOrgContributionData(contributionDates: string[], graphqlTotal: number): boolean {
  return contributionDates.length > 0 && contributionDates.length >= graphqlTotal
}

/** Build contribution calendar/source data from search dates and GraphQL profile. */
export function buildContributionData(
  contributionDates: string[],
  userProfile: GraphQLUserProfile | null
): {
  totalContributions: number | null
  contributionWeeks: ContributionWeek[] | null
  contributionSource: 'graphql' | 'org-activity'
} {
  const graphqlCalendar = resolveGraphqlCalendar(userProfile)
  const graphqlTotal = resolveGraphqlContributionTotal(graphqlCalendar)

  if (shouldUseOrgContributionData(contributionDates, graphqlTotal)) {
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

// ── Repo / PR / Event Mappers ────────────────────────────────────────

/** Extract repo name from a GitHub API repository_url. */
export function extractRepoFromUrl(repoUrl: string): string {
  const parts = repoUrl.split('/').filter(Boolean)
  const owner = parts[parts.length - 2]
  const repo = parts[parts.length - 1]
  return owner && repo ? `${owner}/${repo}` : ''
}

/** Map a GitHub search API item to a UserPRSummary. */
export function mapSearchItemToUserPR(item: SearchItemForUserPR): UserPRSummary {
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
export function buildEventId(evt: Record<string, unknown>, repoName: string): string {
  return String(evt.id ?? `${evt.type ?? 'Unknown'}:${repoName}:${evt.created_at ?? ''}`)
}

function getEventRepoName(evt: Record<string, unknown>): string | undefined {
  return (evt.repo as { name?: string } | undefined)?.name
}

function resolveEventText(value: string | undefined, fallback: string): string {
  return value ?? fallback
}

export function mapRawEventToUserEvent(
  evt: Record<string, unknown>,
  orgPrefix: string
): UserEvent | null {
  const repoName = getEventRepoName(evt)
  if (!repoName?.startsWith(orgPrefix)) return null
  const ghEvent: GitHubEvent = {
    id: evt.id as string | undefined,
    type: evt.type as string | undefined,
    repo: { name: repoName },
    payload: evt.payload as GitHubEventPayload | undefined,
    created_at: evt.created_at as string | undefined,
  }
  return {
    id: buildEventId(evt, repoName),
    type: resolveEventText(ghEvent.type, 'Unknown'),
    repo: repoName,
    createdAt: resolveEventText(ghEvent.created_at, ''),
    summary: eventSummary(ghEvent),
  }
}

function isOrgRepoName(repoName: string | undefined, orgPrefix: string): boolean {
  return Boolean(repoName?.startsWith(orgPrefix))
}

function isEventOnOrAfter(evt: Record<string, unknown>, startOfDayIso: string): boolean {
  return typeof evt.created_at === 'string' && evt.created_at >= startOfDayIso
}

function isTodayOrgPushEvent(
  evt: Record<string, unknown>,
  orgPrefix: string,
  startOfDayIso: string
): boolean {
  return (
    evt.type === 'PushEvent' &&
    isOrgRepoName(getEventRepoName(evt), orgPrefix) &&
    isEventOnOrAfter(evt, startOfDayIso)
  )
}

/** Count commits from PushEvents that occurred today in the org. */
export function countEventCommitsToday(
  events: Array<Record<string, unknown>>,
  orgPrefix: string,
  startOfDayIso: string
): number {
  return events
    .filter(evt => isTodayOrgPushEvent(evt, orgPrefix, startOfDayIso))
    .reduce((sum, evt) => {
      const size = (evt.payload as Record<string, unknown> | undefined)?.size
      return sum + (typeof size === 'number' ? size : 1)
    }, 0)
}

// ── User Profile Helpers ─────────────────────────────────────────────

function toNullableString(value: string | null | undefined): string | null {
  return value ?? null
}

/** Extract basic user profile fields from a GraphQL user profile response. */
export function extractUserBasicInfo(
  user:
    | {
        name?: string | null
        bio?: string | null
        company?: string | null
        location?: string | null
      }
    | null
    | undefined
): {
  name: string | null
  bio: string | null
  company: string | null
  location: string | null
} {
  if (!user) return { name: null, bio: null, company: null, location: null }
  return {
    name: toNullableString(user.name),
    bio: toNullableString(user.bio),
    company: toNullableString(user.company),
    location: toNullableString(user.location),
  }
}

export function resolveStatusFields(
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

/** Extract status and createdAt from a GraphQL user profile response. */
export function extractUserStatusInfo(
  user:
    | {
        status?: { message?: string | null; emoji?: string | null } | null
        createdAt?: string | null
      }
    | null
    | undefined
): {
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

export function mapRawRepoSlim(repo: { name: string; pushed_at?: string | null }): OrgRepoSlim {
  return { name: repo.name, pushedAt: repo.pushed_at ?? null }
}
