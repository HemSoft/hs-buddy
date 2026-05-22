/* v8 ignore start -- imports pull in API modules that aren't available in test */
import type { PullRequest, PRConfig } from '../../types/pullRequest'
import { graphql, getTokenForOwner } from './shared'
import type { RepoPullRequest } from './prs'
/* v8 ignore stop */

// ── Pure helpers (testable) ─────────────────────────────────────────

/** Count resolved/unresolved threads from a list of thread nodes. */
export function countThreadStats(
  nodes: ReadonlyArray<{ isResolved: boolean }>,
  totalCount: number
): { resolved: number; unresolved: number } {
  const resolved = nodes.filter(t => t.isResolved).length
  return { resolved, unresolved: Math.max(0, totalCount - resolved) }
}

/** Group PRs by owner for batched token selection. */
export function groupPrsByOwner<T extends { _owner: string }>(prs: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const pr of prs) {
    const list = map.get(pr._owner) || []
    list.push(pr)
    map.set(pr._owner, list)
  }
  return map
}

// ── GraphQL functions (require real API) ────────────────────────────

/* v8 ignore start -- GraphQL thread counting; requires real API */

/** Paginate through remaining review thread pages when the first page didn't fetch all nodes. */
function buildSimpleThreadsPageQuery(
  owner: string,
  repo: string,
  prNumber: number,
  cursor: string
): string {
  return `query {
        repository(owner: "${owner}", name: "${repo}") {
          pullRequest(number: ${prNumber}) {
            reviewThreads(first: 100, after: "${cursor}") {
              pageInfo { hasNextPage endCursor }
              nodes { isResolved }
            }
          }
        }
      }`
}

/** Extract thread nodes from a GraphQL pagination response. */
function extractSimpleThreads(result: {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: Array<{ isResolved: boolean }>
      }
    } | null
  } | null
}):
  | {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: Array<{ isResolved: boolean }>
    }
  | undefined {
  return result.repository?.pullRequest?.reviewThreads
}

function cloneSimpleThreadNodes(
  nodes: Array<{ isResolved: boolean }> | null | undefined
): Array<{ isResolved: boolean }> {
  return [...(nodes ?? [])]
}

function hasSimpleThreadCursor(pageInfo: { hasNextPage: boolean; endCursor: string | null }): boolean {
  return pageInfo.hasNextPage && Boolean(pageInfo.endCursor)
}

async function paginateReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  firstPage: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    nodes: Array<{ isResolved: boolean }>
  },
  token: string
): Promise<Array<{ isResolved: boolean }>> {
  const allNodes = cloneSimpleThreadNodes(firstPage.nodes)
  let { hasNextPage, endCursor } = firstPage.pageInfo

  while (hasSimpleThreadCursor({ hasNextPage, endCursor })) {
    const pageResult = await graphql<{
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: Array<{ isResolved: boolean }>
          }
        } | null
      } | null
    }>(buildSimpleThreadsPageQuery(owner, repo, prNumber, endCursor!), {
      headers: { authorization: `token ${token}` },
    })
    const pageThreads = extractSimpleThreads(pageResult)
    if (!pageThreads) break
    allNodes.push(...cloneSimpleThreadNodes(pageThreads.nodes))
    hasNextPage = pageThreads.pageInfo.hasNextPage
    endCursor = pageThreads.pageInfo.endCursor
  }

  return allNodes
}

/** Count unresolved review threads for a batch of PRs via GraphQL. */
export async function fetchUnresolvedThreadCounts(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  prs: RepoPullRequest[]
): Promise<void> {
  const token = await getTokenForOwner(config, owner)
  for (let i = 0; i < prs.length; i += 20) {
    const chunk = prs.slice(i, i + 20)
    const fragments = chunk
      .map((pr, idx) => {
        const alias = `pr${idx}`
        return `${alias}: repository(owner: "${owner}", name: "${repo}") {
            pullRequest(number: ${pr.number}) {
              reviewThreads(first: 100) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes { isResolved }
              }
            }
          }`
      })
      .join('\n')

    const query = `query { ${fragments} }`
    const result = await graphql<
      Record<
        string,
        {
          pullRequest: {
            reviewThreads: {
              totalCount: number
              pageInfo: { hasNextPage: boolean; endCursor: string | null }
              nodes: Array<{ isResolved: boolean }>
            }
          } | null
        } | null
      >
    >(query, { headers: { authorization: `token ${token}` } })

    for (let idx = 0; idx < chunk.length; idx++) {
      const data = result[`pr${idx}`]?.pullRequest
      if (!data) continue
      const allNodes = await paginateReviewThreads(
        owner,
        repo,
        chunk[idx].number,
        data.reviewThreads,
        token
      )
      const { unresolved } = countThreadStats(allNodes, data.reviewThreads.totalCount)
      chunk[idx].threadsUnaddressed = unresolved
    }
  }
}

/**
 * Batch-fetch review thread stats for multiple PRs using a single GraphQL query per owner.
 */
export async function fetchBatchThreadStats(
  config: PRConfig['github'],
  prs: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>
): Promise<void> {
  if (prs.length === 0) return

  const prsByOwner = groupPrsByOwner(prs)

  for (const [owner, ownerPrs] of prsByOwner) {
    try {
      const token = await getTokenForOwner(config, owner)
      await fetchThreadStatsChunked(token, ownerPrs, owner)
    } catch (error: unknown) {
      console.warn(`[fetchBatchThreadStats] Failed for owner ${owner}:`, error)
    }
  }
}

/** Process thread stats in chunks of 20 for a single owner. */
async function fetchThreadStatsChunked(
  token: string,
  ownerPrs: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>,
  owner: string
): Promise<void> {
  type ThreadStatsResult = Record<
    string,
    {
      pullRequest: {
        reviewThreads: {
          totalCount: number
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: Array<{ isResolved: boolean }>
        }
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
                  pageInfo { hasNextPage endCursor }
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
      const allNodes = await paginateReviewThreads(
        owner,
        chunk[idx]._repo,
        chunk[idx]._prNumber,
        data.reviewThreads,
        token
      )
      const { resolved, unresolved } = countThreadStats(allNodes, data.reviewThreads.totalCount)
      chunk[idx].threadsTotal = data.reviewThreads.totalCount
      chunk[idx].threadsAddressed = resolved
      chunk[idx].threadsUnaddressed = unresolved
    }
  }
}
/* v8 ignore stop */
