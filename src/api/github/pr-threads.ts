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

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

type ReviewThreadsPage = {
  totalCount: number
  pageInfo: PageInfo
  nodes: Array<{ isResolved: boolean }>
}

type ThreadStatsResult = Record<
  string,
  {
    pullRequest: {
      reviewThreads: ReviewThreadsPage
    } | null
  } | null
>

const THREAD_STATS_CHUNK_SIZE = 20

function extractThreadsPage<T>(result: {
  repository: { pullRequest: { reviewThreads: { pageInfo: PageInfo; nodes: T[] } } | null } | null
}): { pageInfo: PageInfo; nodes: T[] } | null {
  return result.repository?.pullRequest?.reviewThreads ?? null
}

function safeNodes<T>(nodes: T[] | undefined | null): T[] {
  return nodes || []
}

function chunkPrs<T>(prs: T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < prs.length; i += THREAD_STATS_CHUNK_SIZE) {
    chunks.push(prs.slice(i, i + THREAD_STATS_CHUNK_SIZE))
  }
  return chunks
}

/** Paginate through remaining review thread pages when the first page didn't fetch all nodes. */
async function paginateReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  firstPage: {
    pageInfo: PageInfo
    nodes: Array<{ isResolved: boolean }>
  },
  token: string
): Promise<Array<{ isResolved: boolean }>> {
  const allNodes = [...safeNodes(firstPage.nodes)]
  let { hasNextPage, endCursor } = firstPage.pageInfo

  while (hasNextPage && endCursor) {
    const pageQuery = `query {
        repository(owner: "${owner}", name: "${repo}") {
          pullRequest(number: ${prNumber}) {
            reviewThreads(first: 100, after: "${endCursor}") {
              pageInfo { hasNextPage endCursor }
              nodes { isResolved }
            }
          }
        }
      }`
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- GitHub cursor pagination is order-dependent; each page needs the previous endCursor.
    const pageResult = await graphql<{
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: PageInfo
            nodes: Array<{ isResolved: boolean }>
          }
        } | null
      } | null
    }>(pageQuery, { headers: { authorization: `token ${token}` } })
    const pageThreads = extractThreadsPage(pageResult)
    if (!pageThreads) break
    allNodes.push(...safeNodes(pageThreads.nodes))
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
  for (const chunk of chunkPrs(prs)) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Keep GitHub GraphQL chunks sequential to avoid bursty secondary-rate-limit failures.
    await fetchUnresolvedThreadCountsChunk(token, owner, repo, chunk)
  }
}

async function fetchUnresolvedThreadCountsChunk(
  token: string,
  owner: string,
  repo: string,
  chunk: RepoPullRequest[]
): Promise<void> {
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
  const result = await graphql<ThreadStatsResult>(query, {
    headers: { authorization: `token ${token}` },
  })

  await Promise.all(
    chunk.map(async (pr, idx) => {
      const data = result[`pr${idx}`]?.pullRequest
      if (!data) return
      const allNodes = await paginateReviewThreads(
        owner,
        repo,
        pr.number,
        data.reviewThreads,
        token
      )
      const { unresolved } = countThreadStats(allNodes, data.reviewThreads.totalCount)
      pr.threadsUnaddressed = unresolved
    })
  )
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

  await Promise.all(
    Array.from(prsByOwner, async ([owner, ownerPrs]) => {
      try {
        const token = await getTokenForOwner(config, owner)
        await fetchThreadStatsChunked(token, ownerPrs, owner)
      } catch (error: unknown) {
        console.warn(`[fetchBatchThreadStats] Failed for owner ${owner}:`, error)
      }
    })
  )
}

/** Process thread stats in chunks of 20 for a single owner. */
async function fetchThreadStatsChunked(
  token: string,
  ownerPrs: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>,
  owner: string
): Promise<void> {
  const chunks = chunkPrs(ownerPrs)
  for (let i = 0; i < chunks.length; i++) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Keep GitHub GraphQL chunks sequential to avoid bursty secondary-rate-limit failures.
    await fetchThreadStatsChunk(token, chunks[i], owner, i * THREAD_STATS_CHUNK_SIZE)
  }
}

async function fetchThreadStatsChunk(
  token: string,
  chunk: Array<PullRequest & { _owner: string; _repo: string; _prNumber: number }>,
  owner: string,
  aliasOffset: number
): Promise<void> {
  const fragments = chunk
    .map((pr, idx) => {
      const alias = `pr${aliasOffset + idx}`
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

  await Promise.all(
    chunk.map(async (pr, idx) => {
      const data = result[`pr${aliasOffset + idx}`]?.pullRequest
      if (!data) return
      const allNodes = await paginateReviewThreads(
        owner,
        pr._repo,
        pr._prNumber,
        data.reviewThreads,
        token
      )
      const { resolved, unresolved } = countThreadStats(allNodes, data.reviewThreads.totalCount)
      pr.threadsTotal = data.reviewThreads.totalCount
      pr.threadsAddressed = resolved
      pr.threadsUnaddressed = unresolved
    })
  )
}
/* v8 ignore stop */
