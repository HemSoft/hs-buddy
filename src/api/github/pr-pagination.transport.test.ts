import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepoPullRequest } from './types'
import type { PullRequest } from '../../types/pullRequest'
import { fetchUnresolvedThreadCounts, fetchBatchThreadStats } from './pr-threads'
import { fetchPRHistory } from './pr-detail'

const transport = vi.hoisted(() => ({ graphql: vi.fn(), token: vi.fn() }))
vi.mock('./shared', async importOriginal => ({
  ...(await importOriginal<typeof import('./shared')>()),
  graphql: transport.graphql,
  getTokenForOwner: transport.token,
}))

const config = { accounts: [] }
const owner = 'fixture-owner'
const repo = 'fixture-repository'
const timestamp = '2026-09-30T12:00:00Z'
const resolved = { isResolved: true }
const unresolved = { isResolved: false }
const page = (
  nodes: { isResolved: boolean }[],
  hasNextPage: boolean,
  endCursor: string | null
) => ({
  nodes,
  pageInfo: { hasNextPage, endCursor },
})

function makeRepoPR(): RepoPullRequest {
  return {
    number: 42,
    title: 'Fixture PR',
    state: 'open',
    author: 'fixture-user',
    authorAvatarUrl: null,
    url: 'https://github.com/fixture-owner/fixture-repository/pull/42',
    createdAt: timestamp,
    updatedAt: timestamp,
    labels: [],
    draft: false,
    headBranch: 'feature',
    baseBranch: 'main',
    assigneeCount: 0,
    approvalCount: 0,
    changesRequestedCount: 0,
    threadsUnaddressed: 99,
    iApproved: false,
  }
}

function makeBatchPR(): PullRequest & { _owner: string; _repo: string; _prNumber: number } {
  return {
    source: 'GitHub',
    repository: repo,
    id: 42,
    title: 'Fixture PR',
    author: 'fixture-user',
    url: 'https://github.com/fixture-owner/fixture-repository/pull/42',
    state: 'open',
    approvalCount: 0,
    assigneeCount: 0,
    iApproved: false,
    created: null,
    date: null,
    threadsTotal: 99,
    threadsAddressed: 99,
    threadsUnaddressed: 99,
    _owner: owner,
    _repo: repo,
    _prNumber: 42,
  }
}

async function readStats(kind: 'repository' | 'batch') {
  if (kind === 'repository') {
    const pr = makeRepoPR()
    await fetchUnresolvedThreadCounts(config, owner, repo, [pr])
    return { unresolved: pr.threadsUnaddressed }
  }
  const pr = makeBatchPR()
  await fetchBatchThreadStats(config, [pr])
  return {
    unresolved: pr.threadsUnaddressed,
    resolved: pr.threadsAddressed,
    total: pr.threadsTotal,
  }
}

const nullConnections = [
  { name: 'null repository', response: { repository: null } },
  { name: 'null pull request', response: { repository: { pullRequest: null } } },
]

beforeEach(() => {
  vi.resetAllMocks()
  transport.token.mockResolvedValue('fixture-token')
})

describe.each(['repository', 'batch'] as const)('%s public thread statistics', kind => {
  it('accumulates all pages and advances each cursor', async () => {
    transport.graphql
      .mockResolvedValueOnce({
        pr0: {
          pullRequest: { reviewThreads: { ...page([resolved], true, 'cursor-1'), totalCount: 4 } },
        },
      })
      .mockResolvedValueOnce({
        repository: { pullRequest: { reviewThreads: page([unresolved], true, 'cursor-2') } },
      })
      .mockResolvedValueOnce({
        repository: { pullRequest: { reviewThreads: page([resolved, unresolved], false, null) } },
      })
    const result = await readStats(kind)
    expect(result.unresolved).toBe(2)
    if (kind === 'batch') expect(result).toEqual({ total: 4, resolved: 2, unresolved: 2 })
    expect(transport.graphql).toHaveBeenCalledTimes(3)
    expect(transport.graphql.mock.calls[1][0]).toContain('after: "cursor-1"')
    expect(transport.graphql.mock.calls[2][0]).toContain('after: "cursor-2"')
    expect(transport.graphql.mock.calls[1][0]).toContain('pullRequest(number: 42)')
    expect(transport.graphql.mock.calls[1][1]).toEqual({
      headers: { authorization: 'token fixture-token' },
    })
  })

  it.each(nullConnections)(
    'retains known results when a later page has $name',
    async ({ response }) => {
      transport.graphql
        .mockResolvedValueOnce({
          pr0: {
            pullRequest: { reviewThreads: { ...page([resolved], true, 'next'), totalCount: 4 } },
          },
        })
        .mockResolvedValueOnce(response)
      expect((await readStats(kind)).unresolved).toBe(3)
      expect(transport.graphql).toHaveBeenCalledTimes(2)
    }
  )

  it('stops on an empty terminal page without losing the first page', async () => {
    transport.graphql
      .mockResolvedValueOnce({
        pr0: {
          pullRequest: { reviewThreads: { ...page([resolved], true, 'next'), totalCount: 4 } },
        },
      })
      .mockResolvedValueOnce({
        repository: { pullRequest: { reviewThreads: page([], false, null) } },
      })
    expect((await readStats(kind)).unresolved).toBe(3)
    expect(transport.graphql).toHaveBeenCalledTimes(2)
  })

  it.each([
    { name: 'missing cursor', hasNextPage: true, endCursor: null },
    { name: 'terminal page', hasNextPage: false, endCursor: 'unused' },
  ])('does not request another page for $name', async ({ hasNextPage, endCursor }) => {
    transport.graphql.mockResolvedValueOnce({
      pr0: {
        pullRequest: {
          reviewThreads: { ...page([resolved], hasNextPage, endCursor), totalCount: 4 },
        },
      },
    })
    expect((await readStats(kind)).unresolved).toBe(3)
    expect(transport.graphql).toHaveBeenCalledTimes(1)
  })

  it('reports zero for an empty connection', async () => {
    transport.graphql.mockResolvedValueOnce({
      pr0: { pullRequest: { reviewThreads: { ...page([], false, null), totalCount: 0 } } },
    })
    expect((await readStats(kind)).unresolved).toBe(0)
    expect(transport.graphql).toHaveBeenCalledTimes(1)
  })
})

type DetailedNode = { isResolved: boolean; isOutdated: boolean; comments: { totalCount: number } }
function detailedPage(nodes: DetailedNode[], hasNextPage: boolean, endCursor: string | null) {
  return { nodes, pageInfo: { hasNextPage, endCursor } }
}
const knownThread: DetailedNode = {
  isResolved: true,
  isOutdated: false,
  comments: { totalCount: 2 },
}
function historyResponse(firstPage: ReturnType<typeof detailedPage>, totalCount = 4) {
  return {
    repository: {
      pullRequest: {
        body: 'Fixture history',
        createdAt: timestamp,
        updatedAt: timestamp,
        mergedAt: null,
        author: { login: 'fixture-user' },
        comments: { totalCount: 2, nodes: [] },
        commits: { totalCount: 0, nodes: [] },
        reviews: { nodes: [] },
        reviewRequests: { nodes: [] },
        closingIssuesReferences: { nodes: [] },
        reviewThreads: { ...firstPage, totalCount },
      },
    },
  }
}

function historyPageResponse(
  nodes: DetailedNode[],
  hasNextPage: boolean,
  endCursor: string | null
) {
  return {
    repository: { pullRequest: { reviewThreads: detailedPage(nodes, hasNextPage, endCursor) } },
  }
}

describe('public PR history pagination', () => {
  it('accumulates thread status and comment totals across every page', async () => {
    transport.graphql
      .mockResolvedValueOnce(historyResponse(detailedPage([knownThread], true, 'history-1')))
      .mockResolvedValueOnce(
        historyPageResponse(
          [{ isResolved: false, isOutdated: true, comments: { totalCount: 3 } }],
          true,
          'history-2'
        )
      )
      .mockResolvedValueOnce(
        historyPageResponse(
          [
            { isResolved: true, isOutdated: false, comments: { totalCount: 1 } },
            { isResolved: false, isOutdated: false, comments: { totalCount: 4 } },
          ],
          false,
          null
        )
      )
    const result = await fetchPRHistory(config, owner, repo, 42)
    expect(result).toMatchObject({
      body: 'Fixture history',
      threadsTotal: 4,
      threadsAddressed: 2,
      threadsUnaddressed: 2,
      threadsOutdated: 1,
      reviewCommentCount: 10,
      issueCommentCount: 2,
      totalComments: 12,
      commitCount: 0,
      linkedIssues: [],
      reviewers: [],
    })
    expect(result.timeline).toEqual([
      {
        id: 'opened-42',
        type: 'opened',
        author: 'fixture-user',
        occurredAt: timestamp,
        summary: 'Opened pull request',
        url: null,
      },
    ])
    expect(transport.graphql).toHaveBeenCalledTimes(3)
    expect(transport.graphql.mock.calls[1][0]).toContain('after: "history-1"')
    expect(transport.graphql.mock.calls[2][0]).toContain('after: "history-2"')
  })
})

describe('public PR history termination', () => {
  it.each(nullConnections)(
    'keeps history and known counts when a later page has $name',
    async ({ response }) => {
      transport.graphql
        .mockResolvedValueOnce(historyResponse(detailedPage([knownThread], true, 'next')))
        .mockResolvedValueOnce(response)
      const result = await fetchPRHistory(config, owner, repo, 42)
      expect(result).toMatchObject({
        body: 'Fixture history',
        threadsTotal: 4,
        threadsAddressed: 1,
        threadsUnaddressed: 3,
        reviewCommentCount: 2,
        totalComments: 4,
      })
      expect(transport.graphql).toHaveBeenCalledTimes(2)
    }
  )

  it('preserves counts when the final page has no nodes', async () => {
    transport.graphql
      .mockResolvedValueOnce(historyResponse(detailedPage([knownThread], true, 'next')))
      .mockResolvedValueOnce({
        repository: { pullRequest: { reviewThreads: detailedPage([], false, null) } },
      })
    expect(await fetchPRHistory(config, owner, repo, 42)).toMatchObject({
      threadsAddressed: 1,
      threadsUnaddressed: 3,
      reviewCommentCount: 2,
      totalComments: 4,
    })
    expect(transport.graphql).toHaveBeenCalledTimes(2)
  })

  it.each([
    { name: 'missing cursor', hasNextPage: true, endCursor: null },
    { name: 'terminal page', hasNextPage: false, endCursor: 'unused' },
  ])('terminates without another request for $name', async ({ hasNextPage, endCursor }) => {
    transport.graphql.mockResolvedValueOnce(
      historyResponse(detailedPage([knownThread], hasNextPage, endCursor))
    )
    expect(await fetchPRHistory(config, owner, repo, 42)).toMatchObject({
      threadsAddressed: 1,
      threadsUnaddressed: 3,
      reviewCommentCount: 2,
    })
    expect(transport.graphql).toHaveBeenCalledTimes(1)
  })

  it('returns an empty thread summary for an empty first page', async () => {
    transport.graphql.mockResolvedValueOnce(historyResponse(detailedPage([], false, null), 0))
    expect(await fetchPRHistory(config, owner, repo, 42)).toMatchObject({
      threadsTotal: 0,
      threadsAddressed: 0,
      threadsUnaddressed: 0,
      reviewCommentCount: 0,
      totalComments: 2,
    })
  })

  it.each(nullConnections)('rejects $name in the initial response', async ({ response }) => {
    transport.graphql.mockResolvedValueOnce(response)
    await expect(fetchPRHistory(config, owner, repo, 42)).rejects.toThrow(
      'PR #42 not found in fixture-owner/fixture-repository'
    )
    expect(transport.graphql).toHaveBeenCalledTimes(1)
  })
})
