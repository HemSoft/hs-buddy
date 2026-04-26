/**
 * Copilot prompt utilities — pure type guards and mappers extracted from
 * electron/services/copilotService.ts.
 */

export interface PRReviewMetadata {
  prUrl?: string
  prTitle?: string
  prNumber?: number
  repo?: string
  org?: string
  author?: string
  ghAccount?: string
  reviewedHeadSha?: string
  reviewedThreadStats?: {
    total: number
    unresolved: number
    outdated: number
  }
}

export interface CopilotPromptRequest {
  prompt: string
  category?: string
  metadata?: unknown
  model?: string
}

const PR_REVIEW_REQUIRED_STRINGS = ['org', 'repo', 'prUrl', 'prTitle'] as const

/**
 * Type guard: checks if a prompt request has complete PR review metadata.
 */
export function hasPRReviewMetadata(
  request: CopilotPromptRequest,
  metadata: PRReviewMetadata | undefined
): metadata is PRReviewMetadata &
  Required<Pick<PRReviewMetadata, 'org' | 'repo' | 'prNumber' | 'prUrl' | 'prTitle'>> {
  if (!metadata) return false
  if (request.category !== 'pr-review') return false
  if (typeof metadata.prNumber !== 'number') return false
  return PR_REVIEW_REQUIRED_STRINGS.every(k => !!metadata[k])
}

/**
 * Find the first GitHub account whose org matches one of the given org names.
 * Comparison is case-insensitive. Returns the matching username, or undefined.
 */
export function findAccountForOrgs(
  accounts: ReadonlyArray<{ org: string; username: string }>,
  orgs: ReadonlyArray<string>
): string | undefined {
  for (const org of orgs) {
    const lowerOrg = org.toLowerCase()
    const match = accounts.find(a => a.org.toLowerCase() === lowerOrg)
    if (match) return match.username
  }
  return undefined
}

/** Map raw model info from the SDK to a clean shape. */
export function mapModelInfo(m: {
  id: string
  name: string
  policy?: { state?: string }
  billing?: { multiplier?: number }
}): {
  id: string
  name: string
  isDisabled: boolean
  billingMultiplier: number
} {
  return {
    id: m.id,
    name: m.name,
    isDisabled: m.policy?.state === 'disabled',
    billingMultiplier: m.billing?.multiplier ?? 1,
  }
}
