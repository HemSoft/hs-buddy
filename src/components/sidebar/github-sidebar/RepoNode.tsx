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
  Play,
  RefreshCw,
  Star,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import type { OrgRepo, RepoCommit, RepoCounts, RepoIssue } from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus, SFLOverallStatus, SFLWorkflowInfo } from '../../../types/sflStatus'
import type { RalphRunInfo, RalphRunStatus } from '../../../types/ralph'
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
  ralphRuns: RalphRunInfo[]
  expandedRalphGroups: ReadonlySet<string>
  selectedItem: string | null
  refreshTick: number
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onToggleRalphGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
}

function DisclosureChevron({ expanded }: { expanded: boolean }) {
  if (expanded) return <ChevronDown size={12} />
  return <ChevronRight size={12} />
}

function DisclosureIcons({ expanded }: { expanded: boolean }) {
  return (
    <>
      <span className="sidebar-item-chevron">
        <DisclosureChevron expanded={expanded} />
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
}: {
  org: string
  repo: OrgRepo
  isBookmarked: boolean
  isRepoExpanded: boolean
  onToggleRepo: (org: string, repoName: string) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
}) {
  return (
    <div
      className="sidebar-item sidebar-item-disclosure sidebar-repo-item"
      title={repo.description || repo.fullName}
    >
      <button
        type="button"
        className="sidebar-item-main"
        onClick={() => onToggleRepo(org, repo.name)}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleRepo(org, repo.name))}
      >
        <DisclosureIcons expanded={isRepoExpanded} />
        <span className="sidebar-item-label">{repo.name}</span>
        {repo.language && <span className="sidebar-repo-lang">{repo.language}</span>}
      </button>
      <BookmarkButton
        isBookmarked={isBookmarked}
        onClick={event => onBookmarkToggle(event, org, repo.name, repo.url)}
      />
    </div>
  )
}

function BookmarkButton({
  isBookmarked,
  onClick,
}: {
  isBookmarked: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={`sidebar-bookmark-btn ${isBookmarked ? 'active' : ''}`}
      onClick={onClick}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark this repo'}
    >
      <Star size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
    </button>
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
    <button
      type="button"
      className={`sidebar-item sidebar-repo-child ${selectedItem === detailViewId ? 'selected' : ''}`}
      onClick={() => onItemSelect(detailViewId)}
      onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(detailViewId))}
    >
      <span className="sidebar-item-icon">
        <FileText size={12} />
      </span>
      <span className="sidebar-item-label">Overview</span>
    </button>
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
            <span className="sidebar-item-label">Loading commits…</span>
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
            <button
              type="button"
              key={childViewId}
              className={sidebarItemClass(
                'sidebar-item sidebar-pr-child',
                selectedItem === childViewId
              )}
              onClick={() => onItemSelect(childViewId)}
              onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(childViewId))}
              title={commit.message}
            >
              <span className="sidebar-item-icon">
                <GitCommit size={11} />
              </span>
              <span className="sidebar-item-label">{commit.message}</span>
              <span className="sidebar-pr-meta">{commit.sha.slice(0, 7)}</span>
            </button>
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
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggleRepoCommitGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoCommitGroup(org, repoName), true)
          }
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
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
          <span className="sidebar-item-icon">
            <GitCommit size={12} />
          </span>
          <span className="sidebar-item-label">Commits</span>
          <CommitCountBadge loading={loading} count={commits.length} />
        </button>
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
          <button
            type="button"
            key={`${keyPrefix}-${issue.number}`}
            className={`sidebar-item sidebar-pr-child sidebar-issue-leaf ${selectedItem === issueViewId ? 'selected' : ''}`}
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
          </button>
        )
      })}
    </div>
  )
}

function isAnyLoading(isLoading: boolean, isCountLoading: boolean): boolean {
  return isLoading || isCountLoading
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
    if (isAnyLoading(isLoading, isCountLoading)) return <Loader2 size={10} className="spin" />
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
          <span className="sidebar-item-label">Loading issues…</span>
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
  const handleClick = () => {
    onItemSelect(viewId)
    onToggle(org, repoName, state)
  }

  return (
    <>
      <div
        /* v8 ignore start */
        className={`sidebar-item sidebar-pr-child ${selectedItem === viewId ? 'selected' : ''}`}
        /* v8 ignore stop */
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggle(org, repoName, state)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggle(org, repoName, state), true)}
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={handleClick}
          onKeyDown={event => handleItemKeyDown(event, handleClick)}
        >
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
        </button>
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

function getTreeItems<T>(data: Record<string, T[]>, key: string): T[] {
  return data[key] || []
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
  const openIssueGroupKey = `${repoKey}:open`
  const closedIssueGroupKey = `${repoKey}:closed`
  const isExpanded = expandedRepoIssueGroups.has(repoKey)
  /* v8 ignore start */
  const isSelected = selectedItem === issuesViewId && !isExpanded
  /* v8 ignore stop */
  const handleClick = () => {
    onItemSelect(issuesViewId)
    onToggleRepoIssueGroup(org, repoName)
  }

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass(
          'sidebar-item sidebar-item-disclosure sidebar-repo-child',
          isSelected
        )}
        /* v8 ignore stop */
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggleRepoIssueGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoIssueGroup(org, repoName), true)
          }
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={handleClick}
          onKeyDown={event => handleItemKeyDown(event, handleClick)}
        >
          <span className="sidebar-item-icon">
            <CircleDot size={12} />
          </span>
          <span className="sidebar-item-label">Issues</span>
          <SectionCountBadge isCountLoading={isCountLoading} count={counts?.issues} />
        </button>
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
              issues={getTreeItems(repoIssueTreeData, `open:${repoKey}`)}
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
              issues={getTreeItems(repoIssueTreeData, `closed:${repoKey}`)}
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

function renderOpenPRCountBadge(isLoading: boolean, isCountLoading: boolean, counts?: RepoCounts) {
  if (isAnyLoading(isLoading, isCountLoading)) return <Loader2 size={10} className="spin" />
  if (counts) return <span className="sidebar-item-count">{counts.prs}</span>
  return null
}

function renderClosedPRCountBadge(isLoading: boolean, closedCount: number) {
  if (isLoading) return <Loader2 size={10} className="spin" />
  if (closedCount > 0) return <span className="sidebar-item-count">{closedCount}</span>
  return null
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
    return renderOpenPRCountBadge(isLoading, isCountLoading, counts)
  }
  return renderClosedPRCountBadge(isLoading, closedCount)
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
          <span className="sidebar-item-label">Loading pull requests…</span>
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
  const handleClick = () => {
    onItemSelect(viewId)
    onToggle(org, repoName, state)
  }

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass('sidebar-item sidebar-pr-child', selectedItem === viewId)}
        /* v8 ignore stop */
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggle(org, repoName, state)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggle(org, repoName, state), true)}
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={handleClick}
          onKeyDown={event => handleItemKeyDown(event, handleClick)}
        >
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
        </button>
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
  const openPrGroupKey = `${repoKey}:open`
  const closedPrGroupKey = `${repoKey}:closed`
  const isExpanded = expandedRepoPRGroups.has(repoKey)
  /* v8 ignore start */
  const isSelected = selectedItem === prsViewId && !isExpanded
  /* v8 ignore stop */
  const handleClick = () => {
    onItemSelect(prsViewId)
    onToggleRepoPRGroup(org, repoName)
  }
  const shared = {
    org,
    repoName,
    repoKey,
    isCountLoading,
    counts,
    expandedPRNodes,
    selectedItem,
    onItemSelect,
    onToggle: onToggleRepoPRStateGroup,
    onTogglePRNode,
    onContextMenu,
  }

  return (
    <>
      <div
        /* v8 ignore start */
        className={sidebarItemClass(
          'sidebar-item sidebar-item-disclosure sidebar-repo-child sidebar-repo-pr-row',
          isSelected
        )}
        /* v8 ignore stop */
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggleRepoPRGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRepoPRGroup(org, repoName), true)
          }
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={handleClick}
          onKeyDown={event => handleItemKeyDown(event, handleClick)}
        >
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
        </button>
      </div>
      {isExpanded && (
        <div className="sidebar-job-tree sidebar-repo-pr-tree">
          <div className="sidebar-job-items">
            <PRStateGroup
              {...shared}
              state="open"
              viewId={prsViewId}
              isExpanded={expandedRepoPRStateGroups.has(openPrGroupKey)}
              isLoading={isOpenPRsLoading}
              prs={getTreeItems(repoPrTreeData, `open:${repoKey}`)}
            />
            <PRStateGroup
              {...shared}
              state="closed"
              viewId={closedPrsViewId}
              isExpanded={expandedRepoPRStateGroups.has(closedPrGroupKey)}
              isLoading={isClosedPRsLoading}
              prs={getTreeItems(repoPrTreeData, `closed:${repoKey}`)}
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

function SFLStatusBadge({
  isLoading,
  overallStatus,
}: {
  isLoading: boolean
  overallStatus: SFLOverallStatus
}) {
  /* v8 ignore next -- loading state guard */
  if (isLoading) return <Loader2 size={10} className="spin" />
  return (
    <span className="sidebar-sfl-status-badge" title={SFL_STATUS_LABELS[overallStatus]}>
      {sflOverallStatusIcon(overallStatus)}
    </span>
  )
}

function sflWorkflowTitle(
  name: string,
  state: string,
  latestRun: SFLWorkflowInfo['latestRun']
): string {
  const stateLabel = state === 'active' ? 'enabled' : 'disabled'
  /* v8 ignore start -- defensive guard for missing latestRun */
  if (!latestRun) return `${name} — ${stateLabel}`
  const runLabel = latestRun.conclusion || latestRun.status
  /* v8 ignore stop */
  return `${name} — ${stateLabel}, last: ${runLabel}`
}

function SFLWorkflowItem({ wf }: { wf: SFLWorkflowInfo }) {
  const conclusion = wf.latestRun?.conclusion ?? null
  return (
    <div
      key={wf.id}
      className="sidebar-item sidebar-job-item sidebar-sfl-workflow"
      /* v8 ignore start */
      title={sflWorkflowTitle(wf.name, wf.state, wf.latestRun)}
      /* v8 ignore stop */
    >
      {sflWorkflowStateIcon(wf.state, conclusion)}
      <span className="sidebar-item-label">{wf.name.replace(/^SFL:\s*/i, '')}</span>
      {wf.state !== 'active' && <span className="sidebar-sfl-disabled-badge">off</span>}
    </div>
  )
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
        <span className="sidebar-item-chevron">
          <Loader2 size={12} className="spin" />
        </span>
        <span className="sidebar-item-icon">
          <Activity size={12} />
        </span>
        <span className="sidebar-item-label">SFL Loop</span>
      </div>
    ) : null
  }

  return (
    <>
      <div className="sidebar-item sidebar-item-disclosure sidebar-repo-child">
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggleSFLGroup(org, repoName)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onToggleSFLGroup(org, repoName), true)}
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={() => onToggleSFLGroup(org, repoName)}
          onKeyDown={event => handleItemKeyDown(event, () => onToggleSFLGroup(org, repoName))}
        >
          <span className="sidebar-item-icon">
            <Activity size={12} />
          </span>
          <span className="sidebar-item-label">SFL Loop</span>
          {/* v8 ignore start */}
          <SFLStatusBadge isLoading={isLoading} overallStatus={sflStatus.overallStatus} />
          {/* v8 ignore stop */}
        </button>
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
              <SFLWorkflowItem key={wf.id} wf={wf} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const RALPH_STATUS_ICON: Record<RalphRunStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: AlertTriangle,
  orphaned: AlertTriangle,
}

function ralphTimeAgo(epoch: number): string {
  const ms = Date.now() - epoch
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Check whether a ralph run's repoPath matches a given org/repo pair. */
function matchesRepo(run: RalphRunInfo, org: string, repoName: string): boolean {
  const rp = run.config.repoPath.replace(/\\/g, '/')
  if (rp.endsWith(`/${org}/${repoName}`)) return true
  if (rp.endsWith(`/${repoName}`)) return true
  if (rp === repoName) return true
  return false
}

interface RepoRalphSectionProps {
  org: string
  repoName: string
  runs: RalphRunInfo[]
  isExpanded: boolean
  selectedItem: string | null
  onToggleRalphGroup: (org: string, repoName: string) => void
  onItemSelect: (itemId: string) => void
}

function getRalphRunDetail(run: RalphRunInfo): string {
  const isActive = run.status === 'running' || run.status === 'pending'
  if (!isActive) return ralphTimeAgo(run.completedAt ?? run.updatedAt)
  return run.totalIterations ? `${run.currentIteration}/${run.totalIterations}` : run.phase
}

function RalphRunItem({
  run,
  selectedItem,
  onItemSelect,
}: {
  run: RalphRunInfo
  selectedItem: string | null
  onItemSelect: (id: string) => void
}) {
  const Icon = RALPH_STATUS_ICON[run.status]
  const viewId = `ralph-run:${run.runId}`
  return (
    <button
      type="button"
      key={run.runId}
      className={sidebarItemClass('sidebar-item sidebar-job-item', selectedItem === viewId)}
      onClick={() => onItemSelect(viewId)}
      onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(viewId))}
      title={`${run.config.scriptType} — ${run.status}`}
    >
      <Icon size={11} className={run.status === 'running' ? 'spin' : ''} />
      <span className="sidebar-item-label">{run.config.scriptType}</span>
      <span className="sidebar-pr-meta">{getRalphRunDetail(run)}</span>
    </button>
  )
}

function RepoRalphSection({
  org,
  repoName,
  runs,
  isExpanded,
  selectedItem,
  onToggleRalphGroup,
  onItemSelect,
}: RepoRalphSectionProps) {
  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'pending')
  const recentRuns = runs.filter(r => r.status !== 'running' && r.status !== 'pending').slice(0, 5)
  const handleLaunch = () => {
    window.dispatchEvent(new CustomEvent('ralph:prefill-repo', { detail: { org, repoName } }))
    onItemSelect('ralph-dashboard')
  }

  return (
    <>
      <div className="sidebar-item sidebar-item-disclosure sidebar-repo-child">
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onToggleRalphGroup(org, repoName)
          }}
          onKeyDown={event =>
            handleItemKeyDown(event, () => onToggleRalphGroup(org, repoName), true)
          }
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={() => onToggleRalphGroup(org, repoName)}
          onKeyDown={event => handleItemKeyDown(event, () => onToggleRalphGroup(org, repoName))}
        >
          <span className="sidebar-item-icon">
            <RefreshCw size={12} />
          </span>
          <span className="sidebar-item-label">Ralph Loops</span>
          {activeRuns.length > 0 && <span className="sidebar-item-count">{activeRuns.length}</span>}
        </button>
      </div>
      {isExpanded && (
        <div className="sidebar-job-tree sidebar-ralph-tree">
          <div className="sidebar-job-items">
            {activeRuns.map(run => (
              <RalphRunItem
                key={run.runId}
                run={run}
                selectedItem={selectedItem}
                onItemSelect={onItemSelect}
              />
            ))}
            {recentRuns.map(run => (
              <RalphRunItem
                key={run.runId}
                run={run}
                selectedItem={selectedItem}
                onItemSelect={onItemSelect}
              />
            ))}
            <button
              type="button"
              className="sidebar-item sidebar-job-item"
              onClick={handleLaunch}
              onKeyDown={event => handleItemKeyDown(event, handleLaunch)}
            >
              <Play size={11} />
              <span className="sidebar-item-label">Launch…</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function prNodeStatePrefix(closed: boolean): string {
  return closed ? 'closed' : 'open'
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
      key={`${prNodeStatePrefix(closed)}-${repoKey}-${pr.source}-${pr.repository}-${pr.id}`}
      className="sidebar-pr-group sidebar-pr-children"
    >
      <div
        /* v8 ignore start */
        className={`sidebar-item sidebar-item-disclosure sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
        /* v8 ignore stop */
        onContextMenu={event => onContextMenu(event, pr)}
        title={pr.title}
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          onClick={event => {
            event.stopPropagation()
            onTogglePRNode(prViewId)
          }}
          onKeyDown={event => handleItemKeyDown(event, () => onTogglePRNode(prViewId), true)}
        >
          <DisclosureChevron expanded={expandedPRNodes.has(prViewId)} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={() => onItemSelect(prViewId)}
          onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(prViewId))}
        >
          <span className="sidebar-item-icon">{icon}</span>
          <span className="sidebar-item-label">
            #{pr.id} {pr.title}
          </span>
          <span className="sidebar-pr-meta">{pr.repository}</span>
        </button>
      </div>
      {expandedPRNodes.has(prViewId) && (
        <div className="sidebar-pr-children">
          {prSubNodes.map(node => {
            const childViewId = createPRDetailViewId(pr, node.key)
            const Icon = sectionIcons[node.key]
            return (
              <button
                type="button"
                key={childViewId}
                /* v8 ignore start */
                className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                /* v8 ignore stop */
                onClick={() => onItemSelect(childViewId)}
                onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(childViewId))}
              >
                <span className="sidebar-item-icon">
                  <Icon size={12} />
                </span>
                <span className="sidebar-item-label">{node.label}</span>
              </button>
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
  ralphRuns,
  expandedRalphGroups,
  selectedItem,
  refreshTick,
  onToggleRepo,
  onToggleRepoIssueGroup,
  onToggleRepoIssueStateGroup,
  onToggleRepoPRGroup,
  onToggleRepoPRStateGroup,
  onToggleRepoCommitGroup,
  onToggleSFLGroup,
  onToggleRalphGroup,
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
}: RepoNodeProps) {
  const repoKey = `${org}/${repo.name}`
  const isRepoExpanded = expandedRepos.has(repoKey)
  const counts = repoCounts[repoKey]
  const repoCountsEntry = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
  const repoCountsUpdatedLabel = repoCountsEntry?.fetchedAt
    ? formatUpdatedAge(repoCountsEntry.fetchedAt)
    : null
  const isCountLoading = loadingRepoCounts.has(repoKey)

  return (
    <div className="sidebar-repo-group">
      <RepoHeader
        org={org}
        repo={repo}
        isBookmarked={bookmarkedRepoKeys.has(repoKey)}
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
            isCountLoading={isCountLoading}
            isOpenIssuesLoading={loadingRepoIssues.has(`open:${repoKey}`)}
            isClosedIssuesLoading={loadingRepoIssues.has(`closed:${repoKey}`)}
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
            isCountLoading={isCountLoading}
            isOpenPRsLoading={loadingRepoPRs.has(`open:${repoKey}`)}
            isClosedPRsLoading={loadingRepoPRs.has(`closed:${repoKey}`)}
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
            sflStatus={sflStatusData[repoKey]}
            isLoading={loadingSFLStatus.has(repoKey)}
            isExpanded={expandedSFLGroups.has(repoKey)}
            onToggleSFLGroup={onToggleSFLGroup}
          />
          <RepoRalphSection
            org={org}
            repoName={repo.name}
            runs={ralphRuns.filter(r => matchesRepo(r, org, repo.name))}
            isExpanded={expandedRalphGroups.has(repoKey)}
            selectedItem={selectedItem}
            onToggleRalphGroup={onToggleRalphGroup}
            onItemSelect={onItemSelect}
          />
        </div>
      )}
    </div>
  )
}
