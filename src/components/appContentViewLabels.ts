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

function getBrowserLabel(viewId: string): string {
  try {
    return new URL(decodeURIComponent(viewId.slice('browser:'.length))).hostname
  } catch {
    return 'Browser'
  }
}

function getFolderLabel(viewId: string): string {
  const folderPath = decodeURIComponent(viewId.slice('folder-view:'.length))
  const name = folderPath.replace(/\//g, '\\').split('\\').pop() || 'Explorer'
  return `📂 ${name}`
}

function getOrgUserLabel(viewId: string): string {
  const orgUser = viewId.replace('org-user:', '')
  const slashIdx = orgUser.indexOf('/')
  if (slashIdx <= 0) return orgUser
  return `${orgUser.substring(0, slashIdx)} · ${orgUser.substring(slashIdx + 1)}`
}

function getPRReviewLabel(viewId: string): string {
  const info = parsePRReviewInfo(viewId)
  if (!info) return 'PR Review'
  return `Review: ${info.prTitle.length > 30 ? info.prTitle.slice(0, 30) + '…' : info.prTitle}`
}

const PR_DETAIL_SECTION_LABELS = {
  conversation: 'Conversation',
  commits: 'Commits',
  checks: 'Checks',
  'files-changed': 'Files',
  'ai-reviews': 'AI Reviews',
} as const

function getPRDetailLabel(viewId: string): string {
  const route = parsePRDetailRoute(viewId)
  if (!route) return 'PR Detail'
  const section = route.section ? ` · ${PR_DETAIL_SECTION_LABELS[route.section]}` : ''
  return `#${route.pr.id} ${route.pr.repository}${section}`
}

type PrefixLabelEntry = { prefix: string; label: (viewId: string) => string }

const prefixLabelRegistry: PrefixLabelEntry[] = [
  { prefix: 'browser:', label: getBrowserLabel },
  { prefix: 'folder-view:', label: getFolderLabel },
  { prefix: 'bookmarks-category:', label: id => id.replace('bookmarks-category:', '') },
  { prefix: 'crew-project:', label: () => 'Project Session' },
  { prefix: 'repo-detail:', label: id => parseRepoViewId(id, 'repo-detail').repoName },
  { prefix: 'org-detail:', label: id => `${id.replace('org-detail:', '')} Overview` },
  { prefix: 'org-user:', label: getOrgUserLabel },
  {
    prefix: 'repo-commits:',
    label: id => `${parseRepoViewId(id, 'repo-commits').repoName} Commits`,
  },
  {
    prefix: 'repo-commit:',
    label: id => {
      const { repoName, suffix: sha } = parseRepoViewId(id, 'repo-commit')
      return `${repoName} · ${sha.slice(0, 7)}`
    },
  },
  {
    prefix: 'repo-issue:',
    label: id => {
      const { repoName, suffix: num } = parseRepoViewId(id, 'repo-issue')
      return `${repoName} · #${num}`
    },
  },
  {
    prefix: 'repo-issues-closed:',
    label: id => `${parseRepoViewId(id, 'repo-issues-closed').repoName} Closed Issues`,
  },
  { prefix: 'repo-issues:', label: id => `${parseRepoViewId(id, 'repo-issues').repoName} Issues` },
  {
    prefix: 'repo-prs-closed:',
    label: id => `${parseRepoViewId(id, 'repo-prs-closed').repoName} Closed PRs`,
  },
  { prefix: 'repo-prs:', label: id => `${parseRepoViewId(id, 'repo-prs').repoName} PRs` },
  { prefix: 'copilot-session-detail:', label: () => 'Session Detail' },
  { prefix: 'copilot-result:', label: () => 'Copilot Result' },
  { prefix: 'job-detail:', label: () => 'Job Detail' },
  { prefix: 'schedule-detail:', label: () => 'Schedule Detail' },
  { prefix: 'pr-review:', label: getPRReviewLabel },
  { prefix: 'pr-detail:', label: getPRDetailLabel },
]

export function getViewLabel(viewId: string): string {
  const entry = prefixLabelRegistry.find(e => viewId.startsWith(e.prefix))
  if (entry) return entry.label(viewId)
  return viewLabels[viewId] || viewId
}
