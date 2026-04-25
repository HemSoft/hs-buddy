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
import { FolderExplorerView } from './explorer/FolderExplorerView'
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

type AppContentRouterProps = {
  activeViewId: string | null
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
  onOpenTab: (viewId: string) => void
  onCloseView: (viewId: string) => void
  onPRCountChange: (viewId: string, count: number) => void
}

type ExactRouteContext = {
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
  onOpenTab: (viewId: string) => void
  onPRCountChange: (viewId: string, count: number) => void
}

function renderSettingsRoute(activeViewId: string): React.JSX.Element | null {
  switch (activeViewId) {
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
    default:
      return null
  }
}

function renderCopilotRoute(
  activeViewId: string,
  ctx: ExactRouteContext
): React.JSX.Element | null {
  switch (activeViewId) {
    case 'copilot-prompt':
      return <CopilotPromptBox onOpenResult={id => ctx.onOpenTab(`copilot-result:${id}`)} />
    case 'copilot-all-results':
      return <CopilotResultsList onOpenResult={id => ctx.onOpenTab(`copilot-result:${id}`)} />
    case 'copilot-usage':
      return <CopilotUsagePanel />
    case 'copilot-sessions':
      return (
        <SessionExplorer
          onSelectSession={fp => ctx.onOpenTab(`copilot-session-detail:${btoa(fp)}`)}
        />
      )
    case 'automation-schedules':
      return (
        <ScheduleOverviewPanel onOpenSchedule={sId => ctx.onOpenTab(`schedule-detail:${sId}`)} />
      )
    case 'automation-runs':
      return <RunList />
    default:
      return null
  }
}

function renderWorkspaceRoute(
  activeViewId: string,
  ctx: ExactRouteContext
): React.JSX.Element | null {
  switch (activeViewId) {
    case 'tasks-today':
      return <TaskPlannerView mode="today" />
    case 'tasks-upcoming':
      return <TaskPlannerView mode="upcoming" />
    case 'tasks-projects':
      return <TaskPlannerView />
    case 'tempo-timesheet':
      return <TempoDashboard />
    case 'bookmarks-all':
      return <BookmarkList key="bookmarks-all" onOpenTab={ctx.onOpenTab} />
    default:
      return null
  }
}

function renderExactRoute(
  activeViewId: string,
  prCounts: Record<string, number>,
  onNavigate: (viewId: string) => void,
  onSectionChange: (sectionId: string) => void,
  onOpenTab: (viewId: string) => void,
  onPRCountChange: (viewId: string, count: number) => void
): React.JSX.Element | null {
  if (activeViewId === 'dashboard') {
    return (
      <WelcomePanel prCounts={prCounts} onNavigate={onNavigate} onSectionChange={onSectionChange} />
    )
  }
  if (activeViewId.startsWith('pr-')) {
    const mode = activeViewId.slice(3) as (typeof PR_MODES)[number]
    if (PR_MODES.includes(mode)) {
      return (
        <PullRequestList
          mode={mode}
          onCountChange={count => onPRCountChange(activeViewId, count)}
          onOpenPR={onOpenTab}
        />
      )
    }
  }
  const ctx: ExactRouteContext = {
    prCounts,
    onNavigate,
    onSectionChange,
    onOpenTab,
    onPRCountChange,
  }
  return (
    renderSettingsRoute(activeViewId) ??
    renderCopilotRoute(activeViewId, ctx) ??
    renderWorkspaceRoute(activeViewId, ctx)
  )
}

type PrefixRouteEntry = {
  prefix: string
  render: (slug: string, ctx: PrefixRouteContext) => React.JSX.Element | null
}

type PrefixRouteContext = {
  activeViewId: string
  onNavigate: (viewId: string) => void
  onOpenTab: (viewId: string) => void
  onCloseView: (viewId: string) => void
}

function renderFolderView(slug: string): React.JSX.Element {
  const folderPath = decodeURIComponent(slug)
  return <FolderExplorerView key={`folder-view:${slug}`} rootPath={folderPath} />
}

function renderBookmarkCategory(slug: string, ctx: PrefixRouteContext): React.JSX.Element {
  return (
    <BookmarkList
      key={`bookmarks-category:${slug}`}
      filterCategory={slug}
      onOpenTab={ctx.onOpenTab}
    />
  )
}

function renderPRReviewRoute(_slug: string, ctx: PrefixRouteContext): React.JSX.Element {
  const prInfo = parsePRReviewInfo(ctx.activeViewId)
  if (prInfo) {
    return (
      <PRReviewPanel
        prInfo={prInfo}
        onSubmitted={resultId => ctx.onOpenTab(`copilot-result:${resultId}`)}
        onClose={() => ctx.onCloseView(ctx.activeViewId)}
      />
    )
  }
  return (
    <div className="content-placeholder">
      <p>Invalid PR review data</p>
    </div>
  )
}

function renderPRDetailRoute(slug: string): React.JSX.Element {
  const route = parsePRDetailRoute(`pr-detail:${slug}`)
  if (route) return <PullRequestDetailPanel pr={route.pr} section={route.section} />
  return (
    <div className="content-placeholder">
      <p>Invalid PR detail data</p>
    </div>
  )
}

const prefixRoutes: PrefixRouteEntry[] = [
  { prefix: 'folder-view:', render: slug => renderFolderView(slug) },
  { prefix: 'bookmarks-category:', render: (slug, ctx) => renderBookmarkCategory(slug, ctx) },
  {
    prefix: 'browser:',
    render: slug => <BrowserTabView key={`browser:${slug}`} url={decodeURIComponent(slug)} />,
  },
  { prefix: 'crew-project:', render: slug => <CrewProjectView projectId={slug} /> },
  {
    prefix: 'copilot-session-detail:',
    render: (slug, ctx) => (
      <SessionDetail filePath={atob(slug)} onBack={() => ctx.onNavigate('copilot-sessions')} />
    ),
  },
  { prefix: 'schedule-detail:', render: slug => <ScheduleDetailPanel scheduleId={slug} /> },
  { prefix: 'job-detail:', render: slug => <JobDetailPanel jobId={slug} /> },
  {
    prefix: 'repo-detail:',
    render: slug => {
      const p = parseOwnerRepo(slug)
      return p ? <RepoDetailPanel owner={p.owner} repo={p.repo} /> : null
    },
  },
  {
    prefix: 'org-user:',
    render: slug => {
      const p = parseOwnerRepo(slug)
      return p ? <UserDetailPanel org={p.owner} memberLogin={p.repo} /> : null
    },
  },
  {
    prefix: 'org-detail:',
    render: slug => (slug ? <OrgDetailPanel org={slug} /> : null),
  },
  {
    prefix: 'repo-commits:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <RepoCommitListPanel
          owner={p.owner}
          repo={p.repo}
          onOpenCommit={sha => ctx.onOpenTab(`repo-commit:${p.owner}/${p.repo}/${sha}`)}
        />
      ) : null
    },
  },
  {
    prefix: 'repo-commit:',
    render: slug => {
      const p = parseRepoCommitRoute(slug)
      return p ? <RepoCommitDetailPanel owner={p.owner} repo={p.repo} sha={p.sha} /> : null
    },
  },
  {
    prefix: 'repo-issues-closed:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <RepoIssueList
          owner={p.owner}
          repo={p.repo}
          issueState="closed"
          onOpenIssue={n => ctx.onOpenTab(`repo-issue:${p.owner}/${p.repo}/${n}`)}
        />
      ) : null
    },
  },
  {
    prefix: 'repo-issue:',
    render: slug => {
      const p = parseRepoIssueRoute(slug)
      return p ? (
        <RepoIssueDetailPanel owner={p.owner} repo={p.repo} issueNumber={p.issueNumber} />
      ) : null
    },
  },
  {
    prefix: 'repo-issues:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <RepoIssueList
          owner={p.owner}
          repo={p.repo}
          issueState="open"
          onOpenIssue={n => ctx.onOpenTab(`repo-issue:${p.owner}/${p.repo}/${n}`)}
        />
      ) : null
    },
  },
  {
    prefix: 'repo-prs-closed:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <RepoPullRequestList
          owner={p.owner}
          repo={p.repo}
          prState="closed"
          onOpenPR={ctx.onOpenTab}
        />
      ) : null
    },
  },
  {
    prefix: 'repo-prs:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <RepoPullRequestList
          owner={p.owner}
          repo={p.repo}
          prState="open"
          onOpenPR={ctx.onOpenTab}
        />
      ) : null
    },
  },
  { prefix: 'copilot-result:', render: slug => <CopilotResultPanel resultId={slug} /> },
  { prefix: 'pr-review:', render: (slug, ctx) => renderPRReviewRoute(slug, ctx) },
  { prefix: 'pr-detail:', render: slug => renderPRDetailRoute(slug) },
]

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
      <div className="content-placeholder">
        <div className="content-body" style={{ textAlign: 'center', paddingTop: '120px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Open a tab to get started
          </p>
        </div>
      </div>
    )
  }

  const exact = renderExactRoute(
    activeViewId,
    prCounts,
    onNavigate,
    onSectionChange,
    onOpenTab,
    onPRCountChange
  )
  if (exact) return exact

  const ctx: PrefixRouteContext = { activeViewId, onNavigate, onOpenTab, onCloseView }
  for (const route of prefixRoutes) {
    if (activeViewId.startsWith(route.prefix)) {
      const slug = activeViewId.slice(route.prefix.length)
      const result = route.render(slug, ctx)
      if (result) return result
    }
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
