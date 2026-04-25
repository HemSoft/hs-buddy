/** Shared error message when a PR URL cannot be decomposed into owner/repo. */
export const PR_URL_PARSE_ERROR = 'Could not parse owner/repo from PR URL'

export function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(?:\d+)/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}

export function formatFileStatus(status: string): string {
  return status.replace(/-/g, ' ')
}

/** Extract the repo name from an "owner/repo" string, falling back to the full string. */
export function getRepoShortName(fullRepo: string): string {
  return fullRepo.split('/')[1] || fullRepo
}

/** Parse an `owner/repo` key into its parts. Returns null if either part is empty. */
export function parseOwnerRepoKey(key: string): { owner: string; repo: string } | null {
  const [owner, ...repoParts] = key.split('/')
  const repo = repoParts.join('/')
  if (!owner || !repo) return null
  return { owner, repo }
}

// ─── Git remote URL parsing ──────────────────────────────

/** Parsed result from a git remote URL. */
interface GitRemoteParsed {
  host: string
  slug: string
  scheme: 'http' | 'https' | 'ssh'
}

/**
 * Parse a git remote URL into host + owner/repo slug.
 * Supports HTTP(S) and SSH formats. Returns null for unparseable URLs.
 */
export function parseGitRemote(originUrl: string): GitRemoteParsed | null {
  const httpsMatch = originUrl.match(
    /^(https?):\/\/(?:[^@/]+@)?([^/]+)\/([^/]+\/[^/\s]+?)(?:\.git)?$/i
  )
  if (httpsMatch) {
    const scheme = httpsMatch[1].toLowerCase() as 'http' | 'https'
    return { host: httpsMatch[2], slug: httpsMatch[3], scheme }
  }

  const sshMatch = originUrl.match(
    /^(?:ssh:\/\/)?(?:.+@)?([^:/]+)[:/]([^/]+\/[^/\s]+?)(?:\.git)?$/i
  )
  if (sshMatch) {
    return { host: sshMatch[1], slug: sshMatch[2], scheme: 'ssh' }
  }

  return null
}

/** Check whether a hostname belongs to GitHub (github.com or *.github.com). */
export function isGitHubHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === 'github.com' || normalized.endsWith('.github.com')
}
