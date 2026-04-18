import { parsePRDetailRoute } from './prDetailView'

export interface RepoContext {
  owner: string
  repo: string
}

/**
 * Extract owner/repo from any view ID.
 * Handles PR detail (encoded JSON), repo-detail, repo-commits, repo-issues, etc.
 */
export function getRepoContextFromViewId(viewId: string | null): RepoContext | null {
  if (!viewId) return null

  // PR detail uses encoded JSON — delegate to the existing parser
  if (viewId.startsWith('pr-detail:')) {
    const route = parsePRDetailRoute(viewId)
    if (!route) return null
    const repository = route.pr.repository
    const org = route.pr.org

    // Normalize: repository may be "repo" or "owner/repo"
    let normalizedOwner: string | null = null
    let normalizedRepo = repository
    if (repository) {
      const parts = repository.split('/').filter(Boolean)
      if (parts.length >= 2) {
        normalizedOwner = parts[parts.length - 2]
        normalizedRepo = parts[parts.length - 1]
      }
    }

    if (normalizedOwner && normalizedRepo) return { owner: normalizedOwner, repo: normalizedRepo }
    if (org && normalizedRepo) return { owner: org, repo: normalizedRepo }

    // Fallback: try to get owner from the PR URL
    try {
      const url = new URL(route.pr.url)
      const [, urlOwner] = url.pathname.split('/')
      if (urlOwner && normalizedRepo) return { owner: urlOwner, repo: normalizedRepo }
    } catch {
      // ignore
    }
    return null
  }

  // Simple prefixed views: "prefix:owner/repo" or "prefix:owner/repo/extra"
  const simplePrefixes = [
    'repo-detail:',
    'repo-commits:',
    'repo-commit:',
    'repo-issues:',
    'repo-issues-closed:',
    'repo-issue:',
    'repo-prs:',
    'repo-prs-closed:',
  ]

  for (const prefix of simplePrefixes) {
    if (viewId.startsWith(prefix)) {
      const slug = viewId.slice(prefix.length)
      const slashIdx = slug.indexOf('/')
      if (slashIdx <= 0) return null
      const owner = slug.substring(0, slashIdx)
      const rest = slug.substring(slashIdx + 1)
      // repo is the next segment (before any further slashes)
      const nextSlash = rest.indexOf('/')
      const repo = nextSlash > 0 ? rest.substring(0, nextSlash) : rest
      if (owner && repo) return { owner, repo }
    }
  }

  return null
}
