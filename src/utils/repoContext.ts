import { parsePRDetailRoute } from './prDetailView'

export interface RepoContext {
  owner: string
  repo: string
}

function splitRepoSlug(repository: string): { owner: string | null; repo: string } {
  const parts = repository.split('/').filter(Boolean)
  if (parts.length >= 2) return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] }
  return { owner: null, repo: repository }
}

function extractOwnerFromUrl(url: string): string | null {
  try {
    const [, urlOwner] = new URL(url).pathname.split('/')
    return urlOwner || null
  } catch (_: unknown) {
    return null
  }
}

function parseRepoContextFromPRDetail(viewId: string): RepoContext | null {
  const route = parsePRDetailRoute(viewId)
  if (!route) return null
  const { repository, org, url } = route.pr

  const { owner: normalizedOwner, repo: normalizedRepo } = splitRepoSlug(repository)

  const resolvedOwner = normalizedOwner || org || extractOwnerFromUrl(url)
  if (resolvedOwner && normalizedRepo) return { owner: resolvedOwner, repo: normalizedRepo }
  return null
}

const SIMPLE_PREFIXES = [
  'repo-detail:',
  'repo-commits:',
  'repo-commit:',
  'repo-issues:',
  'repo-issues-closed:',
  'repo-issue:',
  'repo-prs:',
  'repo-prs-closed:',
]

/** Parse an owner/repo pair from a slug like "owner/repo" or "owner/repo/extra". */
function parseOwnerRepoFromSlug(slug: string): RepoContext | null {
  const slashIdx = slug.indexOf('/')
  if (slashIdx <= 0) return null
  const owner = slug.substring(0, slashIdx)
  const rest = slug.substring(slashIdx + 1)
  const nextSlash = rest.indexOf('/')
  const repo = nextSlash > 0 ? rest.substring(0, nextSlash) : rest
  return owner && repo ? { owner, repo } : null
}

function parseRepoContextFromSimplePrefix(viewId: string): RepoContext | null {
  const prefix = SIMPLE_PREFIXES.find(p => viewId.startsWith(p))
  if (!prefix) return null
  return parseOwnerRepoFromSlug(viewId.slice(prefix.length))
}

/**
 * Extract owner/repo from any view ID.
 * Handles PR detail (encoded JSON), repo-detail, repo-commits, repo-issues, etc.
 */
export function getRepoContextFromViewId(viewId: string | null): RepoContext | null {
  if (!viewId) return null
  if (viewId.startsWith('pr-detail:')) return parseRepoContextFromPRDetail(viewId)
  return parseRepoContextFromSimplePrefix(viewId)
}
