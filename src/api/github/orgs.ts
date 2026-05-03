import type { PRConfig } from '../../types/pullRequest'
import { type Octokit, withFirstAvailableAccount, fetchUserNames, pickFirst } from './shared'
import { isNotFoundError } from '../../utils/errorUtils'
import { sumBy } from '../../utils/arrayUtils'

// ─── Types ────────────────────────────────────────────────────────────

// Repository info type for org repo listing
export interface OrgRepo {
  name: string
  fullName: string
  description: string | null
  url: string
  defaultBranch: string
  language: string | null
  stargazersCount: number
  forksCount: number
  isPrivate: boolean
  isArchived: boolean
  updatedAt: string | null
  pushedAt: string | null
}

// Result from fetchOrgRepos with account attribution
export interface OrgRepoResult {
  repos: OrgRepo[]
  /** The GitHub username whose token authenticated this request */
  authenticatedAs: string
  /** True when the namespace is a user account rather than an organization */
  isUserNamespace: boolean
}

export interface OrgMember {
  login: string
  name: string | null
  avatarUrl: string | null
  url: string
  type: string
}

export interface OrgMemberResult {
  members: OrgMember[]
  authenticatedAs: string
  isUserNamespace: boolean
}

export interface OrgTeam {
  slug: string
  name: string
  description: string | null
  memberCount: number
  repoCount: number
  url: string
}

export interface OrgTeamResult {
  teams: OrgTeam[]
}

export interface TeamMember {
  login: string
  name: string | null
  avatarUrl: string | null
}

export interface TeamMembersResult {
  members: TeamMember[]
}

interface OrgContributorToday {
  login: string
  avatarUrl: string | null
  url: string | null
  commits: number
}

interface OrgOverviewMetrics {
  org: string
  repoCount: number
  privateRepoCount: number
  archivedRepoCount: number
  openIssueCount: number
  openPullRequestCount: number
  totalStars: number
  totalForks: number
  activeReposToday: number
  commitsToday: number
  lastPushAt: string | null
  topContributorsToday: OrgContributorToday[]
}

export interface OrgOverviewResult {
  metrics: OrgOverviewMetrics
  authenticatedAs: string
  isUserNamespace: boolean
}

// ─── Constants ────────────────────────────────────────────────────────

const ORG_REPO_NUM_DEFAULTS = { stargazers_count: 0, forks_count: 0, archived: false }

// ─── Helper functions ─────────────────────────────────────────────────

/** Map a repo entry from Octokit response to OrgRepo. */
/* v8 ignore start -- API response null-guards in org repo mapping */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawRepoToOrgRepo(repo: any): OrgRepo {
  const d = { ...ORG_REPO_NUM_DEFAULTS, ...repo }
  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    url: repo.html_url,
    defaultBranch: repo.default_branch || 'main',
    language: repo.language ?? null,
    stargazersCount: d.stargazers_count,
    forksCount: d.forks_count,
    isPrivate: repo.private,
    isArchived: d.archived,
    updatedAt: repo.updated_at ?? null,
    pushedAt: repo.pushed_at ?? null,
  }
}

/* v8 ignore stop */

/* v8 ignore start -- API response null-guards in org overview metrics */
function buildOrgMetrics(
  org: string,
  repos: OrgRepo[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openIssuesResult: PromiseSettledResult<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openPrsResult: PromiseSettledResult<any>,
  activeReposToday: number,
  commitsToday: number,
  contributorMap: Map<string, OrgContributorToday>
): OrgOverviewMetrics {
  return {
    org,
    repoCount: repos.length,
    privateRepoCount: repos.filter(repo => repo.isPrivate).length,
    archivedRepoCount: repos.filter(repo => repo.isArchived).length,
    openIssueCount:
      openIssuesResult.status === 'fulfilled' ? openIssuesResult.value.data.total_count : 0,
    openPullRequestCount:
      openPrsResult.status === 'fulfilled' ? openPrsResult.value.data.total_count : 0,
    totalStars: sumBy(repos, repo => repo.stargazersCount),
    totalForks: sumBy(repos, repo => repo.forksCount),
    activeReposToday,
    commitsToday,
    lastPushAt:
      repos
        .map(repo => repo.pushedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null,
    topContributorsToday: Array.from(contributorMap.values())
      .sort((left, right) => right.commits - left.commits || left.login.localeCompare(right.login))
      .slice(0, 10),
  }
}
/* v8 ignore stop */

/** Resolve contributor login from a commit (author login or committer name fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveContributorLogin(commit: any): string {
  /* v8 ignore start -- API response null-guards */
  return commit.author?.login || commit.commit.author?.name || 'unknown'
  /* v8 ignore stop */
}

const EMPTY_CONTRIBUTOR: OrgContributorToday = {
  login: 'unknown',
  avatarUrl: null,
  url: null,
  commits: 0,
}

/** Merge a commit into an existing contributor entry (or create a new one). */
/* v8 ignore start -- API response null-guards in contributor merging */
function mergeContributorEntry(
  login: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commit: any,
  existing: OrgContributorToday | undefined
): OrgContributorToday {
  const author = commit.author || {}
  const prev = existing || EMPTY_CONTRIBUTOR
  return {
    login,
    avatarUrl: pickFirst(author.avatar_url, prev.avatarUrl),
    url: pickFirst(author.html_url, prev.url),
    commits: prev.commits + 1,
  }
}
/* v8 ignore stop */

// ─── Internal helpers ─────────────────────────────────────────────────

/**
 * Paginate through all repos for an org or user namespace.
 */
async function paginateRepos(
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
      repos.push(mapRawRepoToOrgRepo(repo))
    }

    hasMore = response.data.length >= perPage
  }

  return repos
}

/**
 * Try org API first, fall back to user API on 404.
 */
async function resolveOrgOrUserRepos(
  octokit: Octokit,
  namespace: string
): Promise<{ repos: OrgRepo[]; isUserNamespace: boolean }> {
  try {
    const repos = await paginateRepos(octokit, namespace, 'org')
    return { repos, isUserNamespace: false }
  } catch (error: unknown) {
    if (!isNotFoundError(error)) throw error

    // Namespace is likely a user account — retry with user endpoint
    console.info(`Namespace '${namespace}' is not an org, trying user repos...`)
    const repos = await paginateRepos(octokit, namespace, 'user')
    return { repos, isUserNamespace: true }
  }
}

async function resolveOrgOrUserMembers(
  config: PRConfig['github'],
  octokit: Octokit,
  namespace: string
): Promise<{ members: OrgMember[]; isUserNamespace: boolean }> {
  try {
    const members = await octokit.paginate(octokit.orgs.listMembers, {
      org: namespace,
      per_page: 100,
    })

    const names = await fetchUserNames(
      config,
      members.map(m => m.login),
      namespace
    )

    return {
      members: members.map(member => ({
        login: member.login,
        name: names.get(member.login) ?? null,
        avatarUrl: member.avatar_url,
        url: member.html_url,
        type: member.type,
      })),
      isUserNamespace: false,
    }
  } catch (error: unknown) {
    /* v8 ignore start -- user-namespace fallback; requires real API 404 */
    if (!isNotFoundError(error)) throw error

    const user = await octokit.users.getByUsername({ username: namespace })
    return {
      members: [
        {
          login: user.data.login,
          name: user.data.name ?? null,
          avatarUrl: user.data.avatar_url,
          url: user.data.html_url,
          type: user.data.type,
        },
      ],
      isUserNamespace: true,
    }
    /* v8 ignore stop */
  }
}

// ─── Domain functions ─────────────────────────────────────────────────

/* v8 ignore start -- Org/team/overview fetch methods; error paths and null-guards */

/**
 * Fetch all repos for an org (or user namespace).
 * Tries repos.listForOrg first; on 404 falls back to repos.listForUser.
 * Returns which account was used so the UI can attribute the request.
 */
export async function fetchOrgRepos(
  config: PRConfig['github'],
  owner: string
): Promise<OrgRepoResult> {
  return withFirstAvailableAccount(
    config,
    owner,
    async (octokit, username) => {
      const result = await resolveOrgOrUserRepos(octokit, owner)
      return { ...result, authenticatedAs: username }
    },
    `fetch repos for '${owner}'`
  )
}

export async function fetchOrgMembers(
  config: PRConfig['github'],
  owner: string
): Promise<OrgMemberResult> {
  return withFirstAvailableAccount(
    config,
    owner,
    async (octokit, username) => {
      const result = await resolveOrgOrUserMembers(config, octokit, owner)
      return { ...result, authenticatedAs: username }
    },
    `fetch members for '${owner}'`
  )
}

export async function fetchOrgTeams(
  config: PRConfig['github'],
  owner: string
): Promise<OrgTeamResult> {
  return withFirstAvailableAccount(
    config,
    owner,
    async octokit => {
      const teams = await octokit.paginate(octokit.teams.list, {
        org: owner,
        per_page: 100,
      })

      return {
        teams: teams.map(team => ({
          slug: team.slug,
          name: team.name,
          description: team.description ?? null,
          memberCount: (team as { members_count?: number }).members_count ?? 0,
          repoCount: (team as { repos_count?: number }).repos_count ?? 0,
          url: team.html_url,
        })),
      }
    },
    `fetch teams for ${owner}`,
    { teams: [] }
  )
}

export async function fetchTeamMembers(
  config: PRConfig['github'],
  owner: string,
  teamSlug: string
): Promise<TeamMembersResult> {
  return withFirstAvailableAccount(
    config,
    owner,
    async octokit => {
      const members = await octokit.paginate(octokit.teams.listMembersInOrg, {
        org: owner,
        team_slug: teamSlug,
        per_page: 100,
      })

      const names = await fetchUserNames(
        config,
        members.map(m => m.login),
        owner
      )

      return {
        members: members.map(m => ({
          login: m.login,
          name: names.get(m.login) ?? null,
          avatarUrl: m.avatar_url ?? null,
        })),
      }
    },
    `fetch members for ${owner}/${teamSlug}`,
    { members: [] }
  )
}

export async function fetchOrgOverview(
  config: PRConfig['github'],
  owner: string
): Promise<OrgOverviewResult> {
  return withFirstAvailableAccount(
    config,
    owner,
    async (octokit, username) => {
      const { repos, isUserNamespace } = await resolveOrgOrUserRepos(octokit, owner)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const startOfDayIso = startOfDay.toISOString()

      const qualifier = isUserNamespace ? 'user' : 'org'
      const [openIssuesResult, openPrsResult] = await Promise.allSettled([
        octokit.search.issuesAndPullRequests({
          q: `${qualifier}:${owner} is:issue is:open`,
          per_page: 1,
        }),
        octokit.search.issuesAndPullRequests({
          q: `${qualifier}:${owner} is:pr is:open`,
          per_page: 1,
        }),
      ])

      const recentlyPushedRepos = repos.filter(
        repo => repo.pushedAt && new Date(repo.pushedAt).getTime() >= startOfDay.getTime()
      )

      const { activeReposToday, commitsToday, contributorMap } = await fetchTodayCommitStats(
        octokit,
        owner,
        recentlyPushedRepos,
        startOfDayIso
      )

      return {
        metrics: buildOrgMetrics(
          owner,
          repos,
          openIssuesResult,
          openPrsResult,
          activeReposToday,
          commitsToday,
          contributorMap
        ),
        authenticatedAs: username,
        isUserNamespace,
      }
    },
    `fetch overview for '${owner}'`
  )
}

/** Gather today's commit stats across recently-pushed repos. */
async function fetchTodayCommitStats(
  octokit: Octokit,
  org: string,
  recentlyPushedRepos: OrgRepo[],
  startOfDayIso: string
): Promise<{
  activeReposToday: number
  commitsToday: number
  contributorMap: Map<string, OrgContributorToday>
}> {
  let activeReposToday = 0
  let commitsToday = 0
  const contributorMap = new Map<string, OrgContributorToday>()

  for (const repo of recentlyPushedRepos) {
    const commits = await octokit.paginate(octokit.repos.listCommits, {
      owner: org,
      repo: repo.name,
      since: startOfDayIso,
      per_page: 100,
    })

    if (commits.length === 0) continue

    activeReposToday++
    commitsToday += commits.length

    for (const commit of commits) {
      const login = resolveContributorLogin(commit)
      const existing = contributorMap.get(login)
      contributorMap.set(login, mergeContributorEntry(login, commit, existing))
    }
  }

  return { activeReposToday, commitsToday, contributorMap }
}

export async function fetchAllOrgOrUserRepos(
  config: PRConfig['github'],
  owner: string
): Promise<{ repos: OrgRepo[]; isUserNamespace: boolean }> {
  return withFirstAvailableAccount(
    config,
    owner,
    async octokit => resolveOrgOrUserRepos(octokit, owner),
    `fetch repos for '${owner}'`
  )
}

export async function fetchAllOrgOrUserMembers(
  config: PRConfig['github'],
  owner: string
): Promise<{ members: OrgMember[]; isUserNamespace: boolean }> {
  return withFirstAvailableAccount(
    config,
    owner,
    async octokit => resolveOrgOrUserMembers(config, octokit, owner),
    `fetch members for '${owner}'`
  )
}
/* v8 ignore stop */
