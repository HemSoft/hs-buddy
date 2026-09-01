import { WelcomePanel } from './WelcomePanel'
import { parsePRReviewInfo } from './pr-review/PRReviewInfo'
import { LazyRouteBoundary } from './LazyRouteBoundary'
import {
  LazyBookmarkList,
  LazyBrowserTabView,
  LazyCopilotPromptBox,
  LazyCopilotResultPanel,
  LazyCopilotResultsList,
  LazyCopilotUsagePanel,
  LazyCrewProjectView,
  LazyFolderExplorerView,
  LazyJobDetailPanel,
  LazyOrgDetailPanel,
  LazyPRReviewPanel,
  LazyPullRequestDetailPanel,
  LazyPullRequestList,
  LazyRalphDashboard,
  LazyRalphRunDetailPanel,
  LazyRepoCommitDetailPanel,
  LazyRepoCommitListPanel,
  LazyRepoDetailPanel,
  LazyRepoIssueDetailPanel,
  LazyRepoIssueList,
  LazyRepoPullRequestList,
  LazyRunList,
  LazyScheduleDetailPanel,
  LazyScheduleOverviewPanel,
  LazySessionDetail,
  LazySessionExplorer,
  LazySettingsAccounts,
  LazySettingsAdvanced,
  LazySettingsAppearance,
  LazySettingsCopilot,
  LazySettingsNotifications,
  LazySettingsPullRequests,
  LazySettingsWeather,
  LazyTaskPlannerView,
  LazyTempoDashboard,
  LazyTerminalWorkspaceView,
  LazyUserDetailPanel,
} from './AppContentLazyRoutes'
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

const SETTINGS_ROUTES: Record<string, () => React.JSX.Element> = {
  'settings-accounts': () => <LazySettingsAccounts />,
  'settings-appearance': () => <LazySettingsAppearance />,
  'settings-pullrequests': () => <LazySettingsPullRequests />,
  'settings-copilot': () => <LazySettingsCopilot />,
  'settings-notifications': () => <LazySettingsNotifications />,
  'settings-advanced': () => <LazySettingsAdvanced />,
  'settings-weather': () => <LazySettingsWeather />,
}

function resolveRoute(
  routes: Record<string, () => React.JSX.Element>,
  viewId: string
): React.JSX.Element | null {
  return Object.hasOwn(routes, viewId) ? routes[viewId]() : null
}

function buildCopilotRoutes(ctx: ExactRouteContext): Record<string, () => React.JSX.Element> {
  return {
    'copilot-prompt': () => (
      <LazyCopilotPromptBox onOpenResult={id => ctx.onOpenTab(`copilot-result:${id}`)} />
    ),
    'copilot-all-results': () => (
      <LazyCopilotResultsList onOpenResult={id => ctx.onOpenTab(`copilot-result:${id}`)} />
    ),
    'copilot-usage': () => <LazyCopilotUsagePanel />,
    'copilot-sessions': () => (
      <LazySessionExplorer
        onSelectSession={fp => ctx.onOpenTab(`copilot-session-detail:${encodeURIComponent(fp)}`)}
      />
    ),
    'automation-schedules': () => (
      <LazyScheduleOverviewPanel onOpenSchedule={sId => ctx.onOpenTab(`schedule-detail:${sId}`)} />
    ),
    'automation-runs': () => <LazyRunList />,
  }
}

function buildWorkspaceRoutes(ctx: ExactRouteContext): Record<string, () => React.JSX.Element> {
  return {
    'tasks-today': () => <LazyTaskPlannerView mode="today" />,
    'tasks-upcoming': () => <LazyTaskPlannerView mode="upcoming" />,
    'tasks-projects': () => <LazyTaskPlannerView />,
    'terminal-workspace': () => <LazyTerminalWorkspaceView />,
    'tempo-timesheet': () => <LazyTempoDashboard />,
    'ralph-dashboard': () => <LazyRalphDashboard onOpenTab={ctx.onOpenTab} />,
    'bookmarks-all': () => <LazyBookmarkList key="bookmarks-all" onOpenTab={ctx.onOpenTab} />,
  }
}

function renderPRModeRoute(
  activeViewId: string,
  onPRCountChange: (viewId: string, count: number) => void,
  onOpenTab: (viewId: string) => void
): React.JSX.Element | null {
  if (!activeViewId.startsWith('pr-')) return null
  const mode = activeViewId.slice(3) as (typeof PR_MODES)[number]
  if (!PR_MODES.includes(mode)) return null
  return (
    <LazyPullRequestList
      mode={mode}
      onCountChange={count => onPRCountChange(activeViewId, count)}
      onOpenPR={onOpenTab}
    />
  )
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
  const prRoute = renderPRModeRoute(activeViewId, onPRCountChange, onOpenTab)
  if (prRoute) return prRoute
  const ctx: ExactRouteContext = {
    prCounts,
    onNavigate,
    onSectionChange,
    onOpenTab,
    onPRCountChange,
  }
  return (
    resolveRoute(SETTINGS_ROUTES, activeViewId) ??
    resolveRoute(buildCopilotRoutes(ctx), activeViewId) ??
    resolveRoute(buildWorkspaceRoutes(ctx), activeViewId)
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
  return <LazyFolderExplorerView key={`folder-view:${slug}`} rootPath={folderPath} />
}

function renderBookmarkCategory(slug: string, ctx: PrefixRouteContext): React.JSX.Element {
  return (
    <LazyBookmarkList
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
      <LazyPRReviewPanel
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
  if (route) return <LazyPullRequestDetailPanel pr={route.pr} section={route.section} />
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
    render: slug => {
      const pipeIndex = slug.indexOf('|')
      const encodedUrl = pipeIndex >= 0 ? slug.slice(0, pipeIndex) : slug
      try {
        return (
          <LazyBrowserTabView key={`browser:${encodedUrl}`} url={decodeURIComponent(encodedUrl)} />
        )
      } catch (_: unknown) {
        return null
      }
    },
  },
  { prefix: 'crew-project:', render: slug => <LazyCrewProjectView projectId={slug} /> },
  {
    prefix: 'copilot-session-detail:',
    render: (slug, ctx) => (
      <LazySessionDetail
        filePath={decodeURIComponent(slug)}
        onBack={() => ctx.onNavigate('copilot-sessions')}
      />
    ),
  },
  { prefix: 'schedule-detail:', render: slug => <LazyScheduleDetailPanel scheduleId={slug} /> },
  { prefix: 'job-detail:', render: slug => <LazyJobDetailPanel jobId={slug} /> },
  {
    prefix: 'repo-detail:',
    render: slug => {
      const p = parseOwnerRepo(slug)
      return p ? <LazyRepoDetailPanel owner={p.owner} repo={p.repo} /> : null
    },
  },
  {
    prefix: 'org-user:',
    render: slug => {
      const p = parseOwnerRepo(slug)
      return p ? <LazyUserDetailPanel org={p.owner} memberLogin={p.repo} /> : null
    },
  },
  {
    prefix: 'org-detail:',
    render: slug => (slug ? <LazyOrgDetailPanel org={slug} /> : null),
  },
  {
    prefix: 'repo-commits:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <LazyRepoCommitListPanel
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
      return p ? <LazyRepoCommitDetailPanel owner={p.owner} repo={p.repo} sha={p.sha} /> : null
    },
  },
  {
    prefix: 'repo-issues-closed:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <LazyRepoIssueList
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
        <LazyRepoIssueDetailPanel owner={p.owner} repo={p.repo} issueNumber={p.issueNumber} />
      ) : null
    },
  },
  {
    prefix: 'repo-issues:',
    render: (slug, ctx) => {
      const p = parseOwnerRepo(slug)
      return p ? (
        <LazyRepoIssueList
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
        <LazyRepoPullRequestList
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
        <LazyRepoPullRequestList
          owner={p.owner}
          repo={p.repo}
          prState="open"
          onOpenPR={ctx.onOpenTab}
        />
      ) : null
    },
  },
  { prefix: 'ralph-run:', render: slug => <LazyRalphRunDetailPanel runId={slug} /> },
  { prefix: 'copilot-result:', render: slug => <LazyCopilotResultPanel resultId={slug} /> },
  { prefix: 'pr-review:', render: (slug, ctx) => renderPRReviewRoute(slug, ctx) },
  { prefix: 'pr-detail:', render: slug => renderPRDetailRoute(slug) },
]

function renderPrefixRoute(
  activeViewId: string,
  ctx: PrefixRouteContext
): React.JSX.Element | null {
  for (const route of prefixRoutes) {
    if (activeViewId.startsWith(route.prefix)) {
      const slug = activeViewId.slice(route.prefix.length)
      const result = route.render(slug, ctx)
      if (result) return result
    }
  }
  return null
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
  if (exact) {
    return activeViewId === 'dashboard' ? (
      exact
    ) : (
      <LazyRouteBoundary routeKey={activeViewId}>{exact}</LazyRouteBoundary>
    )
  }

  const ctx: PrefixRouteContext = { activeViewId, onNavigate, onOpenTab, onCloseView }
  const prefixResult = renderPrefixRoute(activeViewId, ctx)
  if (prefixResult) {
    return <LazyRouteBoundary routeKey={activeViewId}>{prefixResult}</LazyRouteBoundary>
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
