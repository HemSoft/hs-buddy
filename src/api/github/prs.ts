import type { Octokit } from '@octokit/rest'
import type { PullRequest, PRConfig } from '../../types/pullRequest'
import { getErrorMessage } from '../../utils/errorUtils'
import {
  type DiffFile,
  type ProgressCallback,
  graphql,
  getOctokit,
  getOctokitForOwner,
  getGitHubCLIToken,
  resolveOrgAvatar,
  batchProcess,
  pickFirst,
  includesLoginIgnoreCase,
  mapUserAuthorFields,
  ensureCallback,
  mapPRLabel,
} from './shared'
import { fetchUnresolvedThreadCounts, fetchBatchThreadStats } from './pr-threads'

export { fetchBatchThreadStats }

// ── Types ────────────────────────────────────────────────────────────

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
  changesRequestedCount: number
  threadsUnaddressed: number | null
  iApproved: boolean
}

type PRFileChange = DiffFile

export interface PRFilesChangedSummary {
  files: PRFileChange[]
  additions: number
  deletions: number
  changes: number
}

export type PRSearchMode = 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge'

export interface PRReviewerSummary {
  login: string
  name: string | null
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'changes-requested' | 'commented' | 'reviewed'
  updatedAt: string | null
}

// ── Internal types ───────────────────────────────────────────────────

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

type ReviewRequestNode = {
  requestedReviewer:
    | { __typename: 'User'; login: string; avatarUrl: string }
    | { __typename: string }
    | null
}

interface ViewerPRNode {
  number: number
  title: string
  url: string
  state: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
  mergedAt: string | null
  author: { login: string; avatarUrl: string } | null
  assignees: { totalCount: number }
  repository: { nameWithOwner: string; owner: { login: string } }
  headRefName: string
  baseRefName: string
}

interface ViewerPRsResponse {
  viewer: {
    pullRequests: {
      totalCount: number
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: ViewerPRNode[]
    }
  }
}

// ── Constants ────────────────────────────────────────────────────────

const REVIEWER_STATUS_MAP: Record<string, PRReviewerSummary['status']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  COMMENTED: 'commented',
}

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

const VIEWER_PRS_QUERY = `
  query ViewerPRs($states: [PullRequestState!]!, $first: Int!, $after: String) {
    viewer {
      pullRequests(first: $first, states: $states, orderBy: {field: UPDATED_AT, direction: DESC}, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          state
          createdAt
          updatedAt
          closedAt
          mergedAt
          author { login avatarUrl }
          assignees(first: 10) { totalCount }
          repository { nameWithOwner owner { login } }
          headRefName
          baseRefName
        }
      }
    }
  }
`

// ── Helper functions ─────────────────────────────────────────────────

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
  existing: { submittedAt: string | null } | undefined
): boolean {
  return !existing || (submittedAt || '') > (existing.submittedAt || '')
}

export function buildLatestReviewsMap(
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

/** Type guard: is this reviewer a User node with login and avatarUrl? */
function isUserReviewer(
  reviewer: unknown
): reviewer is { login: string; avatarUrl?: string | null; name?: string | null } {
  if (!reviewer) return false
  const r = reviewer as Record<string, unknown>
  return r.__typename === 'User' && 'login' in r && 'avatarUrl' in r
}

export function buildRequestedReviewersMap(
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

function resolveReviewerStatus(state: string | undefined): PRReviewerSummary['status'] {
  if (!state) return 'pending'
  return Object.hasOwn(REVIEWER_STATUS_MAP, state) ? REVIEWER_STATUS_MAP[state] : 'reviewed'
}
/* v8 ignore stop */

/** Extract author fields from a GraphQL PR node. */
/* v8 ignore start -- GraphQL fallback mapping for search API outages */
function resolveGraphQLAuthor(author: ViewerPRNode['author']): {
  login: string
  avatarUrl?: string
} {
  return { login: author?.login || 'unknown', avatarUrl: author?.avatarUrl }
}
/* v8 ignore stop */

/** Map a GraphQL viewer PR node to a PullRequest (with temp metadata fields). */
/* v8 ignore start -- GraphQL fallback mapping for search API outages */
function mapGraphQLNodeToPullRequest(
  node: ViewerPRNode,
  orgAvatarUrl: string | null,
  org: string
): PullRequest & { _owner: string; _repo: string; _prNumber: number } {
  const [owner, repo] = node.repository.nameWithOwner.split('/')
  const { login: author, avatarUrl: authorAvatarUrl } = resolveGraphQLAuthor(node.author)

  return {
    source: 'GitHub' as const,
    repository: repo,
    id: node.number,
    title: node.title,
    author,
    authorAvatarUrl,
    assigneeCount: node.assignees.totalCount,
    created: node.createdAt ? new Date(node.createdAt) : null,
    updatedAt: node.updatedAt || null,
    date: node.closedAt || node.mergedAt || null,
    url: node.url,
    state: node.state.toLowerCase(),
    approvalCount: 0,
    iApproved: false,
    headBranch: node.headRefName || '',
    baseBranch: node.baseRefName || '',
    threadsTotal: null,
    threadsAddressed: null,
    threadsUnaddressed: null,
    orgAvatarUrl: orgAvatarUrl ?? undefined,
    org,
    _owner: owner,
    _repo: repo,
    _prNumber: node.number,
  }
}
/* v8 ignore stop */

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

/** Build search queries for fetchPRsForAccount based on mode. */
function buildPRSearchQueries(
  username: string,
  org: string,
  mode: PRSearchMode,
  mergedAfter?: string
): string[] {
  /* v8 ignore start -- defensive: PRSearchMode union is exhaustive */
  const resolvedMode: PRSearchMode = Object.hasOwn(PR_SEARCH_BUILDERS, mode) ? mode : 'my-prs'
  /* v8 ignore stop */
  return PR_SEARCH_BUILDERS[resolvedMode](username, org, mergedAfter)
}

/** Extract head/base branch refs and head SHA from PR ref objects. */
/* v8 ignore start -- API response null-guards in commit/reviewer mapping */
function extractBranchRefs(
  head: { ref?: string; sha?: string },
  base: { ref?: string }
): { headBranch: string; baseBranch: string; headSha: string } {
  return { headBranch: head.ref || '', baseBranch: base.ref || '', headSha: head.sha || '' }
}

/** Build the latest-review-by-user map from a list of REST reviews. */
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
    if (isNewerReview(submittedAt, map.get(login))) {
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
export function buildReviewerSummary(
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

/** Map a raw PR from the pulls.list endpoint to a RepoPullRequest. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawPRToRepoPR(pr: any): RepoPullRequest {
  const head = pr.head || {}
  const base = pr.base || {}
  const labels = pr.labels || []
  const assignees = pr.assignees || []
  const { headBranch, baseBranch } = extractBranchRefs(head, base)
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
    headBranch,
    baseBranch,
    assigneeCount: assignees.length,
    approvalCount: 0,
    changesRequestedCount: 0,
    threadsUnaddressed: null,
    iApproved: false,
  }
}
/* v8 ignore stop */

// ── Domain functions ─────────────────────────────────────────────────

/* v8 ignore start -- API response null-guards for review data */
function countApprovals(
  reviews: Array<{
    user?: { login?: string } | null
    state: string
    submitted_at?: string | null
  }>,
  viewerLogin: string | null
): { approvalCount: number; iApproved: boolean } {
  const latestByUser = buildLatestReviewByUser(reviews)
  const approvedLogins = Array.from(latestByUser.entries())
    .filter(([, { state }]) => state === 'APPROVED')
    .map(([login]) => login)
  return {
    approvalCount: approvedLogins.length,
    iApproved: includesLoginIgnoreCase(approvedLogins, viewerLogin),
  }
}
/* v8 ignore stop */

/** Execute a single PR search query, returning mapped results. */
/* v8 ignore start -- search API orchestration; requires real API */
async function executeSingleSearchQuery(
  _config: PRConfig['github'],
  octokit: Octokit,
  query: string,
  orgAvatarUrl: string | null,
  org: string
): Promise<PullRequest[]> {
  const searchResults = await octokit.search.issuesAndPullRequests({
    q: query,
    per_page: 100,
    sort: 'updated',
    order: 'desc',
  })

  console.debug(`Search found ${searchResults.data.items.length} results for: ${query}`)

  const prs: PullRequest[] = []
  for (const item of searchResults.data.items) {
    const mapped = mapSearchItemToPullRequest(item, orgAvatarUrl, org)
    if (mapped) prs.push(mapped)
    else console.debug(`Invalid PR URL format: ${item.html_url}`)
  }
  return prs
}

/** Execute PR search queries and collect unique results. */
async function executeSearchQueries(
  _config: PRConfig['github'],
  octokit: Octokit,
  queries: string[],
  org: string
): Promise<PullRequest[]> {
  const orgAvatarUrl = await resolveOrgAvatar(octokit, org)
  const seenUrls = new Set<string>()
  const allPrs: PullRequest[] = []
  for (const query of queries) {
    try {
      const prs = await executeSingleSearchQuery(_config, octokit, query, orgAvatarUrl, org)
      for (const pr of prs) {
        if (!seenUrls.has(pr.url)) {
          seenUrls.add(pr.url)
          allPrs.push(pr)
        }
      }
    } catch (error: unknown) {
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

/**
 * Fallback: fetch the viewer's open PRs via GraphQL `viewer.pullRequests`
 * when the GitHub Search API is degraded.
 */
async function fetchPRsViaGraphQLFallback(
  _config: PRConfig['github'],
  username: string,
  org: string,
  orgAvatarUrl: string | null
): Promise<Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>> {
  const token = await getGitHubCLIToken(username)
  if (!token) return []

  const orgLower = org.toLowerCase()
  const result: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }> = []
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const response: ViewerPRsResponse = await graphql<ViewerPRsResponse>(VIEWER_PRS_QUERY, {
      states: ['OPEN'],
      first: 100,
      after: cursor,
      headers: { authorization: `token ${token}` },
    })

    const page = response.viewer.pullRequests
    for (const node of page.nodes) {
      if (node.repository.owner.login.toLowerCase() === orgLower) {
        result.push(mapGraphQLNodeToPullRequest(node, orgAvatarUrl, org))
      }
    }

    hasNextPage = page.pageInfo.hasNextPage
    cursor = hasNextPage ? page.pageInfo.endCursor : null
  }

  return result
}

async function fetchPRsForAccount(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  username: string,
  org: string,
  mode: PRSearchMode = 'my-prs'
): Promise<PullRequest[]> {
  const octokit = await getOctokit(username)
  if (!octokit) return []

  const orgAvatarUrl = await resolveOrgAvatar(octokit, org)

  // Compute mergedAfter date for recently-merged mode
  let mergedAfter: string | undefined
  if (mode === 'recently-merged') {
    const mergedAfterDate = new Date()
    mergedAfterDate.setDate(mergedAfterDate.getDate() - recentlyMergedDays)
    mergedAfter = mergedAfterDate.toISOString().split('T')[0]
  }

  const queries = buildPRSearchQueries(username, org, mode, mergedAfter)
  const allPrs = await executeSearchQueries(config, octokit, queries, org)

  // Fallback: when search returns 0 results for my-prs, try GraphQL viewer.pullRequests
  // which bypasses the search index (resilient to GitHub Search API outages)
  if (allPrs.length === 0 && mode === 'my-prs') {
    console.debug(
      `[PR Fallback] Search returned 0 for my-prs, trying GraphQL viewer.pullRequests...`
    )
    try {
      const fallbackPrs = await fetchPRsViaGraphQLFallback(config, username, org, orgAvatarUrl)
      if (fallbackPrs.length > 0) {
        console.info(
          `[PR Fallback] GraphQL found ${fallbackPrs.length} PRs (search API may be degraded)`
        )
        allPrs.push(...fallbackPrs)
      }
    } catch (error: unknown) {
      console.debug(`[PR Fallback] GraphQL fallback failed:`, error)
    }
  }

  // Batch fetch reviews in parallel (with concurrency limit)
  const prsWithMeta = allPrs as (PullRequest & {
    _owner: string
    _repo: string
    _prNumber: number
  })[]

  await batchProcess(prsWithMeta, async pr => {
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
      const { approvalCount, iApproved } = countApprovals(reviews, username)

      pr.approvalCount = approvalCount
      pr.iApproved = iApproved
      pr.headBranch = prData.data.head?.ref || ''
      pr.baseBranch = prData.data.base?.ref || ''
    } catch (error: unknown) {
      console.debug(`Failed to get reviews for PR #${pr._prNumber}:`, error)
    }
  })

  // Batch-fetch thread stats via a single GraphQL query per owner (more reliable than per-PR calls)
  await fetchBatchThreadStats(config, prsWithMeta)

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
 * Core fetch method with mode support — orchestrates multi-account PR fetching.
 */
/* v8 ignore start -- multi-account orchestration; requires real API */
async function fetchPRs(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  mode: PRSearchMode,
  onProgress?: ProgressCallback
): Promise<PullRequest[]> {
  const allPrs: PullRequest[] = []
  let authenticationErrors = 0
  const totalAccounts = config.accounts.length
  const report: ProgressCallback = ensureCallback(onProgress)

  type PRProgressStatus = 'authenticating' | 'fetching' | 'done' | 'error'
  const accountReport = (
    index: number,
    status: PRProgressStatus,
    extra?: { prsFound?: number; error?: string }
  ) => {
    const { username, org } = config.accounts[index]
    report({
      currentAccount: index + 1,
      totalAccounts,
      accountName: username,
      org,
      status,
      ...extra,
    })
  }

  // Process each configured GitHub account with its own token
  for (let i = 0; i < config.accounts.length; i++) {
    const { username, org } = config.accounts[i]

    console.debug(`Checking GitHub account '${username}' for org '${org}' (mode: ${mode})...`)
    accountReport(i, 'authenticating')

    // Get Octokit instance for this specific account
    const octokit = await getOctokit(username)
    if (!octokit) {
      console.warn(`⚠️  Skipping account '${username}' - no GitHub CLI authentication found`)
      accountReport(i, 'error', { error: 'No GitHub CLI authentication found' })
      authenticationErrors++
      continue
    }

    accountReport(i, 'fetching')

    try {
      const prs = await fetchPRsForAccount(config, recentlyMergedDays, username, org, mode)
      allPrs.push(...prs)

      console.debug(`✓ Found ${prs.length} PRs for ${username} in ${org}`)
      accountReport(i, 'done', { prsFound: prs.length })
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error)
      // Only warn for non-404 errors (404s likely mean no access or org doesn't exist)
      if (!errorMsg.includes('404')) {
        console.warn(`⚠️  Error fetching PRs for ${username} in ${org}:`, errorMsg)
      } else {
        console.debug(`ℹ️  No access or org not found for ${username} in ${org}`)
      }
      accountReport(i, 'error', { error: errorMsg })
      continue
    }
  }

  // If all accounts failed due to auth, throw error
  if (authenticationErrors === config.accounts.length) {
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
/* v8 ignore stop */

/** Fetch all PRs (default mode: all PRs I'm involved with). */
export async function fetchMyPRs(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  onProgress?: ProgressCallback
): Promise<PullRequest[]> {
  return fetchPRs(config, recentlyMergedDays, 'my-prs', onProgress)
}

/** Fetch PRs needing review (where I haven't approved yet). */
export async function fetchNeedsReview(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  onProgress?: ProgressCallback
): Promise<PullRequest[]> {
  return fetchPRs(config, recentlyMergedDays, 'needs-review', onProgress)
}

/** Fetch recently merged PRs. */
export async function fetchRecentlyMerged(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  onProgress?: ProgressCallback
): Promise<PullRequest[]> {
  return fetchPRs(config, recentlyMergedDays, 'recently-merged', onProgress)
}

/** Fetch PRs the user has approved but haven't been merged yet. */
export async function fetchNeedANudge(
  config: PRConfig['github'],
  recentlyMergedDays: number,
  onProgress?: ProgressCallback
): Promise<PullRequest[]> {
  return fetchPRs(config, recentlyMergedDays, 'need-a-nudge', onProgress)
}

/** Fetch open pull requests for a specific repository. */
/* v8 ignore start -- repo PR listing; requires real API */
export async function fetchRepoPRs(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  state: 'open' | 'closed' = 'open'
): Promise<RepoPullRequest[]> {
  const octokit = await getOctokitForOwner(config, owner)
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

  await batchProcess(prs, async pr => {
    try {
      const reviewsData = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      })
      const { approvalCount, iApproved } = countApprovals(reviewsData.data, viewerLogin)
      pr.approvalCount = approvalCount
      pr.iApproved = iApproved
      const latestByUser = buildLatestReviewByUser(reviewsData.data)
      pr.changesRequestedCount = Array.from(latestByUser.values()).filter(
        ({ state }) => state === 'CHANGES_REQUESTED'
      ).length
    } catch (error: unknown) {
      console.debug(`Failed to fetch review state for ${owner}/${repo}#${pr.number}:`, error)
    }
  })

  // Batch-fetch unresolved thread counts via GraphQL (single query for same repo)
  try {
    await fetchUnresolvedThreadCounts(config, owner, repo, prs)
  } catch (error: unknown) {
    console.debug(`Failed to fetch thread stats for ${owner}/${repo}:`, error)
  }

  return prs
}
/* v8 ignore stop */
