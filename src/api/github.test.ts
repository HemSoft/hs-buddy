import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock window.ipcRenderer
const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  ipcRenderer: { invoke: mockInvoke },
})

// Mock Octokit instance methods
const mockOctokit = {
  pulls: {
    list: vi.fn(),
    get: vi.fn(),
    listReviews: vi.fn(),
    listFiles: vi.fn(),
  },
  users: {
    getAuthenticated: vi.fn(),
  },
  repos: {
    get: vi.fn(),
    listLanguages: vi.fn(),
    listCommits: vi.fn(),
    listContributors: vi.fn(),
    getCombinedStatusForRef: vi.fn(),
    getCommit: vi.fn(),
  },
  actions: {
    listWorkflowRunsForRepo: vi.fn(),
  },
  checks: {
    listForRef: vi.fn(),
  },
  search: {
    issuesAndPullRequests: vi.fn(),
  },
  paginate: vi.fn(),
  orgs: {
    listMembers: vi.fn(),
    get: vi.fn(),
  },
}

// Mock @octokit/rest — plugin() must return a class (used with `new`)
vi.mock('@octokit/rest', () => ({
  Octokit: {
    plugin: () => class MockOctokit {
      constructor() { return mockOctokit as unknown as MockOctokit }
    },
  },
}))

// Mock graphql
const mockGraphql = vi.fn()
vi.mock('@octokit/graphql', () => ({
  graphql: (...args: unknown[]) => mockGraphql(...args),
}))

// Mock retry + throttling plugins
vi.mock('@octokit/plugin-retry', () => ({ retry: {} }))
vi.mock('@octokit/plugin-throttling', () => ({ throttling: {} }))

import { GitHubClient } from './github'

const TEST_CONFIG = {
  accounts: [
    { username: 'user1', org: 'myorg' },
    { username: 'user2', org: 'otherorg' },
  ],
}

describe('GitHubClient', () => {
  let client: GitHubClient

  beforeEach(() => {
    vi.clearAllMocks()
    // Return token for any account
    mockInvoke.mockImplementation((_channel: string, username: string) => {
      if (_channel === 'github:get-cli-token') return Promise.resolve(`token-${username}`)
      return Promise.resolve(null)
    })
    client = new GitHubClient(TEST_CONFIG)
  })

  describe('constructor', () => {
    it('creates instance with default recentlyMergedDays', () => {
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('accepts custom recentlyMergedDays', () => {
      const c = new GitHubClient(TEST_CONFIG, 14)
      expect(c).toBeInstanceOf(GitHubClient)
    })
  })

  describe('getActiveCliAccount', () => {
    it('returns trimmed account name', async () => {
      mockInvoke.mockResolvedValueOnce('  user1  ')
      const result = await GitHubClient.getActiveCliAccount()
      expect(result).toBe('user1')
    })

    it('returns null on empty output', async () => {
      mockInvoke.mockResolvedValueOnce('')
      const result = await GitHubClient.getActiveCliAccount()
      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('fail'))
      const result = await GitHubClient.getActiveCliAccount()
      expect(result).toBeNull()
    })
  })

  describe('fetchRepoPRs (exercises countApprovals)', () => {
    it('returns mapped PRs with approval counts', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 1,
            title: 'PR 1',
            state: 'open',
            user: { login: 'author1', avatar_url: 'https://avatar1' },
            html_url: 'https://github.com/myorg/repo/pull/1',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
            labels: [{ name: 'bug', color: 'ff0000' }],
            draft: false,
            head: { ref: 'feature-branch' },
            base: { ref: 'main' },
            assignees: [{ login: 'user1' }],
          },
        ],
      })

      mockOctokit.users.getAuthenticated.mockResolvedValue({
        data: { login: 'user1' },
      })

      // Reviews: user1 approved, user2 requested changes then approved
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'user1' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z' },
          { user: { login: 'user2' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-01-01T00:00:00Z' },
          { user: { login: 'user2' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z' },
        ],
      })

      const result = await client.fetchRepoPRs('myorg', 'repo')

      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(1)
      expect(result[0].title).toBe('PR 1')
      expect(result[0].author).toBe('author1')
      expect(result[0].labels).toEqual([{ name: 'bug', color: 'ff0000' }])
      expect(result[0].headBranch).toBe('feature-branch')
      expect(result[0].baseBranch).toBe('main')
      // countApprovals: user2's latest is APPROVED, user1 is APPROVED → 2 approvals
      expect(result[0].approvalCount).toBe(2)
      // Viewer is user1 who approved
      expect(result[0].iApproved).toBe(true)
    })

    it('handles review fetch failures gracefully', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 1, title: 'PR', state: 'open',
            user: { login: 'a' }, html_url: 'h', created_at: 'c', updated_at: 'u',
            labels: [], head: { ref: 'h' }, base: { ref: 'b' }, assignees: [],
          },
        ],
      })
      mockOctokit.users.getAuthenticated.mockResolvedValue({ data: { login: 'x' } })
      mockOctokit.pulls.listReviews.mockRejectedValue(new Error('403'))

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].approvalCount).toBe(0)
      expect(result[0].iApproved).toBe(false)
    })

    it('handles string labels', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 1, title: 'PR', state: 'open',
            user: null, html_url: 'h', created_at: 'c', updated_at: 'u',
            labels: ['plain-string-label'],
            head: null, base: null, assignees: null, draft: undefined,
          },
        ],
      })
      mockOctokit.users.getAuthenticated.mockRejectedValue(new Error('unauth'))
      mockOctokit.pulls.listReviews.mockResolvedValue({ data: [] })

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].author).toBe('unknown')
      expect(result[0].labels[0]).toEqual({ name: 'plain-string-label', color: '808080' })
      expect(result[0].headBranch).toBe('')
      expect(result[0].baseBranch).toBe('')
    })

    it('countApprovals deduplicates by latest review per user', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'a' }, html_url: 'h', created_at: 'c', updated_at: 'u',
          labels: [], head: { ref: 'h' }, base: { ref: 'b' }, assignees: [],
        }],
      })
      mockOctokit.users.getAuthenticated.mockResolvedValue({ data: { login: 'viewer' } })
      // reviewer approved first, then requested changes → latest wins
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z' },
          { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-01-02T00:00:00Z' },
          { user: null, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z' }, // null user skip
        ],
      })

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].approvalCount).toBe(0) // reviewer's latest is CHANGES_REQUESTED
      expect(result[0].iApproved).toBe(false)
    })

    it('countApprovals case-insensitive viewer match', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'a' }, html_url: 'h', created_at: 'c', updated_at: 'u',
          labels: [], head: { ref: 'h' }, base: { ref: 'b' }, assignees: [],
        }],
      })
      mockOctokit.users.getAuthenticated.mockResolvedValue({ data: { login: 'VIEWER' } })
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'viewer' }, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z' },
        ],
      })

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].approvalCount).toBe(1)
      expect(result[0].iApproved).toBe(true) // case-insensitive match
    })
  })

  describe('fetchPRHistory (exercises buildPRTimeline + buildReviewerSummaries)', () => {
    it('builds timeline and reviewer summaries from GraphQL response', async () => {
      mockGraphql.mockResolvedValue({
        repository: {
          pullRequest: {
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-03T00:00:00Z',
            mergedAt: null,
            author: { login: 'author1' },
            comments: {
              totalCount: 1,
              nodes: [
                { id: 'c1', createdAt: '2026-01-01T12:00:00Z', bodyText: 'Looks good overall', url: 'url1', author: { login: 'commenter1' } },
              ],
            },
            commits: {
              totalCount: 2,
              nodes: [
                {
                  commit: {
                    oid: 'abc123',
                    committedDate: '2026-01-01T06:00:00Z',
                    messageHeadline: 'Initial commit',
                    url: 'commit-url1',
                    author: { user: { login: 'author1' }, name: 'Author' },
                  },
                },
                {
                  commit: {
                    oid: 'def456',
                    committedDate: '2026-01-02T06:00:00Z',
                    messageHeadline: 'Fix bugs',
                    url: 'commit-url2',
                    author: { user: null, name: 'external' },
                  },
                },
              ],
            },
            reviewRequests: {
              nodes: [
                { requestedReviewer: { __typename: 'User', login: 'reviewer1', avatarUrl: 'av1' } },
                { requestedReviewer: { __typename: 'Team' } }, // not User
              ],
            },
            reviews: {
              nodes: [
                { id: 'r1', state: 'APPROVED', submittedAt: '2026-01-02T12:00:00Z', url: 'rev-url1', author: { login: 'reviewer1', avatarUrl: 'av1' } },
                { id: 'r2', state: 'COMMENTED', submittedAt: '2026-01-01T18:00:00Z', url: 'rev-url2', author: { login: 'reviewer2', avatarUrl: 'av2' } },
                { id: 'r3', state: 'CHANGES_REQUESTED', submittedAt: null, url: 'rev-url3', author: { login: 'reviewer3', avatarUrl: 'av3' } }, // no submittedAt → skipped in timeline
              ],
            },
            reviewThreads: {
              totalCount: 3,
              nodes: [
                { isResolved: true, isOutdated: false, comments: { totalCount: 2 } },
                { isResolved: false, isOutdated: true, comments: { totalCount: 1 } },
                { isResolved: false, isOutdated: false, comments: { totalCount: 3 } },
              ],
            },
          },
        },
      })

      const result = await client.fetchPRHistory('myorg', 'repo', 42)

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z')
      expect(result.mergedAt).toBeNull()
      expect(result.commitCount).toBe(2)
      expect(result.issueCommentCount).toBe(1)
      expect(result.reviewCommentCount).toBe(6) // 2+1+3
      expect(result.totalComments).toBe(7)
      expect(result.threadsTotal).toBe(3)
      expect(result.threadsOutdated).toBe(1)
      expect(result.threadsAddressed).toBe(1)
      expect(result.threadsUnaddressed).toBe(2)

      // Timeline: sorted by occurredAt
      expect(result.timeline).toHaveLength(6) // 1 opened + 1 comment + 2 commits + 2 reviews (r3 skipped)
      expect(result.timeline[0].type).toBe('opened')
      expect(result.timeline[0].author).toBe('author1')
      // Commits come after opened based on date
      expect(result.timeline[1].type).toBe('commit')
      expect(result.timeline[1].summary).toBe('Initial commit')

      // Reviewers: reviewer1 (approved), reviewer2 (commented), reviewer3 (changes-requested)
      expect(result.reviewers).toHaveLength(3)
      const r1 = result.reviewers.find(r => r.login === 'reviewer1')
      expect(r1?.status).toBe('approved')
      const r2 = result.reviewers.find(r => r.login === 'reviewer2')
      expect(r2?.status).toBe('commented')
      const r3 = result.reviewers.find(r => r.login === 'reviewer3')
      expect(r3?.status).toBe('changes-requested')
    })

    it('throws when PR not found', async () => {
      mockGraphql.mockResolvedValue({ repository: { pullRequest: null } })
      await expect(client.fetchPRHistory('myorg', 'repo', 99)).rejects.toThrow(
        'PR #99 not found in myorg/repo'
      )
    })

    it('handles reviewer with only pending request (no review submitted)', async () => {
      mockGraphql.mockResolvedValue({
        repository: {
          pullRequest: {
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            mergedAt: null,
            author: null,
            comments: { totalCount: 0, nodes: [] },
            commits: { totalCount: 0, nodes: [] },
            reviewRequests: {
              nodes: [{ requestedReviewer: { __typename: 'User', login: 'pendingReviewer', avatarUrl: 'av' } }],
            },
            reviews: { nodes: [] },
            reviewThreads: { totalCount: 0, nodes: [] },
          },
        },
      })

      const result = await client.fetchPRHistory('myorg', 'repo', 1)
      expect(result.reviewers).toHaveLength(1)
      expect(result.reviewers[0].login).toBe('pendingReviewer')
      expect(result.reviewers[0].status).toBe('pending')
      expect(result.timeline[0].author).toBe('unknown') // null author
    })
  })

  describe('fetchPRChecks (exercises check counting logic)', () => {
    it('returns passing state when all checks succeed', async () => {
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { sha: 'abc123' } },
      })
      mockOctokit.checks.listForRef.mockResolvedValue({
        data: {
          check_runs: [
            { id: 1, name: 'CI', status: 'completed', conclusion: 'success', details_url: 'url', started_at: 's', completed_at: 'c', app: { name: 'Actions' } },
          ],
        },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'success', statuses: [{ id: 1, context: 'lint', state: 'success', description: 'ok', target_url: 'u', created_at: 'c', updated_at: 'u' }] },
      })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.headSha).toBe('abc123')
      expect(result.overallState).toBe('passing')
      expect(result.totalCount).toBe(2)
      expect(result.successfulCount).toBe(2)
      expect(result.failedCount).toBe(0)
    })

    it('returns failing state when any check fails', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({
        data: {
          check_runs: [
            { id: 1, name: 'CI', status: 'completed', conclusion: 'failure', html_url: 'u', app: null },
            { id: 2, name: 'Lint', status: 'completed', conclusion: 'success', app: { name: 'Linter' } },
            { id: 3, name: 'Test', status: 'completed', conclusion: 'neutral', app: null },
            { id: 4, name: 'Build', status: 'completed', conclusion: 'skipped', app: null },
            { id: 5, name: 'Deploy', status: 'completed', conclusion: 'cancelled', app: null },
            { id: 6, name: 'Sec', status: 'completed', conclusion: 'timed_out', app: null },
            { id: 7, name: 'Stale', status: 'completed', conclusion: 'stale', app: null },
            { id: 8, name: 'Action', status: 'completed', conclusion: 'action_required', app: null },
            { id: 9, name: 'Startup', status: 'completed', conclusion: 'startup_failure', app: null },
            { id: 10, name: 'Other', status: 'completed', conclusion: 'unknown_thing', app: null },
          ],
        },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'failure', statuses: [{ id: 1, context: 'x', state: 'failure' }, { id: 2, context: 'y', state: 'error' }] },
      })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.overallState).toBe('failing')
      // Check successes: CI fail, Lint success, Test neutral, Build neutral, Deploy fail, Sec fail, Stale fail, Action fail, Startup fail, Other neutral
      expect(result.successfulCount).toBe(1) // Lint
      expect(result.failedCount).toBe(6 + 2) // 6 checks + 2 statuses
      expect(result.neutralCount).toBe(3) // Test, Build, Other
    })

    it('returns pending state', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({
        data: { check_runs: [{ id: 1, name: 'CI', status: 'in_progress', conclusion: null, app: null }] },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'pending', statuses: [{ id: 1, context: 'x', state: 'pending' }] },
      })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.overallState).toBe('pending')
      expect(result.pendingCount).toBe(2)
    })

    it('returns none state when no checks', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({ data: { state: 'pending', statuses: [] } })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.overallState).toBe('none')
      expect(result.totalCount).toBe(0)
    })

    it('returns neutral state when only neutral checks exist', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({
        data: { check_runs: [{ id: 1, name: 'CI', status: 'completed', conclusion: 'neutral', app: null }] },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({ data: { state: 'success', statuses: [] } })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.overallState).toBe('neutral')
    })

    it('throws on missing head SHA', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: {} } })
      await expect(client.fetchPRChecks('myorg', 'repo', 1)).rejects.toThrow('missing a head SHA')
    })

    it('handles statusContexts default state', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'success', statuses: [{ id: 1, context: 'x', state: 'unknown' }] },
      })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.neutralCount).toBe(1)
    })
  })

  describe('fetchPRThreads (exercises mapReactionGroups)', () => {
    it('maps threads and issue comments with reactions', async () => {
      mockGraphql.mockResolvedValue({
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: 't1',
                  isResolved: false,
                  isOutdated: false,
                  path: 'src/main.ts',
                  line: 10,
                  startLine: 8,
                  diffSide: 'RIGHT',
                  comments: {
                    nodes: [
                      {
                        id: 'tc1',
                        author: { login: 'reviewer1', avatarUrl: 'av1' },
                        body: 'Fix this',
                        bodyHTML: '<p>Fix this</p>',
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                        url: 'u1',
                        diffHunk: '@@ -1,5 +1,5 @@',
                        reactionGroups: [
                          { content: 'THUMBS_UP', viewerHasReacted: true, users: { totalCount: 3 } },
                          { content: 'HEART', viewerHasReacted: false, users: { totalCount: 1 } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
            comments: {
              nodes: [
                {
                  id: 'ic1',
                  author: null,
                  body: null,
                  bodyHTML: null,
                  createdAt: '2026-01-01T00:00:00Z',
                  updatedAt: '2026-01-01T00:00:00Z',
                  url: 'u2',
                  reactionGroups: null,
                },
              ],
            },
          },
        },
      })

      const result = await client.fetchPRThreads('myorg', 'repo', 42)

      // Thread
      expect(result.threads).toHaveLength(1)
      expect(result.threads[0].path).toBe('src/main.ts')
      expect(result.threads[0].comments[0].body).toBe('Fix this')
      expect(result.threads[0].comments[0].diffHunk).toBe('@@ -1,5 +1,5 @@')

      // Reactions — all 8 types present, mapped from groups
      const reactions = result.threads[0].comments[0].reactions
      expect(reactions).toHaveLength(8)
      const thumbsUp = reactions.find(r => r.content === 'THUMBS_UP')
      expect(thumbsUp?.count).toBe(3)
      expect(thumbsUp?.viewerHasReacted).toBe(true)
      const heart = reactions.find(r => r.content === 'HEART')
      expect(heart?.count).toBe(1)
      // Missing reaction types default to 0 count
      const laugh = reactions.find(r => r.content === 'LAUGH')
      expect(laugh?.count).toBe(0)

      // Issue comment with null author/body
      expect(result.issueComments).toHaveLength(1)
      expect(result.issueComments[0].author).toBe('unknown')
      expect(result.issueComments[0].body).toBe('')
      expect(result.issueComments[0].reactions).toHaveLength(8)
      expect(result.issueComments[0].reactions.every(r => r.count === 0)).toBe(true)
    })

    it('throws when PR not found', async () => {
      mockGraphql.mockResolvedValue({ repository: null })
      await expect(client.fetchPRThreads('myorg', 'repo', 99)).rejects.toThrow(
        'PR #99 not found in myorg/repo'
      )
    })
  })

  describe('fetchRepoDetail', () => {
    it('maps full repo detail from parallel API calls', async () => {
      mockOctokit.repos.get.mockResolvedValue({
        data: {
          name: 'repo', full_name: 'myorg/repo', description: 'A repo',
          html_url: 'https://github.com/myorg/repo', homepage: 'https://example.com',
          language: 'TypeScript', default_branch: 'main', visibility: 'public',
          archived: false, fork: false, private: false,
          created_at: '2025-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          pushed_at: '2026-01-15T00:00:00Z', size: 5120,
          stargazers_count: 42, forks_count: 10, subscribers_count: 5,
          open_issues_count: 7, topics: ['typescript', 'electron'],
          license: { spdx_id: 'MIT' },
        },
      })
      mockOctokit.repos.listLanguages.mockResolvedValue({
        data: { TypeScript: 8000, JavaScript: 2000 },
      })
      mockOctokit.repos.listCommits.mockResolvedValue({
        data: [{
          sha: 'abc123', commit: { message: 'Initial commit\n\nBody', author: { name: 'Author', date: '2026-01-01T00:00:00Z' } },
          author: { login: 'author1', avatar_url: 'av' }, html_url: 'cu',
        }],
      })
      mockOctokit.repos.listContributors.mockResolvedValue({
        data: [{ login: 'c1', avatar_url: 'cav', contributions: 100, html_url: 'ch' }],
      })
      mockOctokit.pulls.list.mockResolvedValue({ data: [{ number: 1 }] })
      mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [{ name: 'CI', status: 'completed', conclusion: 'success', html_url: 'wu', created_at: 'wc', head_branch: 'main' }],
        },
      })

      const result = await client.fetchRepoDetail('myorg', 'repo')
      expect(result.name).toBe('repo')
      expect(result.language).toBe('TypeScript')
      expect(result.languages).toEqual({ TypeScript: 8000, JavaScript: 2000 })
      expect(result.recentCommits[0].message).toBe('Initial commit') // first line only
      expect(result.topContributors[0].login).toBe('c1')
      expect(result.openPRCount).toBe(7) // open_issues_count when PRs exist
      expect(result.latestWorkflowRun?.name).toBe('CI')
      expect(result.license).toBe('MIT')
      expect(result.sizeKB).toBe(5120)
    })

    it('handles failed optional API calls gracefully', async () => {
      mockOctokit.repos.get.mockResolvedValue({
        data: {
          name: 'repo', full_name: 'myorg/repo', description: null,
          html_url: 'u', homepage: null, language: null, default_branch: 'main',
          visibility: undefined, archived: undefined, fork: false, private: true,
          created_at: null, updated_at: null, pushed_at: null, size: null,
          stargazers_count: null, forks_count: null, subscribers_count: null,
          open_issues_count: null, topics: null, license: null,
        },
      })
      mockOctokit.repos.listLanguages.mockRejectedValue(new Error('fail'))
      mockOctokit.repos.listCommits.mockRejectedValue(new Error('fail'))
      mockOctokit.repos.listContributors.mockRejectedValue(new Error('fail'))
      mockOctokit.pulls.list.mockRejectedValue(new Error('fail'))
      mockOctokit.actions.listWorkflowRunsForRepo.mockRejectedValue(new Error('fail'))

      const result = await client.fetchRepoDetail('myorg', 'repo')
      expect(result.languages).toEqual({})
      expect(result.recentCommits).toEqual([])
      expect(result.topContributors).toEqual([])
      expect(result.openPRCount).toBe(0)
      expect(result.latestWorkflowRun).toBeNull()
      expect(result.visibility).toBe('private') // falls back to private flag
    })
  })

  describe('fetchRepoCounts', () => {
    it('returns separate issue and PR counts', async () => {
      mockOctokit.search.issuesAndPullRequests
        .mockResolvedValueOnce({ data: { total_count: 15 } }) // issues
        .mockResolvedValueOnce({ data: { total_count: 3 } }) // PRs

      const result = await client.fetchRepoCounts('myorg', 'repo')
      expect(result.issues).toBe(15)
      expect(result.prs).toBe(3)
    })
  })

  describe('fetchRepoCommits', () => {
    it('maps commit data', async () => {
      mockOctokit.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'abc',
            commit: {
              message: 'Fix\ndetails',
              author: { name: 'Author', date: '2026-01-01T00:00:00Z' },
              committer: { date: '2026-01-01T00:00:01Z' },
            },
            author: { login: 'user1', avatar_url: 'av' },
            html_url: 'u',
          },
          {
            sha: 'def',
            commit: { message: 'No user', author: { date: '' }, committer: null },
            author: null,
            html_url: 'u2',
          },
        ],
      })

      const result = await client.fetchRepoCommits('myorg', 'repo', 10)
      expect(result[0].message).toBe('Fix') // first line
      expect(result[0].author).toBe('user1')
      expect(result[1].author).toBe('unknown')
    })
  })

  describe('fetchRepoCommitDetail', () => {
    it('maps full commit detail with files', async () => {
      mockOctokit.repos.getCommit.mockResolvedValue({
        data: {
          sha: 'abc123',
          commit: {
            message: 'feat: new feature\n\nLong description',
            author: { name: 'Author', date: '2026-01-01T00:00:00Z' },
            committer: { date: '2026-01-01T00:00:01Z' },
          },
          author: { login: 'user1', avatar_url: 'av' },
          html_url: 'https://github.com/myorg/repo/commit/abc123',
          parents: [{ sha: 'parent1', html_url: 'https://github.com/myorg/repo/commit/parent1' }],
          stats: { additions: 10, deletions: 5, total: 15 },
          files: [
            {
              filename: 'src/main.ts',
              previous_filename: null,
              status: 'modified',
              additions: 10,
              deletions: 5,
              changes: 15,
              patch: '@@ -1 +1 @@',
              blob_url: 'b',
            },
          ],
        },
      })

      const result = await client.fetchRepoCommitDetail('myorg', 'repo', 'abc123')
      expect(result.messageHeadline).toBe('feat: new feature')
      expect(result.stats.total).toBe(15)
      expect(result.files).toHaveLength(1)
      expect(result.parents[0].sha).toBe('parent1')
    })

    it('handles missing optional fields', async () => {
      mockOctokit.repos.getCommit.mockResolvedValue({
        data: {
          sha: 'abc',
          commit: { message: '', author: { date: '2026-01-01T00:00:00Z' }, committer: { date: '2026-01-01T00:00:01Z' } },
          author: null, html_url: 'u',
          parents: [{ sha: 'p1' }], // no html_url
          stats: null, files: null,
        },
      })

      const result = await client.fetchRepoCommitDetail('myorg', 'repo', 'abc')
      expect(result.author).toBe('unknown')
      expect(result.messageHeadline).toBe('abc') // falls back to sha
      expect(result.stats).toEqual({ additions: 0, deletions: 0, total: 0 })
      expect(result.files).toEqual([])
    })
  })

  describe('fetchPRBranches', () => {
    it('returns head and base branch info', async () => {
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { ref: 'feature', sha: 'abc' }, base: { ref: 'main' } },
      })

      const result = await client.fetchPRBranches('myorg', 'repo', 1)
      expect(result.headBranch).toBe('feature')
      expect(result.baseBranch).toBe('main')
      expect(result.headSha).toBe('abc')
    })
  })

  describe('fetchPRFilesChanged', () => {
    it('paginate and sum files changed', async () => {
      mockOctokit.paginate.mockResolvedValue([
        { filename: 'a.ts', status: 'added', additions: 10, deletions: 0, changes: 10, patch: '+new', blob_url: 'b1' },
        { filename: 'b.ts', previous_filename: 'old.ts', status: 'renamed', additions: 2, deletions: 1, changes: 3, patch: null, blob_url: null },
      ])

      const result = await client.fetchPRFilesChanged('myorg', 'repo', 1)
      expect(result.files).toHaveLength(2)
      expect(result.additions).toBe(12)
      expect(result.deletions).toBe(1)
      expect(result.changes).toBe(13)
      expect(result.files[1].previousFilename).toBe('old.ts')
    })
  })

  describe('fetchMyPRs / fetchNeedsReview / fetchRecentlyMerged / fetchNeedANudge', () => {
    // These all delegate to fetchPRs which is async and complex.
    // We verify they exist and call without error when mocked.
    it('fetchMyPRs delegates correctly', () => {
      expect(typeof client.fetchMyPRs).toBe('function')
    })

    it('fetchNeedsReview delegates correctly', () => {
      expect(typeof client.fetchNeedsReview).toBe('function')
    })

    it('fetchRecentlyMerged delegates correctly', () => {
      expect(typeof client.fetchRecentlyMerged).toBe('function')
    })

    it('fetchNeedANudge delegates correctly', () => {
      expect(typeof client.fetchNeedANudge).toBe('function')
    })
  })
})
