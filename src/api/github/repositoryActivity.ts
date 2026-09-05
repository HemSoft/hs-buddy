import type { Octokit } from './shared'

export interface RepositoryActivityItem {
  number: number
  title: string
  url: string
  state: 'open' | 'draft' | 'closed' | 'merged'
  updatedAt: string
}

export interface ActiveRepositoryActivity {
  name: string
  fullName: string
  url: string
  updatedAt: string
  issues: RepositoryActivityItem[]
  pullRequests: RepositoryActivityItem[]
}

export interface RepositoryActivitySummary {
  repositories: ActiveRepositoryActivity[]
  issuesAvailable: boolean
  pullRequestsAvailable: boolean
  hasMore: boolean
  fetchedAt: string
}

export interface RepositoryActivitySource {
  name: string
  fullName: string
  url: string
  isArchived: boolean
}

const ACTIVE_REPOSITORY_LIMIT = 6
const ACTIVITY_ITEMS_PER_REPOSITORY = 4

type ActivitySearchResponse = Awaited<ReturnType<Octokit['search']['issuesAndPullRequests']>>
type ActivitySearchItem = ActivitySearchResponse['data']['items'][number]

function compareActivityItems(left: RepositoryActivityItem, right: RepositoryActivityItem): number {
  const leftIsOpen = left.state === 'open' || left.state === 'draft'
  const rightIsOpen = right.state === 'open' || right.state === 'draft'

  return (
    Number(rightIsOpen) - Number(leftIsOpen) ||
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
    right.number - left.number
  )
}

function getActivityRepoFullName(item: ActivitySearchItem): string | null {
  const marker = '/repos/'
  const markerIndex = item.repository_url.indexOf(marker)
  if (markerIndex < 0) return null
  return item.repository_url.slice(markerIndex + marker.length)
}

function mapActivityItem(
  item: ActivitySearchItem,
  kind: 'issue' | 'pull-request'
): RepositoryActivityItem {
  let state: RepositoryActivityItem['state'] = item.state === 'open' ? 'open' : 'closed'
  if (kind === 'pull-request') {
    if (item.pull_request?.merged_at) state = 'merged'
    else if (item.draft && item.state === 'open') state = 'draft'
  }

  return {
    number: item.number,
    title: item.title,
    url: item.html_url,
    state,
    updatedAt: item.updated_at,
  }
}

function getSearchItems(
  result: PromiseSettledResult<ActivitySearchResponse>
): ActivitySearchItem[] {
  return result.status === 'fulfilled' ? result.value.data.items : []
}

function addSearchItems(
  grouped: Map<string, ActiveRepositoryActivity>,
  activeRepos: Map<string, RepositoryActivitySource>,
  items: ActivitySearchItem[],
  kind: 'issue' | 'pull-request'
) {
  for (const item of items) {
    const fullName = getActivityRepoFullName(item)
    if (!fullName) continue
    const repo = activeRepos.get(fullName.toLowerCase())
    if (!repo) continue

    const current = grouped.get(repo.fullName) ?? {
      name: repo.name,
      fullName: repo.fullName,
      url: repo.url,
      updatedAt: item.updated_at,
      issues: [],
      pullRequests: [],
    }
    const lane = kind === 'issue' ? current.issues : current.pullRequests
    lane.push(mapActivityItem(item, kind))
    if (new Date(item.updated_at).getTime() > new Date(current.updatedAt).getTime()) {
      current.updatedAt = item.updated_at
    }
    grouped.set(repo.fullName, current)
  }
}

export function buildRepositoryActivity(
  repos: RepositoryActivitySource[],
  issuesResult: PromiseSettledResult<ActivitySearchResponse>,
  pullRequestsResult: PromiseSettledResult<ActivitySearchResponse>,
  fetchedAt = new Date().toISOString()
): RepositoryActivitySummary {
  const activeRepos = new Map(
    repos.flatMap(repo => (repo.isArchived ? [] : [[repo.fullName.toLowerCase(), repo] as const]))
  )
  const grouped = new Map<string, ActiveRepositoryActivity>()

  addSearchItems(grouped, activeRepos, getSearchItems(issuesResult), 'issue')
  addSearchItems(grouped, activeRepos, getSearchItems(pullRequestsResult), 'pull-request')

  const allRepositories = Array.from(grouped.values())
    .map(repo => ({
      ...repo,
      issues: repo.issues.sort(compareActivityItems).slice(0, ACTIVITY_ITEMS_PER_REPOSITORY),
      pullRequests: repo.pullRequests
        .sort(compareActivityItems)
        .slice(0, ACTIVITY_ITEMS_PER_REPOSITORY),
    }))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
        left.fullName.localeCompare(right.fullName)
    )

  const issueCount = issuesResult.status === 'fulfilled' ? issuesResult.value.data.total_count : 0
  const pullRequestCount =
    pullRequestsResult.status === 'fulfilled' ? pullRequestsResult.value.data.total_count : 0
  const returnedItemCount =
    getSearchItems(issuesResult).length + getSearchItems(pullRequestsResult).length

  return {
    repositories: allRepositories.slice(0, ACTIVE_REPOSITORY_LIMIT),
    issuesAvailable: issuesResult.status === 'fulfilled',
    pullRequestsAvailable: pullRequestsResult.status === 'fulfilled',
    hasMore:
      allRepositories.length > ACTIVE_REPOSITORY_LIMIT ||
      issueCount + pullRequestCount > returnedItemCount,
    fetchedAt,
  }
}
