import { lazy } from 'react'

export const featureRouteLoaders = {
  pullRequestList: () =>
    import('./PullRequestList').then(module => ({ default: module.PullRequestList })),
  scheduleDetail: () =>
    import('./automation/ScheduleDetailPanel').then(module => ({
      default: module.ScheduleDetailPanel,
    })),
  scheduleOverview: () =>
    import('./automation/ScheduleOverviewPanel').then(module => ({
      default: module.ScheduleOverviewPanel,
    })),
  jobDetail: () =>
    import('./automation/JobDetailPanel').then(module => ({ default: module.JobDetailPanel })),
  runList: () => import('./automation/RunList').then(module => ({ default: module.RunList })),
  settingsAccounts: () =>
    import('./settings/SettingsAccounts').then(module => ({ default: module.SettingsAccounts })),
  settingsAppearance: () =>
    import('./settings/SettingsAppearance').then(module => ({
      default: module.SettingsAppearance,
    })),
  settingsPullRequests: () =>
    import('./settings/SettingsPullRequests').then(module => ({
      default: module.SettingsPullRequests,
    })),
  settingsCopilot: () =>
    import('./settings/SettingsCopilot').then(module => ({ default: module.SettingsCopilot })),
  settingsNotifications: () =>
    import('./settings/SettingsNotifications').then(module => ({
      default: module.SettingsNotifications,
    })),
  settingsAdvanced: () =>
    import('./settings/SettingsAdvanced').then(module => ({ default: module.SettingsAdvanced })),
  settingsWeather: () =>
    import('./settings/SettingsWeather').then(module => ({ default: module.SettingsWeather })),
  repoDetail: () =>
    import('./RepoDetailPanel').then(module => ({ default: module.RepoDetailPanel })),
  repoCommitList: () =>
    import('./RepoCommitListPanel').then(module => ({ default: module.RepoCommitListPanel })),
  repoCommitDetail: () =>
    import('./RepoCommitDetailPanel').then(module => ({ default: module.RepoCommitDetailPanel })),
  repoIssueList: () =>
    import('./RepoIssueList').then(module => ({ default: module.RepoIssueList })),
  repoIssueDetail: () =>
    import('./RepoIssueDetailPanel').then(module => ({ default: module.RepoIssueDetailPanel })),
  repoPullRequests: () =>
    import('./RepoPullRequestList').then(module => ({ default: module.RepoPullRequestList })),
  pullRequestDetail: () =>
    import('./PullRequestDetailPanel').then(module => ({
      default: module.PullRequestDetailPanel,
    })),
  copilotPrompt: () =>
    import('./CopilotPromptBox').then(module => ({ default: module.CopilotPromptBox })),
  copilotResult: () =>
    import('./CopilotResultPanel').then(module => ({ default: module.CopilotResultPanel })),
  copilotResults: () =>
    import('./CopilotResultsList').then(module => ({ default: module.CopilotResultsList })),
  prReview: () => import('./PRReviewPanel').then(module => ({ default: module.PRReviewPanel })),
  copilotUsage: () =>
    import('./CopilotUsagePanel').then(module => ({ default: module.CopilotUsagePanel })),
  orgDetail: () => import('./OrgDetailPanel').then(module => ({ default: module.OrgDetailPanel })),
  userDetail: () =>
    import('./UserDetailPanel').then(module => ({ default: module.UserDetailPanel })),
  crewProject: () =>
    import('./crew/CrewProjectView').then(module => ({ default: module.CrewProjectView })),
  tempo: () =>
    import('./tempo/TempoDashboard').then(module => ({ default: module.TempoDashboard })),
  ralph: () =>
    import('./ralph-loops/RalphDashboard').then(module => ({ default: module.RalphDashboard })),
  ralphRun: () =>
    import('./ralph-loops/RalphRunDetailPanel').then(module => ({
      default: module.RalphRunDetailPanel,
    })),
  sessionExplorer: () =>
    import('./sessions/SessionExplorer').then(module => ({ default: module.SessionExplorer })),
  sessionDetail: () =>
    import('./sessions/SessionDetail').then(module => ({ default: module.SessionDetail })),
  taskPlanner: () =>
    import('./planner/TaskPlannerView').then(module => ({ default: module.TaskPlannerView })),
  bookmarks: () =>
    import('./bookmarks/BookmarkList').then(module => ({ default: module.BookmarkList })),
  browser: () => import('./BrowserTabView').then(module => ({ default: module.BrowserTabView })),
  folderExplorer: () =>
    import('./explorer/FolderExplorerView').then(module => ({
      default: module.FolderExplorerView,
    })),
  terminalWorkspace: () =>
    import('./terminal-workspace/TerminalWorkspaceView').then(module => ({
      default: module.TerminalWorkspaceView,
    })),
} as const

export const LazyPullRequestList = lazy(featureRouteLoaders.pullRequestList)
export const LazyScheduleDetailPanel = lazy(featureRouteLoaders.scheduleDetail)
export const LazyScheduleOverviewPanel = lazy(featureRouteLoaders.scheduleOverview)
export const LazyJobDetailPanel = lazy(featureRouteLoaders.jobDetail)
export const LazyRunList = lazy(featureRouteLoaders.runList)
export const LazySettingsAccounts = lazy(featureRouteLoaders.settingsAccounts)
export const LazySettingsAppearance = lazy(featureRouteLoaders.settingsAppearance)
export const LazySettingsPullRequests = lazy(featureRouteLoaders.settingsPullRequests)
export const LazySettingsCopilot = lazy(featureRouteLoaders.settingsCopilot)
export const LazySettingsNotifications = lazy(featureRouteLoaders.settingsNotifications)
export const LazySettingsAdvanced = lazy(featureRouteLoaders.settingsAdvanced)
export const LazySettingsWeather = lazy(featureRouteLoaders.settingsWeather)
export const LazyRepoDetailPanel = lazy(featureRouteLoaders.repoDetail)
export const LazyRepoCommitListPanel = lazy(featureRouteLoaders.repoCommitList)
export const LazyRepoCommitDetailPanel = lazy(featureRouteLoaders.repoCommitDetail)
export const LazyRepoIssueList = lazy(featureRouteLoaders.repoIssueList)
export const LazyRepoIssueDetailPanel = lazy(featureRouteLoaders.repoIssueDetail)
export const LazyRepoPullRequestList = lazy(featureRouteLoaders.repoPullRequests)
export const LazyPullRequestDetailPanel = lazy(featureRouteLoaders.pullRequestDetail)
export const LazyCopilotPromptBox = lazy(featureRouteLoaders.copilotPrompt)
export const LazyCopilotResultPanel = lazy(featureRouteLoaders.copilotResult)
export const LazyCopilotResultsList = lazy(featureRouteLoaders.copilotResults)
export const LazyPRReviewPanel = lazy(featureRouteLoaders.prReview)
export const LazyCopilotUsagePanel = lazy(featureRouteLoaders.copilotUsage)
export const LazyOrgDetailPanel = lazy(featureRouteLoaders.orgDetail)
export const LazyUserDetailPanel = lazy(featureRouteLoaders.userDetail)
export const LazyCrewProjectView = lazy(featureRouteLoaders.crewProject)
export const LazyTempoDashboard = lazy(featureRouteLoaders.tempo)
export const LazyRalphDashboard = lazy(featureRouteLoaders.ralph)
export const LazyRalphRunDetailPanel = lazy(featureRouteLoaders.ralphRun)
export const LazySessionExplorer = lazy(featureRouteLoaders.sessionExplorer)
export const LazySessionDetail = lazy(featureRouteLoaders.sessionDetail)
export const LazyTaskPlannerView = lazy(featureRouteLoaders.taskPlanner)
export const LazyBookmarkList = lazy(featureRouteLoaders.bookmarks)
export const LazyBrowserTabView = lazy(featureRouteLoaders.browser)
export const LazyFolderExplorerView = lazy(featureRouteLoaders.folderExplorer)
export const LazyTerminalWorkspaceView = lazy(featureRouteLoaders.terminalWorkspace)
