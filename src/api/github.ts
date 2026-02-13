import { Octokit } from '@octokit/rest'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { graphql } from '@octokit/graphql'
import type { PullRequest, PRConfig } from '../types/pullRequest'

// Repository info type for org repo listing
export interface OrgRepo {
  name: string
  fullName: string
  description: string | null
  url: string
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

export interface RepoContributor {
  login: string
  avatarUrl: string
  contributions: number
  url: string
}

export interface WorkflowRun {
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
  assignees: Array<{ login: string; avatarUrl: string }>
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

// Lightweight issue + PR counts for sidebar badges
export interface RepoCounts {
  issues: number
  prs: number
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
  reviewers: PRReviewerSummary[]
  timeline: PRTimelineEvent[]
}

export interface PRReviewerSummary {
  login: string
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'changes-requested' | 'commented' | 'reviewed'
  updatedAt: string | null
}

export interface PRTimelineEvent {
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

export interface PRCommentReaction {
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

export interface PRThreadsResult {
  threads: PRReviewThread[]
  issueComments: PRReviewComment[]
}

// Create Octokit with retry and throttling plugins
const OctokitWithPlugins = Octokit.plugin(retry, throttling)

// Module-level caches (persist across GitHubClient instances)
const tokenCache: Map<string, string> = new Map()
const orgAvatarCache: Map<string, string | null> = new Map() // null = tried and failed

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

export class GitHubClient {
  private config: PRConfig['github']
  private recentlyMergedDays: number = 7

  constructor(config: PRConfig['github'], recentlyMergedDays: number = 7) {
    this.config = config
    this.recentlyMergedDays = recentlyMergedDays
  }

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
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Rate limit hit for ${options.method} ${options.url}`)
          if (retryCount < 3) {
            console.info(`Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/3)`)
            return true
          }
          return false
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Secondary rate limit hit for ${options.method} ${options.url}`)
          if (retryCount < 2) {
            console.info(`Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/2)`)
            return true
          }
          return false
        },
      },
      retry: {
        doNotRetry: ['404', '429'],
        retries: 3,
      },
    })
  }

  /**
   * Get an Octokit instance for a given owner/org.
   * Tries accounts matching the owner first, then falls back to any account.
   */
  private async getOctokitForOwner(owner: string): Promise<Octokit> {
    for (const account of this.config.accounts) {
      if (account.org === owner) {
        const octokit = await this.getOctokit(account.username)
        if (octokit) return octokit
      }
    }
    for (const account of this.config.accounts) {
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
    // Find an octokit instance — prefer account matching the owner/org
    let octokit: Octokit | null = null
    for (const account of this.config.accounts) {
      if (account.org === owner) {
        octokit = await this.getOctokit(account.username)
        if (octokit) break
      }
    }
    // Fallback: try any available account
    if (!octokit) {
      for (const account of this.config.accounts) {
        octokit = await this.getOctokit(account.username)
        if (octokit) break
      }
    }
    if (!octokit) {
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
    if (repoData.status === 'rejected') {
      throw new Error(`Failed to fetch repo ${owner}/${repo}: ${repoData.reason}`)
    }
    const r = repoData.value.data

    // Languages (optional)
    const languages: Record<string, number> =
      languagesData.status === 'fulfilled' ? languagesData.value.data : {}

    // Recent commits (optional)
    const recentCommits: RepoCommit[] =
      commitsData.status === 'fulfilled'
        ? commitsData.value.data.map(c => ({
            sha: c.sha,
            message: c.commit.message.split('\n')[0], // first line only
            author: c.author?.login || c.commit.author?.name || 'unknown',
            authorAvatarUrl: c.author?.avatar_url || null,
            date: c.commit.author?.date || '',
            url: c.html_url,
          }))
        : []

    // Contributors (optional)
    const topContributors: RepoContributor[] =
      contributorsData.status === 'fulfilled' && Array.isArray(contributorsData.value.data)
        ? contributorsData.value.data.map(c => ({
            login: c.login ?? 'unknown',
            avatarUrl: c.avatar_url ?? '',
            contributions: c.contributions ?? 0,
            url: c.html_url ?? '',
          }))
        : []

    // Open PR count (optional) — GitHub returns total_count in search,
    // but for pulls.list we check response headers or just count length.
    // Since per_page=1, we use the total from the link header or just presence.
    let openPRCount = 0
    if (prsData.status === 'fulfilled') {
      // If there's at least 1 PR, use the open_issues_count from repo data
      // (which includes issues + PRs) — we'll estimate from the repo's pull data
      openPRCount = prsData.value.data.length > 0 ? r.open_issues_count : 0
    }

    // Latest workflow run (optional)
    let latestWorkflowRun: WorkflowRun | null = null
    if (workflowsData.status === 'fulfilled' && workflowsData.value.data.workflow_runs.length > 0) {
      const run = workflowsData.value.data.workflow_runs[0]
      latestWorkflowRun = {
        name: run.name ?? 'Workflow',
        status: run.status ?? 'unknown',
        conclusion: run.conclusion ?? null,
        url: run.html_url,
        createdAt: run.created_at,
        headBranch: run.head_branch ?? '',
      }
    }

    return {
      name: r.name,
      fullName: r.full_name,
      description: r.description ?? null,
      url: r.html_url,
      homepage: r.homepage ?? null,
      language: r.language ?? null,
      defaultBranch: r.default_branch,
      visibility: r.visibility ?? (r.private ? 'private' : 'public'),
      isArchived: r.archived ?? false,
      isFork: r.fork,
      createdAt: r.created_at ?? '',
      updatedAt: r.updated_at ?? '',
      pushedAt: r.pushed_at ?? null,
      sizeKB: r.size ?? 0,
      stargazersCount: r.stargazers_count ?? 0,
      forksCount: r.forks_count ?? 0,
      watchersCount: r.subscribers_count ?? 0,
      openIssuesCount: r.open_issues_count ?? 0,
      topics: r.topics ?? [],
      license: r.license?.spdx_id ?? null,
      languages,
      recentCommits,
      topContributors,
      openPRCount,
      latestWorkflowRun,
    }
  }

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
  async fetchRepoIssues(owner: string, repo: string): Promise<RepoIssue[]> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 100,
      sort: 'updated',
      direction: 'desc',
    })
    return response.data
      .filter(issue => !issue.pull_request)
      .map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login || 'unknown',
        authorAvatarUrl: issue.user?.avatar_url || null,
        url: issue.html_url,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        labels: (issue.labels || [])
          .filter((l): l is { name?: string; color?: string | null } & object => typeof l !== 'string')
          .map(l => ({ name: l.name || '', color: l.color || '808080' })),
        commentCount: issue.comments,
        assignees: (issue.assignees || []).map(a => ({
          login: a.login,
          avatarUrl: a.avatar_url,
        })),
      }))
  }

  /**
   * Fetch open pull requests for a specific repository.
   */
  async fetchRepoPRs(owner: string, repo: string): Promise<RepoPullRequest[]> {
    const octokit = await this.getOctokitForOwner(owner)
    const [response, viewer] = await Promise.all([
      octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      }),
      octokit.users.getAuthenticated().catch(() => null),
    ])

    const viewerLogin = viewer?.data?.login?.toLowerCase() || null

    const prs: RepoPullRequest[] = response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login || 'unknown',
      authorAvatarUrl: pr.user?.avatar_url || null,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      labels: (pr.labels || []).map(l => ({
        name: typeof l === 'string' ? l : l.name || '',
        color: typeof l === 'string' ? '808080' : l.color || '808080',
      })),
      draft: pr.draft || false,
      headBranch: pr.head?.ref || '',
      baseBranch: pr.base?.ref || '',
      assigneeCount: pr.assignees?.length || 0,
      approvalCount: 0,
      iApproved: false,
    }))

    const BATCH_SIZE = 10
    for (let i = 0; i < prs.length; i += BATCH_SIZE) {
      const batch = prs.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async pr => {
          try {
            const reviewsData = await octokit.pulls.listReviews({
              owner,
              repo,
              pull_number: pr.number,
            })

            const reviewerLatest = new Map<string, string>()
            for (const review of reviewsData.data) {
              const login = review.user?.login
              if (!login) continue

              const submittedAt = review.submitted_at || ''
              const existingAt = reviewerLatest.get(login)
              if (!existingAt || submittedAt > existingAt) {
                reviewerLatest.set(login, submittedAt)
              }
            }

            const latestStates = new Map<string, string>()
            for (const review of reviewsData.data) {
              const login = review.user?.login
              if (!login) continue
              const latestAt = reviewerLatest.get(login)
              if ((review.submitted_at || '') === latestAt) {
                latestStates.set(login, review.state)
              }
            }

            let approvalCount = 0
            let iApproved = false
            for (const [login, state] of latestStates) {
              if (state === 'APPROVED') {
                approvalCount++
                if (viewerLogin && login.toLowerCase() === viewerLogin) {
                  iApproved = true
                }
              }
            }

            pr.approvalCount = approvalCount
            pr.iApproved = iApproved
          } catch (error) {
            console.debug(`Failed to fetch review state for ${owner}/${repo}#${pr.number}:`, error)
          }
        })
      )
    }

    return prs
  }

  /**
   * Fetch source and destination branch names for a PR.
   */
  async fetchPRBranches(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ headBranch: string; baseBranch: string }> {
    const octokit = await this.getOctokitForOwner(owner)
    const response = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })

    return {
      headBranch: response.data.head?.ref || '',
      baseBranch: response.data.base?.ref || '',
    }
  }

  /**
   * Fetch detailed PR history stats for context menus and history panel.
   */
  async fetchPRHistory(owner: string, repo: string, pullNumber: number): Promise<PRHistorySummary> {
    const token = await this.getTokenForOwner(owner)

    const query = `
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
          }
        }
      }
    `

    const result = await graphql<{
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
        } | null
      } | null
    }>(query, {
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

    const latestReviewsByUser = new Map<
      string,
      { state: string; submittedAt: string | null; avatarUrl: string | null }
    >()
    for (const review of pr.reviews.nodes || []) {
      const login = review.author?.login
      if (!login) continue
      const existing = latestReviewsByUser.get(login)
      if (!existing || (review.submittedAt || '') > (existing.submittedAt || '')) {
        latestReviewsByUser.set(login, {
          state: review.state,
          submittedAt: review.submittedAt,
          avatarUrl: review.author?.avatarUrl || null,
        })
      }
    }

    const requestedReviewers = new Map<string, { avatarUrl: string | null }>()
    for (const req of pr.reviewRequests.nodes || []) {
      const reviewer = req.requestedReviewer
      if (
        reviewer &&
        reviewer.__typename === 'User' &&
        'login' in reviewer &&
        'avatarUrl' in reviewer
      ) {
        requestedReviewers.set(reviewer.login, { avatarUrl: reviewer.avatarUrl || null })
      }
    }

    const reviewerLogins = new Set<string>([
      ...requestedReviewers.keys(),
      ...latestReviewsByUser.keys(),
    ])

    const reviewers: PRReviewerSummary[] = Array.from(reviewerLogins).map(login => {
      const latest = latestReviewsByUser.get(login)
      const requested = requestedReviewers.get(login)
      const status: PRReviewerSummary['status'] = latest
        ? latest.state === 'APPROVED'
          ? 'approved'
          : latest.state === 'CHANGES_REQUESTED'
            ? 'changes-requested'
            : latest.state === 'COMMENTED'
              ? 'commented'
              : 'reviewed'
        : 'pending'

      return {
        login,
        avatarUrl: latest?.avatarUrl || requested?.avatarUrl || null,
        status,
        updatedAt: latest?.submittedAt || null,
      }
    })

    const timeline: PRTimelineEvent[] = []
    timeline.push({
      id: `opened-${pullNumber}`,
      type: 'opened',
      author: pr.author?.login || 'unknown',
      occurredAt: pr.createdAt,
      summary: 'Opened pull request',
      url: null,
    })

    for (const comment of pr.comments.nodes || []) {
      const summary = (comment.bodyText || '').trim().split('\n')[0] || 'Added comment'
      timeline.push({
        id: `comment-${comment.id}`,
        type: 'comment',
        author: comment.author?.login || 'unknown',
        occurredAt: comment.createdAt,
        summary,
        url: comment.url,
      })
    }

    for (const commitNode of pr.commits.nodes || []) {
      const commit = commitNode.commit
      timeline.push({
        id: `commit-${commit.oid}`,
        type: 'commit',
        author: commit.author?.user?.login || commit.author?.name || 'unknown',
        occurredAt: commit.committedDate,
        summary: commit.messageHeadline || 'Commit',
        url: commit.url || null,
      })
    }

    for (const review of pr.reviews.nodes || []) {
      if (!review.submittedAt) continue
      const reviewSummary =
        review.state === 'APPROVED'
          ? 'Approved review'
          : review.state === 'CHANGES_REQUESTED'
            ? 'Requested changes'
            : review.state === 'COMMENTED'
              ? 'Left review comments'
              : 'Submitted review'

      timeline.push({
        id: `review-${review.id}`,
        type: 'review',
        author: review.author?.login || 'unknown',
        occurredAt: review.submittedAt,
        summary: reviewSummary,
        url: review.url || null,
      })
    }

    timeline.sort((a, b) => {
      const aTs = new Date(a.occurredAt).getTime()
      const bTs = new Date(b.occurredAt).getTime()
      return aTs - bTs
    })

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
      reviewers,
      timeline,
    }
  }

  /**
   * Fetch full review threads and issue comments for a PR.
   * Returns all threads with their comments and all top-level issue comments.
   */
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
      comments: (t.comments.nodes || []).map(c => ({
        id: c.id,
        author: c.author?.login || 'unknown',
        authorAvatarUrl: c.author?.avatarUrl || null,
        body: c.body || '',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        url: c.url,
        diffHunk: c.diffHunk || null,
        reactions: this.mapReactionGroups(c.reactionGroups),
      })),
    }))

    const issueComments: PRReviewComment[] = (pr.comments.nodes || []).map(c => ({
      id: c.id,
      author: c.author?.login || 'unknown',
      authorAvatarUrl: c.author?.avatarUrl || null,
      body: c.body || '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      url: c.url,
      diffHunk: null,
      reactions: this.mapReactionGroups(c.reactionGroups),
    }))

    return { threads, issueComments }
  }

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
      author: c.author?.login || 'unknown',
      authorAvatarUrl: c.author?.avatarUrl || null,
      body: c.body,
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
      author: c.user?.login || 'unknown',
      authorAvatarUrl: c.user?.avatar_url || null,
      body: c.body || '',
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
   * Get a token for an owner (used by thread/comment methods).
   */
  private async getTokenForOwner(owner: string): Promise<string> {
    let token: string | null = null
    for (const account of this.config.accounts) {
      if (account.org === owner) {
        token = await this.getGitHubCLIToken(account.username)
        if (token) break
      }
    }
    if (!token) {
      for (const account of this.config.accounts) {
        token = await this.getGitHubCLIToken(account.username)
        if (token) break
      }
    }
    if (!token) {
      throw new Error('No authenticated GitHub account available')
    }
    return token
  }

  private mapReactionGroups(
    groups: Array<{ content: string; viewerHasReacted: boolean; users: { totalCount: number } }> | null | undefined
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
  async fetchOrgRepos(org: string): Promise<OrgRepoResult> {
    // Try each account that matches this org first
    for (const account of this.config.accounts) {
      if (account.org !== org) continue

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

    // If no matching account, try any account
    for (const account of this.config.accounts) {
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
        repos.push({
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description ?? null,
          url: repo.html_url,
          language: repo.language ?? null,
          stargazersCount: repo.stargazers_count ?? 0,
          forksCount: repo.forks_count ?? 0,
          isPrivate: repo.private,
          isArchived: repo.archived ?? false,
          updatedAt: repo.updated_at ?? null,
          pushedAt: repo.pushed_at ?? null,
        })
      }

      hasMore = response.data.length >= perPage
    }

    return repos
  }

  /**
   * Core fetch method with mode support
   */
  private async fetchPRs(
    mode: 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge',
    onProgress?: ProgressCallback
  ): Promise<PullRequest[]> {
    const allPrs: PullRequest[] = []
    let authenticationErrors = 0
    const totalAccounts = this.config.accounts.length

    // Process each configured GitHub account with its own token
    for (let i = 0; i < this.config.accounts.length; i++) {
      const account = this.config.accounts[i]
      const { username, org } = account
      const currentAccount = i + 1

      console.debug(`Checking GitHub account '${username}' for org '${org}' (mode: ${mode})...`)

      // Report authenticating progress
      onProgress?.({
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
        onProgress?.({
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

      // Report fetching progress
      onProgress?.({
        currentAccount,
        totalAccounts,
        accountName: username,
        org,
        status: 'fetching',
      })

      try {
        const prs = await this.fetchPRsForAccount(octokit, org, username, mode)
        allPrs.push(...prs)

        console.debug(`✓ Found ${prs.length} PRs for ${username} in ${org}`)

        // Report done progress
        onProgress?.({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'done',
          prsFound: prs.length,
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // Only warn for non-404 errors (404s likely mean no access or org doesn't exist)
        if (!errorMsg.includes('404')) {
          console.warn(`⚠️  Error fetching PRs for ${username} in ${org}:`, errorMsg)
        } else {
          console.debug(`ℹ️  No access or org not found for ${username} in ${org}`)
        }
        onProgress?.({
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

    return allPrs
  }

  /**
   * Fetch PRs for a specific account and org using Octokit
   */
  private async fetchPRsForAccount(
    octokit: Octokit,
    org: string,
    username: string,
    mode: 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge' = 'my-prs'
  ): Promise<PullRequest[]> {
    const seenUrls = new Set<string>()
    const allPrs: PullRequest[] = []

    // Fetch org avatar (cached at module level to persist across instances)
    let orgAvatarUrl: string | undefined | null
    if (!orgAvatarCache.has(org)) {
      try {
        const orgData = await octokit.orgs.get({ org })
        orgAvatarUrl = orgData.data.avatar_url
        orgAvatarCache.set(org, orgAvatarUrl)
      } catch {
        // Might be a user, not an org - try users endpoint
        try {
          const userData = await octokit.users.getByUsername({ username: org })
          orgAvatarUrl = userData.data.avatar_url
          orgAvatarCache.set(org, orgAvatarUrl)
        } catch {
          console.debug(`Could not fetch avatar for ${org}`)
          orgAvatarCache.set(org, null) // Cache the failure to avoid retrying
        }
      }
    } else {
      orgAvatarUrl = orgAvatarCache.get(org)
    }

    // Different queries based on mode
    let queries: string[]

    switch (mode) {
      case 'needs-review':
        // PRs where review is requested from me OR I'm assigned but haven't approved
        queries = [
          `is:pr review-requested:${username} is:open org:${org}`,
          `is:pr assignee:${username} is:open org:${org} -author:${username}`,
        ]
        break
      case 'need-a-nudge':
        // PRs I approved that are still open (may need a nudge to merge)
        queries = [`is:pr is:open reviewed-by:${username} org:${org}`]
        break
      case 'recently-merged': {
        // PRs I authored or reviewed that were recently merged (within configured days)
        const mergedAfterDate = new Date()
        mergedAfterDate.setDate(mergedAfterDate.getDate() - this.recentlyMergedDays)
        const mergedAfter = mergedAfterDate.toISOString().split('T')[0] // YYYY-MM-DD format
        queries = [
          `is:pr author:${username} is:merged merged:>=${mergedAfter} org:${org}`,
          `is:pr reviewed-by:${username} is:merged merged:>=${mergedAfter} org:${org}`,
        ]
        break
      }
      case 'my-prs':
      default:
        // PRs I authored that are not merged
        queries = [`is:pr author:${username} is:open org:${org}`]
        break
    }

    // Execute each search query
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
          if (seenUrls.has(item.html_url)) {
            continue
          }
          seenUrls.add(item.html_url)

          // Parse owner/repo from URL
          const urlMatch = item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/)
          if (!urlMatch || !urlMatch[1] || !urlMatch[2]) {
            console.debug(`Invalid PR URL format: ${item.html_url}`)
            continue
          }

          const owner: string = urlMatch[1]
          const repo: string = urlMatch[2]

          // Build PR from search result (most data already available)
          allPrs.push({
            source: 'GitHub' as const,
            repository: repo,
            id: item.number,
            title: item.title,
            author: item.user?.login || 'unknown',
            authorAvatarUrl: item.user?.avatar_url,
            url: item.html_url,
            state: item.state,
            approvalCount: 0, // Will be filled in batch
            assigneeCount: item.assignees?.length || 0,
            iApproved: false, // Will be filled in batch
            created: item.created_at ? new Date(item.created_at) : null,
            updatedAt: item.updated_at || null,
            headBranch: '',
            baseBranch: '',
            date: item.closed_at || null, // For merged PRs, closed_at is the merge date
            orgAvatarUrl,
            org,
            // Store metadata for batch processing
            _owner: owner,
            _repo: repo,
            _prNumber: item.number,
          } as PullRequest & { _owner: string; _repo: string; _prNumber: number })
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // Suppress 404 errors (org doesn't exist or no access)
        if (!errorMsg.includes('404')) {
          console.warn(`Search query failed: ${query}`, error)
        } else {
          console.debug(`No search results (404) for: ${query}`)
        }
      }
    }

    // Batch fetch reviews in parallel (with concurrency limit)
    const BATCH_SIZE = 10
    const prsWithMeta = allPrs as (PullRequest & {
      _owner: string
      _repo: string
      _prNumber: number
    })[]

    for (let i = 0; i < prsWithMeta.length; i += BATCH_SIZE) {
      const batch = prsWithMeta.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async pr => {
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
            let approvalCount = 0
            let iApproved = false

            if (reviews.length > 0) {
              const reviewerGroups = new Map<string, typeof reviews>()

              for (const review of reviews) {
                const login = review.user?.login
                if (!login) continue
                if (!reviewerGroups.has(login)) {
                  reviewerGroups.set(login, [])
                }
                reviewerGroups.get(login)?.push(review)
              }

              for (const [login, userReviews] of reviewerGroups) {
                const latestReview = userReviews.sort((a, b) => {
                  const aTime = a.submitted_at || ''
                  const bTime = b.submitted_at || ''
                  return bTime.localeCompare(aTime)
                })[0]

                if (latestReview?.state === 'APPROVED') {
                  approvalCount++
                  if (login === username) {
                    iApproved = true
                  }
                }
              }
            }

            pr.approvalCount = approvalCount
            pr.iApproved = iApproved
            pr.headBranch = prData.data.head?.ref || ''
            pr.baseBranch = prData.data.base?.ref || ''
          } catch (error) {
            console.debug(`Failed to get reviews for PR #${pr._prNumber}:`, error)
          }
        })
      )
    }

    // Clean up metadata and filter
    const finalPrs = allPrs
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
        // For needs-review mode, filter out PRs the user has already approved
        if (mode === 'needs-review' && pr.iApproved) {
          return false
        }
        // For need-a-nudge mode, only include PRs the user has approved
        if (mode === 'need-a-nudge' && !pr.iApproved) {
          return false
        }
        return true
      })

    return finalPrs
  }
}
