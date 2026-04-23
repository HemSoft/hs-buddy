import type { PRReviewInfo } from '../components/pr-review/PRReviewInfo'

/**
 * Dispatch the `pr-review:open` custom event to launch an AI review panel.
 *
 * Centralises the event shape so callers don't duplicate the CustomEvent
 * construction (previously copy-pasted across 4+ call sites).
 */
export function dispatchPRReviewOpen(info: PRReviewInfo): void {
  window.dispatchEvent(new CustomEvent('pr-review:open', { detail: info }))
}

/**
 * Build the prompt text for a re-review request.
 *
 * When a `reviewedHeadSha` is available the prompt focuses on changes
 * introduced *after* that commit; otherwise it asks for a general
 * re-review of recent commits and unresolved conversations.
 */
export function buildReReviewPrompt(prUrl: string, reviewedHeadSha?: string | null): string {
  if (reviewedHeadSha) {
    return `Please re-review ${prUrl}. Focus only on changes introduced after commit ${reviewedHeadSha}. Prioritize unresolved or outdated review conversations and verify whether prior findings are addressed.`
  }
  return `Please do a targeted re-review on ${prUrl}. Focus on newly pushed commits and unresolved review conversations.`
}
