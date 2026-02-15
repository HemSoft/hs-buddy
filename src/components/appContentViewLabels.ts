import { parsePRDetailRoute } from '../utils/prDetailView'
import type { PRReviewInfo } from './PRReviewPanel'

export const viewLabels: Record<string, string> = {
  'pr-my-prs': 'My PRs',
  'pr-needs-review': 'Needs Review',
  'pr-recently-merged': 'Recently Merged',
  'pr-need-a-nudge': 'Needs a nudge',
  'skills-browser': 'Browse Skills',
  'skills-recent': 'Recently Used',
  'skills-favorites': 'Favorites',
  'tasks-today': 'Today',
  'tasks-upcoming': 'Upcoming',
  'tasks-projects': 'Projects',
  'insights-productivity': 'Productivity',
  'insights-activity': 'Activity',
  'settings-accounts': 'Accounts',
  'settings-appearance': 'Appearance',
  'settings-pullrequests': 'Pull Requests',
  'settings-copilot': 'Copilot SDK',
  'settings-advanced': 'Advanced',
  'automation-schedules': 'Schedules',
  'automation-runs': 'Runs',
  'copilot-prompt': 'Copilot Prompt',
  'copilot-all-results': 'Copilot Results',
  'copilot-usage': 'Premium Usage',
}

export function getViewLabel(viewId: string): string {
  if (viewId.startsWith('repo-detail:')) {
    const repoSlug = viewId.replace('repo-detail:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return repoName
  }
  if (viewId.startsWith('repo-issues:')) {
    const repoSlug = viewId.replace('repo-issues:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} Issues`
  }
  if (viewId.startsWith('copilot-result:')) {
    return 'Copilot Result'
  }
  if (viewId.startsWith('job-detail:')) {
    return 'Job Detail'
  }
  if (viewId.startsWith('schedule-detail:')) {
    return 'Schedule Detail'
  }
  if (viewId.startsWith('pr-review:')) {
    try {
      const info = JSON.parse(decodeURIComponent(viewId.replace('pr-review:', ''))) as PRReviewInfo
      return `Review: ${info.prTitle.length > 30 ? info.prTitle.slice(0, 30) + '…' : info.prTitle}`
    } catch {
      return 'PR Review'
    }
  }
  if (viewId.startsWith('pr-detail:')) {
    const route = parsePRDetailRoute(viewId)
    if (route) {
      const sectionLabelMap = {
        conversation: 'Conversation',
        commits: 'Commits',
        checks: 'Checks',
        'files-changed': 'Files',
      } as const
      const section = route.section ? ` · ${sectionLabelMap[route.section]}` : ''
      return `#${route.pr.id} ${route.pr.repository}${section}`
    }
    return 'PR Detail'
  }

  return viewLabels[viewId] || viewId
}
