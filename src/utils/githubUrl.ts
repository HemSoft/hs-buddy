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
