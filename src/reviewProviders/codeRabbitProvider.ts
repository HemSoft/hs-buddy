import type { GitHubClient } from '../api/github'
import type { AIReviewProvider, PollResult, ProviderCapabilities, ReviewCheckpoint } from './types'

interface CodeRabbitCheckpoint {
  /** Max comment ID from coderabbitai[bot] before trigger. */
  maxCommentId: number
  /** Timestamp of when we triggered, for fallback comparison. */
  triggeredAt: string
}

/** Detection cache: repo key → boolean. Survives for the session. */
const detectionCache = new Map<string, boolean>()

/**
 * Determine if a CodeRabbit comment represents a completed review (not just a progress update).
 * CodeRabbit posts a summary comment containing "## Walkthrough" when it finishes.
 */
function isCompletedReviewComment(body: string): boolean {
  return body.includes('## Walkthrough') || body.includes('## Summary by CodeRabbit')
}

/**
 * CodeRabbit review provider.
 * Triggers via a PR comment (`@coderabbitai full review`).
 * Monitors for a completed review comment from `coderabbitai[bot]`.
 */
export const codeRabbitProvider: AIReviewProvider = {
  id: 'coderabbit',
  name: 'CodeRabbit',
  botLogin: 'coderabbitai[bot]',
  iconName: 'Rabbit',
  capabilities: { canTrigger: true, canMonitor: true } satisfies ProviderCapabilities,

  async detect(client: GitHubClient, owner: string, repo: string): Promise<boolean> {
    const key = `${owner}/${repo}`
    const cached = detectionCache.get(key)
    if (cached !== undefined) return cached

    // Check for .coderabbit.yaml in the repo root
    const exists = await client.checkFileExists(owner, repo, '.coderabbit.yaml')
    detectionCache.set(key, exists)
    return exists
  },

  async trigger(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<void> {
    await client.addPRComment(owner, repo, prNumber, '@coderabbitai full review')
  },

  async getCheckpoint(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewCheckpoint> {
    const comments = await client.listPRIssueComments(owner, repo, prNumber)
    const botComments = comments.filter(c => c.user?.login === 'coderabbitai[bot]')
    const maxCommentId = botComments.reduce((max, c) => Math.max(max, c.id), 0)
    return { maxCommentId, triggeredAt: new Date().toISOString() } satisfies CodeRabbitCheckpoint
  },

  async poll(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    checkpoint: ReviewCheckpoint
  ): Promise<PollResult> {
    const { maxCommentId } = checkpoint as CodeRabbitCheckpoint
    const comments = await client.listPRIssueComments(owner, repo, prNumber)
    const newBotComments = comments.filter(
      c => c.user?.login === 'coderabbitai[bot]' && c.id > maxCommentId
    )

    // Look for a completed review comment (contains the walkthrough/summary)
    const completed = newBotComments.some(c => isCompletedReviewComment(c.body))
    return { status: completed ? 'completed' : 'pending' }
  },
}

/** Clear the detection cache (useful for testing or manual refresh). */
export function clearCodeRabbitDetectionCache(): void {
  detectionCache.clear()
}
