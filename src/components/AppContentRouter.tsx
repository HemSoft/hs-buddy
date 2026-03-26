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
import { RepoCommitListPanel } from './RepoCommitListPanel'
import { RepoCommitDetailPanel } from './RepoCommitDetailPanel'
import { RepoIssueList } from './RepoIssueList'
import { RepoIssueDetailPanel } from './RepoIssueDetailPanel'
import { RepoPullRequestList } from './RepoPullRequestList'
import { PullRequestDetailPanel } from './PullRequestDetailPanel'
import { CopilotPromptBox } from './CopilotPromptBox'
import { CopilotResultPanel } from './CopilotResultPanel'
import { CopilotResultsList } from './CopilotResultsList'
import { PRReviewPanel, parsePRReviewInfo } from './PRReviewPanel'
import { CopilotUsagePanel } from './CopilotUsagePanel'
import { OrgDetailPanel } from './OrgDetailPanel'
import { UserDetailPanel } from './UserDetailPanel'
import { CrewProjectView } from './crew/CrewProjectView'
import { TempoDashboard } from './tempo/TempoDashboard'
import { parsePRDetailRoute } from '../utils/prDetailView'
import { viewLabels } from './appContentViewLabels'

function parseOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const slashIdx = slug.indexOf('/')
  if (slashIdx <= 0) return null
  return { owner: slug.substring(0, slashIdx), repo: slug.substring(slashIdx + 1) }
}

function parseOrgMemberRoute(slug: string): { org: string; memberLogin: string } | null {
  const slashIdx = slug.indexOf('/')
  if (slashIdx <= 0) return null
  return { org: slug.substring(0, slashIdx), memberLogin: slug.substring(slashIdx + 1) }
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
      return (
        <PullRequestList
          mode="my-prs"
          onCountChange={count => onPRCountChange('pr-my-prs', count)}
        />
      )
    case 'pr-needs-review':
      return (
        <PullRequestList
          mode="needs-review"
          onCountChange={count => onPRCountChange('pr-needs-review', count)}
        />
      )
    case 'pr-recently-merged':
      return (
        <PullRequestList
          mode="recently-merged"
          onCountChange={count => onPRCountChange('pr-recently-merged', count)}
        />
      )
    case 'pr-need-a-nudge':
      return (
        <PullRequestList
          mode="need-a-nudge"
          onCountChange={count => onPRCountChange('pr-need-a-nudge', count)}
        />
      )
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
    case 'tempo-timesheet':
      return <TempoDashboard />
    default:
      if (activeViewId.startsWith('crew-project:')) {
        const projectId = activeViewId.replace('crew-project:', '')
        return <CrewProjectView projectId={projectId} />
      }
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
      if (activeViewId.startsWith('org-user:')) {
        const parsed = parseOrgMemberRoute(activeViewId.replace('org-user:', ''))
        if (parsed) {
          return <UserDetailPanel org={parsed.org} memberLogin={parsed.memberLogin} />
        }
      }
      if (activeViewId.startsWith('org-detail:')) {
        const org = activeViewId.replace('org-detail:', '')
        if (org) return <OrgDetailPanel org={org} />
      }
      if (activeViewId.startsWith('repo-commits:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-commits:', ''))
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
      if (activeViewId.startsWith('repo-commit:')) {
        const parsed = parseRepoCommitRoute(activeViewId.replace('repo-commit:', ''))
        if (parsed)
          return <RepoCommitDetailPanel owner={parsed.owner} repo={parsed.repo} sha={parsed.sha} />
      }
      if (activeViewId.startsWith('repo-issues-closed:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-issues-closed:', ''))
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
      if (activeViewId.startsWith('repo-issue:')) {
        const parsed = parseRepoIssueRoute(activeViewId.replace('repo-issue:', ''))
        if (parsed)
          return (
            <RepoIssueDetailPanel
              owner={parsed.owner}
              repo={parsed.repo}
              issueNumber={parsed.issueNumber}
            />
          )
      }
      if (activeViewId.startsWith('repo-issues:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-issues:', ''))
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
      if (activeViewId.startsWith('repo-prs-closed:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-prs-closed:', ''))
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
      if (activeViewId.startsWith('repo-prs:')) {
        const parsed = parseOwnerRepo(activeViewId.replace('repo-prs:', ''))
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
