import { parsePRDetailRoute } from '../utils/prDetailView'
import { parsePRReviewInfo } from './pr-review/PRReviewInfo'

export const viewLabels: Record<string, string> = {
  dashboard: 'Dashboard',
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
  'settings-notifications': 'Notifications',
  'settings-advanced': 'Advanced',
  'automation-schedules': 'Schedules',
  'automation-runs': 'Runs',
  'crew-projects': 'The Crew',
  'copilot-prompt': 'Copilot Prompt',
  'copilot-all-results': 'Copilot Results',
  'copilot-usage': 'Copilot Usage',
  'copilot-sessions': 'Session Explorer',
  'bookmarks-all': 'All Bookmarks',
  'tempo-timesheet': 'Timesheet',
}

function parseRepoViewId(viewId: string, prefix: string): { repoName: string; suffix: string } {
  const slug = viewId.slice(prefix.length + 1)
  const segments = slug.split('/')
  return {
    repoName: segments.length >= 2 ? segments[1] : segments[0],
    suffix: segments.length > 2 ? segments.slice(2).join('/') : '',
  }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function getViewLabel(viewId: string): string {
  if (viewId.startsWith('terminal:')) {
    const encoded = viewId.slice('terminal:'.length)
    const decoded = safeDecodeURIComponent(encoded)

    if (decoded === null) {
      return 'Terminal'
    }

    try {
      const parsed = JSON.parse(decoded)
      const folder = (parsed.cwd || '').split(/[\\/]/).pop()
      return folder ? `Terminal: ${folder}` : 'Terminal'
    } catch {
      const folder = decoded.split(/[\\/]/).pop()
      return folder ? `Terminal: ${folder}` : 'Terminal'
    }
  }
  if (viewId.startsWith('browser:')) {
    try {
      const url = decodeURIComponent(viewId.slice('browser:'.length))
      return new URL(url).hostname
    } catch {
      return 'Browser'
    }
  }
  if (viewId.startsWith('bookmarks-category:')) {
    const category = viewId.replace('bookmarks-category:', '')
    return category
  }
  if (viewId.startsWith('crew-project:')) {
    return 'Project Session'
  }
  if (viewId.startsWith('repo-detail:')) {
    return parseRepoViewId(viewId, 'repo-detail').repoName
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
    return `${parseRepoViewId(viewId, 'repo-commits').repoName} Commits`
  }
  if (viewId.startsWith('repo-commit:')) {
    const { repoName, suffix: sha } = parseRepoViewId(viewId, 'repo-commit')
    return `${repoName} · ${sha.slice(0, 7)}`
  }
  if (viewId.startsWith('repo-issue:')) {
    const { repoName, suffix: issueNumber } = parseRepoViewId(viewId, 'repo-issue')
    return `${repoName} · #${issueNumber}`
  }
  if (viewId.startsWith('repo-issues:')) {
    return `${parseRepoViewId(viewId, 'repo-issues').repoName} Issues`
  }
  if (viewId.startsWith('repo-issues-closed:')) {
    return `${parseRepoViewId(viewId, 'repo-issues-closed').repoName} Closed Issues`
  }
  if (viewId.startsWith('repo-prs:')) {
    return `${parseRepoViewId(viewId, 'repo-prs').repoName} PRs`
  }
  if (viewId.startsWith('repo-prs-closed:')) {
    return `${parseRepoViewId(viewId, 'repo-prs-closed').repoName} Closed PRs`
  }
  if (viewId.startsWith('copilot-session-detail:')) {
    return 'Session Detail'
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
    const info = parsePRReviewInfo(viewId)
    if (info) {
      return `Review: ${info.prTitle.length > 30 ? info.prTitle.slice(0, 30) + '…' : info.prTitle}`
    }

    return 'PR Review'
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
