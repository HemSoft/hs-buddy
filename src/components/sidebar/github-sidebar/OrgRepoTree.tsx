import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Folder,
  FolderOpen,
  Star,
  GitCommit,
  GitPullRequest,
  Loader2,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Circle,
  MinusCircle,
  Users,
  UserRound,
} from 'lucide-react'
import type { OrgRepo, OrgMember, RepoCounts, RepoCommit, RepoIssue } from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus, SFLOverallStatus } from '../../../types/sflStatus'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { formatUpdatedAge } from './orgRepoTreeUtils'
import { prSubNodes, sectionIcons } from './prConstants'
import { dataCache } from '../../../services/dataCache'

interface OrgMeta {
  authenticatedAs: string
  isUserNamespace: boolean
}

interface OrgRepoTreeProps {
  uniqueOrgs: string[]
  orgRepos: Record<string, OrgRepo[]>
  orgMeta: Record<string, OrgMeta>
  orgMembers: Record<string, OrgMember[]>
  loadingOrgMembers: Set<string>
  expandedOrgUserGroups: Set<string>
  orgContributorCounts: Record<string, Record<string, number>>
  loadingOrgs: Set<string>
  expandedOrgs: Set<string>
  expandedRepos: Set<string>
  expandedRepoIssueGroups: Set<string>
  expandedRepoIssueStateGroups: Set<string>
  expandedRepoPRGroups: Set<string>
  expandedRepoPRStateGroups: Set<string>
  expandedRepoCommitGroups: Set<string>
  expandedPRNodes: Set<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: Set<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: Set<string>
  loadingRepoPRs: Set<string>
  loadingRepoIssues: Set<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: Set<string>
  expandedSFLGroups: Set<string>
  bookmarkedRepoKeys: Set<string>
  showBookmarkedOnly: boolean
  selectedItem: string | null
  refreshTick: number
  onToggleOrg: (org: string) => void
  onToggleOrgUserGroup: (org: string) => void
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
}

const SFL_STATUS_LABELS: Record<SFLOverallStatus, string> = {
  healthy: 'Healthy',
  'active-work': 'Active work',
  blocked: 'Blocked',
  'ready-for-review': 'Ready for review',
  'recent-failure': 'Recent failure',
  unknown: 'Unknown',
}

function sflOverallStatusIcon(status: SFLOverallStatus) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 size={12} className="sfl-status-icon sfl-status-success" />
    case 'active-work':
      return <Clock size={12} className="sfl-status-icon sfl-status-info" />
    case 'blocked':
      return <AlertTriangle size={12} className="sfl-status-icon sfl-status-warning" />
    case 'ready-for-review':
      return <CircleDot size={12} className="sfl-status-icon sfl-status-info" />
    case 'recent-failure':
      return <XCircle size={12} className="sfl-status-icon sfl-status-error" />
    default:
      return <Circle size={12} className="sfl-status-icon sfl-status-muted" />
  }
}

function sflWorkflowStateIcon(state: string, conclusion: string | null) {
  if (state !== 'active')
    return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" />
  if (!conclusion) return <Circle size={11} className="sfl-status-icon sfl-status-muted" />
  switch (conclusion) {
    case 'success':
      return <CheckCircle2 size={11} className="sfl-status-icon sfl-status-success" />
    case 'failure':
    case 'timed_out':
      return <XCircle size={11} className="sfl-status-icon sfl-status-error" />
    case 'skipped':
      return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" />
    default:
      return <Clock size={11} className="sfl-status-icon sfl-status-info" />
  }
}

export function OrgRepoTree({
  uniqueOrgs,
  orgRepos,
  orgMeta,
  orgMembers,
  loadingOrgMembers,
  expandedOrgUserGroups,
  orgContributorCounts,
  loadingOrgs,
  expandedOrgs,
  expandedRepos,
  expandedRepoIssueGroups,
  expandedRepoIssueStateGroups,
  expandedRepoPRGroups,
  expandedRepoPRStateGroups,
  expandedRepoCommitGroups,
  expandedPRNodes,
  repoCounts,
  loadingRepoCounts,
  repoPrTreeData,
  repoCommitTreeData,
  repoIssueTreeData,
  loadingRepoCommits,
  loadingRepoPRs,
  loadingRepoIssues,
  sflStatusData,
  loadingSFLStatus,
  expandedSFLGroups,
  bookmarkedRepoKeys,
  showBookmarkedOnly,
  selectedItem,
  refreshTick,
  onToggleOrg,
  onToggleOrgUserGroup,
  onToggleRepo,
  onToggleRepoIssueGroup,
  onToggleRepoIssueStateGroup,
  onToggleRepoPRGroup,
  onToggleRepoPRStateGroup,
  onToggleRepoCommitGroup,
  onToggleSFLGroup,
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
}: OrgRepoTreeProps) {
  return (
    <div className="sidebar-section-items">
      {uniqueOrgs.length === 0 ? (
        <div className="sidebar-item sidebar-item-empty">
          <span className="sidebar-item-label">No accounts configured</span>
        </div>
      ) : (
        uniqueOrgs.map(org => {
          const isOrgExpanded = expandedOrgs.has(org)
          const isLoading = loadingOrgs.has(org)
          const isOrgSelected = selectedItem === `org-detail:${org}`
          const repos = orgRepos[org] ?? []
          const members = orgMembers[org] ?? []
          const meta = orgMeta[org]
          const isUserGroupExpanded = expandedOrgUserGroups.has(org)
          const isUserGroupLoading = loadingOrgMembers.has(org)
          const contributorCounts = orgContributorCounts[org] ?? {}
          const filteredRepos = showBookmarkedOnly
            ? repos.filter(r => bookmarkedRepoKeys.has(`${org}/${r.name}`))
            : repos

          return (
            <div key={org} className="sidebar-org-group">
              <div
                className={`sidebar-item sidebar-item-disclosure sidebar-org-item ${isOrgSelected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect(`org-detail:${org}`)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect(`org-detail:${org}`)
                  }
                }}
              >
                <span
                  className="sidebar-item-chevron"
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation()
                    onToggleOrg(org)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onToggleOrg(org)
                    }
                  }}
                >
                  {isOrgExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="sidebar-item-icon">
                  {isOrgExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                </span>
                <span className="sidebar-item-label">{org}</span>
                {meta?.isUserNamespace && (
                  <span className="sidebar-namespace-badge" title="User account (not an org)">
                    user
                  </span>
                )}
                {isLoading && <Loader2 size={12} className="spin" />}
                {!isLoading && repos.length > 0 && (
                  <span className="sidebar-item-count">
                    {showBookmarkedOnly ? filteredRepos.length : repos.length}
                  </span>
                )}
              </div>
              {meta && !isLoading && (
                <div
                  className="sidebar-org-account"
                  title={`Authenticated via @${meta.authenticatedAs}`}
                >
                  via @{meta.authenticatedAs}
                </div>
              )}
              {isOrgExpanded && (
                <div className="sidebar-org-repos">
                  {isLoading ? (
                    <div className="sidebar-item sidebar-item-empty">
                      <Loader2 size={12} className="spin" />
                      <span className="sidebar-item-label">Loading repos...</span>
                    </div>
                  ) : (
                    <>
                      <div
                        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => onToggleOrgUserGroup(org)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onToggleOrgUserGroup(org)
                          }
                        }}
                      >
                        <span className="sidebar-item-chevron">
                          {isUserGroupExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">
                          <Users size={12} />
                        </span>
                        <span className="sidebar-item-label">Users</span>
                        {isUserGroupLoading ? (
                          <Loader2 size={10} className="spin" />
                        ) : members.length > 0 ? (
                          <span className="sidebar-item-count">{members.length}</span>
                        ) : null}
                      </div>
                      {isUserGroupExpanded && isUserGroupLoading && (
                        <div className="sidebar-org-users-list">
                          <div className="sidebar-item sidebar-pr-child">
                            <span className="sidebar-item-icon">
                              <Loader2 size={11} className="spin" />
                            </span>
                            <span className="sidebar-item-label">Loading users...</span>
                          </div>
                        </div>
                      )}
                      {isUserGroupExpanded && !isUserGroupLoading && members.length > 0 && (
                        <div className="sidebar-org-users-list">
                          {members.map(member => {
                            const userViewId = `org-user:${org}/${member.login}`
                            const userCommitCount = contributorCounts[member.login] ?? 0
                            return (
                              <div
                                key={userViewId}
                                className={`sidebar-item sidebar-org-user-child ${selectedItem === userViewId ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => onItemSelect(userViewId)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onItemSelect(userViewId)
                                  }
                                }}
                              >
                                <span className="sidebar-item-icon">
                                  <UserRound size={11} />
                                </span>
                                <span className="sidebar-item-label">{member.login}</span>
                                {userCommitCount > 0 && (
                                  <span className="sidebar-item-count">{userCommitCount}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {filteredRepos.length === 0 ? (
                        <div className="sidebar-item sidebar-item-empty">
                          <span className="sidebar-item-label">
                            {showBookmarkedOnly ? 'No bookmarked repos' : 'No repos found'}
                          </span>
                        </div>
                      ) : (
                        filteredRepos.map(repo => {
                      const isBookmarked = bookmarkedRepoKeys.has(`${org}/${repo.name}`)
                      const repoKey = `${org}/${repo.name}`
                      const isRepoExpanded = expandedRepos.has(repoKey)
                      const counts = repoCounts[repoKey]
                      const repoCountsEntry = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
                      const repoCountsUpdatedLabel = repoCountsEntry?.fetchedAt
                        ? formatUpdatedAge(repoCountsEntry.fetchedAt)
                        : null
                      const isCountLoading = loadingRepoCounts.has(repoKey)
                      const isCommitLoading = loadingRepoCommits.has(repoKey)
                      const openIssuesKey = `open:${repoKey}`
                      const closedIssuesKey = `closed:${repoKey}`
                      const openIssueGroupKey = `${repoKey}:open`
                      const closedIssueGroupKey = `${repoKey}:closed`
                      const openPrsKey = `open:${repoKey}`
                      const closedPrsKey = `closed:${repoKey}`
                      const openPrGroupKey = `${repoKey}:open`
                      const closedPrGroupKey = `${repoKey}:closed`
                      const isOpenIssuesLoading = loadingRepoIssues.has(openIssuesKey)
                      const isClosedIssuesLoading = loadingRepoIssues.has(closedIssuesKey)
                      const isOpenPRsLoading = loadingRepoPRs.has(openPrsKey)
                      const isClosedPRsLoading = loadingRepoPRs.has(closedPrsKey)
                      const isCommitSelected = selectedItem === `repo-commits:${repoKey}`
                      const isIssuesGroupExpanded = expandedRepoIssueGroups.has(repoKey)
                      const isIssueSelected =
                        selectedItem === `repo-issues:${repoKey}` && !isIssuesGroupExpanded
                      const isOpenIssueSelected = selectedItem === `repo-issues:${repoKey}`
                      const isClosedIssueSelected = selectedItem === `repo-issues-closed:${repoKey}`
                      const isPRGroupExpanded = expandedRepoPRGroups.has(repoKey)
                      const isPRSelected =
                        selectedItem === `repo-prs:${repoKey}` && !isPRGroupExpanded
                      const isOpenPRSelected = selectedItem === `repo-prs:${repoKey}`
                      const isClosedPRSelected = selectedItem === `repo-prs-closed:${repoKey}`

                      return (
                        <div key={repo.name} className="sidebar-repo-group">
                          <div
                            className="sidebar-item sidebar-item-disclosure sidebar-repo-item"
                            role="button"
                            tabIndex={0}
                            onClick={() => onToggleRepo(org, repo.name)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onToggleRepo(org, repo.name)
                              }
                            }}
                            title={repo.description || repo.fullName}
                          >
                            <span className="sidebar-item-chevron">
                              {isRepoExpanded ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </span>
                            <span className="sidebar-item-icon">
                              {isRepoExpanded ? <FolderOpen size={12} /> : <Folder size={12} />}
                            </span>
                            <span className="sidebar-item-label">{repo.name}</span>
                            {repo.language && (
                              <span className="sidebar-repo-lang">{repo.language}</span>
                            )}
                            <button
                              className={`sidebar-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                              onClick={e => onBookmarkToggle(e, org, repo.name, repo.url)}
                              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this repo'}
                            >
                              <Star size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                          {isRepoExpanded && (
                            <div className="sidebar-repo-children">
                              <div
                                className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-detail:${repoKey}` ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => onItemSelect(`repo-detail:${repoKey}`)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(`repo-detail:${repoKey}`); } }}
                              >
                                <span className="sidebar-item-icon">
                                  <FileText size={12} />
                                </span>
                                <span className="sidebar-item-label">Overview</span>
                              </div>
                              <div
                                className={`sidebar-item sidebar-item-disclosure sidebar-repo-child ${isCommitSelected ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  onItemSelect(`repo-commits:${repoKey}`)
                                  onToggleRepoCommitGroup(org, repo.name)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onItemSelect(`repo-commits:${repoKey}`)
                                    onToggleRepoCommitGroup(org, repo.name)
                                  }
                                }}
                              >
                                <span
                                  className="sidebar-item-chevron"
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onToggleRepoCommitGroup(org, repo.name)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      onToggleRepoCommitGroup(org, repo.name)
                                    }
                                  }}
                                >
                                  {expandedRepoCommitGroups.has(repoKey) ? (
                                    <ChevronDown size={12} />
                                  ) : (
                                    <ChevronRight size={12} />
                                  )}
                                </span>
                                <span className="sidebar-item-icon">
                                  <GitCommit size={12} />
                                </span>
                                <span className="sidebar-item-label">Commits</span>
                                {isCommitLoading ? (
                                  <Loader2 size={10} className="spin" />
                                ) : repoCommitTreeData[repoKey] ? (
                                  <span className="sidebar-item-count">
                                    {Math.min(repoCommitTreeData[repoKey].length, 25)}
                                  </span>
                                ) : null}
                              </div>
                              {expandedRepoCommitGroups.has(repoKey) && isCommitLoading && (
                                <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                  <div className="sidebar-job-items">
                                    <div className="sidebar-item sidebar-pr-child">
                                      <span className="sidebar-item-icon">
                                        <Loader2 size={11} className="spin" />
                                      </span>
                                      <span className="sidebar-item-label">Loading commits...</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {expandedRepoCommitGroups.has(repoKey) &&
                                !isCommitLoading &&
                                (repoCommitTreeData[repoKey] || []).length > 0 && (
                                  <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                    <div className="sidebar-job-items">
                                      {repoCommitTreeData[repoKey].slice(0, 10).map(commit => {
                                        const childViewId = `repo-commit:${repoKey}/${commit.sha}`
                                        return (
                                          <div
                                            key={childViewId}
                                            className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => onItemSelect(childViewId)}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(childViewId); } }}
                                            title={commit.message}
                                          >
                                            <span className="sidebar-item-icon">
                                              <GitCommit size={11} />
                                            </span>
                                            <span className="sidebar-item-label">
                                              {commit.message}
                                            </span>
                                            <span className="sidebar-pr-meta">
                                              {commit.sha.slice(0, 7)}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              <div
                                className={`sidebar-item sidebar-item-disclosure sidebar-repo-child ${isIssueSelected ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  onItemSelect(`repo-issues:${repoKey}`)
                                  onToggleRepoIssueGroup(org, repo.name)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onItemSelect(`repo-issues:${repoKey}`)
                                    onToggleRepoIssueGroup(org, repo.name)
                                  }
                                }}
                              >
                                <span
                                  className="sidebar-item-chevron"
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onToggleRepoIssueGroup(org, repo.name)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      onToggleRepoIssueGroup(org, repo.name)
                                    }
                                  }}
                                >
                                  {expandedRepoIssueGroups.has(repoKey) ? (
                                    <ChevronDown size={12} />
                                  ) : (
                                    <ChevronRight size={12} />
                                  )}
                                </span>
                                <span className="sidebar-item-icon">
                                  <CircleDot size={12} />
                                </span>
                                <span className="sidebar-item-label">Issues</span>
                                {isCountLoading ? (
                                  <Loader2 size={10} className="spin" />
                                ) : counts ? (
                                  <span className="sidebar-item-count">{counts.issues}</span>
                                ) : null}
                              </div>
                              {isIssuesGroupExpanded && (
                                <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                  <div className="sidebar-job-items">
                                    <div
                                      className={`sidebar-item sidebar-pr-child ${isOpenIssueSelected ? 'selected' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        onItemSelect(`repo-issues:${repoKey}`)
                                        onToggleRepoIssueStateGroup(org, repo.name, 'open')
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onItemSelect(`repo-issues:${repoKey}`)
                                          onToggleRepoIssueStateGroup(org, repo.name, 'open')
                                        }
                                      }}
                                    >
                                      <span
                                        className="sidebar-item-chevron"
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => {
                                          e.stopPropagation()
                                          onToggleRepoIssueStateGroup(org, repo.name, 'open')
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onToggleRepoIssueStateGroup(org, repo.name, 'open')
                                          }
                                        }}
                                      >
                                        {expandedRepoIssueStateGroups.has(openIssueGroupKey) ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </span>
                                      <span className="sidebar-item-icon">
                                        <CircleDot size={11} />
                                      </span>
                                      <span className="sidebar-item-label">Open</span>
                                      {isOpenIssuesLoading || isCountLoading ? (
                                        <Loader2 size={10} className="spin" />
                                      ) : counts ? (
                                        <span className="sidebar-item-count">{counts.issues}</span>
                                      ) : null}
                                    </div>
                                    {expandedRepoIssueStateGroups.has(openIssueGroupKey) &&
                                      isOpenIssuesLoading && (
                                        <div className="sidebar-pr-children">
                                          <div className="sidebar-item sidebar-pr-child">
                                            <span className="sidebar-item-icon">
                                              <Loader2 size={11} className="spin" />
                                            </span>
                                            <span className="sidebar-item-label">
                                              Loading issues...
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    {expandedRepoIssueStateGroups.has(openIssueGroupKey) &&
                                      !isOpenIssuesLoading &&
                                      (repoIssueTreeData[openIssuesKey] || []).length > 0 && (
                                        <div className="sidebar-pr-children">
                                          {repoIssueTreeData[openIssuesKey]
                                            .slice(0, 15)
                                            .map(issue =>
                                              (() => {
                                                const issueViewId = `repo-issue:${repoKey}/${issue.number}`
                                                return (
                                                  <div
                                                    key={`open-${issue.number}`}
                                                    className={`sidebar-item sidebar-pr-child ${selectedItem === issueViewId ? 'selected' : ''}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onItemSelect(issueViewId)}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(issueViewId); } }}
                                                    title={issue.title}
                                                  >
                                                    <span className="sidebar-item-icon">
                                                      <CircleDot size={10} />
                                                    </span>
                                                    <span className="sidebar-item-label">
                                                      #{issue.number} {issue.title}
                                                    </span>
                                                  </div>
                                                )
                                              })()
                                            )}
                                        </div>
                                      )}
                                    <div
                                      className={`sidebar-item sidebar-pr-child ${isClosedIssueSelected ? 'selected' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        onItemSelect(`repo-issues-closed:${repoKey}`)
                                        onToggleRepoIssueStateGroup(org, repo.name, 'closed')
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onItemSelect(`repo-issues-closed:${repoKey}`)
                                          onToggleRepoIssueStateGroup(org, repo.name, 'closed')
                                        }
                                      }}
                                    >
                                      <span
                                        className="sidebar-item-chevron"
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => {
                                          e.stopPropagation()
                                          onToggleRepoIssueStateGroup(org, repo.name, 'closed')
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onToggleRepoIssueStateGroup(org, repo.name, 'closed')
                                          }
                                        }}
                                      >
                                        {expandedRepoIssueStateGroups.has(closedIssueGroupKey) ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </span>
                                      <span className="sidebar-item-icon">
                                        <CheckCircle2 size={11} />
                                      </span>
                                      <span className="sidebar-item-label">Closed</span>
                                      {isClosedIssuesLoading ? (
                                        <Loader2 size={10} className="spin" />
                                      ) : null}
                                    </div>
                                    {expandedRepoIssueStateGroups.has(closedIssueGroupKey) &&
                                      isClosedIssuesLoading && (
                                        <div className="sidebar-pr-children">
                                          <div className="sidebar-item sidebar-pr-child">
                                            <span className="sidebar-item-icon">
                                              <Loader2 size={11} className="spin" />
                                            </span>
                                            <span className="sidebar-item-label">
                                              Loading issues...
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    {expandedRepoIssueStateGroups.has(closedIssueGroupKey) &&
                                      !isClosedIssuesLoading &&
                                      (repoIssueTreeData[closedIssuesKey] || []).length > 0 && (
                                        <div className="sidebar-pr-children">
                                          {repoIssueTreeData[closedIssuesKey]
                                            .slice(0, 15)
                                            .map(issue =>
                                              (() => {
                                                const issueViewId = `repo-issue:${repoKey}/${issue.number}`
                                                return (
                                                  <div
                                                    key={`closed-${issue.number}`}
                                                    className={`sidebar-item sidebar-pr-child ${selectedItem === issueViewId ? 'selected' : ''}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onItemSelect(issueViewId)}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(issueViewId); } }}
                                                    title={issue.title}
                                                  >
                                                    <span className="sidebar-item-icon">
                                                      <CheckCircle2 size={10} />
                                                    </span>
                                                    <span className="sidebar-item-label">
                                                      #{issue.number} {issue.title}
                                                    </span>
                                                  </div>
                                                )
                                              })()
                                            )}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              )}
                              <div
                                className={`sidebar-item sidebar-item-disclosure sidebar-repo-child sidebar-repo-pr-row ${isPRSelected ? 'selected' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  onItemSelect(`repo-prs:${repoKey}`)
                                  onToggleRepoPRGroup(org, repo.name)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onItemSelect(`repo-prs:${repoKey}`)
                                    onToggleRepoPRGroup(org, repo.name)
                                  }
                                }}
                              >
                                <span
                                  className="sidebar-item-chevron"
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation()
                                    onToggleRepoPRGroup(org, repo.name)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      onToggleRepoPRGroup(org, repo.name)
                                    }
                                  }}
                                >
                                  {expandedRepoPRGroups.has(repoKey) ? (
                                    <ChevronDown size={12} />
                                  ) : (
                                    <ChevronRight size={12} />
                                  )}
                                </span>
                                <span className="sidebar-item-icon">
                                  <GitPullRequest size={12} />
                                </span>
                                <span className="sidebar-item-label">Pull Requests</span>
                                {isCountLoading ? (
                                  <Loader2 size={10} className="spin" />
                                ) : counts ? (
                                  <span className="sidebar-item-count">{counts.prs}</span>
                                ) : null}
                                {!isCountLoading && repoCountsUpdatedLabel && (
                                  <span key={refreshTick} className="sidebar-item-updated-age">
                                    {repoCountsUpdatedLabel}
                                  </span>
                                )}
                              </div>
                              {isPRGroupExpanded && (
                                <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                  <div className="sidebar-job-items">
                                    <div
                                      className={`sidebar-item sidebar-pr-child ${isOpenPRSelected ? 'selected' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        onItemSelect(`repo-prs:${repoKey}`)
                                        onToggleRepoPRStateGroup(org, repo.name, 'open')
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onItemSelect(`repo-prs:${repoKey}`)
                                          onToggleRepoPRStateGroup(org, repo.name, 'open')
                                        }
                                      }}
                                    >
                                      <span
                                        className="sidebar-item-chevron"
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => {
                                          e.stopPropagation()
                                          onToggleRepoPRStateGroup(org, repo.name, 'open')
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onToggleRepoPRStateGroup(org, repo.name, 'open')
                                          }
                                        }}
                                      >
                                        {expandedRepoPRStateGroups.has(openPrGroupKey) ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </span>
                                      <span className="sidebar-item-icon">
                                        <GitPullRequest size={11} />
                                      </span>
                                      <span className="sidebar-item-label">Open</span>
                                      {isOpenPRsLoading || isCountLoading ? (
                                        <Loader2 size={10} className="spin" />
                                      ) : counts ? (
                                        <span className="sidebar-item-count">{counts.prs}</span>
                                      ) : null}
                                    </div>
                                    {expandedRepoPRStateGroups.has(openPrGroupKey) &&
                                      isOpenPRsLoading && (
                                        <div className="sidebar-pr-children">
                                          <div className="sidebar-item sidebar-pr-child">
                                            <span className="sidebar-item-icon">
                                              <Loader2 size={11} className="spin" />
                                            </span>
                                            <span className="sidebar-item-label">
                                              Loading pull requests...
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    {expandedRepoPRStateGroups.has(openPrGroupKey) &&
                                      !isOpenPRsLoading &&
                                      (repoPrTreeData[openPrsKey] || []).map(pr => {
                                        const prViewId = createPRDetailViewId(pr)
                                        const isSelected = selectedItem === prViewId
                                        return (
                                          <div
                                            key={`open-${repoKey}-${pr.source}-${pr.repository}-${pr.id}`}
                                            className="sidebar-pr-group sidebar-pr-children"
                                          >
                                            <div
                                              className={`sidebar-item sidebar-item-disclosure sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => onItemSelect(prViewId)}
                                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(prViewId); } }}
                                              onContextMenu={e => onContextMenu(e, pr)}
                                              title={pr.title}
                                            >
                                              <span
                                                className="sidebar-item-chevron"
                                                role="button"
                                                tabIndex={0}
                                                onClick={e => {
                                                  e.stopPropagation()
                                                  onTogglePRNode(prViewId)
                                                }}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    onTogglePRNode(prViewId)
                                                  }
                                                }}
                                              >
                                                {expandedPRNodes.has(prViewId) ? (
                                                  <ChevronDown size={12} />
                                                ) : (
                                                  <ChevronRight size={12} />
                                                )}
                                              </span>
                                              <span className="sidebar-item-icon">
                                                <GitPullRequest size={12} />
                                              </span>
                                              <span className="sidebar-item-label">
                                                #{pr.id} {pr.title}
                                              </span>
                                              <span className="sidebar-pr-meta">
                                                {pr.repository}
                                              </span>
                                            </div>
                                            {expandedPRNodes.has(prViewId) && (
                                              <div className="sidebar-pr-children">
                                                {prSubNodes.map(node => {
                                                  const childViewId = createPRDetailViewId(
                                                    pr,
                                                    node.key
                                                  )
                                                  const Icon = sectionIcons[node.key]
                                                  return (
                                                    <div
                                                      key={childViewId}
                                                      className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                                      role="button"
                                                      tabIndex={0}
                                                      onClick={() => onItemSelect(childViewId)}
                                                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(childViewId); } }}
                                                    >
                                                      <span className="sidebar-item-icon">
                                                        <Icon size={12} />
                                                      </span>
                                                      <span className="sidebar-item-label">
                                                        {node.label}
                                                      </span>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    <div
                                      className={`sidebar-item sidebar-pr-child ${isClosedPRSelected ? 'selected' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        onItemSelect(`repo-prs-closed:${repoKey}`)
                                        onToggleRepoPRStateGroup(org, repo.name, 'closed')
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onItemSelect(`repo-prs-closed:${repoKey}`)
                                          onToggleRepoPRStateGroup(org, repo.name, 'closed')
                                        }
                                      }}
                                    >
                                      <span
                                        className="sidebar-item-chevron"
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => {
                                          e.stopPropagation()
                                          onToggleRepoPRStateGroup(org, repo.name, 'closed')
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onToggleRepoPRStateGroup(org, repo.name, 'closed')
                                          }
                                        }}
                                      >
                                        {expandedRepoPRStateGroups.has(closedPrGroupKey) ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </span>
                                      <span className="sidebar-item-icon">
                                        <CheckCircle2 size={11} />
                                      </span>
                                      <span className="sidebar-item-label">Closed</span>
                                      {isClosedPRsLoading ? (
                                        <Loader2 size={10} className="spin" />
                                      ) : (repoPrTreeData[closedPrsKey] || []).length > 0 ? (
                                        <span className="sidebar-item-count">
                                          {repoPrTreeData[closedPrsKey].length}
                                        </span>
                                      ) : null}
                                    </div>
                                    {expandedRepoPRStateGroups.has(closedPrGroupKey) &&
                                      isClosedPRsLoading && (
                                        <div className="sidebar-pr-children">
                                          <div className="sidebar-item sidebar-pr-child">
                                            <span className="sidebar-item-icon">
                                              <Loader2 size={11} className="spin" />
                                            </span>
                                            <span className="sidebar-item-label">
                                              Loading pull requests...
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    {expandedRepoPRStateGroups.has(closedPrGroupKey) &&
                                      !isClosedPRsLoading &&
                                      (repoPrTreeData[closedPrsKey] || []).map(pr => {
                                        const prViewId = createPRDetailViewId(pr)
                                        const isSelected = selectedItem === prViewId
                                        return (
                                          <div
                                            key={`closed-${repoKey}-${pr.source}-${pr.repository}-${pr.id}`}
                                            className="sidebar-pr-group sidebar-pr-children"
                                          >
                                            <div
                                              className={`sidebar-item sidebar-item-disclosure sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => onItemSelect(prViewId)}
                                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(prViewId); } }}
                                              onContextMenu={e => onContextMenu(e, pr)}
                                              title={pr.title}
                                            >
                                              <span
                                                className="sidebar-item-chevron"
                                                role="button"
                                                tabIndex={0}
                                                onClick={e => {
                                                  e.stopPropagation()
                                                  onTogglePRNode(prViewId)
                                                }}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    onTogglePRNode(prViewId)
                                                  }
                                                }}
                                              >
                                                {expandedPRNodes.has(prViewId) ? (
                                                  <ChevronDown size={12} />
                                                ) : (
                                                  <ChevronRight size={12} />
                                                )}
                                              </span>
                                              <span className="sidebar-item-icon">
                                                <CheckCircle2 size={12} />
                                              </span>
                                              <span className="sidebar-item-label">
                                                #{pr.id} {pr.title}
                                              </span>
                                              <span className="sidebar-pr-meta">
                                                {pr.repository}
                                              </span>
                                            </div>
                                            {expandedPRNodes.has(prViewId) && (
                                              <div className="sidebar-pr-children">
                                                {prSubNodes.map(node => {
                                                  const childViewId = createPRDetailViewId(
                                                    pr,
                                                    node.key
                                                  )
                                                  const Icon = sectionIcons[node.key]
                                                  return (
                                                    <div
                                                      key={childViewId}
                                                      className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                                      role="button"
                                                      tabIndex={0}
                                                      onClick={() => onItemSelect(childViewId)}
                                                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(childViewId); } }}
                                                    >
                                                      <span className="sidebar-item-icon">
                                                        <Icon size={12} />
                                                      </span>
                                                      <span className="sidebar-item-label">
                                                        {node.label}
                                                      </span>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                  </div>
                                </div>
                              )}
                              {/* SFL Loop node */}
                              {(() => {
                                const sflStatus = sflStatusData[repoKey]
                                const isSFLLoading = loadingSFLStatus.has(repoKey)
                                const isSFLExpanded = expandedSFLGroups.has(repoKey)
                                if (!sflStatus || !sflStatus.isSFLEnabled) {
                                  if (isSFLLoading) {
                                    return (
                                      <div className="sidebar-item sidebar-item-disclosure sidebar-repo-child">
                                        <span className="sidebar-item-icon">
                                          <Activity size={12} />
                                        </span>
                                        <span className="sidebar-item-label">SFL Loop</span>
                                        <Loader2 size={10} className="spin" />
                                      </div>
                                    )
                                  }
                                  return null
                                }
                                return (
                                  <>
                                    <div
                                      className="sidebar-item sidebar-item-disclosure sidebar-repo-child"
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => onToggleSFLGroup(org, repo.name)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onToggleSFLGroup(org, repo.name)
                                        }
                                      }}
                                    >
                                      <span
                                        className="sidebar-item-chevron"
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => {
                                          e.stopPropagation()
                                          onToggleSFLGroup(org, repo.name)
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onToggleSFLGroup(org, repo.name)
                                          }
                                        }}
                                      >
                                        {isSFLExpanded ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                      </span>
                                      <span className="sidebar-item-icon">
                                        <Activity size={12} />
                                      </span>
                                      <span className="sidebar-item-label">SFL Loop</span>
                                      {isSFLLoading && <Loader2 size={10} className="spin" />}
                                      {sflStatus?.isSFLEnabled && !isSFLLoading && (
                                        <span
                                          className="sidebar-sfl-status-badge"
                                          title={SFL_STATUS_LABELS[sflStatus.overallStatus]}
                                        >
                                          {sflOverallStatusIcon(sflStatus.overallStatus)}
                                        </span>
                                      )}
                                    </div>
                                    {isSFLExpanded && sflStatus?.isSFLEnabled && (
                                      <div className="sidebar-job-tree sidebar-sfl-tree">
                                        <div className="sidebar-job-items">
                                          <div className="sidebar-item sidebar-job-item sidebar-sfl-summary">
                                            {sflOverallStatusIcon(sflStatus.overallStatus)}
                                            <span className="sidebar-item-label">
                                              {SFL_STATUS_LABELS[sflStatus.overallStatus]}
                                            </span>
                                            <span className="sidebar-item-count">
                                              {sflStatus.workflows.length}
                                            </span>
                                          </div>
                                          {sflStatus.workflows.map(wf => (
                                            <div
                                              key={wf.id}
                                              className="sidebar-item sidebar-job-item sidebar-sfl-workflow"
                                              title={`${wf.name} — ${wf.state === 'active' ? 'enabled' : 'disabled'}${wf.latestRun ? `, last: ${wf.latestRun.conclusion || wf.latestRun.status}` : ''}`}
                                            >
                                              {sflWorkflowStateIcon(
                                                wf.state,
                                                wf.latestRun?.conclusion ?? null
                                              )}
                                              <span className="sidebar-item-label">
                                                {wf.name.replace(/^SFL:\s*/i, '')}
                                              </span>
                                              {wf.state !== 'active' && (
                                                <span className="sidebar-sfl-disabled-badge">
                                                  off
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {isSFLExpanded && !sflStatus?.isSFLEnabled && !isSFLLoading && (
                                      <div className="sidebar-job-tree sidebar-sfl-tree">
                                        <div className="sidebar-job-items">
                                          <div className="sidebar-item sidebar-job-item sidebar-sfl-summary">
                                            <span className="sidebar-item-label">
                                              No SFL workflows detected
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )
                        })
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
