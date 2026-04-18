import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const capturedCallbacks: Record<string, (...args: any[]) => void> = {}

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
  RepoCommitListPanel: (props: { onOpenCommit: (sha: string) => void }) => {
    capturedCallbacks.onOpenCommit = props.onOpenCommit
    return <div>RepoCommitListPanel</div>
  },
}))

vi.mock('./RepoCommitDetailPanel', () => ({
  RepoCommitDetailPanel: () => <div>RepoCommitDetailPanel</div>,
}))

vi.mock('./RepoIssueList', () => ({
  RepoIssueList: (props: { onOpenIssue: (issueNumber: number) => void; state?: string }) => {
    capturedCallbacks.onOpenIssue = props.onOpenIssue
    return <div>RepoIssueList</div>
  },
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
  CopilotResultsList: (props: { onOpenResult: (resultId: string) => void }) => {
    capturedCallbacks.onOpenResult = props.onOpenResult
    return <div>CopilotResultsList</div>
  },
}))

vi.mock('./PRReviewPanel', () => ({
  PRReviewPanel: (props: { onSubmitted: (resultId: string) => void; onClose: () => void }) => {
    capturedCallbacks.prReviewOnSubmitted = props.onSubmitted
    capturedCallbacks.prReviewOnClose = props.onClose
    return <div>PRReviewPanel</div>
  },
  parsePRReviewInfo: () => null,
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

vi.mock('./sessions/SessionExplorer', () => ({
  SessionExplorer: (props: { onSelectSession: (filePath: string) => void }) => {
    capturedCallbacks.onSelectSession = props.onSelectSession
    return <div>SessionExplorer</div>
  },
}))

vi.mock('./sessions/SessionDetail', () => ({
  SessionDetail: ({ filePath }: { filePath: string }) => <div>SessionDetail:{filePath}</div>,
}))

vi.mock('./planner/TaskPlannerView', () => ({
  TaskPlannerView: ({ mode }: { mode?: string }) => <div>TaskPlanner:{mode ?? 'default'}</div>,
}))

vi.mock('./bookmarks/BookmarkList', () => ({
  BookmarkList: ({ filterCategory }: { filterCategory?: string }) => (
    <div>BookmarkList:{filterCategory ?? 'all'}</div>
  ),
}))

vi.mock('./BrowserTabView', () => ({
  BrowserTabView: ({ url }: { url: string }) => <div>BrowserTab:{url}</div>,
}))

vi.mock('./pr-review/PRReviewInfo', () => ({
  parsePRReviewInfo: (viewId: string) => {
    if (viewId === 'pr-review:valid-pr') {
      return { prUrl: 'url', prTitle: 'title', prNumber: 1, repo: 'r', org: 'o', author: 'a' }
    }
    return null
  },
}))

vi.mock('../utils/prDetailView', () => ({
  parsePRDetailRoute: (viewId: string) => {
    if (viewId.includes('valid-pr')) {
      return {
        pr: { id: 99, repository: 'my-repo' },
        section: 'checks',
      }
    }
    return null
  },
}))

vi.mock('./appContentViewLabels', () => ({
  viewLabels: { 'some-known-view': 'Known View' },
}))

import { AppContentRouter } from './AppContentRouter'

function renderRouter(activeViewId: string | null = null) {
  const onPRCountChange = vi.fn()
  const onOpenTab = vi.fn()
  const onCloseView = vi.fn()

  render(
    <AppContentRouter
      activeViewId={activeViewId}
      prCounts={{}}
      onNavigate={vi.fn()}
      onSectionChange={vi.fn()}
      onOpenTab={onOpenTab}
      onCloseView={onCloseView}
      onPRCountChange={onPRCountChange}
    />
  )

  return { onPRCountChange, onOpenTab, onCloseView }
}

describe('AppContentRouter', () => {
  beforeEach(() => {
    for (const key in capturedCallbacks) delete capturedCallbacks[key]
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

  it('renders placeholder when activeViewId is null', () => {
    renderRouter(null)
    expect(screen.getByText('Open a tab to get started')).toBeInTheDocument()
  })

  it.each([
    ['settings-accounts', 'SettingsAccounts'],
    ['settings-appearance', 'SettingsAppearance'],
    ['settings-pullrequests', 'SettingsPullRequests'],
    ['settings-copilot', 'SettingsCopilot'],
    ['settings-advanced', 'SettingsAdvanced'],
    ['automation-runs', 'RunList'],
    ['copilot-prompt', 'CopilotPromptBox'],
    ['copilot-all-results', 'CopilotResultsList'],
    ['copilot-usage', 'CopilotUsagePanel'],
    ['copilot-sessions', 'SessionExplorer'],
    ['tempo-timesheet', 'TempoDashboard'],
  ])('renders %s route', (viewId, expectedText) => {
    renderRouter(viewId)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })

  it.each([
    ['tasks-today', 'TaskPlanner:today'],
    ['tasks-upcoming', 'TaskPlanner:upcoming'],
    ['tasks-projects', 'TaskPlanner:default'],
  ])('renders task planner route %s', (viewId, expectedText) => {
    renderRouter(viewId)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })

  it('renders bookmarks-all', () => {
    renderRouter('bookmarks-all')
    expect(screen.getByText('BookmarkList:all')).toBeInTheDocument()
  })

  it('renders bookmarks-category route', () => {
    renderRouter('bookmarks-category:work')
    expect(screen.getByText('BookmarkList:work')).toBeInTheDocument()
  })

  it('renders browser tab route', () => {
    const encoded = encodeURIComponent('https://example.com')
    renderRouter(`browser:${encoded}`)
    expect(screen.getByText('BrowserTab:https://example.com')).toBeInTheDocument()
  })

  it('renders crew-project route', () => {
    renderRouter('crew-project:proj-123')
    expect(screen.getByText('CrewProject:proj-123')).toBeInTheDocument()
  })

  it('renders copilot-session-detail route', () => {
    const encoded = btoa('/path/to/session.jsonl')
    renderRouter(`copilot-session-detail:${encoded}`)
    expect(screen.getByText('SessionDetail:/path/to/session.jsonl')).toBeInTheDocument()
  })

  it('renders schedule-detail route', () => {
    renderRouter('schedule-detail:sched-1')
    expect(screen.getByText('ScheduleDetail:sched-1')).toBeInTheDocument()
  })

  it('renders job-detail route', () => {
    renderRouter('job-detail:job-1')
    expect(screen.getByText('JobDetail:job-1')).toBeInTheDocument()
  })

  it('renders repo-detail route', () => {
    renderRouter('repo-detail:acme/widget')
    expect(screen.getByText('RepoDetail:acme/widget')).toBeInTheDocument()
  })

  it('renders org-detail route', () => {
    renderRouter('org-detail:acme-corp')
    expect(screen.getByText('OrgDetail:acme-corp')).toBeInTheDocument()
  })

  it('renders repo-commits route', () => {
    renderRouter('repo-commits:acme/widget')
    expect(screen.getByText('RepoCommitListPanel')).toBeInTheDocument()
  })

  it('renders repo-commit route', () => {
    renderRouter('repo-commit:acme/widget/abc1234')
    expect(screen.getByText('RepoCommitDetailPanel')).toBeInTheDocument()
  })

  it('renders repo-issues route', () => {
    renderRouter('repo-issues:acme/widget')
    expect(screen.getByText('RepoIssueList')).toBeInTheDocument()
  })

  it('renders repo-issues-closed route', () => {
    renderRouter('repo-issues-closed:acme/widget')
    expect(screen.getByText('RepoIssueList')).toBeInTheDocument()
  })

  it('renders repo-issue route', () => {
    renderRouter('repo-issue:acme/widget/42')
    expect(screen.getByText('RepoIssueDetailPanel')).toBeInTheDocument()
  })

  it('renders repo-prs route', () => {
    renderRouter('repo-prs:acme/widget')
    expect(screen.getByText('RepoPullRequestList')).toBeInTheDocument()
  })

  it('renders repo-prs-closed route', () => {
    renderRouter('repo-prs-closed:acme/widget')
    expect(screen.getByText('RepoPullRequestList')).toBeInTheDocument()
  })

  it('renders copilot-result route', () => {
    renderRouter('copilot-result:res-123')
    expect(screen.getByText('CopilotResultPanel')).toBeInTheDocument()
  })

  it('renders pr-review route with valid info', () => {
    renderRouter('pr-review:valid-pr')
    expect(screen.getByText('PRReviewPanel')).toBeInTheDocument()
  })

  it('renders "Invalid PR review data" for invalid pr-review', () => {
    renderRouter('pr-review:invalid-info')
    expect(screen.getByText('Invalid PR review data')).toBeInTheDocument()
  })

  it('renders PullRequestDetailPanel for valid pr-detail', () => {
    renderRouter('pr-detail:valid-pr-info')
    expect(screen.getByText('PullRequestDetailPanel')).toBeInTheDocument()
  })

  it('renders "Invalid PR detail data" for invalid pr-detail', () => {
    renderRouter('pr-detail:invalid')
    expect(screen.getByText('Invalid PR detail data')).toBeInTheDocument()
  })

  it('renders coming soon fallback for unknown view IDs', () => {
    renderRouter('totally-unknown-view')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('uses viewLabels for unknown view header', () => {
    renderRouter('some-known-view')
    expect(screen.getByText('Known View')).toBeInTheDocument()
  })

  it('renders WelcomePanel for dashboard route', () => {
    renderRouter('dashboard')
    expect(screen.getByText('WelcomePanel')).toBeInTheDocument()
  })

  it('renders ScheduleOverview for automation-schedules route', () => {
    renderRouter('automation-schedules')
    expect(screen.getByText('ScheduleOverview')).toBeInTheDocument()
  })

  it('renders settings-notifications route', () => {
    renderRouter('settings-notifications')
    expect(screen.getByText('SettingsNotifications')).toBeInTheDocument()
  })

  it('renders fallback "Content" heading for truly unknown view', () => {
    renderRouter('completely-unknown-xyz')
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('returns invalid repo-detail with no slash', () => {
    renderRouter('repo-detail:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns invalid repo-commit with bad format', () => {
    renderRouter('repo-commit:badformat')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns invalid repo-issue with non-numeric issue number', () => {
    renderRouter('repo-issue:acme/widget/notanumber')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for org-detail with empty org', () => {
    renderRouter('org-detail:')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for repo-commits with no slash', () => {
    renderRouter('repo-commits:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for repo-prs with no slash', () => {
    renderRouter('repo-prs:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for repo-prs-closed with no slash', () => {
    renderRouter('repo-prs-closed:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for repo-issues with no slash', () => {
    renderRouter('repo-issues:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for repo-issues-closed with no slash', () => {
    renderRouter('repo-issues-closed:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('returns fallback for org-user with no slash', () => {
    renderRouter('org-user:noslash')
    expect(screen.getByText('This feature is coming soon!')).toBeInTheDocument()
  })

  it('CopilotResultsList onOpenResult calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('copilot-all-results')
    capturedCallbacks.onOpenResult('test-result-id')
    expect(onOpenTab).toHaveBeenCalledWith('copilot-result:test-result-id')
  })

  it('SessionExplorer onSelectSession calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('copilot-sessions')
    capturedCallbacks.onSelectSession('/path/to/session.jsonl')
    expect(onOpenTab).toHaveBeenCalledWith(
      `copilot-session-detail:${btoa('/path/to/session.jsonl')}`
    )
  })

  it('RepoCommitListPanel onOpenCommit calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('repo-commits:acme/widget')
    capturedCallbacks.onOpenCommit('abc1234')
    expect(onOpenTab).toHaveBeenCalledWith('repo-commit:acme/widget/abc1234')
  })

  it('RepoIssueList (closed) onOpenIssue calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('repo-issues-closed:acme/widget')
    capturedCallbacks.onOpenIssue(42)
    expect(onOpenTab).toHaveBeenCalledWith('repo-issue:acme/widget/42')
  })

  it('RepoIssueList (open) onOpenIssue calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('repo-issues:acme/widget')
    capturedCallbacks.onOpenIssue(99)
    expect(onOpenTab).toHaveBeenCalledWith('repo-issue:acme/widget/99')
  })

  it('PRReviewPanel onSubmitted calls onOpenTab', () => {
    const { onOpenTab } = renderRouter('pr-review:valid-pr')
    capturedCallbacks.prReviewOnSubmitted('result-456')
    expect(onOpenTab).toHaveBeenCalledWith('copilot-result:result-456')
  })

  it('PRReviewPanel onClose calls onCloseView', () => {
    const { onCloseView } = renderRouter('pr-review:valid-pr')
    capturedCallbacks.prReviewOnClose()
    expect(onCloseView).toHaveBeenCalledWith('pr-review:valid-pr')
  })
})
