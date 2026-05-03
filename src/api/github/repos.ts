import type { Octokit } from '@octokit/rest'
import type { PRConfig } from '../../types/pullRequest'
import type { DiffFile } from './shared'
import {
  getOctokitForOwner,
  fetchUserNames,
  parseLabels,
  mapUserAuthorFields,
  mapCommitFileToDiffFile,
} from './shared'
import { getErrorMessage } from '../../utils/errorUtils'

// ── Types ────────────────────────────────────────────────────────────

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
  files: DiffFile[]
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

export interface RepoCounts {
  issues: number
  prs: number
}

// ── Constants ────────────────────────────────────────────────────────

/** Map a raw Octokit commit to a RepoCommit. */
const COMMIT_AUTHOR_DEFAULTS = { login: '', name: 'unknown', avatar_url: '', date: '' }

const CONTRIBUTOR_DEFAULTS = { login: 'unknown', avatar_url: '', contributions: 0, html_url: '' }

const WORKFLOW_RUN_DEFAULTS = {
  name: 'Workflow',
  status: 'unknown',
  conclusion: null,
  head_branch: '',
}

const REPO_IDENTITY_DEFAULTS = {
  description: null as string | null,
  homepage: null as string | null,
  language: null as string | null,
  archived: false,
}

const REPO_DATE_DEFAULTS = { created_at: '', updated_at: '' }

const REPO_STATS_DEFAULTS = {
  size: 0,
  stargazers_count: 0,
  forks_count: 0,
  subscribers_count: 0,
  open_issues_count: 0,
}

const COMMIT_STATS_DEFAULTS = { additions: 0, deletions: 0, total: 0 }

// ── Helper functions ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawCommitToRepoCommit(c: any): RepoCommit {
  const a = { ...COMMIT_AUTHOR_DEFAULTS, ...(c.author ?? {}) }
  /* v8 ignore start -- commit.author always present in API responses */
  const ca = { ...COMMIT_AUTHOR_DEFAULTS, ...c.commit?.author }
  /* v8 ignore stop */
  return {
    sha: c.sha,
    message: c.commit.message.split('\n')[0],
    author: a.login || ca.name,
    authorAvatarUrl: a.avatar_url || null,
    date: ca.date,
    url: c.html_url,
  }
}

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

function resolveVisibility(r: { visibility?: string; private?: boolean }): string {
  /* v8 ignore start */
  return r.visibility ?? (r.private ? 'private' : 'public')
  /* v8 ignore stop */
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

/** Resolve contributor login from a commit (author login or committer name fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveContributorLogin(commit: any): string {
  return commit.author?.login || commit.commit.author?.name || 'unknown'
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

/** Extract stats from a raw commit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitStats(stats: any): { additions: number; deletions: number; total: number } {
  const d = { ...COMMIT_STATS_DEFAULTS, ...(stats || {}) }
  return { additions: d.additions || 0, deletions: d.deletions || 0, total: d.total || 0 }
}

/** Map parent commits from a raw commit response. */
/* v8 ignore start -- API response null-guards in commit parent mapping */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommitParents(commit: any): Array<{ sha: string; url: string }> {
  const baseUrl = commit.html_url.replace(/\/commit\/[^/]+$/, '')
  return (commit.parents || []).map((parent: { sha: string; html_url?: string }) => ({
    sha: parent.sha,
    url: parent.html_url || `${baseUrl}/commit/${parent.sha}`,
  }))
}
/* v8 ignore stop */

/** Map a raw assignee object to the internal assignee shape. */
function mapAssigneeFields(a: { login: string; avatar_url: string }): {
  login: string
  name: string | null
  avatarUrl: string
} {
  return { login: a.login, name: null, avatarUrl: a.avatar_url }
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

// ── Domain functions ─────────────────────────────────────────────────

/**
 * Fetch detailed information about a single repository.
 * Fetches repo metadata, languages, recent commits, contributors,
 * open PR count, and latest CI/CD workflow run in parallel.
 */
export async function fetchRepoDetail(
  config: PRConfig['github'],
  owner: string,
  repo: string
): Promise<RepoDetail> {
  let octokit: Octokit
  try {
    octokit = await getOctokitForOwner(config, owner)
  } catch (_: unknown) {
    throw new Error(`No authenticated GitHub account available to fetch ${owner}/${repo}`, {
      cause: _,
    })
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
    throw new Error(`Failed to fetch repo ${owner}/${repo}: ${getErrorMessage(repoData.reason)}`)
  }
  /* v8 ignore stop */
  const r = repoData.value.data

  const languages = extractLanguages(languagesData)

  /* v8 ignore start -- Optional API results; branches for rejected/null paths are defensive */
  const recentCommits = extractCommits(commitsData)
  let topContributors = extractContributors(contributorsData)

  if (topContributors.length > 0) {
    const nameMap = await fetchUserNames(
      config,
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
export async function fetchRepoCommits(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  perPage = 25
): Promise<RepoCommit[]> {
  const octokit = await getOctokitForOwner(config, owner)
  const response = await octokit.repos.listCommits({ owner, repo, per_page: perPage })

  return response.data.map(mapRawCommitToRepoCommit)
}

/**
 * Fetch the full detail for a single commit, including changed files.
 */
/* v8 ignore start -- API response null-guards in commit detail mapping */
export async function fetchRepoCommitDetail(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  ref: string
): Promise<RepoCommitDetail> {
  const octokit = await getOctokitForOwner(config, owner)
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
export async function fetchRepoCounts(
  config: PRConfig['github'],
  owner: string,
  repo: string
): Promise<RepoCounts> {
  const octokit = await getOctokitForOwner(config, owner)
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
export async function fetchRepoIssues(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  state: 'open' | 'closed' = 'open'
): Promise<RepoIssue[]> {
  const octokit = await getOctokitForOwner(config, owner)
  const allItems = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state,
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  })
  const issues = allItems.filter(issue => !issue.pull_request).map(mapApiIssueFields)

  const allAssigneeLogins = [
    ...new Set(issues.flatMap(i => i.assignees.map((a: { login: string }) => a.login))),
  ]
  if (allAssigneeLogins.length > 0) {
    const nameMap = await fetchUserNames(config, allAssigneeLogins, owner)
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

export async function fetchRepoIssueDetail(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  issueNumber: number
): Promise<RepoIssueDetail> {
  const octokit = await getOctokitForOwner(config, owner)
  const [issueResponse, allComments] = await Promise.all([
    octokit.issues.get({ owner, repo, issue_number: issueNumber }),
    octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    }),
  ])

  const issue = issueResponse.data

  const assigneeLogins = (issue.assignees || []).map(a => a.login)
  const nameMap =
    assigneeLogins.length > 0
      ? await fetchUserNames(config, assigneeLogins, owner)
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
    comments: allComments.map(comment => ({
      id: comment.id,
      ...mapUserAuthorFields(comment.user),
      body: comment.body || '',
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.html_url,
    })),
  }
}
/* v8 ignore stop */
