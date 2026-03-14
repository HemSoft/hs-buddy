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
  'crew-projects': 'The Crew',
  'copilot-prompt': 'Copilot Prompt',
  'copilot-all-results': 'Copilot Results',
  'copilot-usage': 'Copilot Usage',
}

export function getViewLabel(viewId: string): string {
  if (viewId.startsWith('crew-project:')) {
    return 'Project Session'
  }
  if (viewId.startsWith('repo-detail:')) {
    const repoSlug = viewId.replace('repo-detail:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return repoName
  }
  if (viewId.startsWith('org-detail:')) {
    const org = viewId.replace('org-detail:', '')
    return `${org} Overview`
  }
  if (viewId.startsWith('org-user:')) {
    const orgUser = viewId.replace('org-user:', '')
    const slashIdx = orgUser.indexOf('/')
    if (slashIdx > 0) {
      const org = orgUser.substring(0, slashIdx)
      const user = orgUser.substring(slashIdx + 1)
      return `${org} · ${user}`
    }
    return orgUser
  }
  if (viewId.startsWith('repo-commits:')) {
    const repoSlug = viewId.replace('repo-commits:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} Commits`
  }
  if (viewId.startsWith('repo-commit:')) {
    const commitSlug = viewId.replace('repo-commit:', '')
    const lastSlashIdx = commitSlug.lastIndexOf('/')
    const repoSlug = lastSlashIdx > 0 ? commitSlug.substring(0, lastSlashIdx) : commitSlug
    const sha = lastSlashIdx > 0 ? commitSlug.substring(lastSlashIdx + 1) : ''
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} · ${sha.slice(0, 7)}`
  }
  if (viewId.startsWith('repo-issue:')) {
    const issueSlug = viewId.replace('repo-issue:', '')
    const lastSlashIdx = issueSlug.lastIndexOf('/')
    const repoSlug = lastSlashIdx > 0 ? issueSlug.substring(0, lastSlashIdx) : issueSlug
    const issueNumber = lastSlashIdx > 0 ? issueSlug.substring(lastSlashIdx + 1) : ''
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} · #${issueNumber}`
  }
  if (viewId.startsWith('repo-issues:')) {
    const repoSlug = viewId.replace('repo-issues:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} Issues`
  }
  if (viewId.startsWith('repo-issues-closed:')) {
    const repoSlug = viewId.replace('repo-issues-closed:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} Closed Issues`
  }
  if (viewId.startsWith('repo-prs:')) {
    const repoSlug = viewId.replace('repo-prs:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} PRs`
  }
  if (viewId.startsWith('repo-prs-closed:')) {
    const repoSlug = viewId.replace('repo-prs-closed:', '')
    const repoName = repoSlug.split('/').pop() || repoSlug
    return `${repoName} Closed PRs`
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
        'ai-reviews': 'AI Reviews',
      } as const
      const section = route.section ? ` · ${sectionLabelMap[route.section]}` : ''
      return `#${route.pr.id} ${route.pr.repository}${section}`
    }
    return 'PR Detail'
  }

  return viewLabels[viewId] || viewId
}
