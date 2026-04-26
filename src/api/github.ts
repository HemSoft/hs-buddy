import { Octokit } from '@octokit/rest'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { graphql } from '@octokit/graphql'
import type { PullRequest, PRConfig } from '../types/pullRequest'
import { DEFAULT_RECENTLY_MERGED_DAYS } from '../constants'
import {
  type SFLRepoStatus,
  type SFLWorkflowInfo,
  SFL_CORE_WORKFLOW_FRAGMENTS,
  deriveSFLOverallStatus,
} from '../types/sflStatus'
import { DAY } from '../utils/dateUtils'
import { getErrorMessage } from '../utils/errorUtils'

/** Max retries when the primary rate limit is hit. */
const PRIMARY_RATE_LIMIT_RETRIES = 3

/** Max retries when a secondary (abuse) rate limit is hit. */
const SECONDARY_RATE_LIMIT_RETRIES = 2

/** Total automatic retries for transient errors. */
const TOTAL_RETRIES = 3

/** Status codes that should never be retried. */
const DO_NOT_RETRY_CODES = [404, 429]

const DEFAULT_LABEL_COLOR = '808080'

type LabelWithColor = { name?: string; color?: string | null }

function parseLabels(raw: Array<string | LabelWithColor>): Array<{ name: string; color: string }> {
  /* v8 ignore start */
  return (
    raw
      /* v8 ignore stop */
      .filter((label): label is LabelWithColor => typeof label !== 'string')
      /* v8 ignore start */
      .map(label => ({ name: label.name || '', color: label.color || DEFAULT_LABEL_COLOR }))
  )
  /* v8 ignore stop */
}

// Repository info type for org repo listing
export interface OrgRepo {
  name: string
  fullName: string
  description: string | null
  url: string
  defaultBranch: string
  language: string | null
  stargazersCount: number
  forksCount: number
  isPrivate: boolean
  isArchived: boolean
  updatedAt: string | null
  pushedAt: string | null
}

// Detailed repository info for repo detail view
export interface RepoDetail {
  name: string
  fullName: string
  description: string | null
  url: string
  homepage: string | null
  language: string | null
  defaultBranch: string
  visibility: string
  isArchived: boolean
  isFork: boolean
  createdAt: string
  updatedAt: string
  pushedAt: string | null
  sizeKB: number
  stargazersCount: number
  forksCount: number
  watchersCount: number
  openIssuesCount: number
  topics: string[]
  license: string | null
  languages: Record<string, number>
  recentCommits: RepoCommit[]
  topContributors: RepoContributor[]
  openPRCount: number
  latestWorkflowRun: WorkflowRun | null
}

export interface RepoCommit {
  sha: string
  message: string
  author: string
  authorAvatarUrl: string | null
  date: string
  url: string
}

/** Shared shape for file-level diff entries (commits and PR file changes). */
export interface DiffFile {
  filename: string
  previousFilename: string | null
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string | null
  blobUrl: string | null
}

type RepoCommitFile = DiffFile

export interface RepoCommitDetail {
  sha: string
  message: string
  messageHeadline: string
  author: string
  authorAvatarUrl: string | null
  authoredDate: string
  committedDate: string
  url: string
  parents: Array<{
    sha: string
    url: string
  }>
  stats: {
    additions: number
    deletions: number
    total: number
  }
  files: RepoCommitFile[]
}

interface RepoContributor {
  login: string
  name: string | null
  avatarUrl: string
  contributions: number
  url: string
}

interface WorkflowRun {
  name: string
  status: string
  conclusion: string | null
  url: string
  createdAt: string
  headBranch: string
}

// Result from fetchOrgRepos with account attribution
export interface OrgRepoResult {
  repos: OrgRepo[]
  /** The GitHub username whose token authenticated this request */
  authenticatedAs: string
  /** True when the namespace is a user account rather than an organization */
  isUserNamespace: boolean
}

export interface OrgMember {
  login: string
  name: string | null
  avatarUrl: string | null
  url: string
  type: string
}

export interface OrgMemberResult {
  members: OrgMember[]
  authenticatedAs: string
  isUserNamespace: boolean
}

export interface OrgTeam {
  slug: string
  name: string
  description: string | null
  memberCount: number
  repoCount: number
  url: string
}

export interface OrgTeamResult {
  teams: OrgTeam[]
}

export interface TeamMember {
  login: string
  name: string | null
  avatarUrl: string | null
}

export interface TeamMembersResult {
  members: TeamMember[]
}

interface OrgContributorToday {
  login: string
  avatarUrl: string | null
  url: string | null
  commits: number
}

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

interface OrgOverviewMetrics {
  org: string
  repoCount: number
  privateRepoCount: number
  archivedRepoCount: number
  openIssueCount: number
  openPullRequestCount: number
  totalStars: number
  totalForks: number
  activeReposToday: number
  commitsToday: number
  lastPushAt: string | null
  topContributorsToday: OrgContributorToday[]
}

export interface OrgOverviewResult {
  metrics: OrgOverviewMetrics
  authenticatedAs: string
  isUserNamespace: boolean
}

// Types for repo issue listing
export interface RepoIssue {
  number: number
  title: string
  state: string
  author: string
  authorAvatarUrl: string | null
  url: string
  createdAt: string
  updatedAt: string
  labels: Array<{ name: string; color: string }>
  commentCount: number
  assignees: Array<{ login: string; name: string | null; avatarUrl: string }>
}

interface RepoIssueComment {
  id: number
  author: string
  authorAvatarUrl: string | null
  body: string
  createdAt: string
  updatedAt: string
  url: string
}

export interface RepoIssueDetail extends RepoIssue {
  body: string
  closedAt: string | null
  stateReason: string | null
  milestone: {
    title: string
    dueOn: string | null
  } | null
  comments: RepoIssueComment[]
}

// Types for repo pull request listing
export interface RepoPullRequest {
  number: number
  title: string
  state: string
  author: string
  authorAvatarUrl: string | null
  url: string
  createdAt: string
  updatedAt: string
  labels: Array<{ name: string; color: string }>
  draft: boolean
  headBranch: string
  baseBranch: string
  assigneeCount: number
  approvalCount: number
  iApproved: boolean
}

type PRFileChange = DiffFile

export interface PRFilesChangedSummary {
  files: PRFileChange[]
  additions: number
  deletions: number
  changes: number
}

// Lightweight issue + PR counts for sidebar badges
export interface RepoCounts {
  issues: number
  prs: number
}

export interface PRLinkedIssue {
  number: number
  title: string
  url: string
}

export interface PRHistorySummary {
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  commitCount: number
  issueCommentCount: number
  reviewCommentCount: number
  totalComments: number
  threadsTotal: number
  threadsOutdated: number
  threadsAddressed: number
  threadsUnaddressed: number
  linkedIssues: PRLinkedIssue[]
  reviewers: PRReviewerSummary[]
  timeline: PRTimelineEvent[]
}

interface PRReviewerSummary {
  login: string
  name: string | null
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'changes-requested' | 'commented' | 'reviewed'
  updatedAt: string | null
}

interface PRTimelineEvent {
  id: string
  type: 'opened' | 'comment' | 'commit' | 'review'
  author: string
  occurredAt: string
  summary: string
  url: string | null
}

export type PRCommentReactionContent =
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'LAUGH'
  | 'HOORAY'
  | 'CONFUSED'
  | 'HEART'
  | 'ROCKET'
  | 'EYES'

interface PRCommentReaction {
  content: PRCommentReactionContent
  count: number
  viewerHasReacted: boolean
}

// Full review thread data for the threads panel
export interface PRReviewComment {
  id: string
  author: string
  authorAvatarUrl: string | null
  body: string
  bodyHtml: string | null
  createdAt: string
  updatedAt: string
  url: string
  diffHunk: string | null
  reactions: PRCommentReaction[]
}

export interface PRReviewThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string | null
  line: number | null
  startLine: number | null
  diffSide: string | null
  comments: PRReviewComment[]
}

export interface PRReviewSummary {
  id: string
  state: string
  author: string
  authorAvatarUrl: string | null
  body: string
  bodyHtml: string | null
  createdAt: string
  updatedAt: string
  url: string
}

export interface PRThreadsResult {
  threads: PRReviewThread[]
  issueComments: PRReviewComment[]
  reviews: PRReviewSummary[]
}

interface PRCheckRunSummary {
  id: number
  name: string
  status: string
  conclusion: string | null
  detailsUrl: string | null
  startedAt: string | null
  completedAt: string | null
  appName: string | null
}

interface PRStatusContextSummary {
  id: number
  context: string
  state: string
  description: string | null
  targetUrl: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface PRChecksSummary {
  headSha: string
  overallState: 'passing' | 'failing' | 'pending' | 'neutral' | 'none'
  totalCount: number
  successfulCount: number
  failedCount: number
  pendingCount: number
  neutralCount: number
  checkRuns: PRCheckRunSummary[]
  statusContexts: PRStatusContextSummary[]
}

const PR_HISTORY_QUERY = `
  query PRHistory($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        createdAt
        updatedAt
        mergedAt
        author {
          login
        }
        comments(first: 100) {
          totalCount
          nodes {
            id
            createdAt
            bodyText
            url
            author {
              login
            }
          }
        }
        commits(first: 100) {
          totalCount
          nodes {
            commit {
              oid
              committedDate
              messageHeadline
              url
              author {
                user {
                  login
                }
                name
              }
            }
          }
        }
        reviewRequests(first: 30) {
          nodes {
            requestedReviewer {
              __typename
              ... on User {
                login
                name
                avatarUrl
              }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            id
            state
            submittedAt
            url
            author {
              login
              avatarUrl
              ... on User {
                name
              }
            }
          }
        }
        reviewThreads(first: 100) {
          totalCount
          nodes {
            isResolved
            isOutdated
            comments {
              totalCount
            }
          }
        }
        closingIssuesReferences(first: 10) {
          nodes {
            number
            title
            url
          }
        }
      }
    }
  }
` as const

type PRHistoryGraphQLResponse = {
  repository: {
    pullRequest: {
      createdAt: string
      updatedAt: string
      mergedAt: string | null
      author: { login: string } | null
      comments: {
        totalCount: number
        nodes: Array<{
          id: string
          createdAt: string
          bodyText: string
          url: string
          author: { login: string } | null
        }>
      }
      commits: {
        totalCount: number
        nodes: Array<{
          commit: {
            oid: string
            committedDate: string
            messageHeadline: string
            url: string
            author: {
              user: { login: string } | null
              name: string | null
            } | null
          }
        }>
      }
      reviewRequests: {
        nodes: Array<{
          requestedReviewer:
            | {
                __typename: 'User'
                login: string
                avatarUrl: string
              }
            | { __typename: string }
            | null
        }>
      }
      reviews: {
        nodes: Array<{
          id: string
          state: string
          submittedAt: string | null
          url: string
          author: { login: string; avatarUrl: string } | null
        }>
      }
      reviewThreads: {
        totalCount: number
        nodes: Array<{
          isResolved: boolean
          isOutdated: boolean
          comments: { totalCount: number }
        }>
      }
      closingIssuesReferences: {
        nodes: Array<{
          number: number
          title: string
          url: string
        }>
      }
    } | null
  } | null
}

// Create Octokit with retry and throttling plugins
const OctokitWithPlugins = Octokit.plugin(retry, throttling)

// Module-level caches (persist across GitHubClient instances)
const tokenCache: Map<string, string> = new Map()
const orgAvatarCache: Map<string, string | null> = new Map() // null = tried and failed

/** Test-only: reset the org avatar cache between tests. */
export function clearOrgAvatarCache(): void {
  orgAvatarCache.clear()
}

/** Clear all module-level caches (token, avatar). */
export function clearAllCaches(): void {
  tokenCache.clear()
  orgAvatarCache.clear()
}

/** Test-only: inspect the org avatar cache. */
export function getOrgAvatarCacheEntry(org: string): string | null | undefined {
  return orgAvatarCache.get(org)
}

export const EVENT_LABELS: Record<string, string> = {
  PullRequestReviewEvent: 'Reviewed a pull request',
  IssueCommentEvent: 'Commented on an issue',
  WatchEvent: 'Starred a repository',
  ForkEvent: 'Forked a repository',
  ReleaseEvent: 'Published a release',
}

// Progress callback type
export type ProgressCallback = (progress: {
  currentAccount: number
  totalAccounts: number
  accountName: string
  org: string
  status: 'authenticating' | 'fetching' | 'done' | 'error'
  prsFound?: number
  error?: string
}) => void

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describePushEvent(evt: any): string {
  const size = evt.payload?.size ?? 0
  return `Pushed ${size} commit${size !== 1 ? 's' : ''}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeActionEvent(evt: any, noun: string): string {
  const action = evt.payload?.action ?? 'updated'
  return `${capitalize(action)} ${noun}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeRefEvent(verb: string, evt: any): string {
  return `${verb} a ${evt.payload?.ref_type ?? 'ref'}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DYNAMIC_EVENT_FORMATTERS: Record<string, (evt: any) => string> = {
  PushEvent: describePushEvent,
  PullRequestEvent: evt => describeActionEvent(evt, 'pull request'),
  IssuesEvent: evt => describeActionEvent(evt, 'an issue'),
  CreateEvent: evt => describeRefEvent('Created', evt),
  DeleteEvent: evt => describeRefEvent('Deleted', evt),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function eventSummary(evt: any): string {
  const fixed = EVENT_LABELS[evt.type]
  if (fixed) return fixed
  const formatter = DYNAMIC_EVENT_FORMATTERS[evt.type]
  if (formatter) return formatter(evt)
  return evt.type?.replace(/Event$/, '') ?? 'Activity'
}

const FAILURE_COMBINED_STATES = new Set(['failure', 'error'])

function determineCheckOverallState(counts: {
  total: number
  failed: number
  pending: number
  successful: number
  combinedState: string
}): PRChecksSummary['overallState'] {
  if (counts.total === 0) return 'none'
  if (counts.failed > 0 || FAILURE_COMBINED_STATES.has(counts.combinedState)) {
    return 'failing'
  }
  if (counts.pending > 0 || counts.combinedState === 'pending') return 'pending'
  if (counts.successful > 0) return 'passing'
  return 'neutral'
}

type CheckCategory = 'successful' | 'failed' | 'pending' | 'neutral'

const FAILED_CONCLUSIONS = new Set([
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
  'failure',
])

/* v8 ignore start -- API response null-guards in check/review/timeline helpers */
function classifyCheckRun(run: { status: string; conclusion: string | null }): CheckCategory {
  if (run.status !== 'completed') return 'pending'
  if (run.conclusion === 'success') return 'successful'
  if (FAILED_CONCLUSIONS.has(run.conclusion ?? '')) return 'failed'
  return 'neutral'
}

const STATUS_CONTEXT_CATEGORY: Record<string, CheckCategory> = {
  success: 'successful',
  pending: 'pending',
  failure: 'failed',
  error: 'failed',
}

function classifyStatusContext(state: string): CheckCategory {
  return Object.prototype.hasOwnProperty.call(STATUS_CONTEXT_CATEGORY, state)
    ? STATUS_CONTEXT_CATEGORY[state]
    : 'neutral'
}

function countCheckStatuses(
  checkRuns: Array<{ status: string; conclusion: string | null }>,
  statusContexts: Array<{ state: string }>
): { total: number; failed: number; pending: number; successful: number; neutral: number } {
  const counts = { successful: 0, failed: 0, pending: 0, neutral: 0 }
  for (const run of checkRuns) {
    counts[classifyCheckRun(run)] += 1
  }
  for (const ctx of statusContexts) {
    counts[classifyStatusContext(ctx.state)] += 1
  }
  return { total: checkRuns.length + statusContexts.length, ...counts }
}

/** GitHub light-theme contribution colors for the 5 levels (0–4). */
const CONTRIB_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] as const

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

const REVIEW_STATE_DESCRIPTIONS: Record<string, string> = {
  APPROVED: 'Approved review',
  CHANGES_REQUESTED: 'Requested changes',
  COMMENTED: 'Left review comments',
}

function describeReviewState(state: string): string {
  return Object.hasOwn(REVIEW_STATE_DESCRIPTIONS, state)
    ? REVIEW_STATE_DESCRIPTIONS[state]
    : 'Submitted review'
}

function buildCommentTimelineEvents(
  comments:
    | Array<{
        id: string
        createdAt: string
        bodyText: string
        url: string
        author: { login: string } | null
      }>
    | undefined
): PRTimelineEvent[] {
  return (comments ?? []).map(comment => ({
    id: `comment-${comment.id}`,
    type: 'comment' as const,
    author: comment.author?.login || 'unknown',
    occurredAt: comment.createdAt,
    summary: (comment.bodyText || '').trim().split('\n')[0] || 'Added comment',
    url: comment.url,
  }))
}

function resolveCommitAuthor(
  author: { user: { login: string } | null; name: string | null } | null
): string {
  return author?.user?.login || author?.name || 'unknown'
}

function buildCommitTimelineEvents(
  commitNodes:
    | Array<{
        commit: {
          oid: string
          committedDate: string
          messageHeadline: string
          url: string
          author: { user: { login: string } | null; name: string | null } | null
        }
      }>
    | undefined
): PRTimelineEvent[] {
  return (commitNodes ?? []).map(node => ({
    id: `commit-${node.commit.oid}`,
    type: 'commit' as const,
    author: resolveCommitAuthor(node.commit.author),
    occurredAt: node.commit.committedDate,
    summary: node.commit.messageHeadline || 'Commit',
    url: node.commit.url || null,
  }))
}

function buildReviewTimelineEvents(
  reviews:
    | Array<{
        id: string
        state: string
        submittedAt: string | null
        url: string
        author: { login: string } | null
      }>
    | undefined
): PRTimelineEvent[] {
  return (reviews ?? [])
    .filter(review => review.submittedAt)
    .map(review => ({
      id: `review-${review.id}`,
      type: 'review' as const,
      author: review.author?.login || 'unknown',
      occurredAt: review.submittedAt!,
      summary: describeReviewState(review.state),
      url: review.url || null,
    }))
}

const REVIEWER_STATUS_MAP: Record<string, PRReviewerSummary['status']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  COMMENTED: 'commented',
}

function resolveReviewerStatus(state: string | undefined): PRReviewerSummary['status'] {
  if (!state) return 'pending'
  return Object.hasOwn(REVIEWER_STATUS_MAP, state) ? REVIEWER_STATUS_MAP[state] : 'reviewed'
}
/* v8 ignore stop */

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

type ReviewNodeForMap = {
  state: string
  submittedAt: string | null
  author: { login: string; avatarUrl: string } | null
}

type ReviewEntryForMap = {
  state: string
  submittedAt: string | null
  avatarUrl: string | null
  name: string | null
}

/* v8 ignore start -- API response null-guards in review/event mapping helpers */
function buildReviewEntry(review: ReviewNodeForMap): ReviewEntryForMap {
  const author = review.author as
    | { login?: string; avatarUrl?: string | null; name?: string | null }
    | null
    | undefined
  return {
    state: review.state,
    submittedAt: review.submittedAt,
    avatarUrl: author?.avatarUrl || null,
    name: author?.name || null,
  }
}

function isNewerReview(
  submittedAt: string | null,
  existing: ReviewEntryForMap | undefined
): boolean {
  return !existing || (submittedAt || '') > (existing.submittedAt || '')
}

function buildLatestReviewsMap(
  reviews: ReviewNodeForMap[] | undefined
): Map<string, ReviewEntryForMap> {
  const map = new Map<string, ReviewEntryForMap>()
  for (const review of reviews ?? []) {
    const login = review.author?.login
    if (!login) continue
    if (isNewerReview(review.submittedAt, map.get(login))) {
      map.set(login, buildReviewEntry(review))
    }
  }
  return map
}

type ReviewRequestNode = {
  requestedReviewer:
    | { __typename: 'User'; login: string; avatarUrl: string }
    | { __typename: string }
    | null
}

/** Type guard: is this reviewer a User node with login and avatarUrl? */
function isUserReviewer(
  reviewer: unknown
): reviewer is { login: string; avatarUrl?: string | null; name?: string | null } {
  if (!reviewer) return false
  const r = reviewer as Record<string, unknown>
  return r.__typename === 'User' && 'login' in r && 'avatarUrl' in r
}

function buildRequestedReviewersMap(
  reviewRequests: ReviewRequestNode[] | undefined
): Map<string, { avatarUrl: string | null; name: string | null }> {
  const map = new Map<string, { avatarUrl: string | null; name: string | null }>()
  for (const req of reviewRequests ?? []) {
    if (isUserReviewer(req.requestedReviewer)) {
      const r = req.requestedReviewer
      map.set(r.login, { avatarUrl: r.avatarUrl || null, name: r.name || null })
    }
  }
  return map
}

/** Extract repo name from a GitHub API repository_url. */
function extractRepoFromUrl(repoUrl: string): string {
  const parts = repoUrl.split('/')
  return parts.slice(-2).join('/')
}

/** Map a GitHub search API item to a UserPRSummary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSearchItemToUserPR(item: any): UserPRSummary {
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
  return {
    id: buildEventId(evt, repoName),
    type: (evt.type as string) ?? 'Unknown',
    repo: repoName,
    createdAt: (evt.created_at as string) ?? '',
    summary: eventSummary(evt),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveGraphqlCalendar(userProfile: any) {
  return userProfile?.user?.contributionsCollection?.contributionCalendar ?? null
}

/** Build contribution calendar/source data from search dates and GraphQL profile. */
function buildContributionData(
  contributionDates: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userProfile: any
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

/** Map a raw Octokit commit to a RepoCommit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawCommitToRepoCommit(c: any): RepoCommit {
  const a = c.author ?? {}
  /* v8 ignore start -- commit.author always present in API responses */
  const ca = c.commit.author ?? {}
  /* v8 ignore stop */
  return {
    sha: c.sha,
    message: c.commit.message.split('\n')[0],
    author: a.login || ca.name || 'unknown',
    authorAvatarUrl: a.avatar_url || null,
    date: ca.date || '',
    url: c.html_url,
  }
}

const CONTRIBUTOR_DEFAULTS = { login: 'unknown', avatar_url: '', contributions: 0, html_url: '' }

/** Map a raw Octokit contributor to a RepoContributor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawContributor(c: any): RepoContributor {
  const d = { ...CONTRIBUTOR_DEFAULTS, ...c }
  return {
    login: d.login,
    name: null as string | null,
    avatarUrl: d.avatar_url,
    contributions: d.contributions,
    url: d.html_url,
  }
}

const WORKFLOW_RUN_DEFAULTS = {
  name: 'Workflow',
  status: 'unknown',
  conclusion: null,
  head_branch: '',
}

/** Extract WorkflowRun from a settled workflow runs API result. */
/* v8 ignore start */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractWorkflowRun(result: PromiseSettledResult<any>): WorkflowRun | null {
  if (result.status !== 'fulfilled') return null
  const runs = result.value.data.workflow_runs
  if (runs.length === 0) return null
  const run = { ...WORKFLOW_RUN_DEFAULTS, ...runs[0] }
  return {
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
    createdAt: run.created_at,
    headBranch: run.head_branch,
  }
}
/* v8 ignore stop */

/** Extract languages from a settled API result, defaulting to empty. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLanguages(result: PromiseSettledResult<any>): Record<string, number> {
  return result.status === 'fulfilled' ? result.value.data : {}
}

/** Extract commits from a settled API result, defaulting to empty. */
/* v8 ignore start -- Optional API result; defensive null path */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCommits(result: PromiseSettledResult<any>): RepoCommit[] {
  return result.status === 'fulfilled' ? result.value.data.map(mapRawCommitToRepoCommit) : []
}

/** Extract contributors from a settled API result, defaulting to empty. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContributors(result: PromiseSettledResult<any>): RepoContributor[] {
  if (result.status !== 'fulfilled') return []
  if (!Array.isArray(result.value.data)) return []
  return result.value.data.map(mapRawContributor)
}

/** Derive open PR count from settled PR list result and repo issue count. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOpenPRCount(result: PromiseSettledResult<any>, issueCount: number): number {
  if (result.status !== 'fulfilled') return 0
  if (result.value.data.length === 0) return 0
  return issueCount
}
/* v8 ignore stop */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withFileStats(file: any): { additions: number; deletions: number; changes: number } {
  return {
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
  }
}

/** Map a raw commit file entry to DiffFile. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitFileToDiffFile(file: any): DiffFile {
  return {
    filename: file.filename,
    previousFilename: file.previous_filename || null,
    status: file.status || 'modified',
    ...withFileStats(file),
    patch: file.patch || null,
    blobUrl: file.blob_url || null,
  }
}

export type PRSearchMode = 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge'

const PR_SEARCH_BUILDERS: Record<PRSearchMode, (u: string, o: string, m?: string) => string[]> = {
  'needs-review': (u, o) => [
    `is:pr review-requested:${u} is:open org:${o}`,
    `is:pr assignee:${u} is:open org:${o} -author:${u}`,
  ],
  'need-a-nudge': (u, o) => [`is:pr is:open reviewed-by:${u} org:${o}`],
  'recently-merged': (u, o, m) => [
    `is:pr author:${u} is:merged merged:>=${m} org:${o}`,
    `is:pr reviewed-by:${u} is:merged merged:>=${m} org:${o}`,
  ],
  'my-prs': (u, o) => [`is:pr author:${u} is:open org:${o}`],
}

/** Build search queries for fetchPRsForAccount based on mode. */
function buildPRSearchQueries(
  username: string,
  org: string,
  mode: PRSearchMode,
  mergedAfter?: string
): string[] {
  /* v8 ignore start -- defensive: PRSearchMode union is exhaustive */
  const resolvedMode: PRSearchMode = Object.prototype.hasOwnProperty.call(PR_SEARCH_BUILDERS, mode)
    ? mode
    : 'my-prs'
  /* v8 ignore stop */
  return PR_SEARCH_BUILDERS[resolvedMode](username, org, mergedAfter)
}

/** Safely resolve assignee count from a nullable array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAssigneeCount(item: any): number {
  return item.assignees?.length || 0
}

/** Extract nullable author/date/assignee fields for a search-result PR. */
/* v8 ignore start -- API response null-guards in issue/PR field mapping */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSearchPRFields(item: any): {
  author: string
  authorAvatarUrl: string | undefined
  assigneeCount: number
  created: Date | null
  updatedAt: string | null
  date: string | null
} {
  const user = item.user ?? {}
  return {
    author: user.login || 'unknown',
    authorAvatarUrl: user.avatar_url,
    assigneeCount: resolveAssigneeCount(item),
    created: item.created_at ? new Date(item.created_at) : null,
    updatedAt: item.updated_at || null,
    date: item.closed_at || null,
  }
}

/** Map a GitHub search item to a PullRequest (with temp metadata fields). */
function mapSearchItemToPullRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  orgAvatarUrl: string | null,
  org: string
): (PullRequest & { _owner: string; _repo: string; _prNumber: number }) | null {
  const urlMatch = item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/)
  if (!urlMatch?.[1] || !urlMatch?.[2]) return null

  const owner: string = urlMatch[1]
  const repo: string = urlMatch[2]

  return {
    source: 'GitHub' as const,
    repository: repo,
    id: item.number,
    title: item.title,
    ...buildSearchPRFields(item),
    url: item.html_url,
    state: item.state,
    approvalCount: 0,
    iApproved: false,
    headBranch: '',
    baseBranch: '',
    threadsTotal: null,
    threadsAddressed: null,
    threadsUnaddressed: null,
    orgAvatarUrl: orgAvatarUrl ?? undefined,
    org,
    _owner: owner,
    _repo: repo,
    _prNumber: item.number,
  }
}
/* v8 ignore stop */

const ORG_REPO_NUM_DEFAULTS = { stargazers_count: 0, forks_count: 0, archived: false }

/** Map a repo entry from Octokit response to OrgRepo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawRepoToOrgRepo(repo: any): OrgRepo {
  const d = { ...ORG_REPO_NUM_DEFAULTS, ...repo }
  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    url: repo.html_url,
    defaultBranch: repo.default_branch || 'main',
    language: repo.language ?? null,
    stargazersCount: d.stargazers_count,
    forksCount: d.forks_count,
    isPrivate: repo.private,
    isArchived: d.archived,
    updatedAt: repo.updated_at ?? null,
    pushedAt: repo.pushed_at ?? null,
  }
}

function resolveVisibility(r: { visibility?: string; private?: boolean }): string {
  /* v8 ignore start */
  return r.visibility ?? (r.private ? 'private' : 'public')
  /* v8 ignore stop */
}

const REPO_IDENTITY_DEFAULTS = {
  description: null as string | null,
  homepage: null as string | null,
  language: null as string | null,
  archived: false,
}

/** Build identity fields (name, url, visibility, etc.) for a RepoDetail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRepoIdentityFields(r: any): {
  name: string
  fullName: string
  description: string | null
  url: string
  homepage: string | null
  language: string | null
  defaultBranch: string
  visibility: string
  isArchived: boolean
  isFork: boolean
} {
  const d = { ...REPO_IDENTITY_DEFAULTS, ...r }
  return {
    name: r.name,
    fullName: r.full_name,
    description: d.description,
    url: r.html_url,
    homepage: d.homepage,
    language: d.language,
    defaultBranch: r.default_branch,
    visibility: resolveVisibility(r),
    isArchived: d.archived,
    isFork: r.fork,
  }
}

const REPO_DATE_DEFAULTS = { created_at: '', updated_at: '' }

/** Build date fields for a RepoDetail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRepoDateFields(r: any): {
  createdAt: string
  updatedAt: string
  pushedAt: string | null
} {
  const d = { ...REPO_DATE_DEFAULTS, ...r }
  return {
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    pushedAt: r.pushed_at ?? null,
  }
}

const REPO_STATS_DEFAULTS = {
  size: 0,
  stargazers_count: 0,
  forks_count: 0,
  subscribers_count: 0,
  open_issues_count: 0,
}

/** Build numeric stats and metadata fields for a RepoDetail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRepoStatsFields(r: any): {
  sizeKB: number
  stargazersCount: number
  forksCount: number
  watchersCount: number
  openIssuesCount: number
  topics: string[]
  license: string | null
} {
  const d = { ...REPO_STATS_DEFAULTS, ...r }
  return {
    sizeKB: d.size,
    stargazersCount: d.stargazers_count,
    forksCount: d.forks_count,
    watchersCount: d.subscribers_count,
    openIssuesCount: d.open_issues_count,
    topics: r.topics ?? [],
    license: r.license?.spdx_id ?? null,
  }
}

/** Build the RepoDetail return object from raw API data. */
function buildRepoDetailObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r: any,
  languages: Record<string, number>,
  recentCommits: RepoCommit[],
  topContributors: RepoContributor[],
  openPRCount: number,
  latestWorkflowRun: WorkflowRun | null
): RepoDetail {
  return {
    ...buildRepoIdentityFields(r),
    ...buildRepoDateFields(r),
    ...buildRepoStatsFields(r),
    languages,
    recentCommits,
    topContributors,
    openPRCount,
    latestWorkflowRun,
  }
}

/** Build OrgOverviewMetrics from collected data. */
/* v8 ignore start -- API response null-guards in org overview metrics */
function buildOrgMetrics(
  org: string,
  repos: OrgRepo[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openIssuesResult: PromiseSettledResult<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openPrsResult: PromiseSettledResult<any>,
  activeReposToday: number,
  commitsToday: number,
  contributorMap: Map<string, OrgContributorToday>
): OrgOverviewMetrics {
  return {
    org,
    repoCount: repos.length,
    privateRepoCount: repos.filter(repo => repo.isPrivate).length,
    archivedRepoCount: repos.filter(repo => repo.isArchived).length,
    openIssueCount:
      openIssuesResult.status === 'fulfilled' ? openIssuesResult.value.data.total_count : 0,
    openPullRequestCount:
      openPrsResult.status === 'fulfilled' ? openPrsResult.value.data.total_count : 0,
    totalStars: repos.reduce((sum, repo) => sum + repo.stargazersCount, 0),
    totalForks: repos.reduce((sum, repo) => sum + repo.forksCount, 0),
    activeReposToday,
    commitsToday,
    lastPushAt:
      repos
        .map(repo => repo.pushedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null,
    topContributorsToday: Array.from(contributorMap.values())
      .sort((left, right) => right.commits - left.commits || left.login.localeCompare(right.login))
      .slice(0, 10),
  }
}
/* v8 ignore stop */

/** Map a raw PR label to { name, color }. */
/** Return the first non-nullish value, or null. */
function pickFirst<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null
}

/** Extract author + avatarUrl from a GitHub user object (shared by issue & PR mappers). */
function mapUserAuthorFields(user: { login?: string; avatar_url?: string } | null | undefined): {
  author: string
  authorAvatarUrl: string | null
} {
  return {
    author: user?.login || 'unknown',
    authorAvatarUrl: user?.avatar_url || null,
  }
}

/** Build the latest-review-by-user map from a list of REST reviews. */
/* v8 ignore start -- API response null-guards in commit/reviewer mapping */
function buildLatestReviewByUser(
  reviews: Array<{
    user?: { login?: string } | null
    state: string
    submitted_at?: string | null
  }>
): Map<string, { state: string; submittedAt: string }> {
  const map = new Map<string, { state: string; submittedAt: string }>()
  for (const review of reviews) {
    const login = review.user?.login
    if (!login) continue
    const submittedAt = review.submitted_at || ''
    const existing = map.get(login)
    if (!existing || submittedAt > existing.submittedAt) {
      map.set(login, { state: review.state, submittedAt })
    }
  }
  return map
}

/** Resolve reviewer name + avatarUrl from latest review and/or request data. */
function resolveReviewerIdentity(
  latest: ReviewEntryForMap | undefined,
  requested: { avatarUrl: string | null; name: string | null } | undefined
): { name: string | null; avatarUrl: string | null } {
  return {
    name: pickFirst(latest?.name, requested?.name),
    avatarUrl: pickFirst(latest?.avatarUrl, requested?.avatarUrl),
  }
}

/** Build a PRReviewerSummary from GraphQL review + request data. */
function buildReviewerSummary(
  login: string,
  latest: ReviewEntryForMap | undefined,
  requested: { avatarUrl: string | null; name: string | null } | undefined
): PRReviewerSummary {
  return {
    login,
    ...resolveReviewerIdentity(latest, requested),
    status: resolveReviewerStatus(latest?.state),
    updatedAt: latest?.submittedAt || null,
  }
}

/** Extract author info from a raw commit (handles commit.author + commit.commit.author fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitAuthorFields(commit: any): { author: string; authorAvatarUrl: string | null } {
  return {
    author: resolveContributorLogin(commit),
    authorAvatarUrl: commit.author?.avatar_url || null,
  }
}

function resolveDate(dateObj: { date?: string } | null | undefined): string {
  return dateObj?.date || ''
}

/** Extract authored/committed dates from a raw commit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitDates(commit: any): { authoredDate: string; committedDate: string } {
  const authorDate = resolveDate(commit.commit.author)
  return {
    authoredDate: authorDate,
    committedDate: resolveDate(commit.commit.committer) || authorDate,
  }
}

const COMMIT_STATS_DEFAULTS = { additions: 0, deletions: 0, total: 0 }

/** Extract stats from a raw commit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitStats(stats: any): { additions: number; deletions: number; total: number } {
  const d = { ...COMMIT_STATS_DEFAULTS, ...(stats || {}) }
  return { additions: d.additions || 0, deletions: d.deletions || 0, total: d.total || 0 }
}

/** Map parent commits from a raw commit response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitParents(commit: any): Array<{ sha: string; url: string }> {
  const baseUrl = commit.html_url.replace(/\/commit\/[^/]+$/, '')
  return (commit.parents || []).map((parent: { sha: string; html_url?: string }) => ({
    sha: parent.sha,
    url: parent.html_url || `${baseUrl}/commit/${parent.sha}`,
  }))
}

/** Extract issue body, stateReason, and milestone fields from a raw issue. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIssueBodyFields(issue: any): {
  body: string
  stateReason: string | null
  milestone: { title: string; dueOn: string | null } | null
} {
  return {
    body: issue.body || '',
    stateReason: issue.state_reason || null,
    milestone: issue.milestone
      ? { title: issue.milestone.title, dueOn: issue.milestone.due_on }
      : null,
  }
}

/** Map a raw PR from the pulls.list endpoint to a RepoPullRequest. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawPRToRepoPR(pr: any): RepoPullRequest {
  const head = pr.head || {}
  const base = pr.base || {}
  const labels = pr.labels || []
  const assignees = pr.assignees || []
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    ...mapUserAuthorFields(pr.user),
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    labels: labels.map(mapPRLabel),
    draft: !!pr.draft,
    headBranch: head.ref || '',
    baseBranch: base.ref || '',
    assigneeCount: assignees.length,
    approvalCount: 0,
    iApproved: false,
  }
}

/** Resolve contributor login from a commit (author login or committer name fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveContributorLogin(commit: any): string {
  return commit.author?.login || commit.commit.author?.name || 'unknown'
}
/* v8 ignore stop */

const EMPTY_CONTRIBUTOR: OrgContributorToday = {
  login: 'unknown',
  avatarUrl: null,
  url: null,
  commits: 0,
}

/** Merge a commit into an existing contributor entry (or create a new one). */
/* v8 ignore start -- API response null-guards in contributor merging */
function mergeContributorEntry(
  login: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commit: any,
  existing: OrgContributorToday | undefined
): OrgContributorToday {
  const author = commit.author || {}
  const prev = existing || EMPTY_CONTRIBUTOR
  return {
    login,
    avatarUrl: pickFirst(author.avatar_url, prev.avatarUrl),
    url: pickFirst(author.html_url, prev.url),
    commits: prev.commits + 1,
  }
}
/* v8 ignore stop */

/** Extract basic user profile fields from a GraphQL user profile response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUserBasicInfo(user: any): {
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
function resolveStatusFields(status: { message?: string; emoji?: string } | null | undefined): {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUserStatusInfo(user: any): {
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

function mapPRLabel(l: string | { name?: string; color?: string }): {
  name: string
  color: string
} {
  if (typeof l === 'string') return { name: l, color: DEFAULT_LABEL_COLOR }
  return { name: l.name || '', color: l.color || DEFAULT_LABEL_COLOR }
}

function ensureCallback(cb?: ProgressCallback): ProgressCallback {
  return cb ?? (() => {})
}

/** Resolve author login + avatarUrl from a nullable GraphQL author node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveCommentAuthor(author: any): { author: string; authorAvatarUrl: string | null } {
  return {
    author: author?.login || 'unknown',
    authorAvatarUrl: author?.avatarUrl || null,
  }
}

/** Map a raw GraphQL comment node to PRReviewComment fields. */
function mapReviewCommentFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
  mapReactions: (
    groups:
      | Array<{ content: string; viewerHasReacted: boolean; users: { totalCount: number } }>
      | null
      | undefined
  ) => PRCommentReaction[]
): PRReviewComment {
  return {
    id: c.id,
    ...resolveCommentAuthor(c.author),
    body: c.body || '',
    bodyHtml: c.bodyHTML || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    url: c.url,
    diffHunk: c.diffHunk || null,
    reactions: mapReactions(c.reactionGroups),
  }
}

/** Map a raw assignee object to the internal assignee shape. */
function mapAssigneeFields(a: { login: string; avatar_url: string }): {
  login: string
  name: string | null
  avatarUrl: string
} {
  return { login: a.login, name: null, avatarUrl: a.avatar_url }
}

/** Map a raw issue from the issues.listForRepo endpoint to a RepoIssue (without name resolution). */
/* v8 ignore start -- API response null-guards in issue field mapping */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiIssueFields(issue: any) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    ...mapUserAuthorFields(issue.user),
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    labels: parseLabels(issue.labels || []),
    commentCount: issue.comments,
    assignees: (issue.assignees || []).map(mapAssigneeFields),
  }
}
/* v8 ignore stop */

/** Resolve the best URL for a check run's details. */
function resolveCheckDetailsUrl(run: {
  details_url?: string | null
  html_url?: string | null
}): string | null {
  return run.details_url || run.html_url || null
}

const CHECK_RUN_TIME_DEFAULTS = { started_at: null, completed_at: null }

/** Map a raw check run to a PRCheckRunSummary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCheckRunToSummary(run: any): PRCheckRunSummary {
  const d = { ...CHECK_RUN_TIME_DEFAULTS, ...run }
  return {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    detailsUrl: resolveCheckDetailsUrl(run),
    startedAt: d.started_at,
    completedAt: d.completed_at,
    appName: run.app?.name || null,
  }
}

const STATUS_CONTEXT_DEFAULTS = {
  description: null,
  target_url: null,
  created_at: null,
  updated_at: null,
}

/** Map a raw status context to a PRStatusContextSummary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStatusContextToSummary(status: any): PRStatusContextSummary {
  const d = { ...STATUS_CONTEXT_DEFAULTS, ...status }
  return {
    id: status.id,
    context: status.context,
    state: status.state,
    description: d.description,
    targetUrl: d.target_url,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

export class GitHubClient {
  private config: PRConfig['github']
  private recentlyMergedDays: number = DEFAULT_RECENTLY_MERGED_DAYS

  constructor(
    config: PRConfig['github'],
    recentlyMergedDays: number = DEFAULT_RECENTLY_MERGED_DAYS
  ) {
    this.config = config
    this.recentlyMergedDays = recentlyMergedDays
  }

  private static async batchProcess<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    batchSize?: number
  ): Promise<void> {
    const BATCH_SIZE = 10
    const size = batchSize ?? BATCH_SIZE

    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size)
      await Promise.all(batch.map(fn))
    }
  }

  /* v8 ignore start -- API response null-guards for review data */
  private countApprovals(
    reviews: Array<{
      user?: { login?: string } | null
      state: string
      submitted_at?: string | null
    }>,
    viewerLogin: string | null
  ): { approvalCount: number; iApproved: boolean } {
    const latestByUser = buildLatestReviewByUser(reviews)
    let approvalCount = 0
    let iApproved = false
    const viewerLower = viewerLogin?.toLowerCase() ?? null
    for (const [login, { state }] of latestByUser) {
      if (state !== 'APPROVED') continue
      approvalCount++
      if (viewerLower && login.toLowerCase() === viewerLower) {
        iApproved = true
      }
    }
    return { approvalCount, iApproved }
  }
  /* v8 ignore stop */

  /* v8 ignore start -- GraphQL response null-guards; GitHub types allow nulls but data is always present */
  private buildPRTimeline(
    pr: NonNullable<NonNullable<PRHistoryGraphQLResponse['repository']>['pullRequest']>,
    pullNumber: number
  ): PRTimelineEvent[] {
    const opened: PRTimelineEvent = {
      id: `opened-${pullNumber}`,
      type: 'opened',
      author: pr.author?.login || 'unknown',
      occurredAt: pr.createdAt,
      summary: 'Opened pull request',
      url: null,
    }

    const timeline = [
      opened,
      ...buildCommentTimelineEvents(pr.comments.nodes),
      ...buildCommitTimelineEvents(pr.commits.nodes),
      ...buildReviewTimelineEvents(pr.reviews.nodes),
    ]

    timeline.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

    return timeline
  }
  /* v8 ignore stop */

  /* v8 ignore start -- GraphQL response null-guards in reviewer data mapping */
  private buildReviewerSummaries(
    pr: NonNullable<NonNullable<PRHistoryGraphQLResponse['repository']>['pullRequest']>
  ): PRReviewerSummary[] {
    const latestReviewsByUser = buildLatestReviewsMap(pr.reviews.nodes)
    const requestedReviewers = buildRequestedReviewersMap(pr.reviewRequests.nodes)

    const reviewerLogins = new Set<string>([
      ...requestedReviewers.keys(),
      ...latestReviewsByUser.keys(),
    ])

    return Array.from(reviewerLogins).map(login =>
      buildReviewerSummary(login, latestReviewsByUser.get(login), requestedReviewers.get(login))
    )
  }
  /* v8 ignore stop */

  /**
   * Get the currently-active GitHub CLI account.
   * Uses `gh auth status` — the active account is the one used for Copilot CLI, etc.
   */
  static async getActiveCliAccount(): Promise<string | null> {
    try {
      const output: string = await window.ipcRenderer.invoke('github:get-active-account')
      return output?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Get GitHub CLI authentication token for a specific account
   * Uses 'gh auth token --user <username>' to get account-specific tokens
   */
  private async getGitHubCLIToken(username: string): Promise<string | null> {
    // Check module-level cache first (persists across instances)
    const cached = tokenCache.get(username)
    if (cached) {
      return cached
    }

    try {
      // Use window.ipcRenderer to invoke a main process handler that runs 'gh auth token --user <username>'
      const token = await window.ipcRenderer.invoke('github:get-cli-token', username)
      if (token && typeof token === 'string' && token.trim().length > 0) {
        const trimmedToken = token.trim()
        tokenCache.set(username, trimmedToken)
        return trimmedToken
      }
      console.warn(`⚠️  GitHub CLI token is empty or invalid for account '${username}'`)
      return null
    } catch (error) {
      console.error(`Failed to get GitHub CLI token for '${username}':`, error)
      return null
    }
  }

  /**
   * Get Octokit instance with retry and throttling for a specific account
   * Uses GitHub CLI authentication with per-account tokens
   */
  private async getOctokit(username: string): Promise<Octokit | null> {
    const token = await this.getGitHubCLIToken(username)

    if (!token) {
      console.warn(
        `⚠️  GitHub CLI authentication not available for '${username}'. Run: gh auth login`
      )
      return null
    }

    return new OctokitWithPlugins({
      auth: token,
      /* v8 ignore start -- Octokit throttle callbacks; invoked by plugin internals */
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Rate limit hit for ${options.method} ${options.url}`)
          if (retryCount < PRIMARY_RATE_LIMIT_RETRIES) {
            console.info(
              `Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/${PRIMARY_RATE_LIMIT_RETRIES})`
            )
            return true
          }
          return false
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Secondary rate limit hit for ${options.method} ${options.url}`)
          if (retryCount < SECONDARY_RATE_LIMIT_RETRIES) {
            console.info(
              `Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/${SECONDARY_RATE_LIMIT_RETRIES})`
            )
            return true
          }
          return false
        },
      },
      /* v8 ignore stop */
      retry: {
        doNotRetry: DO_NOT_RETRY_CODES,
        retries: TOTAL_RETRIES,
      },
    })
  }

  /**
   * Return accounts ordered by best match for a target owner/org.
   * Matching org accounts are tried first, then remaining accounts.
   */
  private getAccountsByOwnerPriority(owner: string) {
    const preferred = this.config.accounts.filter(account => account.org === owner)
    const fallback = this.config.accounts.filter(account => account.org !== owner)
    return [...preferred, ...fallback]
  }

  /**
   * Get an Octokit instance for a given owner/org.
   * Tries accounts matching the owner first, then falls back to any account.
   */
  private async getOctokitForOwner(owner: string): Promise<Octokit> {
    for (const account of this.getAccountsByOwnerPriority(owner)) {
      const octokit = await this.getOctokit(account.username)
      if (octokit) return octokit
    }
    throw new Error(`No authenticated GitHub account available for ${owner}`)
  }

  /**
   * Fetch all PRs (default mode: all PRs I'm involved with)
   */
  async fetchMyPRs(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('my-prs', onProgress)
  }

  /**
   * Fetch PRs needing review (where I haven't approved yet)
   */
  async fetchNeedsReview(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('needs-review', onProgress)
  }

  /**
   * Fetch recently merged PRs
   */
  async fetchRecentlyMerged(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('recently-merged', onProgress)
  }

  /**
   * Fetch PRs the user has approved but haven't been merged yet
   */
  async fetchNeedANudge(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('need-a-nudge', onProgress)
  }

  /**
   * Fetch detailed information about a single repository.
   * Fetches repo metadata, languages, recent commits, contributors,
   * open PR count, and latest CI/CD workflow run in parallel.
   */
  async fetchRepoDetail(owner: string, repo: string): Promise<RepoDetail> {
    let octokit: Octokit
    try {
      octokit = await this.getOctokitForOwner(owner)
    } catch {
      throw new Error(`No authenticated GitHub account available to fetch ${owner}/${repo}`)
    }

    // Fetch all data in parallel
    const [repoData, languagesData, commitsData, contributorsData, prsData, workflowsData] =
      await Promise.allSettled([
        octokit.repos.get({ owner, repo }),
        octokit.repos.listLanguages({ owner, repo }),
        octokit.repos.listCommits({ owner, repo, per_page: 10 }),
        octokit.repos.listContributors({ owner, repo, per_page: 10 }),
        octokit.pulls.list({ owner, repo, state: 'open', per_page: 1 }),
        octokit.actions.listWorkflowRunsForRepo({ owner, repo, per_page: 1 }),
      ])

    // Repo metadata (required — throw if it fails)
    /* v8 ignore start -- only triggers on actual GitHub API failure */
    if (repoData.status === 'rejected') {
      throw new Error(`Failed to fetch repo ${owner}/${repo}: ${repoData.reason}`)
    }
    /* v8 ignore stop */
    const r = repoData.value.data

    const languages = extractLanguages(languagesData)

    /* v8 ignore start -- Optional API results; branches for rejected/null paths are defensive */
    const recentCommits = extractCommits(commitsData)
    let topContributors = extractContributors(contributorsData)

    if (topContributors.length > 0) {
      const nameMap = await this.fetchUserNames(
        topContributors.map(c => c.login),
        owner
      )
      topContributors = topContributors.map(c => ({ ...c, name: nameMap.get(c.login) ?? null }))
    }

    const openPRCount = extractOpenPRCount(prsData, r.open_issues_count)
    const latestWorkflowRun = extractWorkflowRun(workflowsData)
    /* v8 ignore stop */

    return buildRepoDetailObject(
      r,
      languages,
      recentCommits,
      topContributors,
      openPRCount,
      latestWorkflowRun
    )
  }

  /**
   * Fetch recent commits for a repository.
   */
  async fetchRepoCommits(owner: string, repo: string, perPage = 25): Promise<RepoCommit[]> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.repos.listCommits({ owner, repo, per_page: perPage })

    return response.data.map(mapRawCommitToRepoCommit)
  }

  /**
   * Fetch the full detail for a single commit, including changed files.
   */
  /* v8 ignore start -- API response null-guards in commit detail mapping */
  async fetchRepoCommitDetail(owner: string, repo: string, ref: string): Promise<RepoCommitDetail> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.repos.getCommit({ owner, repo, ref })
    const commit = response.data

    return {
      sha: commit.sha,
      message: commit.commit.message,
      messageHeadline: commit.commit.message.split('\n')[0] || commit.sha,
      ...mapCommitAuthorFields(commit),
      ...mapCommitDates(commit),
      url: commit.html_url,
      parents: mapCommitParents(commit),
      stats: mapCommitStats(commit.stats),
      files: (commit.files || []).map(mapCommitFileToDiffFile),
    }
  }
  /* v8 ignore stop */

  /**
   * Fetch open issue and PR counts for a specific repository.
   * Uses GitHub search API for accurate separate counts.
   */
  async fetchRepoCounts(owner: string, repo: string): Promise<RepoCounts> {
    const octokit = await this.getOctokitForOwner(owner)
    const [issueSearch, prSearch] = await Promise.all([
      octokit.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} is:issue is:open`,
        per_page: 1,
      }),
      octokit.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} is:pr is:open`,
        per_page: 1,
      }),
    ])
    return {
      issues: issueSearch.data.total_count,
      prs: prSearch.data.total_count,
    }
  }

  /**
   * Fetch open issues for a specific repository.
   * Filters out pull requests (GitHub includes them in the issues endpoint).
   */
  /* v8 ignore start -- API response null-guards throughout issue/PR data mapping */
  async fetchRepoIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' = 'open'
  ): Promise<RepoIssue[]> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: 100,
      sort: 'updated',
      direction: 'desc',
    })
    const issues = response.data.filter(issue => !issue.pull_request).map(mapApiIssueFields)

    const allAssigneeLogins = [
      ...new Set(issues.flatMap(i => i.assignees.map((a: { login: string }) => a.login))),
    ]
    if (allAssigneeLogins.length > 0) {
      const nameMap = await this.fetchUserNames(allAssigneeLogins, owner)
      for (const issue of issues) {
        issue.assignees = issue.assignees.map(
          (a: { login: string; name: string | null; avatarUrl: string }) => ({
            ...a,
            name: nameMap.get(a.login) ?? null,
          })
        )
      }
    }

    return issues
  }

  async fetchRepoIssueDetail(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<RepoIssueDetail> {
    const octokit = await this.getOctokitForOwner(owner)
    const [issueResponse, commentsResponse] = await Promise.all([
      octokit.issues.get({ owner, repo, issue_number: issueNumber }),
      octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
        direction: 'asc',
      }),
    ])

    const issue = issueResponse.data

    const assigneeLogins = (issue.assignees || []).map(a => a.login)
    const nameMap =
      assigneeLogins.length > 0
        ? await this.fetchUserNames(assigneeLogins, owner)
        : new Map<string, string>()

    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      ...mapUserAuthorFields(issue.user),
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      labels: parseLabels(issue.labels || []),
      commentCount: issue.comments,
      assignees: (issue.assignees || []).map(assignee => ({
        login: assignee.login,
        name: nameMap.get(assignee.login) ?? null,
        avatarUrl: assignee.avatar_url,
      })),
      ...mapIssueBodyFields(issue),
      closedAt: issue.closed_at,
      comments: commentsResponse.data.map(comment => ({
        id: comment.id,
        ...mapUserAuthorFields(comment.user),
        body: comment.body || '',
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        url: comment.html_url,
      })),
    }
  }

  /**
   * Fetch open pull requests for a specific repository.
   */
  async fetchRepoPRs(
    owner: string,
    repo: string,
    state: 'open' | 'closed' = 'open'
  ): Promise<RepoPullRequest[]> {
    const octokit = await this.getOctokitForOwner(owner)
    const [response, viewer] = await Promise.all([
      octokit.pulls.list({
        owner,
        repo,
        state,
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      }),
      octokit.users.getAuthenticated().catch(() => null),
    ])

    const viewerLogin = viewer?.data?.login?.toLowerCase() || null

    const prs: RepoPullRequest[] = response.data.map(mapRawPRToRepoPR)

    await GitHubClient.batchProcess(prs, async pr => {
      try {
        const reviewsData = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        })
        const { approvalCount, iApproved } = this.countApprovals(reviewsData.data, viewerLogin)
        pr.approvalCount = approvalCount
        pr.iApproved = iApproved
      } catch (error) {
        console.debug(`Failed to fetch review state for ${owner}/${repo}#${pr.number}:`, error)
      }
    })

    return prs
  }

  /**
   * Fetch source and destination branch names for a PR.
   */
  async fetchPRBranches(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ headBranch: string; baseBranch: string; headSha: string }> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })

    const head = response.data.head || {}
    const base = response.data.base || {}
    return {
      headBranch: head.ref || '',
      baseBranch: base.ref || '',
      headSha: head.sha || '',
    }
  }

  /**
   * Fetch changed files for a pull request, including patch hunks when GitHub provides them.
   */
  async fetchPRFilesChanged(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PRFilesChangedSummary> {
    const octokit = await this.getOctokitForOwner(owner)
    const files = await octokit.paginate(octokit.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    })

    const normalizedFiles: PRFileChange[] = files.map(mapCommitFileToDiffFile)

    return {
      files: normalizedFiles,
      additions: normalizedFiles.reduce((sum, file) => sum + file.additions, 0),
      deletions: normalizedFiles.reduce((sum, file) => sum + file.deletions, 0),
      changes: normalizedFiles.reduce((sum, file) => sum + file.changes, 0),
    }
  }

  /**
   * Fetch detailed PR history stats for context menus and history panel.
   */
  async fetchPRHistory(owner: string, repo: string, pullNumber: number): Promise<PRHistorySummary> {
    const token = await this.getTokenForOwner(owner)

    const result = await graphql<PRHistoryGraphQLResponse>(PR_HISTORY_QUERY, {
      owner,
      repo,
      number: pullNumber,
      headers: {
        authorization: `token ${token}`,
      },
    })

    const pr = result.repository?.pullRequest
    if (!pr) {
      throw new Error(`PR #${pullNumber} not found in ${owner}/${repo}`)
    }

    const threads = pr.reviewThreads.nodes || []
    const threadsOutdated = threads.filter(thread => thread.isOutdated).length
    const threadsAddressed = threads.filter(thread => thread.isResolved).length
    const threadsUnaddressed = Math.max(0, pr.reviewThreads.totalCount - threadsAddressed)
    const reviewCommentCount = threads.reduce(
      (count, thread) => count + (thread.comments?.totalCount || 0),
      0
    )
    const issueCommentCount = pr.comments.totalCount
    const reviewers = this.buildReviewerSummaries(pr)
    const timeline = this.buildPRTimeline(pr, pullNumber)

    const linkedIssues: PRLinkedIssue[] = (pr.closingIssuesReferences?.nodes || []).map(n => ({
      number: n.number,
      title: n.title,
      url: n.url,
    }))

    return {
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
      commitCount: pr.commits.totalCount,
      issueCommentCount,
      reviewCommentCount,
      totalComments: issueCommentCount + reviewCommentCount,
      threadsTotal: pr.reviewThreads.totalCount,
      threadsOutdated,
      threadsAddressed,
      threadsUnaddressed,
      linkedIssues,
      reviewers,
      timeline,
    }
  }

  /**
   * Fetch status checks and commit status contexts for a pull request head SHA.
   */
  async fetchPRChecks(owner: string, repo: string, pullNumber: number): Promise<PRChecksSummary> {
    const octokit = await this.getOctokitForOwner(owner)

    const pullResponse = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })

    const headSha = pullResponse.data.head?.sha || ''
    if (!headSha) {
      throw new Error(`PR #${pullNumber} in ${owner}/${repo} is missing a head SHA`)
    }

    const [checkRunsResponse, combinedStatusResponse] = await Promise.all([
      octokit.checks.listForRef({
        owner,
        repo,
        ref: headSha,
        per_page: 100,
      }),
      octokit.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: headSha,
        per_page: 100,
      }),
    ])

    const checkRuns: PRCheckRunSummary[] = (checkRunsResponse.data.check_runs || []).map(
      mapCheckRunToSummary
    )

    const statusContexts: PRStatusContextSummary[] = (
      combinedStatusResponse.data.statuses || []
    ).map(mapStatusContextToSummary)

    const {
      total: totalCount,
      failed: failedCount,
      pending: pendingCount,
      successful: successfulCount,
      neutral: neutralCount,
    } = countCheckStatuses(checkRuns, statusContexts)
    const overallState = determineCheckOverallState({
      total: totalCount,
      failed: failedCount,
      pending: pendingCount,
      successful: successfulCount,
      combinedState: combinedStatusResponse.data.state,
    })

    return {
      headSha,
      overallState,
      totalCount,
      successfulCount,
      failedCount,
      pendingCount,
      neutralCount,
      checkRuns,
      statusContexts,
    }
  }
  /* v8 ignore stop */

  /**
   * Fetch full review threads and issue comments for a PR.
   * Returns all threads with their comments and all top-level issue comments.
   */
  /* v8 ignore start -- GraphQL PR thread/comment response null-guards */
  async fetchPRThreads(owner: string, repo: string, pullNumber: number): Promise<PRThreadsResult> {
    const token = await this.getTokenForOwner(owner)

    const query = `
      query PRThreads($owner: String!, $repo: String!, $number: Int!, $threadCursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100, after: $threadCursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isResolved
                isOutdated
                path
                line
                startLine
                diffSide
                comments(first: 50) {
                  nodes {
                    id
                    author { login avatarUrl }
                    body
                    bodyHTML
                    createdAt
                    updatedAt
                    url
                    diffHunk
                    reactionGroups {
                      content
                      viewerHasReacted
                      users {
                        totalCount
                      }
                    }
                  }
                }
              }
            }
            comments(first: 100) {
              nodes {
                id
                author { login avatarUrl }
                body
                bodyHTML
                createdAt
                updatedAt
                url
                reactionGroups {
                  content
                  viewerHasReacted
                  users {
                    totalCount
                  }
                }
              }
            }
            reviews(first: 100) {
              nodes {
                id
                state
                body
                bodyHTML
                submittedAt
                updatedAt
                url
                author { login avatarUrl }
              }
            }
          }
        }
      }
    `

    const result = await graphql<{
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: Array<{
              id: string
              isResolved: boolean
              isOutdated: boolean
              path: string | null
              line: number | null
              startLine: number | null
              diffSide: string | null
              comments: {
                nodes: Array<{
                  id: string
                  author: { login: string; avatarUrl: string } | null
                  body: string | null
                  bodyHTML: string | null
                  createdAt: string
                  updatedAt: string
                  url: string
                  diffHunk: string | null
                  reactionGroups: Array<{
                    content: string
                    viewerHasReacted: boolean
                    users: { totalCount: number }
                  }>
                }>
              }
            }>
          }
          comments: {
            nodes: Array<{
              id: string
              author: { login: string; avatarUrl: string } | null
              body: string | null
              bodyHTML: string | null
              createdAt: string
              updatedAt: string
              url: string
              reactionGroups: Array<{
                content: string
                viewerHasReacted: boolean
                users: { totalCount: number }
              }>
            }>
          }
          reviews: {
            nodes: Array<{
              id: string
              state: string
              body: string | null
              bodyHTML: string | null
              submittedAt: string | null
              updatedAt: string
              url: string
              author: { login: string; avatarUrl: string } | null
            }>
          }
        } | null
      } | null
    }>(query, {
      owner,
      repo,
      number: pullNumber,
      headers: { authorization: `token ${token}` },
    })

    const pr = result.repository?.pullRequest
    if (!pr) {
      throw new Error(`PR #${pullNumber} not found in ${owner}/${repo}`)
    }

    const threads: PRReviewThread[] = (pr.reviewThreads.nodes || []).map(t => ({
      id: t.id,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      path: t.path,
      line: t.line,
      startLine: t.startLine,
      diffSide: t.diffSide,
      comments: (t.comments.nodes || []).map(c =>
        mapReviewCommentFields(c, g => this.mapReactionGroups(g))
      ),
    }))

    const issueComments: PRReviewComment[] = (pr.comments.nodes || []).map(c =>
      mapReviewCommentFields(c, g => this.mapReactionGroups(g))
    )

    const reviews: PRReviewSummary[] = (pr.reviews.nodes || [])
      .filter(r => r.submittedAt && r.body)
      .map(r => ({
        id: r.id,
        state: r.state,
        ...resolveCommentAuthor(r.author),
        body: r.body || '',
        bodyHtml: r.bodyHTML || null,
        createdAt: r.submittedAt!,
        updatedAt: r.updatedAt,
        url: r.url,
      }))

    return { threads, issueComments, reviews }
  }
  /* v8 ignore stop */

  /**
   * Reply to a review thread on a PR.
   * Uses the `addPullRequestReviewComment` GraphQL mutation (reply variant).
   */
  async replyToReviewThread(
    owner: string,
    _pullNumber: number,
    threadId: string,
    body: string
  ): Promise<PRReviewComment> {
    const token = await this.getTokenForOwner(owner)

    const mutation = `
      mutation ReplyToThread($threadId: ID!, $body: String!) {
        addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
          comment {
            id
            author { login avatarUrl }
            body
            createdAt
            updatedAt
            url
          }
        }
      }
    `

    const result = await graphql<{
      addPullRequestReviewThreadReply: {
        comment: {
          id: string
          author: { login: string; avatarUrl: string } | null
          body: string
          createdAt: string
          updatedAt: string
          url: string
        }
      }
    }>(mutation, {
      threadId,
      body,
      headers: { authorization: `token ${token}` },
    })

    const c = result.addPullRequestReviewThreadReply.comment
    return {
      id: c.id,
      ...resolveCommentAuthor(c.author),
      body: c.body,
      bodyHtml: null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      url: c.url,
      diffHunk: null,
      reactions: [],
    }
  }

  /**
   * Resolve a review thread conversation.
   */
  async resolveReviewThread(owner: string, threadId: string): Promise<void> {
    const token = await this.getTokenForOwner(owner)

    const mutation = `
      mutation ResolveThread($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread { id isResolved }
        }
      }
    `

    await graphql<unknown>(mutation, {
      threadId,
      headers: { authorization: `token ${token}` },
    })
  }

  /**
   * Unresolve a previously resolved review thread conversation.
   */
  async unresolveReviewThread(owner: string, threadId: string): Promise<void> {
    const token = await this.getTokenForOwner(owner)

    const mutation = `
      mutation UnresolveThread($threadId: ID!) {
        unresolveReviewThread(input: { threadId: $threadId }) {
          thread { id isResolved }
        }
      }
    `

    await graphql<unknown>(mutation, {
      threadId,
      headers: { authorization: `token ${token}` },
    })
  }

  /**
   * Add a top-level issue comment on a PR.
   * Uses REST API since issue comments are simpler.
   */
  async addPRComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string
  ): Promise<PRReviewComment> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    })
    const c = response.data
    return {
      id: c.node_id || String(c.id),
      ...mapUserAuthorFields(c.user),
      body: c.body || '',
      bodyHtml: null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      url: c.html_url,
      diffHunk: null,
      reactions: [],
    }
  }

  /**
   * Add an emoji reaction to a PR comment (review comment or issue comment).
   */
  async addCommentReaction(
    owner: string,
    subjectId: string,
    content: PRCommentReactionContent
  ): Promise<void> {
    const token = await this.getTokenForOwner(owner)

    const mutation = `
      mutation AddCommentReaction($subjectId: ID!, $content: ReactionContent!) {
        addReaction(input: { subjectId: $subjectId, content: $content }) {
          reaction {
            content
          }
        }
      }
    `

    await graphql<unknown>(mutation, {
      subjectId,
      content,
      headers: { authorization: `token ${token}` },
    })
  }

  /**
   * Approve a pull request review.
   */
  async approvePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    body = 'Approved'
  ): Promise<void> {
    const octokit = await this.getOctokitForOwner(owner)
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'APPROVE',
      body,
    })
  }

  /**
   * Request a Copilot review on a pull request.
   */
  async requestCopilotReview(owner: string, repo: string, pullNumber: number): Promise<void> {
    const octokit = await this.getOctokitForOwner(owner)
    await octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers: ['copilot-pull-request-reviewer[bot]'],
    })
  }

  /**
   * List reviews on a pull request (for monitoring review status).
   */
  async listPRReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<
    { id: number; user: { login: string } | null; state: string; submitted_at: string | null }[]
  > {
    const octokit = await this.getOctokitForOwner(owner)
    const data = await octokit.paginate(octokit.pulls.listReviews, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    })
    return data.map(r => ({
      id: r.id,
      user: r.user ? { login: r.user.login } : null,
      state: r.state,
      submitted_at: r.submitted_at ?? null,
    }))
  }

  /**
   * Get a token for an owner (used by thread/comment methods).
   */
  private async getTokenForOwner(owner: string): Promise<string> {
    for (const account of this.getAccountsByOwnerPriority(owner)) {
      const token = await this.getGitHubCLIToken(account.username)
      /* v8 ignore start */
      if (token) {
        /* v8 ignore stop */
        return token
      }
    }

    /* v8 ignore start -- only throws when all accounts lack tokens */
    throw new Error('No authenticated GitHub account available')
    /* v8 ignore stop */
  }

  private mapReactionGroups(
    groups:
      | Array<{ content: string; viewerHasReacted: boolean; users: { totalCount: number } }>
      | null
      | undefined
  ): PRCommentReaction[] {
    const supported: PRCommentReactionContent[] = [
      'THUMBS_UP',
      'THUMBS_DOWN',
      'LAUGH',
      'HOORAY',
      'CONFUSED',
      'HEART',
      'ROCKET',
      'EYES',
    ]
    const groupMap = new Map((groups || []).map(group => [group.content, group]))

    return supported.map(content => {
      const group = groupMap.get(content)
      return {
        content,
        count: group?.users.totalCount || 0,
        viewerHasReacted: group?.viewerHasReacted || false,
      }
    })
  }

  /**
   * Fetch all repositories for a namespace (org or user account).
   * Tries repos.listForOrg first; on 404 falls back to repos.listForUser.
   * Returns which account was used so the UI can attribute the request.
   */
  /* v8 ignore start -- Org/team/overview fetch methods; error paths and null-guards */
  async fetchOrgRepos(org: string): Promise<OrgRepoResult> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue

      try {
        const result = await this.fetchAllOrgOrUserRepos(octokit, org)
        return { ...result, authenticatedAs: account.username }
      } catch (error) {
        console.warn(`Failed to fetch repos for ${org} with account ${account.username}:`, error)
        continue
      }
    }

    throw new Error(`Could not fetch repos for '${org}' - no authenticated account available`)
  }

  async fetchOrgMembers(org: string): Promise<OrgMemberResult> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue

      try {
        const result = await this.fetchAllOrgOrUserMembers(octokit, org)
        return { ...result, authenticatedAs: account.username }
      } catch (error) {
        console.warn(`Failed to fetch members for ${org} with account ${account.username}:`, error)
        continue
      }
    }

    throw new Error(`Could not fetch members for '${org}' - no authenticated account available`)
  }

  async fetchOrgTeams(org: string): Promise<OrgTeamResult> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue

      try {
        const teams = await octokit.paginate(octokit.teams.list, {
          org,
          per_page: 100,
        })

        return {
          teams: teams.map(team => ({
            slug: team.slug,
            name: team.name,
            description: team.description ?? null,
            memberCount: (team as { members_count?: number }).members_count ?? 0,
            repoCount: (team as { repos_count?: number }).repos_count ?? 0,
            url: team.html_url,
          })),
        }
      } catch (error) {
        console.warn(`Failed to fetch teams for ${org} with account ${account.username}:`, error)
        continue
      }
    }

    // Teams may not be available for user namespaces — return empty
    return { teams: [] }
  }

  async fetchTeamMembers(org: string, teamSlug: string): Promise<TeamMembersResult> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue

      try {
        const members = await octokit.paginate(octokit.teams.listMembersInOrg, {
          org,
          team_slug: teamSlug,
          per_page: 100,
        })

        const names = await this.fetchUserNames(
          members.map(m => m.login),
          org
        )

        return {
          members: members.map(m => ({
            login: m.login,
            name: names.get(m.login) ?? null,
            avatarUrl: m.avatar_url ?? null,
          })),
        }
      } catch (error) {
        console.warn(
          `Failed to fetch members for ${org}/${teamSlug} with account ${account.username}:`,
          error
        )
        continue
      }
    }

    return { members: [] }
  }

  async fetchOrgOverview(org: string): Promise<OrgOverviewResult> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue

      try {
        const { repos, isUserNamespace } = await this.fetchAllOrgOrUserRepos(octokit, org)
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const startOfDayIso = startOfDay.toISOString()

        const [openIssuesResult, openPrsResult] = await Promise.allSettled([
          octokit.search.issuesAndPullRequests({ q: `org:${org} is:issue is:open`, per_page: 1 }),
          octokit.search.issuesAndPullRequests({ q: `org:${org} is:pr is:open`, per_page: 1 }),
        ])

        const recentlyPushedRepos = repos.filter(
          repo => repo.pushedAt && new Date(repo.pushedAt).getTime() >= startOfDay.getTime()
        )

        const { activeReposToday, commitsToday, contributorMap } = await this.fetchTodayCommitStats(
          octokit,
          org,
          recentlyPushedRepos,
          startOfDayIso
        )

        return {
          metrics: buildOrgMetrics(
            org,
            repos,
            openIssuesResult,
            openPrsResult,
            activeReposToday,
            commitsToday,
            contributorMap
          ),
          authenticatedAs: account.username,
          isUserNamespace,
        }
      } catch (error) {
        console.warn(`Failed to fetch overview for ${org} with account ${account.username}:`, error)
        continue
      }
    }

    throw new Error(`Could not fetch overview for '${org}' - no authenticated account available`)
  }

  /** Gather today's commit stats across recently-pushed repos. */
  private async fetchTodayCommitStats(
    octokit: Octokit,
    org: string,
    recentlyPushedRepos: OrgRepo[],
    startOfDayIso: string
  ): Promise<{
    activeReposToday: number
    commitsToday: number
    contributorMap: Map<string, OrgContributorToday>
  }> {
    let activeReposToday = 0
    let commitsToday = 0
    const contributorMap = new Map<string, OrgContributorToday>()

    for (const repo of recentlyPushedRepos) {
      const commits = await octokit.paginate(octokit.repos.listCommits, {
        owner: org,
        repo: repo.name,
        since: startOfDayIso,
        per_page: 100,
      })

      if (commits.length === 0) continue

      activeReposToday++
      commitsToday += commits.length

      for (const commit of commits) {
        const login = resolveContributorLogin(commit)
        const existing = contributorMap.get(login)
        contributorMap.set(login, mergeContributorEntry(login, commit, existing))
      }
    }

    return { activeReposToday, commitsToday, contributorMap }
  }

  /**
   * Try org API first, fall back to user API on 404.
   */
  private async fetchAllOrgOrUserRepos(
    octokit: Octokit,
    namespace: string
  ): Promise<{ repos: OrgRepo[]; isUserNamespace: boolean }> {
    try {
      const repos = await this.paginateRepos(octokit, namespace, 'org')
      return { repos, isUserNamespace: false }
    } catch (error: unknown) {
      const is404 =
        error instanceof Error &&
        (error.message.includes('404') || error.message.includes('Not Found'))
      if (!is404) throw error

      // Namespace is likely a user account — retry with user endpoint
      console.info(`Namespace '${namespace}' is not an org, trying user repos...`)
      const repos = await this.paginateRepos(octokit, namespace, 'user')
      return { repos, isUserNamespace: true }
    }
  }

  private async fetchAllOrgOrUserMembers(
    octokit: Octokit,
    namespace: string
  ): Promise<{ members: OrgMember[]; isUserNamespace: boolean }> {
    try {
      const members = await octokit.paginate(octokit.orgs.listMembers, {
        org: namespace,
        per_page: 100,
      })

      const names = await this.fetchUserNames(
        members.map(m => m.login),
        namespace
      )

      return {
        members: members.map(member => ({
          login: member.login,
          name: names.get(member.login) ?? null,
          avatarUrl: member.avatar_url,
          url: member.html_url,
          type: member.type,
        })),
        isUserNamespace: false,
      }
    } catch (error: unknown) {
      const is404 =
        error instanceof Error &&
        (error.message.includes('404') || error.message.includes('Not Found'))
      if (!is404) throw error

      const user = await octokit.users.getByUsername({ username: namespace })
      return {
        members: [
          {
            login: user.data.login,
            name: user.data.name ?? null,
            avatarUrl: user.data.avatar_url,
            url: user.data.html_url,
            type: user.data.type,
          },
        ],
        isUserNamespace: true,
      }
    }
  }

  /**
   * Batch-fetch real names for a list of GitHub logins via GraphQL aliases.
   * Returns a Map<login, name>. Logins without a name are omitted.
   */
  private async fetchUserNames(logins: string[], org: string): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    if (logins.length === 0) return names

    try {
      const token = await this.getTokenForOwner(org)
      // GraphQL aliases must be valid identifiers — prefix with 'u' and replace non-alnum
      const sanitize = (login: string) => 'u' + login.replace(/[^a-zA-Z0-9]/g, '_')
      // Process in chunks of 50 to stay within query size limits
      for (let i = 0; i < logins.length; i += 50) {
        const chunk = logins.slice(i, i + 50)
        const fragments = chunk
          .map(login => `${sanitize(login)}: user(login: "${login}") { login name }`)
          .join('\n')
        const query = `query { ${fragments} }`
        const result = await graphql<Record<string, { login: string; name: string | null } | null>>(
          query,
          { headers: { authorization: `token ${token}` } }
        )
        for (const data of Object.values(result)) {
          if (data?.name) names.set(data.login, data.name)
        }
      }
    } catch (error) {
      console.warn('[fetchUserNames] GraphQL batch name lookup failed:', error)
    }

    return names
  }

  /**
   * Paginate through all repos for an org or user namespace.
   */
  private async paginateRepos(
    octokit: Octokit,
    namespace: string,
    kind: 'org' | 'user'
  ): Promise<OrgRepo[]> {
    const repos: OrgRepo[] = []
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
        repos.push(mapRawRepoToOrgRepo(repo))
      }

      hasMore = response.data.length >= perPage
    }

    return repos
  }

  /**
   * Core fetch method with mode support
   */
  private async fetchPRs(
    mode: PRSearchMode,
    onProgress?: ProgressCallback
  ): Promise<PullRequest[]> {
    const allPrs: PullRequest[] = []
    let authenticationErrors = 0
    const totalAccounts = this.config.accounts.length
    const report: ProgressCallback = ensureCallback(onProgress)

    // Process each configured GitHub account with its own token
    for (let i = 0; i < this.config.accounts.length; i++) {
      const account = this.config.accounts[i]
      const { username, org } = account
      const currentAccount = i + 1

      console.debug(`Checking GitHub account '${username}' for org '${org}' (mode: ${mode})...`)

      report({
        currentAccount,
        totalAccounts,
        accountName: username,
        org,
        status: 'authenticating',
      })

      // Get Octokit instance for this specific account
      const octokit = await this.getOctokit(username)
      if (!octokit) {
        console.warn(`⚠️  Skipping account '${username}' - no GitHub CLI authentication found`)
        report({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'error',
          error: 'No GitHub CLI authentication found',
        })
        authenticationErrors++
        continue
      }

      report({ currentAccount, totalAccounts, accountName: username, org, status: 'fetching' })

      try {
        const prs = await this.fetchPRsForAccount(octokit, org, username, mode)
        allPrs.push(...prs)

        console.debug(`✓ Found ${prs.length} PRs for ${username} in ${org}`)

        report({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'done',
          prsFound: prs.length,
        })
      } catch (error) {
        const errorMsg = getErrorMessage(error)
        // Only warn for non-404 errors (404s likely mean no access or org doesn't exist)
        if (!errorMsg.includes('404')) {
          console.warn(`⚠️  Error fetching PRs for ${username} in ${org}:`, errorMsg)
        } else {
          console.debug(`ℹ️  No access or org not found for ${username} in ${org}`)
        }
        report({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'error',
          error: errorMsg,
        })
        continue
      }
    }

    // If all accounts failed due to auth, throw error
    if (authenticationErrors === this.config.accounts.length) {
      throw new Error(
        'GitHub CLI authentication not available for any configured account. Please run: gh auth login'
      )
    }

    // Sort recently-merged PRs by merge date (newest first) after combining all accounts
    if (mode === 'recently-merged') {
      allPrs.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA // Descending (newest first)
      })
    }

    // Deduplicate across accounts — the same PR can appear from multiple accounts
    const seenUrls = new Set<string>()
    const dedupedPrs = allPrs.filter(pr => {
      if (seenUrls.has(pr.url)) return false
      seenUrls.add(pr.url)
      return true
    })

    return dedupedPrs
  }

  /**
   * Fetch PRs for a specific account and org using Octokit
   */
  private async resolveOrgAvatar(octokit: Octokit, org: string): Promise<string | null> {
    const cached = orgAvatarCache.get(org)
    if (cached !== undefined) return cached

    try {
      const orgData = await octokit.orgs.get({ org })
      orgAvatarCache.set(org, orgData.data.avatar_url)
      return orgData.data.avatar_url
    } catch {
      try {
        const userData = await octokit.users.getByUsername({ username: org })
        orgAvatarCache.set(org, userData.data.avatar_url)
        return userData.data.avatar_url
      } catch {
        console.debug(`Could not fetch avatar for ${org}`)
        orgAvatarCache.set(org, null)
        return null
      }
    }
  }

  /** Execute PR search queries and collect unique results. */
  private async executeSearchQueries(
    octokit: Octokit,
    queries: string[],
    orgAvatarUrl: string | null,
    org: string
  ): Promise<PullRequest[]> {
    const seenUrls = new Set<string>()
    const allPrs: PullRequest[] = []
    for (const query of queries) {
      try {
        const searchResults = await octokit.search.issuesAndPullRequests({
          q: query,
          per_page: 100,
          sort: 'updated',
          order: 'desc',
        })

        console.debug(`Search found ${searchResults.data.items.length} results for: ${query}`)

        for (const item of searchResults.data.items) {
          if (seenUrls.has(item.html_url)) continue
          seenUrls.add(item.html_url)

          const mapped = mapSearchItemToPullRequest(item, orgAvatarUrl, org)
          if (!mapped) {
            console.debug(`Invalid PR URL format: ${item.html_url}`)
            continue
          }
          allPrs.push(mapped)
        }
      } catch (error) {
        const errorMsg = getErrorMessage(error)
        if (!errorMsg.includes('404')) {
          console.warn(`Search query failed: ${query}`, error)
        } else {
          console.debug(`No search results (404) for: ${query}`)
        }
      }
    }
    return allPrs
  }

  private async fetchPRsForAccount(
    octokit: Octokit,
    org: string,
    username: string,
    mode: PRSearchMode = 'my-prs'
  ): Promise<PullRequest[]> {
    const orgAvatarUrl = await this.resolveOrgAvatar(octokit, org)

    // Compute mergedAfter date for recently-merged mode
    let mergedAfter: string | undefined
    if (mode === 'recently-merged') {
      const mergedAfterDate = new Date()
      mergedAfterDate.setDate(mergedAfterDate.getDate() - this.recentlyMergedDays)
      mergedAfter = mergedAfterDate.toISOString().split('T')[0]
    }

    const queries = buildPRSearchQueries(username, org, mode, mergedAfter)
    const allPrs = await this.executeSearchQueries(octokit, queries, orgAvatarUrl, org)

    // Batch fetch reviews in parallel (with concurrency limit)
    const prsWithMeta = allPrs as (PullRequest & {
      _owner: string
      _repo: string
      _prNumber: number
    })[]

    await GitHubClient.batchProcess(prsWithMeta, async pr => {
      try {
        const [reviewsData, prData] = await Promise.all([
          octokit.pulls.listReviews({
            owner: pr._owner,
            repo: pr._repo,
            pull_number: pr._prNumber,
          }),
          octokit.pulls.get({
            owner: pr._owner,
            repo: pr._repo,
            pull_number: pr._prNumber,
          }),
        ])

        const reviews = reviewsData.data
        const { approvalCount, iApproved } = this.countApprovals(reviews, username)

        pr.approvalCount = approvalCount
        pr.iApproved = iApproved
        pr.headBranch = prData.data.head?.ref || ''
        pr.baseBranch = prData.data.base?.ref || ''
      } catch (error) {
        console.debug(`Failed to get reviews for PR #${pr._prNumber}:`, error)
      }
    })

    // Batch-fetch thread stats via a single GraphQL query per owner (more reliable than per-PR calls)
    await this.fetchBatchThreadStats(prsWithMeta)

    // Clean up metadata and filter by mode
    return allPrs
      .map(pr => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _owner, _repo, _prNumber, ...cleanPr } = pr as PullRequest & {
          _owner?: string
          _repo?: string
          _prNumber?: number
        }
        return cleanPr
      })
      .filter(pr => {
        if (mode === 'needs-review') return !pr.iApproved
        if (mode === 'need-a-nudge') return pr.iApproved
        return true
      })
  }

  /**
   * Batch-fetch review thread stats for multiple PRs using a single GraphQL query per owner.
   * Uses aliases (like fetchUserNames) so one request covers all PRs, avoiding per-PR failures.
   */
  private async fetchBatchThreadStats(
    prs: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>
  ): Promise<void> {
    if (prs.length === 0) return

    // Group PRs by owner for token selection
    const prsByOwner = new Map<string, typeof prs>()
    for (const pr of prs) {
      const list = prsByOwner.get(pr._owner) || []
      list.push(pr)
      prsByOwner.set(pr._owner, list)
    }

    for (const [owner, ownerPrs] of prsByOwner) {
      try {
        const token = await this.getTokenForOwner(owner)
        await this.fetchThreadStatsChunked(ownerPrs, owner, token)
      } catch (error) {
        console.warn(`[fetchBatchThreadStats] Failed for owner ${owner}:`, error)
      }
    }
  }

  /** Process thread stats in chunks of 20 for a single owner. */
  private async fetchThreadStatsChunked(
    ownerPrs: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>,
    owner: string,
    token: string
  ): Promise<void> {
    type ThreadStatsResult = Record<
      string,
      {
        pullRequest: {
          reviewThreads: { totalCount: number; nodes: Array<{ isResolved: boolean }> }
        } | null
      } | null
    >

    for (let i = 0; i < ownerPrs.length; i += 20) {
      const chunk = ownerPrs.slice(i, i + 20)
      const fragments = chunk
        .map((pr, idx) => {
          const alias = `pr${i + idx}`
          return `${alias}: repository(owner: "${owner}", name: "${pr._repo}") {
              pullRequest(number: ${pr._prNumber}) {
                reviewThreads(first: 100) {
                  totalCount
                  nodes { isResolved }
                }
              }
            }`
        })
        .join('\n')

      const query = `query { ${fragments} }`
      const result = await graphql<ThreadStatsResult>(query, {
        headers: { authorization: `token ${token}` },
      })

      for (let idx = 0; idx < chunk.length; idx++) {
        const data = result[`pr${i + idx}`]?.pullRequest
        if (!data) continue
        const threads = data.reviewThreads.nodes || []
        const addressed = threads.filter(t => t.isResolved).length
        chunk[idx].threadsTotal = data.reviewThreads.totalCount
        chunk[idx].threadsAddressed = addressed
        chunk[idx].threadsUnaddressed = Math.max(0, data.reviewThreads.totalCount - addressed)
      }
    }
  }

  /**
   * Detect SFL workflows and fetch their latest run status for a repository.
   * Returns an SFLRepoStatus indicating whether SFL is enabled and per-workflow health.
   */
  async fetchSFLStatus(owner: string, repo: string): Promise<SFLRepoStatus> {
    const octokit = await this.getOctokitForOwner(owner)

    const workflowsResponse = await octokit.actions.listRepoWorkflows({
      owner,
      repo,
      per_page: 100,
    })

    const allWorkflows = workflowsResponse.data.workflows
    const sflWorkflows = allWorkflows.filter(w =>
      SFL_CORE_WORKFLOW_FRAGMENTS.some(fragment => w.name.toLowerCase().includes(fragment))
    )

    if (sflWorkflows.length === 0) {
      return { isSFLEnabled: false, overallStatus: 'unknown', workflows: [] }
    }

    // Fetch latest run for each SFL workflow in parallel
    const workflowInfos: SFLWorkflowInfo[] = await Promise.all(
      sflWorkflows.map(async (w): Promise<SFLWorkflowInfo> => {
        try {
          const runsResponse = await octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: w.id,
            per_page: 1,
          })
          const latestRun = runsResponse.data.workflow_runs[0] ?? null
          return {
            id: w.id,
            name: w.name,
            state: w.state,
            latestRun: latestRun
              ? {
                  status: latestRun.status ?? 'unknown',
                  conclusion: latestRun.conclusion ?? null,
                  createdAt: latestRun.created_at,
                  url: latestRun.html_url,
                }
              : null,
          }
        } catch {
          return { id: w.id, name: w.name, state: w.state, latestRun: null }
        }
      })
    )

    return {
      isSFLEnabled: true,
      overallStatus: deriveSFLOverallStatus(workflowInfos),
      workflows: workflowInfos,
    }
  }

  /**
   * Fetch a summary of a user's recent activity within an org.
   * Uses the search API for PRs, repo history for commit counts, and the events API for recent activity.
   */
  async fetchUserActivity(org: string, username: string): Promise<UserActivitySummary> {
    const octokit = await this.getOctokitForOwner(org)

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
          q: `org:${org} is:pr author:${username} is:open`,
          per_page: 15,
          sort: 'updated',
          order: 'desc',
        })
        .catch(() => emptySearch),
      octokit.search
        .issuesAndPullRequests({
          q: `org:${org} is:pr author:${username} is:merged merged:>=${ninetyDaysAgo}`,
          per_page: 15,
          sort: 'updated',
          order: 'desc',
        })
        .catch(() => emptySearch),
      octokit.search
        .issuesAndPullRequests({
          q: `org:${org} is:pr reviewed-by:${username} -author:${username} sort:updated`,
          per_page: 10,
          sort: 'updated',
          order: 'desc',
        })
        .catch(() => emptySearch),
      octokit.activity
        .listPublicEventsForUser({
          username,
          per_page: 100,
        })
        .catch(() => ({ data: [] as Array<Record<string, unknown>> })),
      this.fetchAllOrgOrUserRepos(octokit, org).catch(() => null),
      (async () => {
        try {
          const token = await this.getTokenForOwner(org)
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
              login: username,
              headers: { authorization: `token ${token}` },
            }
          )
        } catch {
          return null
        }
      })(),
      octokit.orgs.getMembershipForUser({ org, username }).catch(() => null),
      octokit
        .paginate(octokit.teams.list, { org, per_page: 100 })
        .then(async teams => {
          const memberTeams: string[] = []
          for (const team of teams) {
            try {
              await octokit.teams.getMembershipForUserInOrg({ org, team_slug: team.slug, username })
              memberTeams.push(team.name)
            } catch {
              /* not a member of this team */
            }
          }
          return memberTeams
        })
        .catch(() => [] as string[]),
      // Fetch all contribution dates (commits + PRs + issues) via search API
      this.searchUserActivityDates(octokit, org, username).catch(() => [] as string[]),
    ])

    const recentPRsAuthored = [
      ...authoredOpen.data.items.map(mapSearchItemToUserPR),
      ...authoredMerged.data.items.map(mapSearchItemToUserPR),
    ]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 15)

    // Filter events to only those in the org
    const orgPrefix = `${org}/`
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

    const repoCommitsToday = await this.countRepoCommitsForUser(
      octokit,
      org,
      recentlyPushedRepos,
      startOfDayIso,
      username
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
      const repo = extractRepoFromUrl(item.repository_url as string)
      if (repo) activeRepoSet.add(repo)
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

  /** Count today's commits by a specific user across repos. */
  private async countRepoCommitsForUser(
    octokit: Octokit,
    org: string,
    repos: OrgRepo[],
    startOfDayIso: string,
    username: string
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
        total += commits.filter(commit => commit.author?.login === username).length
      } catch {
        // Ignore per-repo failures and fall back to the events feed if needed.
      }
    }
    return total
  }

  /**
   * Search for all contribution dates (commits, PRs, issues) by a user across an org.
   * Runs three search streams in parallel, each returning up to 1000 results.
   */
  private async searchUserActivityDates(
    octokit: Octokit,
    org: string,
    username: string
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
      // Commits
      paginateSearch(
        opts => octokit.search.commits(opts),
        `org:${org} author:${username} committer-date:>=${since}`,
        'committer-date',
        (item: Record<string, unknown>) => {
          const commit = item.commit as
            | { committer?: { date?: string }; author?: { date?: string } }
            | undefined
          return commit?.committer?.date ?? commit?.author?.date
        }
      ).catch(() => [] as string[]),
      // Pull requests
      paginateSearch(
        opts => octokit.search.issuesAndPullRequests(opts),
        `org:${org} is:pr author:${username} created:>=${since}`,
        'created',
        (item: Record<string, unknown>) => item.created_at as string | undefined
      ).catch(() => [] as string[]),
      // Issues
      paginateSearch(
        opts => octokit.search.issuesAndPullRequests(opts),
        `org:${org} is:issue author:${username} created:>=${since}`,
        'created',
        (item: Record<string, unknown>) => item.created_at as string | undefined
      ).catch(() => [] as string[]),
    ])

    return [...commitDates, ...prDates, ...issueDates]
  }

  async getRateLimit(
    org: string
  ): Promise<{ limit: number; remaining: number; reset: number; used: number }> {
    for (const account of this.getAccountsByOwnerPriority(org)) {
      const octokit = await this.getOctokit(account.username)
      if (!octokit) continue
      try {
        const { data } = await octokit.rateLimit.get()
        const core = data.resources.core
        return { limit: core.limit, remaining: core.remaining, reset: core.reset, used: core.used }
      } catch {
        continue
      }
    }
    throw new Error(`Could not fetch rate limit for '${org}' - no authenticated account available`)
  }
}
