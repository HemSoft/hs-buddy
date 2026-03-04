import { useMemo } from 'react'
import type { AssistantContext } from '../types/assistant'

/**
 * Derives the current assistant context from the active view and app state.
 * Serializes context into a system prompt preamble for the Copilot SDK.
 */
export function useAssistantContext(activeViewId: string | null): AssistantContext {
  return useMemo(() => {
    if (!activeViewId) {
      return {
        viewType: 'welcome',
        viewId: null,
        summary: 'The user is on the Welcome screen.',
        metadata: {},
      }
    }

    // PR detail view: pr-detail:owner/repo/number
    if (activeViewId.startsWith('pr-detail:')) {
      const parts = activeViewId.replace('pr-detail:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      const prNumber = parts[2] || ''
      return {
        viewType: 'pr-detail',
        viewId: activeViewId,
        summary: `Pull Request #${prNumber} in ${owner}/${repo}`,
        metadata: { owner, repo, prNumber },
      }
    }

    // Repo detail view: repo-detail:owner/repo
    if (activeViewId.startsWith('repo-detail:')) {
      const parts = activeViewId.replace('repo-detail:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-detail',
        viewId: activeViewId,
        summary: `Repository ${owner}/${repo}`,
        metadata: { owner, repo },
      }
    }

    // Repo issues view: repo-issues:owner/repo
    if (activeViewId.startsWith('repo-issues:')) {
      const parts = activeViewId.replace('repo-issues:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-issues',
        viewId: activeViewId,
        summary: `Issues for ${owner}/${repo}`,
        metadata: { owner, repo },
      }
    }

    // PR list views
    if (activeViewId.startsWith('pr-')) {
      const viewMap: Record<string, string> = {
        'pr-my-prs': 'My Pull Requests',
        'pr-needs-review': 'PRs Needing Review',
        'pr-recently-merged': 'Recently Merged PRs',
      }
      return {
        viewType: 'pr-list',
        viewId: activeViewId,
        summary: viewMap[activeViewId] || 'Pull Requests',
        metadata: {},
      }
    }

    // Copilot result view
    if (activeViewId.startsWith('copilot-result:')) {
      return {
        viewType: 'copilot-result',
        viewId: activeViewId,
        summary: 'Viewing a Copilot result',
        metadata: {},
      }
    }

    return {
      viewType: 'other',
      viewId: activeViewId,
      summary: `Viewing: ${activeViewId}`,
      metadata: {},
    }
  }, [activeViewId])
}

/**
 * Serialize an AssistantContext into a system prompt preamble for the Copilot SDK.
 */
export function serializeContext(ctx: AssistantContext): string {
  const lines = [
    'You are Buddy Assistant, an expert AI helper embedded in HemSoft Buddy.',
    `The user is currently viewing: ${ctx.summary}`,
  ]

  if (ctx.metadata.owner && ctx.metadata.repo) {
    lines.push(`Repository: ${ctx.metadata.owner}/${ctx.metadata.repo}`)
  }

  lines.push('')
  lines.push('Answer questions about what\'s on screen, the app itself, or anything else.')

  return lines.join('\n')
}
