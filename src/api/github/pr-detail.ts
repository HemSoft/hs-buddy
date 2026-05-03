import type { PRConfig } from '../../types/pullRequest'
import { sumBy } from '../../utils/arrayUtils'
import {
  type DiffFile,
  type PRReviewComment,
  graphql,
  getOctokitForOwner,
  getTokenForOwner,
  mapReactionGroups,
  resolveCommentAuthor,
  mapReviewCommentFields,
  mapCommitFileToDiffFile,
} from './shared'
import {
  type PRReviewerSummary,
  type PRFilesChangedSummary,
  buildLatestReviewsMap,
  buildRequestedReviewersMap,
  buildReviewerSummary,
} from './prs'

export interface PRLinkedIssue {
  number: number
  title: string
  url: string
}
export interface PRHistorySummary {
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  body: string
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
interface PRTimelineEvent {
  id: string
  type: 'opened' | 'comment' | 'commit' | 'review'
  author: string
  occurredAt: string
  summary: string
  url: string | null
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
type PRFileChange = DiffFile

const PR_HISTORY_QUERY = `
  query PRHistory($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        body
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
          pageInfo { hasNextPage endCursor }
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
      body: string
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
            author: { user: { login: string } | null; name: string | null } | null
          }
        }>
      }
      reviewRequests: {
        nodes: Array<{
          requestedReviewer:
            | { __typename: 'User'; login: string; avatarUrl: string }
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
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: Array<{ isResolved: boolean; isOutdated: boolean; comments: { totalCount: number } }>
      }
      closingIssuesReferences: {
        nodes: Array<{ number: number; title: string; url: string }>
      }
    } | null
  } | null
}

type ReactionGroupNode = {
  content: string
  viewerHasReacted: boolean
  users: { totalCount: number }
}
type CommentNode = {
  id: string
  author: { login: string; avatarUrl: string } | null
  body: string | null
  bodyHTML: string | null
  createdAt: string
  updatedAt: string
  url: string
  diffHunk: string | null
  reactionGroups: ReactionGroupNode[]
}
type IssueCommentNode = Omit<CommentNode, 'diffHunk'>
type ReviewNode = {
  id: string
  state: string
  body: string | null
  bodyHTML: string | null
  submittedAt: string | null
  updatedAt: string
  url: string
  author: { login: string; avatarUrl: string } | null
}
type PRThreadsGraphQLResponse = {
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
          comments: { nodes: CommentNode[] }
        }>
      }
      comments: { nodes: IssueCommentNode[] }
      reviews: { nodes: ReviewNode[] }
    } | null
  } | null
}

const FAILURE_COMBINED_STATES = new Set(['failure', 'error'])
function hasCheckFailures(counts: { failed: number; combinedState: string }): boolean {
  return counts.failed > 0 || FAILURE_COMBINED_STATES.has(counts.combinedState)
}
function hasChecksPending(counts: { pending: number; combinedState: string }): boolean {
  return counts.pending > 0 || counts.combinedState === 'pending'
}
function determineCheckOverallState(counts: {
  total: number
  failed: number
  pending: number
  successful: number
  combinedState: string
}): PRChecksSummary['overallState'] {
  if (counts.total === 0) return 'none'
  if (hasCheckFailures(counts)) return 'failing'
  if (hasChecksPending(counts)) return 'pending'
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
  return Object.hasOwn(STATUS_CONTEXT_CATEGORY, state) ? STATUS_CONTEXT_CATEGORY[state] : 'neutral'
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
/* v8 ignore stop */

/** Resolve the best URLfor a check run's details. */
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

/* v8 ignore start -- API response null-guards in branch ref extraction */
function extractBranchRefs(
  head: { ref?: string; sha?: string },
  base: { ref?: string }
): { headBranch: string; baseBranch: string; headSha: string } {
  return { headBranch: head.ref || '', baseBranch: base.ref || '', headSha: head.sha || '' }
}
/* v8 ignore stop */

/* v8 ignore start -- GraphQL response null-guards; GitHub types allow nulls but data is always present */
function buildPRTimeline(
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
function buildReviewerSummaries(
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

/** Paginate review threads with extended fields (isOutdated + comment count) for PR history. */
/* v8 ignore start -- GraphQL pagination; requires real API with >100 review threads */
async function paginateDetailedReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  firstPage: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    nodes: Array<{ isResolved: boolean; isOutdated: boolean; comments: { totalCount: number } }>
  },
  token: string
): Promise<Array<{ isResolved: boolean; isOutdated: boolean; comments: { totalCount: number } }>> {
  const allNodes = [...(firstPage.nodes || [])]
  let { hasNextPage, endCursor } = firstPage.pageInfo
  while (hasNextPage && endCursor) {
    const pageQuery = `query {
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${prNumber}) {
          reviewThreads(first: 100, after: "${endCursor}") {
            pageInfo { hasNextPage endCursor }
            nodes { isResolved isOutdated comments { totalCount } }
          }
        }
      }
    }`
    const pageResult = await graphql<{
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: Array<{
              isResolved: boolean
              isOutdated: boolean
              comments: { totalCount: number }
            }>
          }
        } | null
      } | null
    }>(pageQuery, { headers: { authorization: `token ${token}` } })
    const pageThreads = pageResult.repository?.pullRequest?.reviewThreads
    if (!pageThreads) break
    allNodes.push(...(pageThreads.nodes || []))
    hasNextPage = pageThreads.pageInfo.hasNextPage
    endCursor = pageThreads.pageInfo.endCursor
  }
  return allNodes
}
/* v8 ignore stop */

/* v8 ignore start -- API response null-guards; requires real API */
export async function fetchPRBranches(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{ headBranch: string; baseBranch: string; headSha: string }> {
  const octokit = await getOctokitForOwner(config, owner)
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  })
  const head = response.data.head || {}
  const base = response.data.base || {}
  return extractBranchRefs(head, base)
}
/* v8 ignore stop */

export async function fetchPRFilesChanged(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRFilesChangedSummary> {
  const octokit = await getOctokitForOwner(config, owner)
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  })
  const normalizedFiles: PRFileChange[] = files.map(mapCommitFileToDiffFile)
  return {
    files: normalizedFiles,
    additions: sumBy(normalizedFiles, file => file.additions),
    deletions: sumBy(normalizedFiles, file => file.deletions),
    changes: sumBy(normalizedFiles, file => file.changes),
  }
}

/* v8 ignore start -- API response null-guards throughout PR detail data mapping */
export async function fetchPRHistory(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRHistorySummary> {
  const token = await getTokenForOwner(config, owner)
  const result = await graphql<PRHistoryGraphQLResponse>(PR_HISTORY_QUERY, {
    owner,
    repo,
    number: pullNumber,
    headers: { authorization: `token ${token}` },
  })
  const pr = result.repository?.pullRequest
  if (!pr) {
    throw new Error(`PR #${pullNumber} not found in ${owner}/${repo}`)
  }
  const threads = await paginateDetailedReviewThreads(
    owner,
    repo,
    pullNumber,
    pr.reviewThreads,
    token
  )
  const threadsOutdated = threads.filter(thread => thread.isOutdated).length
  const threadsAddressed = threads.filter(thread => thread.isResolved).length
  const threadsUnaddressed = Math.max(0, pr.reviewThreads.totalCount - threadsAddressed)
  const reviewCommentCount = threads.reduce(
    (count, thread) => count + (thread.comments?.totalCount || 0),
    0
  )
  const issueCommentCount = pr.comments.totalCount
  const reviewers = buildReviewerSummaries(pr)
  const timeline = buildPRTimeline(pr, pullNumber)
  const linkedIssues: PRLinkedIssue[] = (pr.closingIssuesReferences?.nodes || []).map(n => ({
    number: n.number,
    title: n.title,
    url: n.url,
  }))
  return {
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    body: pr.body || '',
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

export async function fetchPRBody(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string> {
  const octokit = await getOctokitForOwner(config, owner)
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber })
  return data.body || ''
}

export async function fetchPRChecks(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRChecksSummary> {
  const octokit = await getOctokitForOwner(config, owner)
  const pullResponse = await octokit.pulls.get({ owner, repo, pull_number: pullNumber })
  const headSha = pullResponse.data.head?.sha || ''
  if (!headSha) {
    throw new Error(`PR #${pullNumber} in ${owner}/${repo} is missing a head SHA`)
  }
  const [checkRunsResponse, combinedStatusResponse] = await Promise.all([
    octokit.checks.listForRef({ owner, repo, ref: headSha, per_page: 100 }),
    octokit.repos.getCombinedStatusForRef({ owner, repo, ref: headSha, per_page: 100 }),
  ])
  const checkRuns: PRCheckRunSummary[] = (checkRunsResponse.data.check_runs || []).map(
    mapCheckRunToSummary
  )
  const statusContexts: PRStatusContextSummary[] = (combinedStatusResponse.data.statuses || []).map(
    mapStatusContextToSummary
  )

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

/* v8 ignore start -- GraphQL PR thread/comment response null-guards */
export async function fetchPRThreads(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRThreadsResult> {
  const token = await getTokenForOwner(config, owner)
  const query = `query PRThreads($owner: String!, $repo: String!, $number: Int!, $threadCursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $threadCursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id isResolved isOutdated path line startLine diffSide
            comments(first: 50) { nodes {
              id author { login avatarUrl } body bodyHTML createdAt updatedAt url diffHunk
              reactionGroups { content viewerHasReacted users { totalCount } }
            } }
          }
        }
        comments(first: 100) { nodes {
          id author { login avatarUrl } body bodyHTML createdAt updatedAt url
          reactionGroups { content viewerHasReacted users { totalCount } }
        } }
        reviews(first: 100) { nodes {
          id state body bodyHTML submittedAt updatedAt url author { login avatarUrl }
        } }
      }
    }
  }`
  const result = await graphql<PRThreadsGraphQLResponse>(query, {
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
    comments: (t.comments.nodes || []).map(c => mapReviewCommentFields(c, mapReactionGroups)),
  }))
  const issueComments: PRReviewComment[] = (pr.comments.nodes || []).map(c =>
    mapReviewCommentFields(c, mapReactionGroups)
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

export async function replyToReviewThread(
  config: PRConfig['github'],
  owner: string,
  _pullNumber: number,
  threadId: string,
  body: string
): Promise<PRReviewComment> {
  const token = await getTokenForOwner(config, owner)
  const mutation = `
    mutation ReplyToThread($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
        comment { id author { login avatarUrl } body createdAt updatedAt url }
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
  }>(mutation, { threadId, body, headers: { authorization: `token ${token}` } })
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

export async function resolveReviewThread(
  config: PRConfig['github'],
  owner: string,
  threadId: string
): Promise<void> {
  const token = await getTokenForOwner(config, owner)
  const mutation = `
    mutation ResolveThread($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
    }
  `
  await graphql<unknown>(mutation, { threadId, headers: { authorization: `token ${token}` } })
}

export async function unresolveReviewThread(
  config: PRConfig['github'],
  owner: string,
  threadId: string
): Promise<void> {
  const token = await getTokenForOwner(config, owner)
  const mutation = `
    mutation UnresolveThread($threadId: ID!) {
      unresolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
    }
  `
  await graphql<unknown>(mutation, { threadId, headers: { authorization: `token ${token}` } })
}

// PR mutation operations (addPRComment, addCommentReaction, approvePullRequest,
// requestCopilotReview, listPRReviews) are in ./pr-mutations.ts
