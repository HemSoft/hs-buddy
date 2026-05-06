import type { GitHubClient } from '../api/github'
import type { AIReviewProvider, PollResult, ProviderCapabilities, ReviewCheckpoint } from './types'

interface CopilotCheckpoint {
  maxReviewId: number
}

/**
 * Copilot review provider.
 * Triggers via `pulls.requestReviewers`, monitors via `pulls.listReviews`.
 */
export const copilotProvider: AIReviewProvider = {
  id: 'copilot',
  name: 'Copilot',
  botLogin: 'copilot-pull-request-reviewer[bot]',
  iconName: 'Sparkles',
  capabilities: { canTrigger: true, canMonitor: true } satisfies ProviderCapabilities,

  async detect(): Promise<boolean> {
    // Copilot is always available on GitHub repos
    return true
  },

  async trigger(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<void> {
    await client.requestCopilotReview(owner, repo, prNumber)
  },

  async getCheckpoint(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewCheckpoint> {
    const reviews = await client.listPRReviews(owner, repo, prNumber)
    const maxReviewId = reviews
      .filter(r => r.user?.login === 'copilot-pull-request-reviewer[bot]')
      .reduce((max, r) => Math.max(max, r.id), 0)
    return { maxReviewId } satisfies CopilotCheckpoint
  },

  async poll(
    client: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    checkpoint: ReviewCheckpoint
  ): Promise<PollResult> {
    const { maxReviewId } = checkpoint as CopilotCheckpoint
    const reviews = await client.listPRReviews(owner, repo, prNumber)
    const fresh = reviews.find(
      r => r.user?.login === 'copilot-pull-request-reviewer[bot]' && r.id > maxReviewId
    )
    return { status: fresh ? 'completed' : 'pending' }
  },
}
