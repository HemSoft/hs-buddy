import { useState } from 'react'
import { CircleDot, ExternalLink, RefreshCw, MessageSquare, Clock } from 'lucide-react'
import { useGitHubData } from '../hooks/useGitHubData'
import { useGitHubAccounts } from '../hooks/useConfig'
import type { RepoIssue } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { getLabelStyle } from '../utils/labelStyle'
import { ViewModeToggle } from './shared/ViewModeToggle'
import { PanelLoadingState, PanelErrorState, PanelEmptyState } from './shared/PanelStates'
import { useViewMode, type ViewMode } from '../hooks/useViewMode'
import { IssueContextMenu } from './IssueContextMenu'
import './RepoIssueList.css'
import './shared/ListView.css'

interface RepoIssueListProps {
  owner: string
  repo: string
  issueState?: 'open' | 'closed'
  onOpenIssue?: (issueNumber: number) => void
}

function IssueTableView({
  issues,
  onOpenIssue,
  onContextMenu,
}: {
  issues: RepoIssue[]
  onOpenIssue?: (issueNumber: number) => void
  onContextMenu: (e: React.MouseEvent, issue: RepoIssue) => void
}) {
  return (
    <div className="repo-issues-list repo-issues-list--table">
      <table className="list-view-table">
        <thead>
          <tr>
            <th className="col-status"></th>
            <th className="col-title">Title</th>
            <th className="col-author">Author</th>
            <th className="col-labels">Labels</th>
            <th className="col-date">Updated</th>
          </tr>
        </thead>
        <tbody>
          {issues.map(issue => (
            <tr
              key={issue.number}
              onClick={() => {
                if (onOpenIssue) {
                  onOpenIssue(issue.number)
                  return
                }
                window.shell?.openExternal(issue.url)
              }}
              onContextMenu={e => onContextMenu(e, issue)}
            >
              <td className="col-status">
                <CircleDot size={14} className={`list-view-status-${issue.state}`} />
              </td>
              <td className="col-title">
                <span className="col-number">#{issue.number}</span> {issue.title}
              </td>
              <td className="col-author">
                {issue.authorAvatarUrl && (
                  <img
                    src={issue.authorAvatarUrl}
                    alt={issue.author}
                    className="list-view-avatar"
                  />
                )}
                {issue.author}
              </td>
              <td className="col-labels">
                {issue.labels.map(label => (
                  <span
                    key={label.name}
                    className="list-view-label"
                    style={getLabelStyle(label.color)}
                  >
                    {label.name}
                  </span>
                ))}
              </td>
              <td className="col-date">{formatDistanceToNow(issue.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IssueCardView({
  issues,
  onOpenIssue,
  onContextMenu,
}: {
  issues: RepoIssue[]
  onOpenIssue?: (issueNumber: number) => void
  onContextMenu: (e: React.MouseEvent, issue: RepoIssue) => void
}) {
  return (
    <div className="repo-issues-list">
      {issues.map(issue => (
        <div
          key={issue.number}
          className="repo-issue-item"
          onContextMenu={e => onContextMenu(e, issue)}
        >
          <button
            type="button"
            className="repo-issue-main"
            onClick={() => {
              if (onOpenIssue) {
                onOpenIssue(issue.number)
                return
              }
              window.shell?.openExternal(issue.url)
            }}
            title={issue.title}
          >
            <span className="repo-issue-header">
              <span className="repo-issue-title-row">
                <CircleDot size={16} className="repo-issue-icon" />
                <span className="repo-issue-title">{issue.title}</span>
              </span>
              {issue.labels.length > 0 && (
                <span className="repo-issue-labels">
                  {issue.labels.map(label => (
                    <span
                      key={label.name}
                      className="repo-issue-label"
                      style={getLabelStyle(label.color)}
                    >
                      {label.name}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="repo-issue-meta">
              <span className="repo-issue-number">#{issue.number}</span>
              <span className="repo-issue-author">
                {issue.authorAvatarUrl && (
                  <img
                    src={issue.authorAvatarUrl}
                    alt={issue.author}
                    className="repo-issue-avatar"
                  />
                )}
                {issue.author}
              </span>
              <span className="repo-issue-date">
                <Clock size={12} />
                {formatDistanceToNow(issue.createdAt)}
              </span>
              {issue.commentCount > 0 && (
                <span className="repo-issue-comments">
                  <MessageSquare size={12} />
                  {issue.commentCount}
                </span>
              )}
              {issue.assignees.length > 0 && (
                <span className="repo-issue-assignees">
                  {issue.assignees.slice(0, 3).map(a => (
                    <img
                      key={a.login}
                      src={a.avatarUrl}
                      alt={a.login}
                      className="repo-issue-assignee-avatar"
                      title={a.name ? `${a.name} (${a.login})` : a.login}
                    />
                  ))}
                  {issue.assignees.length > 3 && (
                    <span className="repo-issue-assignee-more">+{issue.assignees.length - 3}</span>
                  )}
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            className="repo-issue-external-link-btn"
            onClick={() => window.shell?.openExternal(issue.url)}
            title="Open issue on GitHub"
          >
            <ExternalLink size={14} className="external-link-icon" />
          </button>
        </div>
      ))}
    </div>
  )
}

function IssueListHeader({
  owner,
  repo,
  issueState,
  issueCount,
  loading,
  refresh,
  viewMode,
  setViewMode,
}: {
  owner: string
  repo: string
  issueState: string
  issueCount: number
  loading: boolean
  refresh: () => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}) {
  return (
    <div className="repo-issues-header">
      <div className="repo-issues-header-left">
        <h2>
          <CircleDot size={20} />
          <span className="repo-issues-owner">{owner}</span>
          <span className="repo-issues-separator">/</span>
          <span className="repo-issues-name">{repo}</span>
          <span className="repo-issues-label">
            {issueState === 'open' ? 'Open Issues' : 'Closed Issues'}
          </span>
        </h2>
      </div>
      <div className="repo-issues-header-actions">
        <span className="repo-issues-count">
          {issueCount} {issueState}
        </span>
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <button
          className="repo-issues-refresh-btn"
          /* v8 ignore start */
          onClick={refresh}
          /* v8 ignore stop */
          disabled={loading}
          title="Refresh"
        >
          {/* v8 ignore start */}
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {/* v8 ignore stop */}
        </button>
      </div>
    </div>
  )
}

function IssueListBody({
  issues,
  loading,
  issueState,
  viewMode,
  onOpenIssue,
  onContextMenu,
}: {
  issues: RepoIssue[]
  loading: boolean
  issueState: NonNullable<RepoIssueListProps['issueState']>
  viewMode: ViewMode
  onOpenIssue?: (issueNumber: number) => void
  onContextMenu: (e: React.MouseEvent, issue: RepoIssue) => void
}) {
  if (!loading && issues.length === 0) {
    return (
      <PanelEmptyState
        icon={<CircleDot size={48} />}
        message={`No ${issueState} issues`}
        subtitle={`This repository has no ${issueState} issues right now.`}
      />
    )
  }
  if (viewMode === 'list') {
    return (
      <IssueTableView issues={issues} onOpenIssue={onOpenIssue} onContextMenu={onContextMenu} />
    )
  }
  return <IssueCardView issues={issues} onOpenIssue={onOpenIssue} onContextMenu={onContextMenu} />
}

export function RepoIssueList(props: RepoIssueListProps) {
  const { owner, repo, onOpenIssue } = props
  const issueState = props.issueState ?? 'open'
  const { accounts } = useGitHubAccounts()
  const { data, loading, error, refresh } = useGitHubData<RepoIssue[]>({
    cacheKey: `repo-issues:${issueState}:${owner}/${repo}`,
    taskName: `repo-issues-${issueState}-${owner}-${repo}`,
    /* v8 ignore start */
    fetchFn: client => client.fetchRepoIssues(owner, repo, issueState),
    /* v8 ignore stop */
  })
  const issues = data ?? []
  const isEmpty = issues.length === 0
  const [viewMode, setViewMode] = useViewMode(`repo-issues-${owner}-${repo}`)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; issue: RepoIssue } | null>(
    null
  )

  const handleContextMenu = (e: React.MouseEvent, issue: RepoIssue) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, issue })
  }

  const handleStartRalphLoop = () => {
    /* v8 ignore start -- defensive guard: handler only callable from context menu */
    if (!contextMenu) return
    /* v8 ignore stop */
    const { issue } = contextMenu
    const repoRoot = accounts.find(a => a.org === owner)?.repoRoot
    const repoPath = repoRoot
      ? /* v8 ignore start -- happy-dom navigator.platform doesn't match real Windows */
        [repoRoot, repo].join(window.navigator.platform.startsWith('Win') ? '\\' : '/')
      : /* v8 ignore stop */
        ''
    setContextMenu(null)
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'ralph-dashboard' } }))
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('ralph:launch-from-issue', {
          detail: {
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueBody: `Read the full issue details from GitHub (${owner}/${repo}#${issue.number}) and implement the fix.`,
            repository: repo,
            org: owner,
            repoPath,
          },
        })
      )
    }, 100)
  }

  const handleViewDetails = () => {
    /* v8 ignore start -- defensive guard: handler only callable from context menu */
    if (!contextMenu) return
    /* v8 ignore stop */
    const { issue } = contextMenu
    setContextMenu(null)
    if (onOpenIssue) {
      onOpenIssue(issue.number)
    } else {
      window.shell?.openExternal(issue.url)
    }
  }

  const handleCopyLink = () => {
    /* v8 ignore start -- defensive guard: handler only callable from context menu */
    if (!contextMenu) return
    /* v8 ignore stop */
    navigator.clipboard.writeText(contextMenu.issue.url)
    setContextMenu(null)
  }

  const handleOpenOnGitHub = () => {
    /* v8 ignore start -- defensive guard: handler only callable from context menu */
    if (!contextMenu) return
    /* v8 ignore stop */
    window.shell?.openExternal(contextMenu.issue.url)
    setContextMenu(null)
  }

  if (isEmpty) {
    if (loading) {
      return (
        <PanelLoadingState
          message="Loading issues..."
          subtitle={`${owner}/${repo} · ${issueState}`}
        />
      )
    }
    if (error) {
      return <PanelErrorState title="Failed to load issues" error={error} onRetry={refresh} />
    }
  }

  return (
    <div className="repo-issues-container">
      <IssueListHeader
        owner={owner}
        repo={repo}
        issueState={issueState}
        issueCount={issues.length}
        loading={loading}
        refresh={refresh}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <IssueListBody
        issues={issues}
        loading={loading}
        issueState={issueState}
        viewMode={viewMode}
        onOpenIssue={onOpenIssue}
        onContextMenu={handleContextMenu}
      />

      {contextMenu && (
        <IssueContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          issue={contextMenu.issue}
          owner={owner}
          repo={repo}
          onStartRalphLoop={handleStartRalphLoop}
          onViewDetails={handleViewDetails}
          onCopyLink={handleCopyLink}
          onOpenOnGitHub={handleOpenOnGitHub}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
