import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

vi.mock('../utils/prDetailView', () => ({
  parsePRDetailRoute: () => null,
}))

vi.mock('./appContentViewLabels', () => ({
  viewLabels: {},
}))

import { AppContentRouter } from './AppContentRouter'

function renderRouter(activeViewId: string | null = null) {
  const onPRCountChange = vi.fn()

  render(
    <AppContentRouter
      activeViewId={activeViewId}
      prCounts={{}}
      onNavigate={vi.fn()}
      onSectionChange={vi.fn()}
      onOpenTab={vi.fn()}
      onCloseView={vi.fn()}
      onPRCountChange={onPRCountChange}
    />
  )

  return { onPRCountChange }
}

describe('AppContentRouter', () => {
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
})
