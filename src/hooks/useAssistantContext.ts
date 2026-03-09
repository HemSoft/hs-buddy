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

    if (activeViewId.startsWith('repo-commits:')) {
      const parts = activeViewId.replace('repo-commits:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-commits',
        viewId: activeViewId,
        summary: `Commits for ${owner}/${repo}`,
        metadata: { owner, repo },
      }
    }

    if (activeViewId.startsWith('repo-commit:')) {
      const parts = activeViewId.replace('repo-commit:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      const sha = parts[2] || ''
      return {
        viewType: 'repo-commit',
        viewId: activeViewId,
        summary: `Commit ${sha.slice(0, 7)} in ${owner}/${repo}`,
        metadata: { owner, repo, sha },
      }
    }

    if (activeViewId.startsWith('repo-issue:')) {
      const parts = activeViewId.replace('repo-issue:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      const issueNumber = parts[2] || ''
      return {
        viewType: 'repo-issue',
        viewId: activeViewId,
        summary: `Issue #${issueNumber} in ${owner}/${repo}`,
        metadata: { owner, repo, issueNumber },
      }
    }

    if (activeViewId.startsWith('repo-issues-closed:')) {
      const parts = activeViewId.replace('repo-issues-closed:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-issues',
        viewId: activeViewId,
        summary: `Closed issues for ${owner}/${repo}`,
        metadata: { owner, repo, issueState: 'closed' },
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
        summary: `Open issues for ${owner}/${repo}`,
        metadata: { owner, repo, issueState: 'open' },
      }
    }

    if (activeViewId.startsWith('repo-prs-closed:')) {
      const parts = activeViewId.replace('repo-prs-closed:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-prs',
        viewId: activeViewId,
        summary: `Closed pull requests for ${owner}/${repo}`,
        metadata: { owner, repo, prState: 'closed' },
      }
    }

    if (activeViewId.startsWith('repo-prs:')) {
      const parts = activeViewId.replace('repo-prs:', '').split('/')
      const owner = parts[0] || ''
      const repo = parts[1] || ''
      return {
        viewType: 'repo-prs',
        viewId: activeViewId,
        summary: `Open pull requests for ${owner}/${repo}`,
        metadata: { owner, repo, prState: 'open' },
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
  lines.push("Answer questions about what's on screen, the app itself, or anything else.")

  return lines.join('\n')
}
