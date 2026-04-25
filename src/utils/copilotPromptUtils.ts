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

/**
 * Type guard: checks if a prompt request has complete PR review metadata.
 */
export function hasPRReviewMetadata(
  request: CopilotPromptRequest,
  metadata: PRReviewMetadata | undefined
): metadata is PRReviewMetadata &
  Required<Pick<PRReviewMetadata, 'org' | 'repo' | 'prNumber' | 'prUrl' | 'prTitle'>> {
  if (!metadata) return false
  return (
    request.category === 'pr-review' &&
    !!metadata.org &&
    !!metadata.repo &&
    typeof metadata.prNumber === 'number' &&
    !!metadata.prUrl &&
    !!metadata.prTitle
  )
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
