import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./PullRequestList', () => ({
  PullRequestList: ({
    mode,
    onCountChange,
  }: {
    mode: string
    onCountChange: (count: number) => void
  }) => (
    <button data-testid="pull-request-list" data-mode={mode} onClick={() => onCountChange(7)}>
      PullRequestList
    </button>
  ),
}))

vi.mock('./automation', () => ({
  ScheduleDetailPanel: ({ scheduleId }: { scheduleId: string }) => (
    <div>ScheduleDetail:{scheduleId}</div>
  ),
  ScheduleOverviewPanel: () => <div>ScheduleOverview</div>,
  JobDetailPanel: ({ jobId }: { jobId: string }) => <div>JobDetail:{jobId}</div>,
  RunList: () => <div>RunList</div>,
}))

vi.mock('./settings', () => ({
  SettingsAccounts: () => <div>SettingsAccounts</div>,
  SettingsAppearance: () => <div>SettingsAppearance</div>,
  SettingsPullRequests: () => <div>SettingsPullRequests</div>,
  SettingsCopilot: () => <div>SettingsCopilot</div>,
  SettingsNotifications: () => <div>SettingsNotifications</div>,
  SettingsAdvanced: () => <div>SettingsAdvanced</div>,
}))

vi.mock('./WelcomePanel', () => ({
  WelcomePanel: () => <div>WelcomePanel</div>,
}))

vi.mock('./RepoDetailPanel', () => ({
  RepoDetailPanel: ({ owner, repo }: { owner: string; repo: string }) => (
    <div>
      RepoDetail:{owner}/{repo}
    </div>
  ),
}))

vi.mock('./RepoCommitListPanel', () => ({
  RepoCommitListPanel: () => <div>RepoCommitListPanel</div>,
}))

vi.mock('./RepoCommitDetailPanel', () => ({
  RepoCommitDetailPanel: () => <div>RepoCommitDetailPanel</div>,
}))

vi.mock('./RepoIssueList', () => ({
  RepoIssueList: () => <div>RepoIssueList</div>,
}))

vi.mock('./RepoIssueDetailPanel', () => ({
  RepoIssueDetailPanel: () => <div>RepoIssueDetailPanel</div>,
}))

vi.mock('./RepoPullRequestList', () => ({
  RepoPullRequestList: () => <div>RepoPullRequestList</div>,
}))

vi.mock('./PullRequestDetailPanel', () => ({
  PullRequestDetailPanel: () => <div>PullRequestDetailPanel</div>,
}))

vi.mock('./CopilotPromptBox', () => ({
  CopilotPromptBox: () => <div>CopilotPromptBox</div>,
}))

vi.mock('./CopilotResultPanel', () => ({
  CopilotResultPanel: () => <div>CopilotResultPanel</div>,
}))

vi.mock('./CopilotResultsList', () => ({
  CopilotResultsList: () => <div>CopilotResultsList</div>,
}))

vi.mock('./PRReviewPanel', () => ({
  PRReviewPanel: () => <div>PRReviewPanel</div>,
}))

vi.mock('./CopilotUsagePanel', () => ({
  CopilotUsagePanel: () => <div>CopilotUsagePanel</div>,
}))

vi.mock('./OrgDetailPanel', () => ({
  OrgDetailPanel: ({ org }: { org: string }) => <div>OrgDetail:{org}</div>,
}))

vi.mock('./UserDetailPanel', () => ({
  UserDetailPanel: ({ org, memberLogin }: { org: string; memberLogin: string }) => (
    <div>
      UserDetail:{org}/{memberLogin}
    </div>
  ),
}))

vi.mock('./crew/CrewProjectView', () => ({
  CrewProjectView: ({ projectId }: { projectId: string }) => <div>CrewProject:{projectId}</div>,
}))

vi.mock('./tempo/TempoDashboard', () => ({
  TempoDashboard: () => <div>TempoDashboard</div>,
}))

vi.mock('../utils/prDetailView', () => ({
  parsePRDetailRoute: vi.fn().mockReturnValue(null),
}))

vi.mock('./appContentViewLabels', () => ({
  viewLabels: { 'unknown-view': 'Unknown View' },
}))

vi.mock('./sessions/SessionExplorer', () => ({
  SessionExplorer: () => <div>SessionExplorer</div>,
}))

vi.mock('./sessions/SessionDetail', () => ({
  SessionDetail: ({ filePath }: { filePath: string }) => <div>SessionDetail:{filePath}</div>,
}))

vi.mock('./planner/TaskPlannerView', () => ({
  TaskPlannerView: ({ mode }: { mode?: string }) => <div>TaskPlannerView:{mode ?? 'default'}</div>,
}))

vi.mock('./bookmarks/BookmarkList', () => ({
  BookmarkList: ({ filterCategory }: { filterCategory?: string }) => (
    <div>BookmarkList:{filterCategory ?? 'all'}</div>
  ),
}))

vi.mock('./BrowserTabView', () => ({
  BrowserTabView: ({ url }: { url: string }) => <div>BrowserTabView:{url}</div>,
}))

vi.mock('./pr-review/PRReviewInfo', () => ({
  parsePRReviewInfo: vi.fn(),
}))

import { AppContentRouter } from './AppContentRouter'
import { parsePRReviewInfo } from './pr-review/PRReviewInfo'
import { parsePRDetailRoute } from '../utils/prDetailView'

const mockParsePRReviewInfo = vi.mocked(parsePRReviewInfo)
const mockParsePRDetailRoute = vi.mocked(parsePRDetailRoute)

function renderRouter(activeViewId: string | null = null) {
  const onPRCountChange = vi.fn()
  const onNavigate = vi.fn()
  const onSectionChange = vi.fn()
  const onOpenTab = vi.fn()
  const onCloseView = vi.fn()

  render(
    <AppContentRouter
      activeViewId={activeViewId}
      prCounts={{}}
      onNavigate={onNavigate}
      onSectionChange={onSectionChange}
      onOpenTab={onOpenTab}
      onCloseView={onCloseView}
      onPRCountChange={onPRCountChange}
    />
  )

  return { onPRCountChange, onNavigate, onSectionChange, onOpenTab, onCloseView }
}

describe('AppContentRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParsePRReviewInfo.mockReturnValue(null)
    mockParsePRDetailRoute.mockReturnValue(null)
  })
  it.each(['pr-my-prs', 'pr-needs-review', 'pr-recently-merged', 'pr-need-a-nudge'])(
    'renders PullRequestList for %s using the matching mode',
    async activeViewId => {
      const user = userEvent.setup()
      const { onPRCountChange } = renderRouter(activeViewId)

      const list = screen.getByTestId('pull-request-list')
      expect(list).toHaveAttribute('data-mode', activeViewId.slice(3))

      await user.click(list)

      expect(onPRCountChange).toHaveBeenCalledWith(activeViewId, 7)
    }
  )

  it('reuses parseOwnerRepo for org-user routes', () => {
    renderRouter('org-user:relias-engineering/octocat')

    expect(screen.getByText('UserDetail:relias-engineering/octocat')).toBeInTheDocument()
  })

  it('renders WelcomePanel when activeViewId is null', () => {
    renderRouter(null)
    expect(screen.getByText('WelcomePanel')).toBeInTheDocument()
  })

  // Settings routes
  it.each([
    ['settings-accounts', 'SettingsAccounts'],
    ['settings-appearance', 'SettingsAppearance'],
    ['settings-pullrequests', 'SettingsPullRequests'],
    ['settings-copilot', 'SettingsCopilot'],
    ['settings-notifications', 'SettingsNotifications'],
    ['settings-advanced', 'SettingsAdvanced'],
  ])('renders %s route', (viewId, expectedText) => {
    renderRouter(viewId)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })

  // Automation routes
  it('renders ScheduleOverviewPanel for automation-schedules', () => {
    renderRouter('automation-schedules')
    expect(screen.getByText('ScheduleOverview')).toBeInTheDocument()
  })

  it('renders RunList for automation-runs', () => {
    renderRouter('automation-runs')
    expect(screen.getByText('RunList')).toBeInTheDocument()
  })

  // Copilot routes
  it('renders CopilotPromptBox for copilot-prompt', () => {
    renderRouter('copilot-prompt')
    expect(screen.getByText('CopilotPromptBox')).toBeInTheDocument()
  })

  it('renders CopilotResultsList for copilot-all-results', () => {
    renderRouter('copilot-all-results')
    expect(screen.getByText('CopilotResultsList')).toBeInTheDocument()
  })

  it('renders CopilotUsagePanel for copilot-usage', () => {
    renderRouter('copilot-usage')
    expect(screen.getByText('CopilotUsagePanel')).toBeInTheDocument()
  })

  it('renders SessionExplorer for copilot-sessions', () => {
    renderRouter('copilot-sessions')
    expect(screen.getByText('SessionExplorer')).toBeInTheDocument()
  })

  // Task planner routes
  it('renders TaskPlannerView for tasks-today', () => {
    renderRouter('tasks-today')
    expect(screen.getByText('TaskPlannerView:today')).toBeInTheDocument()
  })

  it('renders TaskPlannerView for tasks-upcoming', () => {
    renderRouter('tasks-upcoming')
    expect(screen.getByText('TaskPlannerView:upcoming')).toBeInTheDocument()
  })

  it('renders TaskPlannerView for tasks-projects', () => {
    renderRouter('tasks-projects')
    expect(screen.getByText('TaskPlannerView:default')).toBeInTheDocument()
  })

  // Tempo
  it('renders TempoDashboard for tempo-timesheet', () => {
    renderRouter('tempo-timesheet')
    expect(screen.getByText('TempoDashboard')).toBeInTheDocument()
  })

  // Bookmarks
  it('renders BookmarkList for bookmarks-all', () => {
    renderRouter('bookmarks-all')
    expect(screen.getByText('BookmarkList:all')).toBeInTheDocument()
  })

  it('renders BookmarkList with category filter for bookmarks-category:Dev', () => {
    renderRouter('bookmarks-category:Dev')
    expect(screen.getByText('BookmarkList:Dev')).toBeInTheDocument()
  })

  // Browser
  it('renders BrowserTabView for browser: routes with URL decoding', () => {
    renderRouter('browser:https%3A%2F%2Fexample.com')
    expect(screen.getByText('BrowserTabView:https://example.com')).toBeInTheDocument()
  })

  // Crew
  it('renders CrewProjectView for crew-project: routes', () => {
    renderRouter('crew-project:proj-123')
    expect(screen.getByText('CrewProject:proj-123')).toBeInTheDocument()
  })

  // Session detail
  it('renders SessionDetail for copilot-session-detail: routes', () => {
    const encoded = btoa('/path/to/session.json')
    renderRouter(`copilot-session-detail:${encoded}`)
    expect(screen.getByText('SessionDetail:/path/to/session.json')).toBeInTheDocument()
  })

  // Schedule / job detail
  it('renders ScheduleDetailPanel for schedule-detail: routes', () => {
    renderRouter('schedule-detail:sched-abc')
    expect(screen.getByText('ScheduleDetail:sched-abc')).toBeInTheDocument()
  })

  it('renders JobDetailPanel for job-detail: routes', () => {
    renderRouter('job-detail:job-xyz')
    expect(screen.getByText('JobDetail:job-xyz')).toBeInTheDocument()
  })

  // Repo detail
  it('renders RepoDetailPanel for repo-detail: routes', () => {
    renderRouter('repo-detail:acme/widgets')
    expect(screen.getByText('RepoDetail:acme/widgets')).toBeInTheDocument()
  })

  // Org detail
  it('renders OrgDetailPanel for org-detail: routes', () => {
    renderRouter('org-detail:acme-org')
    expect(screen.getByText('OrgDetail:acme-org')).toBeInTheDocument()
  })

  // Repo commits
  it('renders RepoCommitListPanel for repo-commits: routes', () => {
    renderRouter('repo-commits:acme/widgets')
    expect(screen.getByText('RepoCommitListPanel')).toBeInTheDocument()
  })

  it('renders RepoCommitDetailPanel for repo-commit: routes', () => {
    renderRouter('repo-commit:acme/widgets/abc123')
    expect(screen.getByText('RepoCommitDetailPanel')).toBeInTheDocument()
  })

  // Repo issues
  it('renders RepoIssueList for repo-issues: routes', () => {
    renderRouter('repo-issues:acme/widgets')
    expect(screen.getByText('RepoIssueList')).toBeInTheDocument()
  })

  it('renders RepoIssueList for repo-issues-closed: routes', () => {
    renderRouter('repo-issues-closed:acme/widgets')
    expect(screen.getByText('RepoIssueList')).toBeInTheDocument()
  })

  it('renders RepoIssueDetailPanel for repo-issue: routes', () => {
    renderRouter('repo-issue:acme/widgets/42')
    expect(screen.getByText('RepoIssueDetailPanel')).toBeInTheDocument()
  })

  // Repo PRs
  it('renders RepoPullRequestList for repo-prs: routes', () => {
    renderRouter('repo-prs:acme/widgets')
    expect(screen.getByText('RepoPullRequestList')).toBeInTheDocument()
  })

  it('renders RepoPullRequestList for repo-prs-closed: routes', () => {
    renderRouter('repo-prs-closed:acme/widgets')
    expect(screen.getByText('RepoPullRequestList')).toBeInTheDocument()
  })

  // Copilot result
  it('renders CopilotResultPanel for copilot-result: routes', () => {
    renderRouter('copilot-result:res-abc')
    expect(screen.getByText('CopilotResultPanel')).toBeInTheDocument()
  })

  // PR review
  it('renders PRReviewPanel when parsePRReviewInfo returns data', () => {
    mockParsePRReviewInfo.mockReturnValue({
      prUrl: 'https://github.com/acme/repo/pull/1',
      prTitle: 'Fix bug',
      prNumber: 1,
      repo: 'repo',
      org: 'acme',
      author: 'dev',
    })
    renderRouter('pr-review:encoded-data')
    expect(screen.getByText('PRReviewPanel')).toBeInTheDocument()
  })

  it('renders invalid PR review message when parsePRReviewInfo returns null', () => {
    mockParsePRReviewInfo.mockReturnValue(null)
    renderRouter('pr-review:bad-data')
    expect(screen.getByText('Invalid PR review data')).toBeInTheDocument()
  })

  // PR detail
  it('renders PullRequestDetailPanel when parsePRDetailRoute returns data', () => {
    mockParsePRDetailRoute.mockReturnValue({
      pr: {
        source: 'GitHub',
        repository: 'acme/widgets',
        id: 5,
        title: 'PR',
        author: 'me',
        url: '',
        state: 'open',
        approvalCount: 0,
        assigneeCount: 0,
        iApproved: false,
        created: null,
        date: null,
      },
      section: 'files-changed',
    })
    renderRouter('pr-detail:acme/widgets/5/files')
    expect(screen.getByText('PullRequestDetailPanel')).toBeInTheDocument()
  })

  it('renders invalid PR detail message when parsePRDetailRoute returns null', () => {
    mockParsePRDetailRoute.mockReturnValue(null)
    renderRouter('pr-detail:bad-data')
    expect(screen.getByText('Invalid PR detail data')).toBeInTheDocument()
  })

  // Unknown route fallback
  it('renders coming soon placeholder for unknown routes', () => {
    renderRouter('totally-unknown-route')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('uses viewLabels for unknown route header', () => {
    renderRouter('unknown-view')
    expect(screen.getByText('Unknown View')).toBeInTheDocument()
  })

  it('falls back to Content header when no viewLabel exists', () => {
    renderRouter('no-label-route')
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  // Edge cases for parseOwnerRepo
  it('returns coming soon for repo-detail with invalid slug (no slash)', () => {
    renderRouter('repo-detail:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })
})
