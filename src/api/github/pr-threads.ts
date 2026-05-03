import type { PullRequest, PRConfig } from '../../types/pullRequest'
import { graphql, getTokenForOwner } from './shared'
import type { RepoPullRequest } from './prs'

// ── Thread stats helpers ─────────────────────────────────────────────

/** Paginate through remaining review thread pages when the first page didn't fetch all nodes. */
/* v8 ignore start -- GraphQL thread counting; requires real API */
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
  const allNodes = [...(firstPage.nodes || [])]
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
    const pageResult = await graphql<{
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            nodes: Array<{ isResolved: boolean }>
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
      const resolved = allNodes.filter(t => t.isResolved).length
      chunk[idx].threadsUnaddressed = Math.max(0, data.reviewThreads.totalCount - resolved)
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

  // Group PRs by owner for token selection
  const prsByOwner = new Map<string, typeof prs>()
  for (const pr of prs) {
    const list = prsByOwner.get(pr._owner) || []
    list.push(pr)
    prsByOwner.set(pr._owner, list)
  }

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
      const addressed = allNodes.filter(t => t.isResolved).length
      chunk[idx].threadsTotal = data.reviewThreads.totalCount
      chunk[idx].threadsAddressed = addressed
      chunk[idx].threadsUnaddressed = Math.max(0, data.reviewThreads.totalCount - addressed)
    }
  }
}
/* v8 ignore stop */
