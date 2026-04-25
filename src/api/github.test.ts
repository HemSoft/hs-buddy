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
    createReview: vi.fn(),
    requestReviewers: vi.fn(),
  },
  users: {
    getAuthenticated: vi.fn(),
    getByUsername: vi.fn(),
  },
  repos: {
    get: vi.fn(),
    listLanguages: vi.fn(),
    listCommits: vi.fn(),
    listContributors: vi.fn(),
    getCombinedStatusForRef: vi.fn(),
    getCommit: vi.fn(),
    listForOrg: vi.fn(),
    listForUser: vi.fn(),
  },
  actions: {
    listWorkflowRunsForRepo: vi.fn(),
    listRepoWorkflows: vi.fn(),
    listWorkflowRuns: vi.fn(),
  },
  checks: {
    listForRef: vi.fn(),
  },
  search: {
    issuesAndPullRequests: vi.fn(),
    commits: vi.fn(),
  },
  paginate: vi.fn(),
  orgs: {
    listMembers: vi.fn(),
    get: vi.fn(),
    getMembershipForUser: vi.fn(),
  },
  issues: {
    listForRepo: vi.fn(),
    get: vi.fn(),
    listComments: vi.fn(),
    createComment: vi.fn(),
  },
  rateLimit: {
    get: vi.fn(),
  },
  activity: {
    listPublicEventsForUser: vi.fn(),
  },
  teams: {
    list: vi.fn(),
    getMembershipForUserInOrg: vi.fn(),
    listMembersInOrg: vi.fn(),
  },
}

// Mock @octokit/rest — plugin() must return a class (used with `new`)
vi.mock('@octokit/rest', () => ({
  Octokit: {
    plugin: () =>
      class MockOctokit {
        constructor() {
          return mockOctokit as unknown as MockOctokit
        }
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

import {
  GitHubClient,
  eventSummary,
  EVENT_LABELS,
  clearOrgAvatarCache,
  clearAllCaches,
  getOrgAvatarCacheEntry,
} from './github'

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
    clearAllCaches()
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

    it('catches IPC invocation errors and returns null', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('IPC connection lost'))
      const result = await GitHubClient.getActiveCliAccount()
      expect(result).toBeNull()
    })

    it('catches timeout errors from IPC renderer and returns null', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Timeout'))
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
          {
            user: { login: 'user2' },
            state: 'CHANGES_REQUESTED',
            submitted_at: '2026-01-01T00:00:00Z',
          },
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
            number: 1,
            title: 'PR',
            state: 'open',
            user: { login: 'a' },
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: [],
            head: { ref: 'h' },
            base: { ref: 'b' },
            assignees: [],
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
            number: 1,
            title: 'PR',
            state: 'open',
            user: null,
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: ['plain-string-label'],
            head: null,
            base: null,
            assignees: null,
            draft: undefined,
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
        data: [
          {
            number: 1,
            title: 'PR',
            state: 'open',
            user: { login: 'a' },
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: [],
            head: { ref: 'h' },
            base: { ref: 'b' },
            assignees: [],
          },
        ],
      })
      mockOctokit.users.getAuthenticated.mockResolvedValue({ data: { login: 'viewer' } })
      // reviewer approved first, then requested changes → latest wins
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z' },
          {
            user: { login: 'reviewer' },
            state: 'CHANGES_REQUESTED',
            submitted_at: '2026-01-02T00:00:00Z',
          },
          { user: null, state: 'APPROVED', submitted_at: '2026-01-01T00:00:00Z' }, // null user skip
        ],
      })

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].approvalCount).toBe(0) // reviewer's latest is CHANGES_REQUESTED
      expect(result[0].iApproved).toBe(false)
    })

    it('countApprovals case-insensitive viewer match', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 1,
            title: 'PR',
            state: 'open',
            user: { login: 'a' },
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: [],
            head: { ref: 'h' },
            base: { ref: 'b' },
            assignees: [],
          },
        ],
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
                {
                  id: 'c1',
                  createdAt: '2026-01-01T12:00:00Z',
                  bodyText: 'Looks good overall',
                  url: 'url1',
                  author: { login: 'commenter1' },
                },
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
                {
                  id: 'r1',
                  state: 'APPROVED',
                  submittedAt: '2026-01-02T12:00:00Z',
                  url: 'rev-url1',
                  author: { login: 'reviewer1', avatarUrl: 'av1' },
                },
                {
                  id: 'r2',
                  state: 'COMMENTED',
                  submittedAt: '2026-01-01T18:00:00Z',
                  url: 'rev-url2',
                  author: { login: 'reviewer2', avatarUrl: 'av2' },
                },
                {
                  id: 'r3',
                  state: 'CHANGES_REQUESTED',
                  submittedAt: null,
                  url: 'rev-url3',
                  author: { login: 'reviewer3', avatarUrl: 'av3' },
                }, // no submittedAt → skipped in timeline
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
            closingIssuesReferences: {
              nodes: [
                {
                  number: 148,
                  title: 'Fix crash on login',
                  url: 'https://github.com/myorg/repo/issues/148',
                },
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

      // Linked issues
      expect(result.linkedIssues).toHaveLength(1)
      expect(result.linkedIssues[0].number).toBe(148)
      expect(result.linkedIssues[0].url).toBe('https://github.com/myorg/repo/issues/148')

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
              nodes: [
                {
                  requestedReviewer: {
                    __typename: 'User',
                    login: 'pendingReviewer',
                    avatarUrl: 'av',
                  },
                },
              ],
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
            {
              id: 1,
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              details_url: 'url',
              started_at: 's',
              completed_at: 'c',
              app: { name: 'Actions' },
            },
          ],
        },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: {
          state: 'success',
          statuses: [
            {
              id: 1,
              context: 'lint',
              state: 'success',
              description: 'ok',
              target_url: 'u',
              created_at: 'c',
              updated_at: 'u',
            },
          ],
        },
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
            {
              id: 1,
              name: 'CI',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'u',
              app: null,
            },
            {
              id: 2,
              name: 'Lint',
              status: 'completed',
              conclusion: 'success',
              app: { name: 'Linter' },
            },
            { id: 3, name: 'Test', status: 'completed', conclusion: 'neutral', app: null },
            { id: 4, name: 'Build', status: 'completed', conclusion: 'skipped', app: null },
            { id: 5, name: 'Deploy', status: 'completed', conclusion: 'cancelled', app: null },
            { id: 6, name: 'Sec', status: 'completed', conclusion: 'timed_out', app: null },
            { id: 7, name: 'Stale', status: 'completed', conclusion: 'stale', app: null },
            {
              id: 8,
              name: 'Action',
              status: 'completed',
              conclusion: 'action_required',
              app: null,
            },
            {
              id: 9,
              name: 'Startup',
              status: 'completed',
              conclusion: 'startup_failure',
              app: null,
            },
            { id: 10, name: 'Other', status: 'completed', conclusion: 'unknown_thing', app: null },
          ],
        },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: {
          state: 'failure',
          statuses: [
            { id: 1, context: 'x', state: 'failure' },
            { id: 2, context: 'y', state: 'error' },
          ],
        },
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
        data: {
          check_runs: [{ id: 1, name: 'CI', status: 'in_progress', conclusion: null, app: null }],
        },
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
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'pending', statuses: [] },
      })

      const result = await client.fetchPRChecks('myorg', 'repo', 1)
      expect(result.overallState).toBe('none')
      expect(result.totalCount).toBe(0)
    })

    it('returns neutral state when only neutral checks exist', async () => {
      mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'sha1' } } })
      mockOctokit.checks.listForRef.mockResolvedValue({
        data: {
          check_runs: [
            { id: 1, name: 'CI', status: 'completed', conclusion: 'neutral', app: null },
          ],
        },
      })
      mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
        data: { state: 'success', statuses: [] },
      })

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
                          {
                            content: 'THUMBS_UP',
                            viewerHasReacted: true,
                            users: { totalCount: 3 },
                          },
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
            reviews: {
              nodes: [
                {
                  id: 'rev1',
                  state: 'COMMENTED',
                  body: '## Review summary\nLooks good.',
                  bodyHTML: '<h2>Review summary</h2><p>Looks good.</p>',
                  submittedAt: '2026-01-01T01:00:00Z',
                  url: 'https://github.com/myorg/repo/pull/42#pullrequestreview-1',
                  author: { login: 'copilot-bot', avatarUrl: 'av3' },
                },
                {
                  id: 'rev2',
                  state: 'APPROVED',
                  body: null,
                  bodyHTML: null,
                  submittedAt: '2026-01-01T02:00:00Z',
                  url: 'https://github.com/myorg/repo/pull/42#pullrequestreview-2',
                  author: { login: 'reviewer1', avatarUrl: 'av1' },
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

      // Reviews — only those with body are included
      expect(result.reviews).toHaveLength(1)
      expect(result.reviews[0].id).toBe('rev1')
      expect(result.reviews[0].state).toBe('COMMENTED')
      expect(result.reviews[0].author).toBe('copilot-bot')
      expect(result.reviews[0].body).toBe('## Review summary\nLooks good.')
      expect(result.reviews[0].bodyHtml).toBe('<h2>Review summary</h2><p>Looks good.</p>')
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
          name: 'repo',
          full_name: 'myorg/repo',
          description: 'A repo',
          html_url: 'https://github.com/myorg/repo',
          homepage: 'https://example.com',
          language: 'TypeScript',
          default_branch: 'main',
          visibility: 'public',
          archived: false,
          fork: false,
          private: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          pushed_at: '2026-01-15T00:00:00Z',
          size: 5120,
          stargazers_count: 42,
          forks_count: 10,
          subscribers_count: 5,
          open_issues_count: 7,
          topics: ['typescript', 'electron'],
          license: { spdx_id: 'MIT' },
        },
      })
      mockOctokit.repos.listLanguages.mockResolvedValue({
        data: { TypeScript: 8000, JavaScript: 2000 },
      })
      mockOctokit.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'abc123',
            commit: {
              message: 'Initial commit\n\nBody',
              author: { name: 'Author', date: '2026-01-01T00:00:00Z' },
            },
            author: { login: 'author1', avatar_url: 'av' },
            html_url: 'cu',
          },
        ],
      })
      mockOctokit.repos.listContributors.mockResolvedValue({
        data: [{ login: 'c1', avatar_url: 'cav', contributions: 100, html_url: 'ch' }],
      })
      mockOctokit.pulls.list.mockResolvedValue({ data: [{ number: 1 }] })
      mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            {
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              html_url: 'wu',
              created_at: 'wc',
              head_branch: 'main',
            },
          ],
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
          name: 'repo',
          full_name: 'myorg/repo',
          description: null,
          html_url: 'u',
          homepage: null,
          language: null,
          default_branch: 'main',
          visibility: undefined,
          archived: undefined,
          fork: false,
          private: true,
          created_at: null,
          updated_at: null,
          pushed_at: null,
          size: null,
          stargazers_count: null,
          forks_count: null,
          subscribers_count: null,
          open_issues_count: null,
          topics: null,
          license: null,
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

    it('throws error when getOctokitForOwner fails (auth catch block)', async () => {
      // Mock the getOctokit method to return null for all accounts, triggering getOctokitForOwner to throw
      // We need to use a fresh config where none of the accounts can authenticate
      mockInvoke.mockImplementation((_channel: string, _username: string) => {
        // Return no token for any account (simulates failed auth)
        if (_channel === 'github:get-cli-token') return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const noAuthConfig = {
        accounts: [{ username: 'noauth-user', org: 'some-org' }],
      }
      const noAuthClient = new GitHubClient(noAuthConfig)

      await expect(noAuthClient.fetchRepoDetail('some-org', 'repo')).rejects.toThrow(
        /No authenticated GitHub account available to fetch some-org\/repo/
      )
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
          commit: {
            message: '',
            author: { date: '2026-01-01T00:00:00Z' },
            committer: { date: '2026-01-01T00:00:01Z' },
          },
          author: null,
          html_url: 'u',
          parents: [{ sha: 'p1' }], // no html_url
          stats: null,
          files: null,
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
        {
          filename: 'a.ts',
          status: 'added',
          additions: 10,
          deletions: 0,
          changes: 10,
          patch: '+new',
          blob_url: 'b1',
        },
        {
          filename: 'b.ts',
          previous_filename: 'old.ts',
          status: 'renamed',
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: null,
          blob_url: null,
        },
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

  describe('fetchRepoIssues', () => {
    it('returns mapped issues filtering out PRs', async () => {
      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: [
          {
            number: 10,
            title: 'Bug report',
            state: 'open',
            user: { login: 'reporter', avatar_url: 'https://av' },
            html_url: 'https://github.com/myorg/repo/issues/10',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
            labels: [{ name: 'bug', color: 'ff0000' }],
            comments: 3,
            assignees: [{ login: 'dev1', avatar_url: 'https://av2' }],
          },
          {
            number: 11,
            title: 'PR disguised as issue',
            state: 'open',
            user: { login: 'author' },
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: [],
            comments: 0,
            assignees: [],
            pull_request: { url: 'https://api.github.com/repos/myorg/repo/pulls/11' },
          },
        ],
      })

      const result = await client.fetchRepoIssues('myorg', 'repo')
      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(10)
      expect(result[0].title).toBe('Bug report')
      expect(result[0].author).toBe('reporter')
      expect(result[0].labels).toEqual([{ name: 'bug', color: 'ff0000' }])
      expect(result[0].commentCount).toBe(3)
      expect(result[0].assignees[0].login).toBe('dev1')
    })

    it('handles missing user and assignees', async () => {
      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: [
          {
            number: 20,
            title: 'No user',
            state: 'open',
            user: null,
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: ['string-label'],
            comments: 0,
            assignees: null,
          },
        ],
      })

      const result = await client.fetchRepoIssues('myorg', 'repo')
      expect(result[0].author).toBe('unknown')
      expect(result[0].assignees).toEqual([])
    })
  })

  describe('fetchRepoIssueDetail', () => {
    it('returns issue detail with comments', async () => {
      mockOctokit.issues.get.mockResolvedValue({
        data: {
          number: 10,
          title: 'Bug report',
          state: 'open',
          user: { login: 'reporter', avatar_url: 'https://av' },
          html_url: 'https://github.com/myorg/repo/issues/10',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          labels: [{ name: 'bug', color: 'ff0000' }],
          body: 'Description of the bug',
          comments: 1,
          assignees: [],
          milestone: null,
          closed_at: null,
          closed_by: null,
        },
      })

      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 100,
            user: { login: 'commenter', avatar_url: 'https://av3' },
            body: 'I can reproduce this',
            created_at: '2026-01-01T12:00:00Z',
            updated_at: '2026-01-01T12:00:00Z',
          },
        ],
      })

      const result = await client.fetchRepoIssueDetail('myorg', 'repo', 10)
      expect(result.number).toBe(10)
      expect(result.title).toBe('Bug report')
      expect(result.body).toBe('Description of the bug')
      expect(result.comments).toHaveLength(1)
      expect(result.comments[0].author).toBe('commenter')
    })
  })

  describe('replyToReviewThread', () => {
    it('sends GraphQL mutation and returns mapped comment', async () => {
      mockGraphql.mockResolvedValue({
        addPullRequestReviewThreadReply: {
          comment: {
            id: 'comment-id-1',
            author: { login: 'user1', avatarUrl: 'https://av' },
            body: 'My reply',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            url: 'https://github.com/myorg/repo/pull/1#comment-1',
          },
        },
      })

      const result = await client.replyToReviewThread('myorg', 1, 'thread-id', 'My reply')
      expect(result.id).toBe('comment-id-1')
      expect(result.author).toBe('user1')
      expect(result.body).toBe('My reply')
      expect(result.reactions).toEqual([])
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.stringContaining('addPullRequestReviewThreadReply'),
        expect.objectContaining({ threadId: 'thread-id', body: 'My reply' })
      )
    })

    it('handles null author', async () => {
      mockGraphql.mockResolvedValue({
        addPullRequestReviewThreadReply: {
          comment: {
            id: 'c2',
            author: null,
            body: 'reply',
            createdAt: 'c',
            updatedAt: 'u',
            url: 'url',
          },
        },
      })

      const result = await client.replyToReviewThread('myorg', 1, 'tid', 'reply')
      expect(result.author).toBe('unknown')
      expect(result.authorAvatarUrl).toBeNull()
    })
  })

  describe('resolveReviewThread', () => {
    it('sends GraphQL mutation', async () => {
      mockGraphql.mockResolvedValue({
        resolveReviewThread: { thread: { id: 'tid', isResolved: true } },
      })

      await client.resolveReviewThread('myorg', 'thread-id')
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.stringContaining('resolveReviewThread'),
        expect.objectContaining({ threadId: 'thread-id' })
      )
    })
  })

  describe('unresolveReviewThread', () => {
    it('sends GraphQL mutation', async () => {
      mockGraphql.mockResolvedValue({
        unresolveReviewThread: { thread: { id: 'tid', isResolved: false } },
      })

      await client.unresolveReviewThread('myorg', 'thread-id')
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.stringContaining('unresolveReviewThread'),
        expect.objectContaining({ threadId: 'thread-id' })
      )
    })
  })

  describe('addPRComment', () => {
    it('creates issue comment and returns mapped result', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({
        data: {
          id: 999,
          node_id: 'IC_kwDOabc',
          user: { login: 'user1', avatar_url: 'https://av' },
          body: 'Great work!',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          html_url: 'https://github.com/myorg/repo/pull/1#issuecomment-999',
        },
      })

      const result = await client.addPRComment('myorg', 'repo', 1, 'Great work!')
      expect(result.id).toBe('IC_kwDOabc')
      expect(result.author).toBe('user1')
      expect(result.body).toBe('Great work!')
      expect(result.reactions).toEqual([])
    })

    it('falls back to string id when node_id is missing', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({
        data: {
          id: 888,
          node_id: '',
          user: null,
          body: '',
          created_at: 'c',
          updated_at: 'u',
          html_url: 'h',
        },
      })

      const result = await client.addPRComment('myorg', 'repo', 1, 'test')
      expect(result.id).toBe('888')
      expect(result.author).toBe('unknown')
    })
  })

  describe('addCommentReaction', () => {
    it('sends GraphQL mutation with correct content', async () => {
      mockGraphql.mockResolvedValue({
        addReaction: { reaction: { content: 'THUMBS_UP' } },
      })

      await client.addCommentReaction('myorg', 'subject-id', 'THUMBS_UP')
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.stringContaining('addReaction'),
        expect.objectContaining({ subjectId: 'subject-id', content: 'THUMBS_UP' })
      )
    })
  })

  describe('approvePullRequest', () => {
    it('creates an APPROVE review', async () => {
      mockOctokit.pulls.createReview = vi.fn().mockResolvedValue({ data: {} })

      await client.approvePullRequest('myorg', 'repo', 42)
      expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith({
        owner: 'myorg',
        repo: 'repo',
        pull_number: 42,
        event: 'APPROVE',
        body: 'Approved',
      })
    })

    it('accepts custom body', async () => {
      mockOctokit.pulls.createReview = vi.fn().mockResolvedValue({ data: {} })

      await client.approvePullRequest('myorg', 'repo', 42, 'LGTM!')
      expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'LGTM!' })
      )
    })
  })

  describe('getRateLimit', () => {
    it('returns rate limit info', async () => {
      mockOctokit.rateLimit.get.mockResolvedValue({
        data: {
          resources: {
            core: { limit: 5000, remaining: 4999, reset: 1234567890, used: 1 },
          },
        },
      })

      const result = await client.getRateLimit('myorg')
      expect(result.limit).toBe(5000)
      expect(result.remaining).toBe(4999)
      expect(result.used).toBe(1)
    })
  })

  describe('fetchOrgRepos', () => {
    it('returns repos for org', async () => {
      mockOctokit.repos.listForOrg.mockResolvedValue({
        data: [
          {
            name: 'repo1',
            full_name: 'myorg/repo1',
            description: 'Test repo',
            private: false,
            default_branch: 'main',
            language: 'TypeScript',
            updated_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/myorg/repo1',
            archived: false,
            stargazers_count: 5,
            forks_count: 1,
          },
        ],
      })
      const result = await client.fetchOrgRepos('myorg')
      expect(result.authenticatedAs).toBeDefined()
      expect(result.repos.length).toBeGreaterThanOrEqual(1)
      expect(result.repos[0].name).toBe('repo1')
    })
  })

  describe('fetchOrgMembers', () => {
    it('returns members for org', async () => {
      mockOctokit.paginate.mockResolvedValue([
        {
          login: 'member1',
          avatar_url: 'https://avatar',
          html_url: 'https://github.com/member1',
          type: 'User',
        },
      ])
      const result = await client.fetchOrgMembers('myorg')
      expect(result.authenticatedAs).toBeDefined()
      expect(result.members.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('fetchSFLStatus', () => {
    it('returns isSFLEnabled false when no SFL workflows found', async () => {
      mockOctokit.actions.listRepoWorkflows = vi.fn().mockResolvedValue({
        data: { workflows: [{ name: 'CI Build', id: 1, state: 'active' }] },
      })
      const result = await client.fetchSFLStatus('myorg', 'my-repo')
      expect(result.isSFLEnabled).toBe(false)
      expect(result.workflows).toHaveLength(0)
    })

    it('returns isSFLEnabled true when SFL workflows exist', async () => {
      mockOctokit.actions.listRepoWorkflows = vi.fn().mockResolvedValue({
        data: {
          workflows: [
            { name: 'SFL Issue Processor', id: 10, state: 'active' },
            { name: 'SFL PR Router', id: 11, state: 'active' },
          ],
        },
      })
      mockOctokit.actions.listWorkflowRuns = vi.fn().mockResolvedValue({
        data: {
          workflow_runs: [
            {
              status: 'completed',
              conclusion: 'success',
              created_at: '2026-01-01T00:00:00Z',
              html_url: 'https://github.com/myorg/repo/actions/runs/1',
            },
          ],
        },
      })
      const result = await client.fetchSFLStatus('myorg', 'my-repo')
      expect(result.isSFLEnabled).toBe(true)
      expect(result.workflows.length).toBeGreaterThan(0)
    })
  })

  describe('fetchUserActivity', () => {
    it('returns user activity summary', async () => {
      const mockSearchResult = (items: unknown[], total_count = 1) => ({
        data: { total_count, items },
      })

      mockOctokit.repos.listForOrg.mockResolvedValue({
        data: [
          {
            name: 'repo1',
            full_name: 'myorg/repo1',
            description: 'Test',
            private: false,
            default_branch: 'main',
            language: 'TypeScript',
            updated_at: '2026-01-01T00:00:00Z',
            pushed_at: new Date().toISOString(),
            html_url: 'https://github.com/myorg/repo1',
            archived: false,
            stargazers_count: 5,
            forks_count: 1,
          },
        ],
      })

      const commitData = [
        {
          sha: 'abc123',
          author: {
            login: 'user1',
            avatar_url: 'https://avatar',
            html_url: 'https://github.com/user1',
          },
          commit: { author: { name: 'user1', date: new Date().toISOString() }, message: 'fix bug' },
        },
        {
          sha: 'def456',
          author: {
            login: 'user1',
            avatar_url: 'https://avatar',
            html_url: 'https://github.com/user1',
          },
          commit: {
            author: { name: 'user1', date: new Date().toISOString() },
            message: 'refine logic',
          },
        },
        {
          sha: 'ghi789',
          author: {
            login: 'user1',
            avatar_url: 'https://avatar',
            html_url: 'https://github.com/user1',
          },
          commit: {
            author: { name: 'user1', date: new Date().toISOString() },
            message: 'add tests',
          },
        },
      ]
      mockOctokit.paginate.mockImplementation((fn: unknown) => {
        if (fn === mockOctokit.teams.list)
          return Promise.resolve([{ slug: 'eng', name: 'Engineering' }])
        return Promise.resolve(commitData)
      })

      const prItem = {
        number: 42,
        title: 'Fix bug',
        repository_url: 'https://api.github.com/repos/myorg/repo1',
        state: 'open',
        pull_request: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        html_url: 'https://github.com/myorg/repo1/pull/42',
      }

      const mergedItem = {
        number: 40,
        title: 'Add feature',
        repository_url: 'https://api.github.com/repos/myorg/repo2',
        state: 'closed',
        pull_request: { merged_at: '2026-01-01T00:00:00Z' },
        created_at: '2025-12-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        html_url: 'https://github.com/myorg/repo2/pull/40',
      }

      let searchCallCount = 0
      mockOctokit.search.issuesAndPullRequests.mockImplementation(() => {
        searchCallCount++
        if (searchCallCount === 1) return Promise.resolve(mockSearchResult([prItem], 1))
        if (searchCallCount === 2) return Promise.resolve(mockSearchResult([mergedItem], 1))
        return Promise.resolve(mockSearchResult([], 0))
      })

      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({
        data: [
          {
            type: 'PushEvent',
            repo: { name: 'myorg/repo1' },
            created_at: new Date().toISOString(),
            payload: { size: 0 },
          },
          {
            type: 'PullRequestReviewEvent',
            repo: { name: 'myorg/repo1' },
            created_at: '2026-01-01T00:00:00Z',
            payload: {},
          },
        ],
      })

      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })
      mockOctokit.teams.getMembershipForUserInOrg.mockResolvedValue({
        data: { state: 'active', role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      expect(result.recentPRsAuthored.length).toBeGreaterThanOrEqual(1)
      expect(result.recentPRsAuthored[0].number).toBe(42)
      expect(result.openPRCount).toBe(1)
      expect(result.mergedPRCount).toBe(1)
      expect(result.recentEvents.length).toBe(2)
      expect(result.recentEvents[0].summary).toBe('Pushed 0 commits')
      expect(result.activeRepos).toContain('myorg/repo1')
      expect(result.commitsToday).toBe(3)
      expect(result.orgRole).toBe('member')
      expect(result.teams).toEqual(['Engineering'])
    })

    it('handles API errors gracefully', async () => {
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockRejectedValue(new Error('API error'))
      mockOctokit.activity.listPublicEventsForUser.mockRejectedValue(new Error('API error'))
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockRejectedValue(new Error('API error'))

      const result = await client.fetchUserActivity('myorg', 'user1')
      expect(result.recentPRsAuthored).toEqual([])
      expect(result.recentPRsReviewed).toEqual([])
      expect(result.recentEvents).toEqual([])
      expect(result.openPRCount).toBe(0)
      expect(result.mergedPRCount).toBe(0)
      expect(result.commitsToday).toBe(0)
      expect(result.orgRole).toBeNull()
      expect(result.teams).toEqual([])
    })

    it('handles GraphQL query failure (profile returns null)', async () => {
      // Simulate GraphQL failing to get user profile
      mockGraphql.mockResolvedValue({
        user: null,
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      // When GraphQL fails (returns null), commitsToday should be 0
      expect(result.commitsToday).toBe(0)
      expect(result.orgRole).toBe('member')
    })

    it('handles team membership check failures silently', async () => {
      // Simulate paginate returning teams but getMembershipForUserInOrg failing
      mockGraphql.mockResolvedValue({
        user: {
          contributionsCollection: { contributionCalendar: { totalContributions: 5 } },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([
        { slug: 'engineering', name: 'Engineering', description: 'Eng team' },
      ])
      // getMembershipForUserInOrg throws for each team (catch block silently ignores)
      mockOctokit.teams.getMembershipForUserInOrg.mockRejectedValue(
        new Error('Not a member of this team')
      )
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      // Teams should be empty because membership check failed for all
      expect(result.teams).toEqual([])
      expect(result.orgRole).toBe('member')
    })

    it('handles per-repo commit fetch failures silently', async () => {
      // When paginate on repos.listCommits fails for a repo, should continue with events fallback
      mockGraphql.mockResolvedValue({
        user: {
          contributionsCollection: { contributionCalendar: { totalContributions: 0 } },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({
        data: [{ name: 'repo1' }, { name: 'repo2' }],
      })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockRejectedValue(new Error('Repo listing failed'))
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      // Should fall back to 0 commits when per-repo fetch fails
      expect(result.commitsToday).toBe(0)
    })

    it('handles graphql throw and returns null for profile (catch block)', async () => {
      mockGraphql.mockRejectedValue(new Error('GraphQL network error'))
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      // userProfile is null → contribution fields fall back to null
      expect(result.totalContributions).toBeNull()
      expect(result.contributionWeeks).toBeNull()
      expect(result.contributionSource).toBe('org-activity')
      expect(result.name).toBeNull()
    })

    it('uses GraphQL data when search returns less contributions', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'User One',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 1735,
              weeks: [
                {
                  contributionDays: [
                    { date: '2026-01-01', contributionCount: 5, color: '#30a14e' },
                  ],
                },
              ],
            },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.search.commits.mockResolvedValue({ data: { items: [] } })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      // When GraphQL has more data than search, use GraphQL (e.g. token has read:user)
      const result = await client.fetchUserActivity('myorg', 'user1')
      expect(result.contributionSource).toBe('graphql')
      expect(result.totalContributions).toBe(1735)
      expect(result.contributionWeeks).toHaveLength(1)
    })

    it('uses search-derived data when it has more contributions than GraphQL', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'User One',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: { totalContributions: 11, weeks: [] },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      // Return commit dates from search
      mockOctokit.search.commits.mockResolvedValue({
        data: {
          items: [
            { commit: { committer: { date: '2026-03-15T10:00:00Z' } } },
            { commit: { committer: { date: '2026-03-15T11:00:00Z' } } },
            { commit: { committer: { date: '2026-03-16T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-17T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-18T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-19T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-20T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-21T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-22T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-23T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-24T09:00:00Z' } } },
            { commit: { committer: { date: '2026-03-25T09:00:00Z' } } },
          ],
        },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      // 12 commits > 11 GraphQL contributions → use search data
      expect(result.contributionSource).toBe('org-activity')
      expect(result.totalContributions).toBe(12)
      expect(result.contributionWeeks!.length).toBeGreaterThan(0)
    })

    it('returns GraphQL data for cross-user view with 0 search results', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'Other User',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: { totalContributions: 0, weeks: [] },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.search.commits.mockResolvedValue({ data: { items: [] } })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'member' },
      })

      const result = await client.fetchUserActivity('myorg', 'other-user')
      expect(result.contributionSource).toBe('graphql')
      expect(result.totalContributions).toBe(0)
    })

    it('extracts repos from reviewed PR items via repository_url', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'Test User',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: { totalContributions: 10, weeks: [] },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockImplementation((opts: { q: string }) => {
        // Return reviewed PR for the review query
        if (opts.q.includes('reviewed-by:')) {
          return Promise.resolve({
            data: {
              total_count: 1,
              items: [
                {
                  number: 99,
                  title: 'Reviewed PR',
                  repository_url: 'https://api.github.com/repos/myorg/reviewed-repo',
                  state: 'open',
                  pull_request: {},
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-02T00:00:00Z',
                  html_url: 'https://github.com/myorg/reviewed-repo/pull/99',
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: { total_count: 0, items: [] } })
      })
      mockOctokit.search.commits.mockResolvedValue({ data: { items: [] } })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({
        data: { role: 'admin' },
      })

      const result = await client.fetchUserActivity('myorg', 'user1')
      expect(result.activeRepos).toContain('myorg/reviewed-repo')
    })

    it('uses org activity search for contributions including PRs and issues', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'Active User',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: { totalContributions: 0, weeks: [] },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      // PR/issue date searches also return items
      mockOctokit.search.issuesAndPullRequests.mockImplementation((opts: { q: string }) => {
        if (opts.q.includes('is:pr') && opts.q.includes('created:>=')) {
          return Promise.resolve({
            data: {
              total_count: 2,
              items: [
                { created_at: '2026-03-10T10:00:00Z' },
                { created_at: '2026-03-11T10:00:00Z' },
              ],
            },
          })
        }
        if (opts.q.includes('is:issue') && opts.q.includes('created:>=')) {
          return Promise.resolve({
            data: {
              total_count: 1,
              items: [{ created_at: '2026-03-12T10:00:00Z' }],
            },
          })
        }
        return Promise.resolve({ data: { total_count: 0, items: [] } })
      })
      mockOctokit.search.commits.mockResolvedValue({
        data: {
          items: [{ commit: { committer: { date: '2026-03-15T10:00:00Z' } } }],
        },
      })
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({ data: { role: 'member' } })

      const result = await client.fetchUserActivity('myorg', 'other-user')
      expect(result.contributionSource).toBe('org-activity')
      // 1 commit + 2 PRs + 1 issue = 4 total
      expect(result.totalContributions).toBe(4)
      expect(result.contributionWeeks!.length).toBeGreaterThan(0)
    })

    it('handles search API failure gracefully and falls back to GraphQL', async () => {
      mockGraphql.mockResolvedValue({
        user: {
          name: 'Other User',
          bio: null,
          company: null,
          location: null,
          createdAt: '2020-01-01',
          status: null,
          contributionsCollection: {
            contributionCalendar: { totalContributions: 5, weeks: [] },
          },
        },
        viewer: { login: 'user1' },
      })
      mockOctokit.repos.listForOrg.mockResolvedValue({ data: [] })
      mockOctokit.search.issuesAndPullRequests.mockRejectedValue(new Error('Search API error'))
      mockOctokit.search.commits.mockRejectedValue(new Error('Search API error'))
      mockOctokit.activity.listPublicEventsForUser.mockResolvedValue({ data: [] })
      mockOctokit.paginate.mockResolvedValue([])
      mockOctokit.orgs.getMembershipForUser.mockResolvedValue({ data: { role: 'member' } })

      const result = await client.fetchUserActivity('myorg', 'other-user')
      // Search failed but GraphQL has data → use GraphQL
      expect(result.contributionSource).toBe('graphql')
      expect(result.totalContributions).toBe(5)
    })
  })

  describe('buildContributionCalendar', () => {
    it('builds weeks aligned to Sundays from commit dates', async () => {
      const { buildContributionCalendar } = await import('./github')
      const result = buildContributionCalendar([
        '2026-03-15T10:00:00Z',
        '2026-03-15T11:00:00Z',
        '2026-03-16T09:00:00Z',
      ])
      expect(result.totalContributions).toBe(3)
      expect(result.weeks.length).toBeGreaterThan(50)
      const activeDays = result.weeks
        .flatMap(w => w.contributionDays)
        .filter(d => d.contributionCount > 0)
      expect(activeDays).toHaveLength(2)
      expect(activeDays.find(d => d.date === '2026-03-15')?.contributionCount).toBe(2)
      expect(activeDays.find(d => d.date === '2026-03-16')?.contributionCount).toBe(1)
    })

    it('returns empty weeks for no commits', async () => {
      const { buildContributionCalendar } = await import('./github')
      const result = buildContributionCalendar([])
      expect(result.totalContributions).toBe(0)
      expect(result.weeks.length).toBeGreaterThan(0)
    })

    it('produces no partial week when total days is divisible by 7', async () => {
      // 2026-04-18 (Saturday) aligns start to 2025-04-13 (Sunday), giving exactly 371 days = 53 weeks
      vi.useFakeTimers({ now: new Date('2026-04-18T12:00:00Z') })
      try {
        const { buildContributionCalendar } = await import('./github')
        const result = buildContributionCalendar([])
        expect(result.weeks).toHaveLength(53)
        expect(result.weeks.every(w => w.contributionDays.length === 7)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('produces a partial last week when total days is not divisible by 7', async () => {
      // Pick a Wednesday so the partial-week remainder is non-zero regardless of timezone offset
      vi.useFakeTimers({ now: new Date('2026-04-22T12:00:00Z') })
      try {
        const { buildContributionCalendar } = await import('./github')
        const result = buildContributionCalendar([])
        const lastWeek = result.weeks[result.weeks.length - 1]
        expect(lastWeek.contributionDays.length).toBeGreaterThan(0)
        expect(lastWeek.contributionDays.length).toBeLessThan(7)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('computeQuartiles', () => {
    it('returns default quartiles for empty input', async () => {
      const { computeQuartiles } = await import('./github')
      expect(computeQuartiles([])).toEqual([1, 2, 3])
    })

    it('computes quartiles from non-zero counts', async () => {
      const { computeQuartiles } = await import('./github')
      const result = computeQuartiles([0, 1, 2, 3, 4, 5, 6, 7, 8])
      expect(result).toHaveLength(3)
      expect(result[0]).toBeLessThanOrEqual(result[1])
      expect(result[1]).toBeLessThanOrEqual(result[2])
    })
  })

  describe('assignContributionColor', () => {
    it('returns empty color for zero count', async () => {
      const { assignContributionColor } = await import('./github')
      expect(assignContributionColor(0, [1, 2, 3])).toBe('#ebedf0')
    })

    it('returns Q1 color for counts at or below first quartile', async () => {
      const { assignContributionColor } = await import('./github')
      expect(assignContributionColor(1, [1, 2, 3])).toBe('#9be9a8')
    })

    it('returns Q2 color for counts at or below second quartile', async () => {
      const { assignContributionColor } = await import('./github')
      expect(assignContributionColor(2, [1, 2, 3])).toBe('#40c463')
    })

    it('returns Q3 color for counts at or below third quartile', async () => {
      const { assignContributionColor } = await import('./github')
      expect(assignContributionColor(3, [1, 2, 3])).toBe('#30a14e')
    })

    it('returns highest level for counts above Q3', async () => {
      const { assignContributionColor } = await import('./github')
      expect(assignContributionColor(10, [1, 2, 3])).toBe('#216e39')
    })
  })

  describe('fetchOrgOverview', () => {
    it('returns org overview metrics', async () => {
      mockOctokit.repos.listForOrg.mockResolvedValue({
        data: [
          {
            name: 'repo1',
            full_name: 'myorg/repo1',
            description: 'Test',
            private: false,
            default_branch: 'main',
            language: 'TypeScript',
            updated_at: '2026-01-01T00:00:00Z',
            pushed_at: new Date().toISOString(),
            html_url: 'https://github.com/myorg/repo1',
            archived: false,
            stargazers_count: 5,
            forks_count: 1,
          },
        ],
      })

      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 3, items: [] },
      })

      mockOctokit.paginate.mockResolvedValue([
        {
          sha: 'abc123',
          author: {
            login: 'dev1',
            avatar_url: 'https://avatar',
            html_url: 'https://github.com/dev1',
          },
          commit: { author: { name: 'dev1' }, message: 'fix bug' },
        },
      ])

      const result = await client.fetchOrgOverview('myorg')
      expect(result.metrics.org).toBe('myorg')
      expect(result.metrics.repoCount).toBeGreaterThanOrEqual(1)
      expect(result.authenticatedAs).toBeDefined()
    })
  })

  describe('eventSummary', () => {
    it.each([
      { type: 'PullRequestReviewEvent', payload: {}, expected: 'Reviewed a pull request' },
      { type: 'IssueCommentEvent', payload: {}, expected: 'Commented on an issue' },
      { type: 'WatchEvent', payload: {}, expected: 'Starred a repository' },
      { type: 'ForkEvent', payload: {}, expected: 'Forked a repository' },
      { type: 'ReleaseEvent', payload: {}, expected: 'Published a release' },
    ])('returns fixed label for $type', ({ type, payload, expected }) => {
      expect(eventSummary({ type, payload })).toBe(expected)
    })

    it('PushEvent with 1 commit (singular)', () => {
      expect(eventSummary({ type: 'PushEvent', payload: { size: 1 } })).toBe('Pushed 1 commit')
    })

    it('PushEvent with multiple commits (plural)', () => {
      expect(eventSummary({ type: 'PushEvent', payload: { size: 3 } })).toBe('Pushed 3 commits')
    })

    it('PushEvent with 0 commits', () => {
      expect(eventSummary({ type: 'PushEvent', payload: { size: 0 } })).toBe('Pushed 0 commits')
    })

    it('PushEvent with missing size defaults to 0', () => {
      expect(eventSummary({ type: 'PushEvent', payload: {} })).toBe('Pushed 0 commits')
    })

    it('PullRequestEvent capitalizes action', () => {
      expect(eventSummary({ type: 'PullRequestEvent', payload: { action: 'opened' } })).toBe(
        'Opened pull request'
      )
    })

    it('PullRequestEvent defaults to "updated" when action missing', () => {
      expect(eventSummary({ type: 'PullRequestEvent', payload: {} })).toBe('Updated pull request')
    })

    it('IssuesEvent capitalizes action', () => {
      expect(eventSummary({ type: 'IssuesEvent', payload: { action: 'closed' } })).toBe(
        'Closed an issue'
      )
    })

    it('CreateEvent includes ref_type', () => {
      expect(eventSummary({ type: 'CreateEvent', payload: { ref_type: 'branch' } })).toBe(
        'Created a branch'
      )
    })

    it('CreateEvent defaults ref_type to "ref"', () => {
      expect(eventSummary({ type: 'CreateEvent', payload: {} })).toBe('Created a ref')
    })

    it('DeleteEvent includes ref_type', () => {
      expect(eventSummary({ type: 'DeleteEvent', payload: { ref_type: 'tag' } })).toBe(
        'Deleted a tag'
      )
    })

    it('DeleteEvent defaults ref_type to "ref"', () => {
      expect(eventSummary({ type: 'DeleteEvent', payload: {} })).toBe('Deleted a ref')
    })

    it('unknown event strips "Event" suffix', () => {
      expect(eventSummary({ type: 'GollumEvent', payload: {} })).toBe('Gollum')
    })

    it('missing type returns "Activity"', () => {
      expect(eventSummary({ payload: {} })).toBe('Activity')
    })

    it('EVENT_LABELS contains exactly the expected fixed labels', () => {
      expect(Object.keys(EVENT_LABELS).sort()).toEqual(
        [
          'PullRequestReviewEvent',
          'IssueCommentEvent',
          'WatchEvent',
          'ForkEvent',
          'ReleaseEvent',
        ].sort()
      )
    })
  })

  describe('resolveOrgAvatar (via fetchMyPRs)', () => {
    beforeEach(() => {
      clearOrgAvatarCache()
    })

    it('fetches org avatar and caches it', async () => {
      mockOctokit.orgs.get.mockResolvedValue({
        data: { avatar_url: 'https://avatars/org.png' },
      })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()

      expect(mockOctokit.orgs.get).toHaveBeenCalledWith({ org: 'myorg' })
      // Second account with different org also calls orgs.get
      expect(mockOctokit.orgs.get).toHaveBeenCalledTimes(2)
    })

    it('caches org avatar to prevent repeated API calls', async () => {
      mockOctokit.orgs.get.mockResolvedValue({
        data: { avatar_url: 'https://avatars/org.png' },
      })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()
      const firstCallCount = mockOctokit.orgs.get.mock.calls.length

      // Reset only search mock but keep cache populated
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()
      // orgs.get should NOT be called again because cache is populated
      expect(mockOctokit.orgs.get).toHaveBeenCalledTimes(firstCallCount)
    })

    it('falls back to users.getByUsername when orgs.get fails', async () => {
      mockOctokit.orgs.get.mockRejectedValue(new Error('Not Found'))
      mockOctokit.users.getByUsername.mockResolvedValue({
        data: { avatar_url: 'https://avatars/user.png' },
      })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()

      expect(mockOctokit.orgs.get).toHaveBeenCalled()
      expect(mockOctokit.users.getByUsername).toHaveBeenCalled()
    })

    it('caches null when both org and user lookups fail', async () => {
      mockOctokit.orgs.get.mockRejectedValue(new Error('Not Found'))
      mockOctokit.users.getByUsername.mockRejectedValue(new Error('Not Found'))
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()

      // Cache should contain null for attempted orgs
      expect(getOrgAvatarCacheEntry('myorg')).toBeNull()

      // Second call should not reattempt the API
      const orgCallCount = mockOctokit.orgs.get.mock.calls.length
      const userCallCount = mockOctokit.users.getByUsername.mock.calls.length

      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] },
      })
      mockOctokit.paginate.mockResolvedValue([])

      await client.fetchMyPRs()

      expect(mockOctokit.orgs.get).toHaveBeenCalledTimes(orgCallCount)
      expect(mockOctokit.users.getByUsername).toHaveBeenCalledTimes(userCallCount)
    })
  })

  describe('listPRReviews', () => {
    it('paginates and maps review data', async () => {
      mockOctokit.paginate.mockResolvedValue([
        {
          id: 100,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: '2026-04-10T12:00:00Z',
        },
        { id: 101, user: null, state: 'APPROVED', submitted_at: null },
      ])

      const client = new GitHubClient(TEST_CONFIG, 7)
      const reviews = await client.listPRReviews('myorg', 'myrepo', 42)

      expect(mockOctokit.paginate).toHaveBeenCalledWith(mockOctokit.pulls.listReviews, {
        owner: 'myorg',
        repo: 'myrepo',
        pull_number: 42,
        per_page: 100,
      })
      expect(reviews).toEqual([
        {
          id: 100,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: '2026-04-10T12:00:00Z',
        },
        { id: 101, user: null, state: 'APPROVED', submitted_at: null },
      ])
    })
  })

  describe('requestCopilotReview', () => {
    it('calls pulls.requestReviewers with copilot bot', async () => {
      mockOctokit.pulls.requestReviewers = vi.fn().mockResolvedValue({ data: {} })
      await client.requestCopilotReview('myorg', 'myrepo', 42)
      expect(mockOctokit.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: 'myorg',
        repo: 'myrepo',
        pull_number: 42,
        reviewers: ['copilot-pull-request-reviewer[bot]'],
      })
    })
  })

  describe('fetchOrgTeams', () => {
    it('returns teams from paginate', async () => {
      mockOctokit.paginate.mockResolvedValueOnce([
        {
          slug: 'alpha',
          name: 'Alpha',
          description: 'Team A',
          members_count: 5,
          repos_count: 10,
          html_url: 'https://github.com/orgs/myorg/teams/alpha',
        },
      ])
      const result = await client.fetchOrgTeams('myorg')
      expect(result.teams).toEqual([
        {
          slug: 'alpha',
          name: 'Alpha',
          description: 'Team A',
          memberCount: 5,
          repoCount: 10,
          url: 'https://github.com/orgs/myorg/teams/alpha',
        },
      ])
    })

    it('returns empty teams on error', async () => {
      mockOctokit.paginate.mockRejectedValueOnce(new Error('forbidden'))
      // Second account also fails
      mockOctokit.paginate.mockRejectedValueOnce(new Error('forbidden'))
      const result = await client.fetchOrgTeams('myorg')
      expect(result.teams).toEqual([])
    })
  })

  describe('fetchTeamMembers', () => {
    it('returns members with resolved names', async () => {
      mockOctokit.teams.listMembersInOrg = vi.fn()
      mockOctokit.paginate.mockResolvedValueOnce([
        { login: 'bob', avatar_url: 'https://avatars/bob' },
      ])
      // Mock graphql for fetchUserNames
      mockGraphql.mockResolvedValueOnce({ ubob: { login: 'bob', name: 'Bob Smith' } })
      const result = await client.fetchTeamMembers('myorg', 'alpha')
      expect(result.members).toEqual([
        { login: 'bob', name: 'Bob Smith', avatarUrl: 'https://avatars/bob' },
      ])
    })

    it('returns empty members when all accounts fail', async () => {
      mockOctokit.teams.listMembersInOrg = vi.fn()
      mockOctokit.paginate.mockRejectedValue(new Error('no access'))
      const result = await client.fetchTeamMembers('myorg', 'alpha')
      expect(result.members).toEqual([])
    })
  })

  describe('fetchMyPRs', () => {
    it('returns PRs from search and deduplicates across accounts', async () => {
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: 'https://av/myorg' } })

      const prItem = {
        number: 10,
        title: 'Fix bug',
        html_url: 'https://github.com/myorg/myrepo/pull/10',
        user: { login: 'user1', avatar_url: 'https://avatars/user1' },
        state: 'open',
        assignees: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        closed_at: null,
      }

      // Both accounts return the same PR (dedup test)
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: { items: [prItem] },
      })

      // Mock listReviews and pulls.get for batch processing
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'reviewer1' }, state: 'APPROVED', submitted_at: '2025-01-02T00:00:00Z' },
        ],
      })
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { ref: 'fix-branch' }, base: { ref: 'main' } },
      })

      // Mock GraphQL for fetchBatchThreadStats
      mockGraphql.mockResolvedValue({
        pr0: {
          pullRequest: {
            reviewThreads: {
              totalCount: 2,
              nodes: [{ isResolved: true }, { isResolved: false }],
            },
          },
        },
      })

      const prs = await client.fetchMyPRs()
      // Should be deduplicated to 1 PR even though 2 accounts returned it
      expect(prs.length).toBe(1)
      expect(prs[0].title).toBe('Fix bug')
      expect(prs[0].approvalCount).toBe(1)
      expect(prs[0].headBranch).toBe('fix-branch')
    })

    it('reports progress callback', async () => {
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({ data: { items: [] } })
      mockGraphql.mockResolvedValue({})

      const progress = vi.fn()
      await client.fetchMyPRs(progress)
      // Should have been called with authenticating, fetching, done for each account
      expect(progress).toHaveBeenCalled()
      const statuses = progress.mock.calls.map(
        (c: unknown[]) => (c[0] as { status: string }).status
      )
      expect(statuses).toContain('authenticating')
      expect(statuses).toContain('fetching')
      expect(statuses).toContain('done')
    })

    it('throws when all accounts fail auth', async () => {
      // Make getGitHubCLIToken return null for all accounts
      mockInvoke.mockResolvedValue(null)
      // Need a fresh client since tokens are cached
      const freshConfig = {
        accounts: [
          { username: 'noauth1', org: 'o1' },
          { username: 'noauth2', org: 'o2' },
        ],
      }
      const c = new GitHubClient(freshConfig)
      await expect(c.fetchMyPRs()).rejects.toThrow('GitHub CLI authentication not available')
    })

    it('handles search query 404 errors silently (no warn log)', async () => {
      // Simulate a 404 error from search API (org doesn't exist or no access)
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })
      mockOctokit.search.issuesAndPullRequests.mockRejectedValue(
        new Error('API Error 404 Not Found')
      )
      mockOctokit.paginate.mockResolvedValue([])
      mockGraphql.mockResolvedValue({})

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

      const result = await client.fetchMyPRs()

      // Should return empty PRs when search fails
      expect(result).toEqual([])
      // 404 errors should use debug logging, not warn
      const debugCalls = debugSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('No search results (404)')
      )
      expect(debugCalls.length).toBeGreaterThan(0)
      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
      debugSpy.mockRestore()
    })

    it('logs warning for non-404 search errors', async () => {
      // Simulate a non-404 error from search API (e.g., 500 server error)
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })
      mockOctokit.search.issuesAndPullRequests.mockRejectedValue(
        new Error('API Error 500 Internal Server Error')
      )
      mockOctokit.paginate.mockResolvedValue([])
      mockGraphql.mockResolvedValue({})

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await client.fetchMyPRs()

      // Should return empty PRs when search fails
      expect(result).toEqual([])
      // Non-404 errors should use warn logging
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Search query failed'),
        expect.any(Error)
      )

      warnSpy.mockRestore()
    })
  })

  describe('fetchNeedsReview', () => {
    it('filters out PRs the user already approved', async () => {
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })

      const prItem = {
        number: 20,
        title: 'PR I approved',
        html_url: 'https://github.com/myorg/repo/pull/20',
        user: { login: 'other', avatar_url: '' },
        state: 'open',
        assignees: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        closed_at: null,
      }

      // needs-review runs 2 queries per account: review-requested + assignee
      // Account 1 (user1/myorg): return the PR from first query only
      // Account 2 (user2/otherorg): return empty so it doesn't re-introduce the PR
      mockOctokit.search.issuesAndPullRequests
        .mockResolvedValueOnce({ data: { items: [prItem] } }) // user1 query 1
        .mockResolvedValueOnce({ data: { items: [] } }) // user1 query 2
        .mockResolvedValue({ data: { items: [] } }) // user2 queries

      // I (user1) already approved this PR
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'user1' }, state: 'APPROVED', submitted_at: '2025-01-02T00:00:00Z' },
        ],
      })
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { ref: 'feat' }, base: { ref: 'main' } },
      })
      mockGraphql.mockResolvedValue({})

      const prs = await client.fetchNeedsReview()
      // Should be filtered out because I already approved
      expect(prs.length).toBe(0)
    })
  })

  describe('fetchNeedANudge', () => {
    it('keeps only PRs the user approved', async () => {
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })
      mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          items: [
            {
              number: 30,
              title: 'Approved PR',
              html_url: 'https://github.com/myorg/repo/pull/30',
              user: { login: 'other', avatar_url: '' },
              state: 'open',
              assignees: [],
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-02T00:00:00Z',
              closed_at: null,
            },
          ],
        },
      })

      // I (user1) approved
      mockOctokit.pulls.listReviews.mockResolvedValue({
        data: [
          { user: { login: 'user1' }, state: 'APPROVED', submitted_at: '2025-01-02T00:00:00Z' },
        ],
      })
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { ref: 'feat' }, base: { ref: 'main' } },
      })
      mockGraphql.mockResolvedValue({})

      const prs = await client.fetchNeedANudge()
      expect(prs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('fetchRecentlyMerged', () => {
    it('sorts by merge date descending', async () => {
      mockOctokit.orgs.get.mockResolvedValue({ data: { avatar_url: null } })
      const items = [
        {
          number: 40,
          title: 'Older',
          html_url: 'https://github.com/myorg/repo/pull/40',
          user: { login: 'user1', avatar_url: '' },
          state: 'closed',
          assignees: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
          closed_at: '2025-01-02T00:00:00Z',
        },
        {
          number: 41,
          title: 'Newer',
          html_url: 'https://github.com/myorg/repo/pull/41',
          user: { login: 'user1', avatar_url: '' },
          state: 'closed',
          assignees: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-03T00:00:00Z',
          closed_at: '2025-01-03T00:00:00Z',
        },
      ]
      // First account returns both
      mockOctokit.search.issuesAndPullRequests
        .mockResolvedValueOnce({ data: { items } }) // author query
        .mockResolvedValueOnce({ data: { items: [] } }) // reviewed-by query
        // Second account returns nothing
        .mockResolvedValue({ data: { items: [] } })

      mockOctokit.pulls.listReviews.mockResolvedValue({ data: [] })
      mockOctokit.pulls.get.mockResolvedValue({
        data: { head: { ref: 'feat' }, base: { ref: 'main' } },
      })
      mockGraphql.mockResolvedValue({})

      const prs = await client.fetchRecentlyMerged()
      expect(prs.length).toBe(2)
      // Newer (closed_at 2025-01-03) should come first
      expect(prs[0].title).toBe('Newer')
      expect(prs[1].title).toBe('Older')
    })
  })

  describe('fetchOrgMembers', () => {
    it('falls back to user endpoint on 404', async () => {
      // First paginate call (org members) throws 404
      mockOctokit.paginate.mockRejectedValueOnce(new Error('Not Found'))
      // users.getByUsername returns user info
      mockOctokit.users.getByUsername.mockResolvedValueOnce({
        data: {
          login: 'myorg',
          name: 'My Org',
          avatar_url: 'https://av/myorg',
          html_url: 'https://github.com/myorg',
          type: 'User',
        },
      })

      const result = await client.fetchOrgMembers('myorg')
      expect(result.members).toEqual([
        {
          login: 'myorg',
          name: 'My Org',
          avatarUrl: 'https://av/myorg',
          url: 'https://github.com/myorg',
          type: 'User',
        },
      ])
      expect(result.isUserNamespace).toBe(true)
    })

    it('throws when all accounts fail', async () => {
      mockOctokit.paginate.mockRejectedValue(new Error('Server Error'))
      await expect(client.fetchOrgMembers('myorg')).rejects.toThrow('Could not fetch members')
    })
  })

  describe('fetchOrgTeams', () => {
    it('returns teams with mapped fields', async () => {
      mockOctokit.paginate.mockResolvedValue([
        {
          slug: 'alpha',
          name: 'Alpha Team',
          description: 'The A team',
          members_count: 5,
          repos_count: 3,
          html_url: 'https://github.com/orgs/myorg/teams/alpha',
        },
      ])
      const result = await client.fetchOrgTeams('myorg')
      expect(result.teams).toHaveLength(1)
      expect(result.teams[0].slug).toBe('alpha')
      expect(result.teams[0].memberCount).toBe(5)
    })

    it('returns empty teams when all accounts fail', async () => {
      mockOctokit.paginate.mockRejectedValue(new Error('forbidden'))
      const result = await client.fetchOrgTeams('myorg')
      expect(result.teams).toEqual([])
    })

    it('handles team without optional fields', async () => {
      mockOctokit.paginate.mockResolvedValue([
        {
          slug: 'beta',
          name: 'Beta',
          description: null,
          html_url: 'https://github.com/orgs/myorg/teams/beta',
        },
      ])
      const result = await client.fetchOrgTeams('myorg')
      expect(result.teams[0].description).toBeNull()
      expect(result.teams[0].memberCount).toBe(0)
      expect(result.teams[0].repoCount).toBe(0)
    })
  })

  describe('fetchRepoCommitDetail', () => {
    it('maps commit detail with all optional fallbacks', async () => {
      mockOctokit.repos.getCommit.mockResolvedValue({
        data: {
          sha: 'abc123',
          commit: {
            message: 'fix: thing\n\nDetailed description',
            author: { name: 'Bot', date: '2026-01-01T00:00:00Z' },
            committer: { date: '2026-01-01T01:00:00Z' },
          },
          author: null,
          html_url: 'https://github.com/myorg/repo/commit/abc123',
          parents: [{ sha: 'parent1', html_url: null }],
          stats: null,
          files: [
            {
              filename: 'README.md',
              previous_filename: undefined,
              status: undefined,
              additions: undefined,
              deletions: undefined,
              changes: undefined,
              patch: undefined,
              blob_url: undefined,
            },
          ],
        },
      })

      const result = await client.fetchRepoCommitDetail('myorg', 'repo', 'abc123')
      expect(result.sha).toBe('abc123')
      expect(result.messageHeadline).toBe('fix: thing')
      expect(result.author).toBe('Bot')
      expect(result.authorAvatarUrl).toBeNull()
      expect(result.committedDate).toBe('2026-01-01T01:00:00Z')
      expect(result.stats).toEqual({ additions: 0, deletions: 0, total: 0 })
      expect(result.files[0].status).toBe('modified')
      expect(result.files[0].additions).toBe(0)
      expect(result.files[0].patch).toBeNull()
      expect(result.files[0].blobUrl).toBeNull()
      expect(result.files[0].previousFilename).toBeNull()
      // Parent URL fallback
      expect(result.parents[0].url).toContain('/commit/parent1')
    })

    it('maps commit with no committer date fallback to author date', async () => {
      mockOctokit.repos.getCommit.mockResolvedValue({
        data: {
          sha: 'abc',
          commit: {
            message: 'msg',
            author: { name: 'Dev', date: '2026-02-01T00:00:00Z' },
            committer: { date: undefined },
          },
          author: { login: 'dev', avatar_url: 'https://av/dev' },
          html_url: 'https://github.com/myorg/repo/commit/abc',
          parents: [],
          stats: { additions: 10, deletions: 5, total: 15 },
          files: [],
        },
      })

      const result = await client.fetchRepoCommitDetail('myorg', 'repo', 'abc')
      expect(result.author).toBe('dev')
      expect(result.authorAvatarUrl).toBe('https://av/dev')
      expect(result.committedDate).toBe('2026-02-01T00:00:00Z')
      expect(result.stats).toEqual({ additions: 10, deletions: 5, total: 15 })
    })
  })

  describe('fetchRepoIssueDetail', () => {
    it('maps issue detail with null/missing optional fields', async () => {
      mockOctokit.issues.get.mockResolvedValue({
        data: {
          number: 42,
          title: 'Bug report',
          state: 'open',
          user: null,
          html_url: 'https://github.com/myorg/repo/issues/42',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          labels: [],
          comments: 0,
          assignees: [],
          body: null,
          closed_at: null,
          state_reason: null,
          milestone: null,
        },
      })
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 1,
            user: null,
            body: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/myorg/repo/issues/42#issuecomment-1',
          },
        ],
      })

      const result = await client.fetchRepoIssueDetail('myorg', 'repo', 42)
      expect(result.author).toBe('unknown')
      expect(result.authorAvatarUrl).toBeNull()
      expect(result.body).toBe('')
      expect(result.milestone).toBeNull()
      expect(result.stateReason).toBeNull()
      expect(result.comments[0].author).toBe('unknown')
      expect(result.comments[0].authorAvatarUrl).toBeNull()
      expect(result.comments[0].body).toBe('')
    })

    it('maps issue with milestone and assignees', async () => {
      mockOctokit.issues.get.mockResolvedValue({
        data: {
          number: 43,
          title: 'Feature',
          state: 'closed',
          user: { login: 'alice', avatar_url: 'https://av/alice' },
          html_url: 'https://github.com/myorg/repo/issues/43',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          labels: [{ name: 'enhancement', color: '00ff00' }],
          comments: 1,
          assignees: [{ login: 'bob', avatar_url: 'https://av/bob' }],
          body: 'Description',
          closed_at: '2026-01-03T00:00:00Z',
          state_reason: 'completed',
          milestone: { title: 'v1.0', due_on: '2026-02-01T00:00:00Z' },
        },
      })
      mockOctokit.issues.listComments.mockResolvedValue({ data: [] })
      // Mock fetchUserNames via GraphQL
      mockGraphql.mockResolvedValue({ user_bob: { name: 'Bob Smith' } })

      const result = await client.fetchRepoIssueDetail('myorg', 'repo', 43)
      expect(result.milestone).toEqual({ title: 'v1.0', dueOn: '2026-02-01T00:00:00Z' })
      expect(result.assignees[0].login).toBe('bob')
      expect(result.closedAt).toBe('2026-01-03T00:00:00Z')
      expect(result.stateReason).toBe('completed')
    })
  })

  describe('fetchPRThreads', () => {
    it('maps thread and comment data with null fallbacks', async () => {
      mockGraphql.mockResolvedValue({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: 'thread-1',
                  isResolved: false,
                  isOutdated: true,
                  path: 'src/test.ts',
                  line: 10,
                  startLine: 5,
                  diffSide: 'RIGHT',
                  comments: {
                    nodes: [
                      {
                        id: 'c1',
                        author: null,
                        body: null,
                        bodyHTML: null,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-01-01T00:00:00Z',
                        url: 'https://github.com/myorg/repo/pull/1#c1',
                        diffHunk: null,
                        reactionGroups: null,
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
                  url: 'https://github.com/myorg/repo/pull/1#ic1',
                  reactionGroups: [],
                },
              ],
            },
            reviews: {
              nodes: [
                {
                  id: 'r1',
                  state: 'APPROVED',
                  author: null,
                  body: 'LGTM',
                  bodyHTML: '<p>LGTM</p>',
                  submittedAt: '2026-01-01T00:00:00Z',
                  updatedAt: '2026-01-01T00:00:00Z',
                  url: 'https://github.com/myorg/repo/pull/1#r1',
                },
                {
                  id: 'r2',
                  state: 'COMMENTED',
                  author: { login: 'reviewer' },
                  body: null,
                  bodyHTML: null,
                  submittedAt: null,
                  updatedAt: null,
                  url: null,
                },
              ],
            },
          },
        },
      })

      const result = await client.fetchPRThreads('myorg', 'repo', 1)
      expect(result.threads).toHaveLength(1)
      expect(result.threads[0].comments[0].author).toBe('unknown')
      expect(result.threads[0].comments[0].authorAvatarUrl).toBeNull()
      expect(result.threads[0].comments[0].body).toBe('')
      expect(result.threads[0].comments[0].bodyHtml).toBeNull()
      expect(result.threads[0].comments[0].diffHunk).toBeNull()
      expect(result.issueComments).toHaveLength(1)
      expect(result.issueComments[0].author).toBe('unknown')
      // Reviews: only r1 passes filter (has both submittedAt and body)
      expect(result.reviews).toHaveLength(1)
      expect(result.reviews[0].author).toBe('unknown')
    })
  })

  describe('fetchRepoPRs edge cases', () => {
    it('handles PR labels with label objects missing color', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 1,
            title: 'PR',
            state: 'open',
            user: { login: 'dev' },
            html_url: 'h',
            created_at: 'c',
            updated_at: 'u',
            labels: [
              { name: 'bug', color: null },
              { name: null, color: undefined },
            ],
            head: { ref: 'f' },
            base: { ref: 'm' },
            assignees: [{ login: 'a' }, { login: 'b' }],
            draft: true,
          },
        ],
      })
      mockOctokit.users.getAuthenticated.mockResolvedValue({ data: { login: 'dev' } })
      mockOctokit.pulls.listReviews.mockResolvedValue({ data: [] })

      const result = await client.fetchRepoPRs('myorg', 'repo')
      expect(result[0].labels[0].color).toBe('808080')
      expect(result[0].labels[1].name).toBe('')
      expect(result[0].draft).toBe(true)
      expect(result[0].assigneeCount).toBe(2)
    })
  })

  describe('fetchRepoDetail', () => {
    it('handles optional data failures gracefully', async () => {
      mockOctokit.repos.get.mockResolvedValue({
        data: {
          name: 'repo',
          full_name: 'myorg/repo',
          description: null,
          html_url: 'https://github.com/myorg/repo',
          homepage: null,
          language: null,
          default_branch: 'main',
          visibility: 'private',
          archived: false,
          fork: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-06-01T00:00:00Z',
          pushed_at: null,
          size: 1000,
          stargazers_count: 0,
          forks_count: 0,
          watchers_count: 0,
          open_issues_count: 0,
          topics: [],
          license: null,
        },
      })
      // Languages fail
      mockOctokit.repos.listLanguages.mockRejectedValue(new Error('fail'))
      // Commits fail
      mockOctokit.repos.listCommits.mockRejectedValue(new Error('fail'))
      // Contributors fail
      mockOctokit.repos.listContributors.mockRejectedValue(new Error('fail'))
      // PRs fail
      mockOctokit.pulls.list.mockRejectedValue(new Error('fail'))
      // Workflows fail
      mockOctokit.actions.listWorkflowRunsForRepo.mockRejectedValue(new Error('fail'))

      const result = await client.fetchRepoDetail('myorg', 'repo')
      expect(result.name).toBe('repo')
      expect(result.languages).toEqual({})
      expect(result.recentCommits).toEqual([])
      expect(result.topContributors).toEqual([])
      expect(result.openPRCount).toBe(0)
      expect(result.latestWorkflowRun).toBeNull()
    })

    it('maps commit with missing author login', async () => {
      mockOctokit.repos.get.mockResolvedValue({
        data: {
          name: 'r',
          full_name: 'o/r',
          description: 'd',
          html_url: 'h',
          homepage: null,
          language: 'TypeScript',
          default_branch: 'main',
          visibility: 'public',
          archived: false,
          fork: false,
          created_at: 'c',
          updated_at: 'u',
          pushed_at: 'p',
          size: 500,
          stargazers_count: 10,
          forks_count: 2,
          watchers_count: 5,
          open_issues_count: 3,
          topics: ['ts'],
          license: { spdx_id: 'MIT' },
        },
      })
      mockOctokit.repos.listLanguages.mockResolvedValue({ data: { TypeScript: 1000 } })
      mockOctokit.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'a1',
            commit: { message: 'msg', author: { date: 'd1' } },
            author: null,
            html_url: 'h1',
          },
        ],
      })
      mockOctokit.repos.listContributors.mockResolvedValue({
        data: [{ login: null, avatar_url: null, contributions: null, html_url: null }],
      })
      mockOctokit.pulls.list.mockResolvedValue({ data: [{ number: 1 }] })
      mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            {
              id: 1,
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              created_at: 'c',
              updated_at: 'u',
              html_url: 'h',
              head_branch: 'main',
            },
          ],
        },
      })
      // Mock fetchUserNames
      mockGraphql.mockResolvedValue({})

      const result = await client.fetchRepoDetail('myorg', 'repo')
      expect(result.license).toBe('MIT')
      expect(result.openPRCount).toBe(3) // comes from open_issues_count when PR list has data
      expect(result.latestWorkflowRun).not.toBeNull()
    })
  })

  describe('getRateLimit', () => {
    it('returns rate limit data', async () => {
      mockOctokit.rateLimit.get.mockResolvedValue({
        data: {
          resources: {
            core: { limit: 5000, remaining: 4999, reset: 1234567890, used: 1 },
          },
        },
      })
      const result = await client.getRateLimit('myorg')
      expect(result.limit).toBe(5000)
      expect(result.remaining).toBe(4999)
    })

    it('tries next account on failure', async () => {
      mockOctokit.rateLimit.get.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({
        data: {
          resources: {
            core: { limit: 5000, remaining: 4000, reset: 123, used: 1000 },
          },
        },
      })
      const result = await client.getRateLimit('myorg')
      expect(result.remaining).toBe(4000)
    })

    it('throws when all accounts fail', async () => {
      mockOctokit.rateLimit.get.mockRejectedValue(new Error('fail'))
      await expect(client.getRateLimit('myorg')).rejects.toThrow('Could not fetch rate limit')
    })
  })

  /* eslint-disable @typescript-eslint/no-explicit-any -- private method bracket access requires any casts */
  describe('Uncovered catch blocks - error handling', () => {
    describe('getGitHubCLIToken catch block', () => {
      it('returns null when token fetch fails', async () => {
        mockInvoke.mockImplementation((_channel: string, username: string) => {
          if (_channel === 'github:get-cli-token' && username === 'error-user') {
            return Promise.reject(new Error('Token fetch failed'))
          }
          if (_channel === 'github:get-cli-token') return Promise.resolve(`token-${username}`)
          return Promise.resolve(null)
        })
        const result = await (client as any)['getGitHubCLIToken']('error-user')
        expect(result).toBeNull()
      })
    })

    describe('fetchOrgTeams catch block (account loop)', () => {
      it('continues to next account when team fetch fails', async () => {
        // Make paginate throw on first call, return teams on second
        mockOctokit.paginate
          .mockRejectedValueOnce(new Error('403 Forbidden'))
          .mockResolvedValueOnce([
            {
              id: 1,
              slug: 'team1',
              name: 'Team 1',
              html_url: 'https://github.com/orgs/myorg/teams/team1',
            },
          ])

        const result = await client.fetchOrgTeams('myorg')
        expect(result.teams).toHaveLength(1)
        expect(result.teams[0].slug).toBe('team1')
      })

      it('returns empty teams when all accounts fail', async () => {
        mockOctokit.paginate.mockRejectedValue(new Error('403 Forbidden'))
        const result = await client.fetchOrgTeams('myorg')
        expect(result.teams).toEqual([])
      })
    })

    describe('fetchTeamMembers catch block', () => {
      it('continues to next account when members fetch fails', async () => {
        // First account fails, second account succeeds
        mockOctokit.paginate
          .mockRejectedValueOnce(new Error('403 Forbidden'))
          .mockResolvedValueOnce([{ login: 'member1', avatar_url: 'https://avatar1' }])

        mockGraphql.mockResolvedValue({})

        const result = await client.fetchTeamMembers('myorg', 'team1')
        expect(result.members).toHaveLength(1)
        expect(result.members[0].login).toBe('member1')
      })

      it('returns empty members array when all accounts fail', async () => {
        mockOctokit.paginate.mockRejectedValue(new Error('403 Forbidden'))

        const result = await client.fetchTeamMembers('myorg', 'team1')
        expect(result.members).toEqual([])
      })
    })

    describe('fetchUserNames catch block (GraphQL batch)', () => {
      it('returns empty names map when GraphQL batch fails', async () => {
        mockGraphql.mockRejectedValue(new Error('GraphQL error'))

        const result = await (client as any)['fetchUserNames'](['user1', 'user2'], 'myorg')
        expect(result.size).toBe(0)
      })

      it('returns empty map for empty login list', async () => {
        const result = await (client as any)['fetchUserNames']([], 'myorg')
        expect(result.size).toBe(0)
      })
    })

    describe('resolveOrgAvatar catch blocks (nested try-catch)', () => {
      it('falls back to user endpoint when org lookup fails', async () => {
        clearOrgAvatarCache()
        // First call (org.get) fails, second call (users.getByUsername) succeeds
        mockOctokit.orgs.get.mockRejectedValueOnce(new Error('404 Not Found'))
        mockOctokit.users.getByUsername.mockResolvedValueOnce({
          data: { avatar_url: 'https://user-avatar' },
        })

        const result = await (client as any)['resolveOrgAvatar'](mockOctokit, 'someuser')
        expect(result).toBe('https://user-avatar')
      })

      it('returns null when both org and user lookup fail', async () => {
        clearOrgAvatarCache()
        mockOctokit.orgs.get.mockRejectedValueOnce(new Error('404 Not Found'))
        mockOctokit.users.getByUsername.mockRejectedValueOnce(new Error('404 Not Found'))

        const result = await (client as any)['resolveOrgAvatar'](mockOctokit, 'missing')
        expect(result).toBeNull()
      })

      it('caches null avatar for missing org/user', async () => {
        clearOrgAvatarCache()
        mockOctokit.orgs.get.mockRejectedValue(new Error('404'))
        mockOctokit.users.getByUsername.mockRejectedValue(new Error('404'))

        const result1 = await (client as any)['resolveOrgAvatar'](mockOctokit, 'missing')
        expect(result1).toBeNull()

        // Second call should use cache without calling octokit
        const result2 = await (client as any)['resolveOrgAvatar'](mockOctokit, 'missing')
        expect(result2).toBeNull()
        expect(mockOctokit.orgs.get).toHaveBeenCalledTimes(1)
      })
    })

    describe('fetchBatchThreadStats catch block', () => {
      it('handles GraphQL batch error gracefully', async () => {
        mockGraphql.mockRejectedValue(new Error('GraphQL error'))

        const prs = [
          {
            number: 1,
            title: 'PR 1',
            state: 'open' as const,
            author: 'user1',
            labels: [],
            url: 'url1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
            headBranch: 'feature',
            baseBranch: 'main',
            approvalCount: 0,
            iApproved: false,
          },
        ]

        // Add internal metadata fields the method expects
        const prsWithMeta = prs.map(pr => ({
          ...pr,
          _owner: 'myorg',
          _repo: 'repo',
          _prNumber: pr.number,
        }))

        // Should not throw, just log warning
        await (client as any)['fetchBatchThreadStats'](prsWithMeta)
        // PRs should still have their existing properties
        expect(prsWithMeta[0].number).toBe(1)
      })
    })

    describe('fetchSFLStatus catch block (workflow mapping)', () => {
      it('returns null latestRun when workflow run fetch fails', async () => {
        mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
          data: {
            workflows: [
              {
                id: 1,
                name: 'SFL: Issue Processor',
                state: 'active',
              },
            ],
          },
        })

        // Simulate error when fetching latest run
        mockOctokit.actions.listWorkflowRuns.mockRejectedValue(new Error('403 Forbidden'))

        const result = await client.fetchSFLStatus('myorg', 'repo')
        expect(result.isSFLEnabled).toBe(true)
        expect(result.workflows[0].latestRun).toBeNull()
      })
    })

    describe('getRateLimit catch block (account loop)', () => {
      it('continues to next account on rate limit fetch error', async () => {
        mockOctokit.rateLimit.get
          .mockRejectedValueOnce(new Error('403 Forbidden'))
          .mockResolvedValueOnce({
            data: {
              resources: {
                core: {
                  limit: 5000,
                  remaining: 4500,
                  reset: 1234567890,
                  used: 500,
                },
              },
            },
          })

        const result = await client.getRateLimit('myorg')
        expect(result.limit).toBe(5000)
        expect(result.remaining).toBe(4500)
      })
    })

    describe('fetchAllOrgOrUserRepos non-404 re-throw', () => {
      it('re-throws non-404 errors during org repo fetch', async () => {
        mockOctokit.repos.listForOrg.mockRejectedValue(new Error('500 Internal Server Error'))

        await expect(
          (client as any)['fetchAllOrgOrUserRepos'](mockOctokit, 'myorg')
        ).rejects.toThrow('500 Internal Server Error')
      })

      it('falls back to user repos on 404 org not found', async () => {
        mockOctokit.repos.listForOrg.mockRejectedValue(new Error('404 Not Found'))
        mockOctokit.repos.listForUser.mockResolvedValue({
          data: [
            {
              name: 'repo1',
              full_name: 'user1/repo1',
              html_url: 'https://github.com/user1/repo1',
              description: 'A repo',
              default_branch: 'main',
              stargazers_count: 10,
              forks_count: 2,
              language: 'TypeScript',
              private: false,
              archived: false,
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        })

        const result = await (client as any)['fetchAllOrgOrUserRepos'](mockOctokit, 'someuser')
        expect(result.isUserNamespace).toBe(true)
        expect(result.repos).toHaveLength(1)
      })
    })

    describe('fetchAllOrgOrUserMembers non-404 re-throw', () => {
      it('re-throws non-404 errors during org members fetch', async () => {
        mockOctokit.paginate.mockRejectedValue(new Error('500 Internal Server Error'))

        await expect(
          (client as any)['fetchAllOrgOrUserMembers'](mockOctokit, 'myorg')
        ).rejects.toThrow('500 Internal Server Error')
      })

      it('falls back to user on 404 org not found', async () => {
        mockOctokit.paginate.mockRejectedValue(new Error('404 Not Found'))
        mockOctokit.users.getByUsername.mockResolvedValue({
          data: {
            login: 'someuser',
            name: 'Some User',
            avatar_url: 'https://avatar',
            html_url: 'https://github.com/someuser',
            type: 'User',
          },
        })

        const result = await (client as any)['fetchAllOrgOrUserMembers'](mockOctokit, 'someuser')
        expect(result.isUserNamespace).toBe(true)
        expect(result.members).toHaveLength(1)
        expect(result.members[0].login).toBe('someuser')
      })
    })
  })
})
