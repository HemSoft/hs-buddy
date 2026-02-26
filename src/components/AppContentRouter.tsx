import { PullRequestList } from './PullRequestList'
import { ScheduleDetailPanel, ScheduleOverviewPanel, JobDetailPanel, RunList } from './automation'
import {
  SettingsAccounts,
  SettingsAppearance,
  SettingsPullRequests,
  SettingsCopilot,
  SettingsAdvanced,
} from './settings'
import { WelcomePanel } from './WelcomePanel'
import { RepoDetailPanel } from './RepoDetailPanel'
import { RepoIssueList } from './RepoIssueList'
import { RepoPullRequestList } from './RepoPullRequestList'
import { PullRequestDetailPanel } from './PullRequestDetailPanel'
import { CopilotPromptBox } from './CopilotPromptBox'
import { CopilotResultPanel } from './CopilotResultPanel'
import { CopilotResultsList } from './CopilotResultsList'
import { PRReviewPanel } from './PRReviewPanel'
import type { PRReviewInfo } from './PRReviewPanel'
import { CopilotUsagePanel } from './CopilotUsagePanel'
import { parsePRDetailRoute } from '../utils/prDetailView'
import { viewLabels } from './appContentViewLabels'

function parseOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const slashIdx = slug.indexOf('/')
  if (slashIdx <= 0) return null
  return { owner: slug.substring(0, slashIdx), repo: slug.substring(slashIdx + 1) }
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
      <WelcomePanel
        prCounts={prCounts}
        onNavigate={onNavigate}
        onSectionChange={onSectionChange}
      />
    )
  }

  switch (activeViewId) {
    case 'pr-my-prs':
      return <PullRequestList mode="my-prs" onCountChange={(count) => onPRCountChange('pr-my-prs', count)} />
    case 'pr-needs-review':
      return <PullRequestList mode="needs-review" onCountChange={(count) => onPRCountChange('pr-needs-review', count)} />
    case 'pr-recently-merged':
      return (
        <PullRequestList mode="recently-merged" onCountChange={(count) => onPRCountChange('pr-recently-merged', count)} />
      )
    case 'pr-need-a-nudge':
      return <PullRequestList mode="need-a-nudge" onCountChange={(count) => onPRCountChange('pr-need-a-nudge', count)} />
    case 'settings-accounts':
      return <SettingsAccounts />
    case 'settings-appearance':
      return <SettingsAppearance />
    case 'settings-pullrequests':
      return <SettingsPullRequests />
    case 'settings-copilot':
      return <SettingsCopilot />
    case 'settings-advanced':
      return <SettingsAdvanced />
    case 'automation-schedules':
      return <ScheduleOverviewPanel onOpenSchedule={(sId) => onOpenTab(`schedule-detail:${sId}`)} />
    case 'automation-runs':
      return <RunList />
    case 'copilot-prompt':
      return <CopilotPromptBox onOpenResult={(resultId) => onOpenTab(`copilot-result:${resultId}`)} />
    case 'copilot-all-results':
      return <CopilotResultsList onOpenResult={(resultId) => onOpenTab(`copilot-result:${resultId}`)} />
    case 'copilot-usage':
      return <CopilotUsagePanel />
    default:
      if (activeViewId.startsWith('schedule-detail:')) {
        const scheduleId = activeViewId.replace('schedule-detail:', '')
        return <ScheduleDetailPanel scheduleId={scheduleId} />
      }
      if (activeViewId.startsWith('job-detail:')) {
        const jobId = activeViewId.replace('job-detail:', '')
        return <JobDetailPanel jobId={jobId} />
      }
      if (activeViewId.startsWith('repo-detail:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-detail:', ''))
        if (parsed) return <RepoDetailPanel owner={parsed.owner} repo={parsed.repo} />
      }
      if (activeViewId.startsWith('repo-issues:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-issues:', ''))
        if (parsed) return <RepoIssueList owner={parsed.owner} repo={parsed.repo} />
      }
      if (activeViewId.startsWith('repo-prs:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-prs:', ''))
        if (parsed) return <RepoPullRequestList owner={parsed.owner} repo={parsed.repo} onOpenPR={onOpenTab} />
      }
      if (activeViewId.startsWith('copilot-result:')) {
        const resultId = activeViewId.replace('copilot-result:', '')
        return <CopilotResultPanel resultId={resultId} />
      }
      if (activeViewId.startsWith('pr-review:')) {
        try {
          const encoded = activeViewId.replace('pr-review:', '')
          const prInfo = JSON.parse(decodeURIComponent(encoded)) as PRReviewInfo
          return (
            <PRReviewPanel
              prInfo={prInfo}
              onSubmitted={(resultId) => onOpenTab(`copilot-result:${resultId}`)}
              onClose={() => onCloseView(activeViewId)}
            />
          )
        } catch {
          return <div className="content-placeholder"><p>Invalid PR review data</p></div>
        }
      }
      if (activeViewId.startsWith('pr-detail:')) {
        const route = parsePRDetailRoute(activeViewId)
        if (route) {
          return <PullRequestDetailPanel pr={route.pr} section={route.section} />
        }
        return <div className="content-placeholder"><p>Invalid PR detail data</p></div>
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
