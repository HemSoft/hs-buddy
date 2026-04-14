import { useMemo } from 'react'
import type { AssistantContext } from '../types/assistant'

interface ViewDefinition {
  prefix: string
  viewType: string
  summary: (parts: string[]) => string
  metadata: (parts: string[]) => Record<string, string>
}

const VIEW_DEFINITIONS: ViewDefinition[] = [
  {
    prefix: 'pr-detail:',
    viewType: 'pr-detail',
    summary: ([owner = '', repo = '', prNumber = '']) =>
      `Pull Request #${prNumber} in ${owner}/${repo}`,
    metadata: ([owner = '', repo = '', prNumber = '']) => ({ owner, repo, prNumber }),
  },
  {
    prefix: 'repo-detail:',
    viewType: 'repo-detail',
    summary: ([owner = '', repo = '']) => `Repository ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo }),
  },
  {
    prefix: 'repo-commits:',
    viewType: 'repo-commits',
    summary: ([owner = '', repo = '']) => `Commits for ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo }),
  },
  {
    prefix: 'repo-commit:',
    viewType: 'repo-commit',
    summary: ([owner = '', repo = '', sha = '']) => `Commit ${sha.slice(0, 7)} in ${owner}/${repo}`,
    metadata: ([owner = '', repo = '', sha = '']) => ({ owner, repo, sha }),
  },
  {
    prefix: 'repo-issue:',
    viewType: 'repo-issue',
    summary: ([owner = '', repo = '', issueNumber = '']) =>
      `Issue #${issueNumber} in ${owner}/${repo}`,
    metadata: ([owner = '', repo = '', issueNumber = '']) => ({ owner, repo, issueNumber }),
  },
  {
    prefix: 'repo-issues-closed:',
    viewType: 'repo-issues',
    summary: ([owner = '', repo = '']) => `Closed issues for ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo, issueState: 'closed' }),
  },
  {
    prefix: 'repo-issues:',
    viewType: 'repo-issues',
    summary: ([owner = '', repo = '']) => `Open issues for ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo, issueState: 'open' }),
  },
  {
    prefix: 'repo-prs-closed:',
    viewType: 'repo-prs',
    summary: ([owner = '', repo = '']) => `Closed pull requests for ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo, prState: 'closed' }),
  },
  {
    prefix: 'repo-prs:',
    viewType: 'repo-prs',
    summary: ([owner = '', repo = '']) => `Open pull requests for ${owner}/${repo}`,
    metadata: ([owner = '', repo = '']) => ({ owner, repo, prState: 'open' }),
  },
  {
    prefix: 'copilot-result:',
    viewType: 'copilot-result',
    summary: () => 'Viewing a Copilot result',
    metadata: () => ({}),
  },
]

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
        summary: 'No tab is open.',
        metadata: {},
      }
    }

    if (activeViewId === 'dashboard') {
      return {
        viewType: 'welcome',
        viewId: 'dashboard',
        summary: 'The user is on the Dashboard screen.',
        metadata: {},
      }
    }

    for (const view of VIEW_DEFINITIONS) {
      if (activeViewId.startsWith(view.prefix)) {
        const parts = activeViewId.slice(view.prefix.length).split('/')
        return {
          viewType: view.viewType,
          viewId: activeViewId,
          summary: view.summary(parts),
          metadata: view.metadata(parts),
        }
      }
    }

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
