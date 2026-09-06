import type { Pull, Review, ReviewComment, ReviewSnapshot } from './ai-review-policy'

export interface GitHubApi {
  request<T>(path: string, method?: string, body?: unknown): Promise<T>
}

export function githubApi(token: string): GitHubApi {
  return {
    async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
      if (!path.startsWith('/')) throw new Error('GitHub API path must be relative')
      const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`GitHub API ${method} ${path}: HTTP ${response.status}`)
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    },
  }
}

export async function allPages<T>(api: GitHubApi, path: string): Promise<T[]> {
  const items: T[] = []
  const separator = path.includes('?') ? '&' : '?'
  for (let page = 1; page <= 100; page++) {
    const next = await api.request<T[]>(`${path}${separator}per_page=100&page=${page}`)
    if (!Array.isArray(next)) throw new Error('Expected a GitHub collection')
    items.push(...next)
    if (next.length < 100) return items
  }
  throw new Error('GitHub pagination limit reached; refusing partial evidence')
}

interface ThreadPage {
  errors?: Array<{ message: string }>
  data?: {
    repository: {
      pullRequest: {
        headRefOid: string
        reviewDecision: string | null
        reviewThreads: {
          nodes: Array<{ isResolved: boolean }>
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        }
      }
    }
  }
}

async function threadState(api: GitHubApi, repository: string, number: number) {
  const [owner, name] = repository.split('/')
  let cursor: string | null = null
  let unresolvedThreads = 0
  let observedHead: string | undefined
  for (let page = 0; page < 100; page++) {
    const result: ThreadPage = await api.request('/graphql', 'POST', {
      query: `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
        repository(owner:$owner,name:$name){pullRequest(number:$number){
          headRefOid reviewDecision reviewThreads(first:100,after:$cursor){
            nodes{isResolved} pageInfo{hasNextPage endCursor}
          }
        }}
      }`,
      variables: { owner, name, number, cursor },
    })
    if (result.errors?.length || !result.data) throw new Error('Incomplete GraphQL review evidence')
    const pull = result.data.repository.pullRequest
    if (observedHead && observedHead !== pull.headRefOid)
      throw new Error('Head changed across thread pages')
    observedHead = pull.headRefOid
    unresolvedThreads += pull.reviewThreads.nodes.filter(thread => !thread.isResolved).length
    const info = pull.reviewThreads.pageInfo
    if (!info.hasNextPage)
      return { observedHead, unresolvedThreads, reviewDecision: pull.reviewDecision }
    if (!info.endCursor || info.endCursor === cursor)
      throw new Error('Missing or repeated thread cursor')
    cursor = info.endCursor
  }
  throw new Error('Thread pagination limit reached; refusing partial evidence')
}

export async function readSnapshot(
  api: GitHubApi,
  repository: string,
  number: number
): Promise<ReviewSnapshot> {
  const root = `/repos/${repository}`
  const pull = await api.request<Pull>(`${root}/pulls/${number}`)
  const [comments, reviews, reactions, commits, threads, openPulls] = await Promise.all([
    allPages<ReviewComment>(api, `${root}/issues/${number}/comments`),
    allPages<Review>(api, `${root}/pulls/${number}/reviews`),
    allPages<ReviewSnapshot['reactions'][number]>(api, `${root}/issues/${number}/reactions`),
    allPages<{ sha: string }>(api, `${root}/pulls/${number}/commits`),
    threadState(api, repository, number),
    allPages<Pull>(api, `${root}/pulls?state=open`),
  ])
  const sharedHead = openPulls.some(
    other => other.number !== number && other.head.sha === pull.head.sha
  )
  return {
    pull,
    comments,
    reviews,
    reactions,
    commitShas: commits.map(commit => commit.sha),
    sharedHead,
    ...threads,
  }
}

export function evidenceFingerprint(snapshot: ReviewSnapshot): string {
  const pull = snapshot.pull
  // REST includes volatile fields not part of Pull's public contract. Select the fields explicitly.
  return JSON.stringify({
    ...snapshot,
    pull: {
      number: pull.number,
      head: pull.head.sha,
      repository: pull.head.repo?.full_name,
      state: pull.state,
      draft: pull.draft,
      base: pull.base.ref,
      labels: pull.labels.map(label => label.name).sort(),
    },
  })
}
