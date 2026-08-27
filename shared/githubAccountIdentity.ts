const GITHUB_ACCOUNT_SLUG_PATTERN = /^(?=.{1,39}$)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

export function isValidGitHubAccountSlug(slug: string): boolean {
  return GITHUB_ACCOUNT_SLUG_PATTERN.test(slug)
}

/** Reject values that cannot be GitHub account, organization, or login slugs. */
export function assertValidGitHubAccountSlug(slug: string): void {
  if (!isValidGitHubAccountSlug(slug)) {
    throw new Error(`Invalid GitHub account slug: '${slug}'`)
  }
}
