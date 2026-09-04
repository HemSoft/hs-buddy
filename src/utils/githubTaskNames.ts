const TASK_PREFIXES = ['prefetch-', 'autorefresh-', 'fetch-'] as const

/** Keep PR-list cache readers and mutations ordered while other GitHub work proceeds. */
export const GITHUB_PR_SERIALIZATION_KEY = 'pull-request-list'

const PR_TASK_LABELS: Readonly<Record<string, string>> = {
  'my-prs': 'My PRs',
  'needs-review': 'Needs Review',
  'recently-merged': 'Recently Merged',
  'need-a-nudge': 'Needs a nudge',
}

const PREFIX_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['org-repos:', 'Repositories'],
  ['org-detail-overview-', 'Org Overview'],
  ['org-detail-members-', 'Org Members'],
  ['org-detail-copilot-', 'Org Copilot'],
  ['refresh-org-', 'Organizations'],
]

export function getOrgOverviewTaskName(org: string): string {
  return `org-detail-overview-${org}`
}

export function getOrgMembersTaskName(org: string): string {
  return `org-detail-members-${org}`
}

/** Keep repository-list cache writers ordered per organization. */
export function getOrgReposSerializationKey(org: string): string {
  return `organization-repositories:${org}`
}

/** Keep repository-count cache writers ordered per repository. */
export function getRepoCountsSerializationKey(owner: string, repo: string): string {
  return `repository-counts:${owner}/${repo}`
}

/** Keep repository-issue cache writers ordered per repository and issue state. */
export function getRepoIssuesSerializationKey(
  owner: string,
  repo: string,
  state: 'open' | 'closed'
): string {
  return `repository-issues:${state}:${owner}/${repo}`
}

/** Keep repository-commit cache writers ordered per repository. */
export function getRepoCommitsSerializationKey(owner: string, repo: string): string {
  return `repository-commits:${owner}/${repo}`
}

/**
 * Removes queue-only prefixes and account-scope payloads from GitHub task names.
 * The returned key is suitable for matching UI data sources, not for display.
 */
export function getGitHubTaskDataSourceKey(taskName: string): string {
  const prefix = TASK_PREFIXES.find(candidate => taskName.startsWith(candidate))
  const key = prefix ? taskName.slice(prefix.length) : taskName
  return key.replace(/^(my-prs|needs-review|recently-merged|need-a-nudge):.*$/, '$1')
}

/** Returns a human-readable label without ever exposing an unknown task identifier. */
export function getFriendlyGitHubTaskLabel(taskName: string | null): string | null {
  if (!taskName) return null

  const key = getGitHubTaskDataSourceKey(taskName)
  const prLabel = PR_TASK_LABELS[key]
  if (prLabel) return prLabel

  return PREFIX_LABELS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'GitHub data'
}
