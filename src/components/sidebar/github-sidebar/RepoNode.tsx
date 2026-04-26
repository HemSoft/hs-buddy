import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Folder,
  FolderOpen,
  GitCommit,
  GitPullRequest,
  Loader2,
  Star,
} from 'lucide-react'
import type { OrgRepo, RepoCommit, RepoCounts, RepoIssue } from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { formatUpdatedAge } from './orgRepoTreeUtils'
import { prSubNodes, sectionIcons } from './prConstants'
import {
  SFL_STATUS_LABELS,
  sflOverallStatusIcon,
  sflWorkflowStateIcon,
  handleItemKeyDown,
  sidebarItemClass,
} from './repoNodeUtils'

interface RepoNodeProps {
  org: string
  repo: OrgRepo
  bookmarkedRepoKeys: ReadonlySet<string>
  expandedRepos: ReadonlySet<string>
  expandedRepoIssueGroups: ReadonlySet<string>
  expandedRepoIssueStateGroups: ReadonlySet<string>
  expandedRepoPRGroups: ReadonlySet<string>
  expandedRepoPRStateGroups: ReadonlySet<string>
  expandedRepoCommitGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: ReadonlySet<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: ReadonlySet<string>
  loadingRepoPRs: ReadonlySet<string>
  loadingRepoIssues: ReadonlySet<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: ReadonlySet<string>
  expandedSFLGroups: ReadonlySet<string>
  selectedItem: string | null
  refreshTick: number
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

interface RepoHeaderProps {
  org: string
  repo: OrgRepo
  isBookmarked: boolean
  isRepoExpanded: boolean
  onToggleRepo: (org: string, repoName: string) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
}

function DisclosureIcons({ expanded }: { expanded: boolean }) {
  return (
    <>
      <span className="sidebar-item-chevron">
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      <span className="sidebar-item-icon">
        {expanded ? <FolderOpen size={12} /> : <Folder size={12} />}
      </span>
    </>
  )
}

function RepoHeader({
  org,
  repo,
  isBookmarked,
  isRepoExpanded,
  onToggleRepo,
  onBookmarkToggle,
}: RepoHeaderProps) {
  return (
    <div
      className="sidebar-item sidebar-item-disclosure sidebar-repo-item"
      role="button"
      tabIndex={0}
      onClick={() => onToggleRepo(org, repo.name)}
      onKeyDown={event => handleItemKeyDown(event, () => onToggleRepo(org, repo.name))}
      title={repo.description || repo.fullName}
    >
      <DisclosureIcons expanded={isRepoExpanded} />
      <span className="sidebar-item-label">{repo.name}</span>
      {repo.language && <span className="sidebar-repo-lang">{repo.language}</span>}
      <button
        className={`sidebar-bookmark-btn ${isBookmarked ? 'active' : ''}`}
        onClick={event => onBookmarkToggle(event, org, repo.name, repo.url)}
        title={isBookmarked ? 'Remove bookmark' : 'Bookmark this repo'}
      >
        <Star size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

interface RepoOverviewItemProps {
  repoKey: string
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}

function RepoOverviewItem({ repoKey, selectedItem, onItemSelect }: RepoOverviewItemProps) {
  const detailViewId = `repo-detail:${repoKey}`

  return (
    <div
      className={`sidebar-item sidebar-repo-child ${selectedItem === detailViewId ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onItemSelect(detailViewId)}
      onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(detailViewId))}
    >
      <span className="sidebar-item-icon">
        <FileText size={12} />
      </span>
      <span className="sidebar-item-label">Overview</span>
    </div>
  )
}

function CommitCountBadge({ loading, count }: { loading: boolean; count: number }) {
  if (loading) return <Loader2 size={10} className="spin" />
  if (count > 0) return <span className="sidebar-item-count">{Math.min(count, 25)}</span>
  return null
}

interface RepoCommitsSectionProps {
  org: string
  repoName: string
  repoKey: string
  expandedRepoCommitGroups: ReadonlySet<string>
  repoCommitTreeData: Record<string, RepoCommit[]>
  loading: boolean
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
}

function CommitsSectionContent({
  isExpanded,
  loading,
  commits,
  repoKey,
  selectedItem,
  onItemSelect,
}: {
  isExpanded: boolean
  loading: boolean
  commits: RepoCommit[]
  repoKey: string
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  if (!isExpanded) return null
  if (loading) {
    return (
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
    )
  }
  if (commits.length === 0) return null
  return (
    <div className="sidebar-job-tree sidebar-repo-pr-tree">
      <div className="sidebar-job-items">
        {commits.slice(0, 10).map(commit => {
          const childViewId = `repo-commit:${repoKey}/${commit.sha}`
          return (
            <div
              key={childViewId}
              className={sidebarItemClass(
                'sidebar-item sidebar-pr-child',
                selectedItem === childViewId
              )}
              role="button"
              tabIndex={0}
              onClick={() => onItemSelect(childViewId)}
              onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(childViewId))}
              title={commit.message}
            >
              <span className="sidebar-item-icon">
                <GitCommit size={11} />
              </span>
              <span className="sidebar-item-label">{commit.message}</span>
              <span className="sidebar-pr-meta">{commit.sha.slice(0, 7)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RepoCommitsSection({
  org,
  repoName,
  repoKey,
  expandedRepoCommitGroups,
  repoCommitTreeData,
  loading,
  selectedItem,
  onItemSelect,
  onToggleRepoCommitGroup,
}: RepoCommitsSectionProps) {
  const commitViewId = `repo-commits:${repoKey}`
  const isExpanded = expandedRepoCommitGroups.has(repoKey)
  const commits = repoCommitTreeData[repoKey] || []

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass(
          'sidebar-item sidebar-item-disclosure sidebar-repo-child',
          selectedItem === commitViewId
        )}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => {
          onItemSelect(commitViewId)
          onToggleRepoCommitGroup(org, repoName)
        }}
        onKeyDown={event =>
          handleItemKeyDown(event, () => {
            onItemSelect(commitViewId)
            onToggleRepoCommitGroup(org, repoName)
          })
        }
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggleRepoCommitGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoCommitGroup(org, repoName), true)
          }
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <GitCommit size={12} />
        </span>
        <span className="sidebar-item-label">Commits</span>
        <CommitCountBadge loading={loading} count={commits.length} />
      </div>
      <CommitsSectionContent
        isExpanded={isExpanded}
        loading={loading}
        commits={commits}
        repoKey={repoKey}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    </>
  )
}

interface RepoIssuesSectionProps {
  org: string
  repoName: string
  repoKey: string
  counts?: RepoCounts
  expandedRepoIssueGroups: ReadonlySet<string>
  expandedRepoIssueStateGroups: ReadonlySet<string>
  repoIssueTreeData: Record<string, RepoIssue[]>
  isCountLoading: boolean
  isOpenIssuesLoading: boolean
  isClosedIssuesLoading: boolean
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
}

function IssueListItems({
  issues,
  repoKey,
  selectedItem,
  onItemSelect,
  keyPrefix,
  icon: Icon,
}: {
  issues: RepoIssue[]
  repoKey: string
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  keyPrefix: string
  icon: typeof CircleDot
}) {
  return (
    <div className="sidebar-pr-children">
      {issues.slice(0, 15).map(issue => {
        const issueViewId = `repo-issue:${repoKey}/${issue.number}`
        return (
          <div
            key={`${keyPrefix}-${issue.number}`}
            className={`sidebar-item sidebar-pr-child ${selectedItem === issueViewId ? 'selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onItemSelect(issueViewId)}
            onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(issueViewId))}
            title={issue.title}
          >
            <span className="sidebar-item-icon">
              <Icon size={10} />
            </span>
            <span className="sidebar-item-label">
              #{issue.number} {issue.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function IssueStateCountBadge({
  isOpen,
  isLoading,
  isCountLoading,
  counts,
}: {
  isOpen: boolean
  isLoading: boolean
  isCountLoading: boolean
  counts?: RepoCounts
}) {
  if (isOpen) {
    if (isLoading || isCountLoading) return <Loader2 size={10} className="spin" />
    if (counts) return <span className="sidebar-item-count">{counts.issues}</span>
    return null
  }
  if (isLoading) return <Loader2 size={10} className="spin" />
  return null
}

const ISSUE_STATE_CONFIG = {
  open: { Icon: CircleDot, label: 'Open' },
  closed: { Icon: CheckCircle2, label: 'Closed' },
} as const

function IssueStateGroupExpanded({
  isExpanded,
  isLoading,
  issues,
  repoKey,
  state,
  selectedItem,
  onItemSelect,
  Icon,
}: {
  isExpanded: boolean
  isLoading: boolean
  issues: RepoIssue[]
  repoKey: string
  state: 'open' | 'closed'
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  Icon: typeof CircleDot
}) {
  if (!isExpanded) return null
  if (isLoading) {
    return (
      <div className="sidebar-pr-children">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-icon">
            <Loader2 size={11} className="spin" />
          </span>
          <span className="sidebar-item-label">Loading issues...</span>
        </div>
      </div>
    )
  }
  if (issues.length === 0) return null
  return (
    <IssueListItems
      issues={issues}
      repoKey={repoKey}
      selectedItem={selectedItem}
      onItemSelect={onItemSelect}
      keyPrefix={state}
      icon={Icon}
    />
  )
}

function IssueStateGroup({
  org,
  repoName,
  repoKey,
  state,
  viewId,
  isExpanded,
  isLoading,
  isCountLoading,
  counts,
  issues,
  selectedItem,
  onItemSelect,
  onToggle,
}: {
  org: string
  repoName: string
  repoKey: string
  state: 'open' | 'closed'
  viewId: string
  isExpanded: boolean
  isLoading: boolean
  isCountLoading: boolean
  counts?: RepoCounts
  issues: RepoIssue[]
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onToggle: (org: string, repoName: string, state: 'open' | 'closed') => void
}) {
  const { Icon, label } = ISSUE_STATE_CONFIG[state]

  return (
    <>
      <div
        /* v8 ignore start */
        className={`sidebar-item sidebar-pr-child ${selectedItem === viewId ? 'selected' : ''}`}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => {
          onItemSelect(viewId)
          onToggle(org, repoName, state)
        }}
        onKeyDown={event =>
          handleItemKeyDown(event, () => {
            onItemSelect(viewId)
            onToggle(org, repoName, state)
          })
        }
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggle(org, repoName, state)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggle(org, repoName, state), true)}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <Icon size={11} />
        </span>
        <span className="sidebar-item-label">{label}</span>
        <IssueStateCountBadge
          isOpen={state === 'open'}
          isLoading={isLoading}
          isCountLoading={isCountLoading}
          counts={counts}
        />
      </div>
      <IssueStateGroupExpanded
        isExpanded={isExpanded}
        isLoading={isLoading}
        issues={issues}
        repoKey={repoKey}
        state={state}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
        Icon={Icon}
      />
    </>
  )
}

function SectionCountBadge({ isCountLoading, count }: { isCountLoading: boolean; count?: number }) {
  if (isCountLoading) return <Loader2 size={10} className="spin" />
  if (count != null) return <span className="sidebar-item-count">{count}</span>
  return null
}

function RepoIssuesSection({
  org,
  repoName,
  repoKey,
  counts,
  expandedRepoIssueGroups,
  expandedRepoIssueStateGroups,
  repoIssueTreeData,
  isCountLoading,
  isOpenIssuesLoading,
  isClosedIssuesLoading,
  selectedItem,
  onItemSelect,
  onToggleRepoIssueGroup,
  onToggleRepoIssueStateGroup,
}: RepoIssuesSectionProps) {
  const issuesViewId = `repo-issues:${repoKey}`
  const closedIssuesViewId = `repo-issues-closed:${repoKey}`
  const openIssuesKey = `open:${repoKey}`
  const closedIssuesKey = `closed:${repoKey}`
  const openIssueGroupKey = `${repoKey}:open`
  const closedIssueGroupKey = `${repoKey}:closed`
  const isExpanded = expandedRepoIssueGroups.has(repoKey)
  /* v8 ignore start */
  const isSelected = selectedItem === issuesViewId && !isExpanded
  /* v8 ignore stop */

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass(
          'sidebar-item sidebar-item-disclosure sidebar-repo-child',
          isSelected
        )}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => {
          onItemSelect(issuesViewId)
          onToggleRepoIssueGroup(org, repoName)
        }}
        onKeyDown={event =>
          handleItemKeyDown(event, () => {
            onItemSelect(issuesViewId)
            onToggleRepoIssueGroup(org, repoName)
          })
        }
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggleRepoIssueGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoIssueGroup(org, repoName), true)
          }
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <CircleDot size={12} />
        </span>
        <span className="sidebar-item-label">Issues</span>
        <SectionCountBadge isCountLoading={isCountLoading} count={counts?.issues} />
      </div>
      {isExpanded && (
        <div className="sidebar-job-tree sidebar-repo-pr-tree">
          <div className="sidebar-job-items">
            <IssueStateGroup
              org={org}
              repoName={repoName}
              repoKey={repoKey}
              state="open"
              viewId={issuesViewId}
              isExpanded={expandedRepoIssueStateGroups.has(openIssueGroupKey)}
              isLoading={isOpenIssuesLoading}
              isCountLoading={isCountLoading}
              counts={counts}
              issues={repoIssueTreeData[openIssuesKey] || []}
              selectedItem={selectedItem}
              onItemSelect={onItemSelect}
              onToggle={onToggleRepoIssueStateGroup}
            />
            <IssueStateGroup
              org={org}
              repoName={repoName}
              repoKey={repoKey}
              state="closed"
              viewId={closedIssuesViewId}
              isExpanded={expandedRepoIssueStateGroups.has(closedIssueGroupKey)}
              isLoading={isClosedIssuesLoading}
              isCountLoading={isCountLoading}
              counts={counts}
              issues={repoIssueTreeData[closedIssuesKey] || []}
              selectedItem={selectedItem}
              onItemSelect={onItemSelect}
              onToggle={onToggleRepoIssueStateGroup}
            />
          </div>
        </div>
      )}
    </>
  )
}

interface RepoPullRequestsSectionProps {
  org: string
  repoName: string
  repoKey: string
  counts?: RepoCounts
  repoCountsUpdatedLabel: string | null
  refreshTick: number
  expandedRepoPRGroups: ReadonlySet<string>
  expandedRepoPRStateGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  repoPrTreeData: Record<string, PullRequest[]>
  isCountLoading: boolean
  isOpenPRsLoading: boolean
  isClosedPRsLoading: boolean
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}

function PRStateCountBadge({
  isOpen,
  isLoading,
  isCountLoading,
  counts,
  closedCount,
}: {
  isOpen: boolean
  isLoading: boolean
  isCountLoading: boolean
  counts?: RepoCounts
  closedCount: number
}) {
  if (isOpen) {
    if (isLoading || isCountLoading) return <Loader2 size={10} className="spin" />
    if (counts) return <span className="sidebar-item-count">{counts.prs}</span>
    return null
  }
  if (isLoading) return <Loader2 size={10} className="spin" />
  if (closedCount > 0) return <span className="sidebar-item-count">{closedCount}</span>
  return null
}

function PRStateGroupContent({
  isExpanded,
  isLoading,
  prs,
  repoKey,
  expandedPRNodes,
  selectedItem,
  onItemSelect,
  onTogglePRNode,
  onContextMenu,
  isClosed,
}: {
  isExpanded: boolean
  isLoading: boolean
  prs: PullRequest[]
  repoKey: string
  expandedPRNodes: ReadonlySet<string>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  isClosed: boolean
}) {
  if (!isExpanded) return null
  if (isLoading) {
    return (
      <div className="sidebar-pr-children">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-icon">
            <Loader2 size={11} className="spin" />
          </span>
          <span className="sidebar-item-label">Loading pull requests...</span>
        </div>
      </div>
    )
  }
  return (
    <>
      {/* v8 ignore start */}
      {prs.map(pr =>
        /* v8 ignore stop */
        renderPRNode(
          pr,
          repoKey,
          expandedPRNodes,
          selectedItem,
          onItemSelect,
          onTogglePRNode,
          onContextMenu,
          isClosed
        )
      )}
    </>
  )
}

function PRStateGroup({
  org,
  repoName,
  repoKey,
  state,
  viewId,
  isExpanded,
  isLoading,
  isCountLoading,
  counts,
  prs,
  expandedPRNodes,
  selectedItem,
  onItemSelect,
  onToggle,
  onTogglePRNode,
  onContextMenu,
}: {
  org: string
  repoName: string
  repoKey: string
  state: 'open' | 'closed'
  viewId: string
  isExpanded: boolean
  isLoading: boolean
  isCountLoading: boolean
  counts?: RepoCounts
  prs: PullRequest[]
  expandedPRNodes: ReadonlySet<string>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onToggle: (org: string, repoName: string, state: 'open' | 'closed') => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}) {
  const isOpen = state === 'open'
  const Icon = isOpen ? GitPullRequest : CheckCircle2
  const label = isOpen ? 'Open' : 'Closed'

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass('sidebar-item sidebar-pr-child', selectedItem === viewId)}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => {
          onItemSelect(viewId)
          onToggle(org, repoName, state)
        }}
        onKeyDown={event =>
          handleItemKeyDown(event, () => {
            onItemSelect(viewId)
            onToggle(org, repoName, state)
          })
        }
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggle(org, repoName, state)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggle(org, repoName, state), true)}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <Icon size={11} />
        </span>
        <span className="sidebar-item-label">{label}</span>
        <PRStateCountBadge
          isOpen={isOpen}
          isLoading={isLoading}
          isCountLoading={isCountLoading}
          counts={counts}
          closedCount={prs.length}
        />
      </div>
      <PRStateGroupContent
        isExpanded={isExpanded}
        isLoading={isLoading}
        prs={prs}
        repoKey={repoKey}
        expandedPRNodes={expandedPRNodes}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
        onTogglePRNode={onTogglePRNode}
        onContextMenu={onContextMenu}
        isClosed={!isOpen}
      />
    </>
  )
}

function UpdatedAgeLabel({
  isCountLoading,
  label,
  refreshTick,
}: {
  isCountLoading: boolean
  label: string | null
  refreshTick: number
}) {
  if (isCountLoading || !label) return null
  return (
    <span key={refreshTick} className="sidebar-item-updated-age">
      {label}
    </span>
  )
}

function RepoPullRequestsSection({
  org,
  repoName,
  repoKey,
  counts,
  repoCountsUpdatedLabel,
  refreshTick,
  expandedRepoPRGroups,
  expandedRepoPRStateGroups,
  expandedPRNodes,
  repoPrTreeData,
  isCountLoading,
  isOpenPRsLoading,
  isClosedPRsLoading,
  selectedItem,
  onItemSelect,
  onToggleRepoPRGroup,
  onToggleRepoPRStateGroup,
  onTogglePRNode,
  onContextMenu,
}: RepoPullRequestsSectionProps) {
  const prsViewId = `repo-prs:${repoKey}`
  const closedPrsViewId = `repo-prs-closed:${repoKey}`
  const openPrsKey = `open:${repoKey}`
  const closedPrsKey = `closed:${repoKey}`
  const openPrGroupKey = `${repoKey}:open`
  const closedPrGroupKey = `${repoKey}:closed`
  const isExpanded = expandedRepoPRGroups.has(repoKey)
  /* v8 ignore start */
  const isSelected = selectedItem === prsViewId && !isExpanded
  /* v8 ignore stop */

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass(
          'sidebar-item sidebar-item-disclosure sidebar-repo-child sidebar-repo-pr-row',
          isSelected
        )}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => {
          onItemSelect(prsViewId)
          onToggleRepoPRGroup(org, repoName)
        }}
        onKeyDown={event =>
          handleItemKeyDown(event, () => {
            onItemSelect(prsViewId)
            onToggleRepoPRGroup(org, repoName)
          })
        }
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggleRepoPRGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoPRGroup(org, repoName), true)
          }
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <GitPullRequest size={12} />
        </span>
        <span className="sidebar-item-label">Pull Requests</span>
        <SectionCountBadge isCountLoading={isCountLoading} count={counts?.prs} />
        <UpdatedAgeLabel
          isCountLoading={isCountLoading}
          label={repoCountsUpdatedLabel}
          refreshTick={refreshTick}
        />
      </div>
      {isExpanded && (
        <div className="sidebar-job-tree sidebar-repo-pr-tree">
          <div className="sidebar-job-items">
            <PRStateGroup
              org={org}
              repoName={repoName}
              repoKey={repoKey}
              state="open"
              viewId={prsViewId}
              isExpanded={expandedRepoPRStateGroups.has(openPrGroupKey)}
              isLoading={isOpenPRsLoading}
              isCountLoading={isCountLoading}
              counts={counts}
              prs={repoPrTreeData[openPrsKey] || []}
              expandedPRNodes={expandedPRNodes}
              selectedItem={selectedItem}
              onItemSelect={onItemSelect}
              onToggle={onToggleRepoPRStateGroup}
              onTogglePRNode={onTogglePRNode}
              onContextMenu={onContextMenu}
            />
            <PRStateGroup
              org={org}
              repoName={repoName}
              repoKey={repoKey}
              state="closed"
              viewId={closedPrsViewId}
              isExpanded={expandedRepoPRStateGroups.has(closedPrGroupKey)}
              isLoading={isClosedPRsLoading}
              isCountLoading={isCountLoading}
              counts={counts}
              prs={repoPrTreeData[closedPrsKey] || []}
              expandedPRNodes={expandedPRNodes}
              selectedItem={selectedItem}
              onItemSelect={onItemSelect}
              onToggle={onToggleRepoPRStateGroup}
              onTogglePRNode={onTogglePRNode}
              onContextMenu={onContextMenu}
            />
          </div>
        </div>
      )}
    </>
  )
}

interface RepoSFLSectionProps {
  org: string
  repoName: string
  sflStatus?: SFLRepoStatus
  isLoading: boolean
  isExpanded: boolean
  onToggleSFLGroup: (org: string, repoName: string) => void
}

function RepoSFLSection({
  org,
  repoName,
  sflStatus,
  isLoading,
  isExpanded,
  onToggleSFLGroup,
}: RepoSFLSectionProps) {
  if (!sflStatus?.isSFLEnabled) {
    return isLoading ? (
      <div className="sidebar-item sidebar-item-disclosure sidebar-repo-child">
        <span className="sidebar-item-icon">
          <Activity size={12} />
        </span>
        <span className="sidebar-item-label">SFL Loop</span>
        <Loader2 size={10} className="spin" />
      </div>
    ) : null
  }

  return (
    <>
      <div
        className="sidebar-item sidebar-item-disclosure sidebar-repo-child"
        role="button"
        tabIndex={0}
        onClick={() => onToggleSFLGroup(org, repoName)}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleSFLGroup(org, repoName))}
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onToggleSFLGroup(org, repoName)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggleSFLGroup(org, repoName), true)}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <Activity size={12} />
        </span>
        <span className="sidebar-item-label">SFL Loop</span>
        {/* v8 ignore start */}
        {isLoading ? (
          <Loader2 size={10} className="spin" />
        ) : (
          /* v8 ignore stop */
          <span
            className="sidebar-sfl-status-badge"
            title={SFL_STATUS_LABELS[sflStatus.overallStatus]}
          >
            {sflOverallStatusIcon(sflStatus.overallStatus)}
          </span>
        )}
      </div>
      {isExpanded && (
        <div className="sidebar-job-tree sidebar-sfl-tree">
          <div className="sidebar-job-items">
            <div className="sidebar-item sidebar-job-item sidebar-sfl-summary">
              {sflOverallStatusIcon(sflStatus.overallStatus)}
              <span className="sidebar-item-label">
                {SFL_STATUS_LABELS[sflStatus.overallStatus]}
              </span>
              <span className="sidebar-item-count">{sflStatus.workflows.length}</span>
            </div>
            {sflStatus.workflows.map(wf => (
              <div
                key={wf.id}
                className="sidebar-item sidebar-job-item sidebar-sfl-workflow"
                /* v8 ignore start */
                title={`${wf.name} — ${wf.state === 'active' ? 'enabled' : 'disabled'}${wf.latestRun ? `, last: ${wf.latestRun.conclusion || wf.latestRun.status}` : ''}`}
                /* v8 ignore stop */
              >
                {sflWorkflowStateIcon(wf.state, wf.latestRun?.conclusion ?? null)}
                <span className="sidebar-item-label">{wf.name.replace(/^SFL:\s*/i, '')}</span>
                {wf.state !== 'active' && <span className="sidebar-sfl-disabled-badge">off</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function renderPRNode(
  pr: PullRequest,
  repoKey: string,
  expandedPRNodes: ReadonlySet<string>,
  selectedItem: string | null,
  onItemSelect: (itemId: string) => void,
  onTogglePRNode: (prViewId: string) => void,
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void,
  closed = false
) {
  const prViewId = createPRDetailViewId(pr)
  const isSelected = selectedItem === prViewId
  const icon = closed ? <CheckCircle2 size={12} /> : <GitPullRequest size={12} />

  return (
    <div
      key={`${closed ? 'closed' : 'open'}-${repoKey}-${pr.source}-${pr.repository}-${pr.id}`}
      className="sidebar-pr-group sidebar-pr-children"
    >
      <div
        /* v8 ignore start */
        className={`sidebar-item sidebar-item-disclosure sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
        /* v8 ignore stop */
        role="button"
        tabIndex={0}
        onClick={() => onItemSelect(prViewId)}
        onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(prViewId))}
        onContextMenu={event => onContextMenu(event, pr)}
        title={pr.title}
      >
        <span
          className="sidebar-item-chevron"
          role="button"
          tabIndex={0}
          onClick={event => {
            event.stopPropagation()
            onTogglePRNode(prViewId)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onTogglePRNode(prViewId), true)}
        >
          {expandedPRNodes.has(prViewId) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">{icon}</span>
        <span className="sidebar-item-label">
          #{pr.id} {pr.title}
        </span>
        <span className="sidebar-pr-meta">{pr.repository}</span>
      </div>
      {expandedPRNodes.has(prViewId) && (
        <div className="sidebar-pr-children">
          {prSubNodes.map(node => {
            const childViewId = createPRDetailViewId(pr, node.key)
            const Icon = sectionIcons[node.key]
            return (
              <div
                key={childViewId}
                /* v8 ignore start */
                className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                /* v8 ignore stop */
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect(childViewId)}
                onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(childViewId))}
              >
                <span className="sidebar-item-icon">
                  <Icon size={12} />
                </span>
                <span className="sidebar-item-label">{node.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RepoNode({
  org,
  repo,
  bookmarkedRepoKeys,
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
  selectedItem,
  refreshTick,
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
}: RepoNodeProps) {
  const repoKey = `${org}/${repo.name}`
  const isBookmarked = bookmarkedRepoKeys.has(repoKey)
  const isRepoExpanded = expandedRepos.has(repoKey)
  const counts = repoCounts[repoKey]
  const repoCountsEntry = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
  const repoCountsUpdatedLabel = repoCountsEntry?.fetchedAt
    ? formatUpdatedAge(repoCountsEntry.fetchedAt)
    : null
  const openIssuesKey = `open:${repoKey}`
  const closedIssuesKey = `closed:${repoKey}`
  const openPrsKey = `open:${repoKey}`
  const closedPrsKey = `closed:${repoKey}`
  const sflStatus = sflStatusData[repoKey]

  return (
    <div className="sidebar-repo-group">
      <RepoHeader
        org={org}
        repo={repo}
        isBookmarked={isBookmarked}
        isRepoExpanded={isRepoExpanded}
        onToggleRepo={onToggleRepo}
        onBookmarkToggle={onBookmarkToggle}
      />
      {isRepoExpanded && (
        <div className="sidebar-repo-children">
          <RepoOverviewItem
            repoKey={repoKey}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
          <RepoCommitsSection
            org={org}
            repoName={repo.name}
            repoKey={repoKey}
            expandedRepoCommitGroups={expandedRepoCommitGroups}
            repoCommitTreeData={repoCommitTreeData}
            loading={loadingRepoCommits.has(repoKey)}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onToggleRepoCommitGroup={onToggleRepoCommitGroup}
          />
          <RepoIssuesSection
            org={org}
            repoName={repo.name}
            repoKey={repoKey}
            counts={counts}
            expandedRepoIssueGroups={expandedRepoIssueGroups}
            expandedRepoIssueStateGroups={expandedRepoIssueStateGroups}
            repoIssueTreeData={repoIssueTreeData}
            isCountLoading={loadingRepoCounts.has(repoKey)}
            isOpenIssuesLoading={loadingRepoIssues.has(openIssuesKey)}
            isClosedIssuesLoading={loadingRepoIssues.has(closedIssuesKey)}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onToggleRepoIssueGroup={onToggleRepoIssueGroup}
            onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
          />
          <RepoPullRequestsSection
            org={org}
            repoName={repo.name}
            repoKey={repoKey}
            counts={counts}
            repoCountsUpdatedLabel={repoCountsUpdatedLabel}
            refreshTick={refreshTick}
            expandedRepoPRGroups={expandedRepoPRGroups}
            expandedRepoPRStateGroups={expandedRepoPRStateGroups}
            expandedPRNodes={expandedPRNodes}
            repoPrTreeData={repoPrTreeData}
            isCountLoading={loadingRepoCounts.has(repoKey)}
            isOpenPRsLoading={loadingRepoPRs.has(openPrsKey)}
            isClosedPRsLoading={loadingRepoPRs.has(closedPrsKey)}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onToggleRepoPRGroup={onToggleRepoPRGroup}
            onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
            onTogglePRNode={onTogglePRNode}
            onContextMenu={onContextMenu}
          />
          <RepoSFLSection
            org={org}
            repoName={repo.name}
            sflStatus={sflStatus}
            isLoading={loadingSFLStatus.has(repoKey)}
            isExpanded={expandedSFLGroups.has(repoKey)}
            onToggleSFLGroup={onToggleSFLGroup}
          />
        </div>
      )}
    </div>
  )
}
