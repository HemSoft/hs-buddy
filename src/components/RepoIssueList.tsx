import { CircleDot, ExternalLink, RefreshCw, MessageSquare, Clock } from 'lucide-react'
import { useGitHubData } from '../hooks/useGitHubData'
import type { RepoIssue } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { getLabelStyle } from '../utils/labelStyle'
import { ViewModeToggle } from './shared/ViewModeToggle'
import { PanelLoadingState, PanelErrorState, PanelEmptyState } from './shared/PanelStates'
import { useViewMode, type ViewMode } from '../hooks/useViewMode'
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
}: {
  issues: RepoIssue[]
  onOpenIssue?: (issueNumber: number) => void
}) {
  return (
    <div className="repo-issues-list" style={{ padding: 0 }}>
      <table className="list-view-table">
        <thead>
          <tr>
            <th className="col-status"></th>
            <th className="col-title">Title</th>
            <th>Author</th>
            <th>Labels</th>
            <th>Updated</th>
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
              <td>
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
}: {
  issues: RepoIssue[]
  onOpenIssue?: (issueNumber: number) => void
}) {
  return (
    <div className="repo-issues-list">
      {issues.map(issue => (
        <div key={issue.number} className="repo-issue-item">
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
}: {
  issues: RepoIssue[]
  loading: boolean
  issueState: NonNullable<RepoIssueListProps['issueState']>
  viewMode: ViewMode
  onOpenIssue?: (issueNumber: number) => void
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
    return <IssueTableView issues={issues} onOpenIssue={onOpenIssue} />
  }
  return <IssueCardView issues={issues} onOpenIssue={onOpenIssue} />
}

export function RepoIssueList(props: RepoIssueListProps) {
  const { owner, repo, onOpenIssue } = props
  const issueState = props.issueState ?? 'open'
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
      />
    </div>
  )
}
