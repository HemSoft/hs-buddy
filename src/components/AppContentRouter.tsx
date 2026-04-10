import { PullRequestList } from './PullRequestList'
import { ScheduleDetailPanel, ScheduleOverviewPanel, JobDetailPanel, RunList } from './automation'
import {
  SettingsAccounts,
  SettingsAppearance,
  SettingsPullRequests,
  SettingsCopilot,
  SettingsNotifications,
  SettingsAdvanced,
} from './settings'
import { WelcomePanel } from './WelcomePanel'
import { RepoDetailPanel } from './RepoDetailPanel'
import { RepoCommitListPanel } from './RepoCommitListPanel'
import { RepoCommitDetailPanel } from './RepoCommitDetailPanel'
import { RepoIssueList } from './RepoIssueList'
import { RepoIssueDetailPanel } from './RepoIssueDetailPanel'
import { RepoPullRequestList } from './RepoPullRequestList'
import { PullRequestDetailPanel } from './PullRequestDetailPanel'
import { CopilotPromptBox } from './CopilotPromptBox'
import { CopilotResultPanel } from './CopilotResultPanel'
import { CopilotResultsList } from './CopilotResultsList'
import { PRReviewPanel } from './PRReviewPanel'
import { parsePRReviewInfo } from './pr-review/PRReviewInfo'
import { CopilotUsagePanel } from './CopilotUsagePanel'
import { OrgDetailPanel } from './OrgDetailPanel'
import { UserDetailPanel } from './UserDetailPanel'
import { CrewProjectView } from './crew/CrewProjectView'
import { TempoDashboard } from './tempo/TempoDashboard'
import { SessionExplorer } from './sessions/SessionExplorer'
import { SessionDetail } from './sessions/SessionDetail'
import { TaskPlannerView } from './planner/TaskPlannerView'
import { BookmarkList } from './bookmarks/BookmarkList'
import { BrowserTabView } from './BrowserTabView'
import { PR_MODES } from '../constants'
import { parsePRDetailRoute } from '../utils/prDetailView'
import { viewLabels } from './appContentViewLabels'

function parseOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const slashIdx = slug.indexOf('/')
  if (slashIdx <= 0) return null
  return { owner: slug.substring(0, slashIdx), repo: slug.substring(slashIdx + 1) }
}

function parseRepoCommitRoute(slug: string): { owner: string; repo: string; sha: string } | null {
  const lastSlashIdx = slug.lastIndexOf('/')
  if (lastSlashIdx <= 0) return null
  const ownerRepo = parseOwnerRepo(slug.substring(0, lastSlashIdx))
  const sha = slug.substring(lastSlashIdx + 1)
  if (!ownerRepo || !sha) return null
  return { ...ownerRepo, sha }
}

function parseRepoIssueRoute(
  slug: string
): { owner: string; repo: string; issueNumber: number } | null {
  const lastSlashIdx = slug.lastIndexOf('/')
  if (lastSlashIdx <= 0) return null
  const ownerRepo = parseOwnerRepo(slug.substring(0, lastSlashIdx))
  const issueNumber = Number(slug.substring(lastSlashIdx + 1))
  if (!ownerRepo || !Number.isFinite(issueNumber)) return null
  return { ...ownerRepo, issueNumber }
}

function matchRoute<T>(
  viewId: string,
  prefix: string,
  parse: (slug: string) => T | null
): T | null {
  if (!viewId.startsWith(`${prefix}:`)) return null
  return parse(viewId.slice(prefix.length + 1))
}

type AppContentRouterProps = {
  activeViewId: string | null
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
  onOpenTab: (viewId: string) => void
  onCloseView: (viewId: string) => void
  onPRCountChange: (viewId: string, count: number) => void
}

export function AppContentRouter({
  activeViewId,
  prCounts,
  onNavigate,
  onSectionChange,
  onOpenTab,
  onCloseView,
  onPRCountChange,
}: AppContentRouterProps) {
  if (!activeViewId) {
    return (
      <WelcomePanel prCounts={prCounts} onNavigate={onNavigate} onSectionChange={onSectionChange} />
    )
  }

  switch (activeViewId) {
    case 'pr-my-prs':
    case 'pr-needs-review':
    case 'pr-recently-merged':
    case 'pr-need-a-nudge': {
      const mode = activeViewId.slice(3) as (typeof PR_MODES)[number]
      return (
        <PullRequestList
          mode={mode}
          onCountChange={count => onPRCountChange(activeViewId, count)}
          onOpenPR={onOpenTab}
        />
      )
    }
    case 'settings-accounts':
      return <SettingsAccounts />
    case 'settings-appearance':
      return <SettingsAppearance />
    case 'settings-pullrequests':
      return <SettingsPullRequests />
    case 'settings-copilot':
      return <SettingsCopilot />
    case 'settings-notifications':
      return <SettingsNotifications />
    case 'settings-advanced':
      return <SettingsAdvanced />
    case 'automation-schedules':
      return <ScheduleOverviewPanel onOpenSchedule={sId => onOpenTab(`schedule-detail:${sId}`)} />
    case 'automation-runs':
      return <RunList />
    case 'copilot-prompt':
      return <CopilotPromptBox onOpenResult={resultId => onOpenTab(`copilot-result:${resultId}`)} />
    case 'copilot-all-results':
      return (
        <CopilotResultsList onOpenResult={resultId => onOpenTab(`copilot-result:${resultId}`)} />
      )
    case 'copilot-usage':
      return <CopilotUsagePanel />
    case 'copilot-sessions':
      return (
        <SessionExplorer
          onSelectSession={filePath => onOpenTab(`copilot-session-detail:${btoa(filePath)}`)}
        />
      )
    case 'tasks-today':
      return <TaskPlannerView mode="today" />
    case 'tasks-upcoming':
      return <TaskPlannerView mode="upcoming" />
    case 'tasks-projects':
      return <TaskPlannerView />
    case 'tempo-timesheet':
      return <TempoDashboard />
    case 'bookmarks-all':
      return <BookmarkList key="bookmarks-all" onOpenTab={onOpenTab} />
    default:
      if (activeViewId.startsWith('bookmarks-category:')) {
        const category = activeViewId.replace('bookmarks-category:', '')
        return (
          <BookmarkList
            key={`bookmarks-category:${category}`}
            filterCategory={category}
            onOpenTab={onOpenTab}
          />
        )
      }
      if (activeViewId.startsWith('browser:')) {
        const encoded = activeViewId.slice('browser:'.length)
        const url = decodeURIComponent(encoded)
        return <BrowserTabView key={activeViewId} url={url} />
      }
      if (activeViewId.startsWith('crew-project:')) {
        const projectId = activeViewId.replace('crew-project:', '')
        return <CrewProjectView projectId={projectId} />
      }
      if (activeViewId.startsWith('copilot-session-detail:')) {
        const filePath = atob(activeViewId.replace('copilot-session-detail:', ''))
        return <SessionDetail filePath={filePath} onBack={() => onNavigate('copilot-sessions')} />
      }
      if (activeViewId.startsWith('schedule-detail:')) {
        const scheduleId = activeViewId.replace('schedule-detail:', '')
        return <ScheduleDetailPanel scheduleId={scheduleId} />
      }
      if (activeViewId.startsWith('job-detail:')) {
        const jobId = activeViewId.replace('job-detail:', '')
        return <JobDetailPanel jobId={jobId} />
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-detail', parseOwnerRepo)
        if (parsed) return <RepoDetailPanel owner={parsed.owner} repo={parsed.repo} />
      }
      {
        const parsed = matchRoute(activeViewId, 'org-user', parseOwnerRepo)
        if (parsed) {
          return <UserDetailPanel org={parsed.owner} memberLogin={parsed.repo} />
        }
      }
      if (activeViewId.startsWith('org-detail:')) {
        const org = activeViewId.replace('org-detail:', '')
        if (org) return <OrgDetailPanel org={org} />
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-commits', parseOwnerRepo)
        if (parsed) {
          return (
            <RepoCommitListPanel
              owner={parsed.owner}
              repo={parsed.repo}
              onOpenCommit={commitSha =>
                onOpenTab(`repo-commit:${parsed.owner}/${parsed.repo}/${commitSha}`)
              }
            />
          )
        }
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-commit', parseRepoCommitRoute)
        if (parsed)
          return <RepoCommitDetailPanel owner={parsed.owner} repo={parsed.repo} sha={parsed.sha} />
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-issues-closed', parseOwnerRepo)
        if (parsed) {
          return (
            <RepoIssueList
              owner={parsed.owner}
              repo={parsed.repo}
              issueState="closed"
              onOpenIssue={issueNumber =>
                onOpenTab(`repo-issue:${parsed.owner}/${parsed.repo}/${issueNumber}`)
              }
            />
          )
        }
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-issue', parseRepoIssueRoute)
        if (parsed)
          return (
            <RepoIssueDetailPanel
              owner={parsed.owner}
              repo={parsed.repo}
              issueNumber={parsed.issueNumber}
            />
          )
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-issues', parseOwnerRepo)
        if (parsed) {
          return (
            <RepoIssueList
              owner={parsed.owner}
              repo={parsed.repo}
              issueState="open"
              onOpenIssue={issueNumber =>
                onOpenTab(`repo-issue:${parsed.owner}/${parsed.repo}/${issueNumber}`)
              }
            />
          )
        }
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-prs-closed', parseOwnerRepo)
        if (parsed)
          return (
            <RepoPullRequestList
              owner={parsed.owner}
              repo={parsed.repo}
              prState="closed"
              onOpenPR={onOpenTab}
            />
          )
      }
      {
        const parsed = matchRoute(activeViewId, 'repo-prs', parseOwnerRepo)
        if (parsed)
          return (
            <RepoPullRequestList
              owner={parsed.owner}
              repo={parsed.repo}
              prState="open"
              onOpenPR={onOpenTab}
            />
          )
      }
      if (activeViewId.startsWith('copilot-result:')) {
        const resultId = activeViewId.replace('copilot-result:', '')
        return <CopilotResultPanel resultId={resultId} />
      }
      if (activeViewId.startsWith('pr-review:')) {
        const prInfo = parsePRReviewInfo(activeViewId)
        if (prInfo) {
          return (
            <PRReviewPanel
              prInfo={prInfo}
              onSubmitted={resultId => onOpenTab(`copilot-result:${resultId}`)}
              onClose={() => onCloseView(activeViewId)}
            />
          )
        }

        return (
          <div className="content-placeholder">
            <p>Invalid PR review data</p>
          </div>
        )
      }
      if (activeViewId.startsWith('pr-detail:')) {
        const route = parsePRDetailRoute(activeViewId)
        if (route) {
          return <PullRequestDetailPanel pr={route.pr} section={route.section} />
        }
        return (
          <div className="content-placeholder">
            <p>Invalid PR detail data</p>
          </div>
        )
      }
      return (
        <div className="content-placeholder">
          <div className="content-header">
            <h2>{viewLabels[activeViewId] || 'Content'}</h2>
          </div>
          <div className="content-body">
            <p>This feature is coming soon!</p>
          </div>
        </div>
      )
  }
}
