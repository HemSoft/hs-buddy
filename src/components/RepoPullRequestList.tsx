import { useCallback } from 'react'
import { GitPullRequest, ExternalLink, RefreshCw, Clock, GitBranch, ThumbsUp } from 'lucide-react'
import { useGitHubData } from '../hooks/useGitHubData'
import type { RepoPullRequest } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { createPRDetailViewId } from '../utils/prDetailView'
import { mapRepoPRToPullRequest } from '../utils/prMapper'
import { getLabelStyle } from '../utils/labelStyle'
import { ViewModeToggle } from './shared/ViewModeToggle'
import {
  PanelLoadingState,
  PanelErrorState,
  InlineRefreshIndicator,
  PanelEmptyState,
} from './shared/PanelStates'
import { PRStateIcon } from './shared/PRStateIcon'
import { useViewMode } from '../hooks/useViewMode'
import './RepoPullRequestList.css'
import './shared/ListView.css'

interface RepoPullRequestListProps {
  owner: string
  repo: string
  prState?: 'open' | 'closed'
  onOpenPR?: (viewId: string) => void
}

function mapToPRDetailId(pr: RepoPullRequest, owner: string): string {
  return createPRDetailViewId(mapRepoPRToPullRequest(pr, owner))
}

export function RepoPullRequestList({
  owner,
  repo,
  prState = 'open',
  onOpenPR,
}: RepoPullRequestListProps) {
  const { data, loading, error, refresh } = useGitHubData<RepoPullRequest[]>({
    cacheKey: `repo-prs:${prState}:${owner}/${repo}`,
    taskName: `repo-prs-${prState}-${owner}-${repo}`,
    /* v8 ignore start */
    fetchFn: client => client.fetchRepoPRs(owner, repo, prState),
    /* v8 ignore stop */
  })
  const prs = data ?? []
  const [viewMode, setViewMode] = useViewMode(`repo-prs-${owner}-${repo}`)

  const handlePRClick = useCallback(
    (pr: RepoPullRequest) => {
      if (onOpenPR) {
        onOpenPR(mapToPRDetailId(pr, owner))
      } else {
        window.shell?.openExternal(pr.url)
      }
    },
    [onOpenPR, owner]
  )

  if (loading && prs.length === 0) {
    return <PanelLoadingState message="Loading pull requests..." subtitle={`${owner}/${repo}`} />
  }

  if (error && prs.length === 0) {
    return <PanelErrorState title="Failed to load pull requests" error={error} onRetry={refresh} />
  }

  return (
    <div className="repo-prs-container">
      <div className="repo-prs-header">
        <div className="repo-prs-header-left">
          <h2>
            <GitPullRequest size={20} />
            <span className="repo-prs-owner">{owner}</span>
            <span className="repo-prs-separator">/</span>
            <span className="repo-prs-name">{repo}</span>
            <span className="repo-prs-label">
              {prState === 'open' ? 'Open Pull Requests' : 'Closed Pull Requests'}
            </span>
          </h2>
        </div>
        <div className="repo-prs-header-actions">
          <span className="repo-prs-count">
            {prs.length} {prState}
          </span>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <button
            className="repo-prs-refresh-btn"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && prs.length > 0 && (
        <InlineRefreshIndicator message="Refreshing pull requests..." />
      )}

      {!loading && prs.length === 0 ? (
        <PanelEmptyState
          icon={<GitPullRequest size={48} />}
          message={`No ${prState} pull requests`}
          subtitle={`This repository has no ${prState} pull requests right now.`}
        />
      ) : viewMode === 'list' ? (
        <div className="repo-prs-list" style={{ padding: 0 }}>
          <table className="list-view-table">
            <thead>
              <tr>
                <th className="col-status"></th>
                <th className="col-title">Title</th>
                <th>Author</th>
                <th>Updated</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {prs.map(pr => (
                <tr key={pr.number} onClick={() => handlePRClick(pr)}>
                  <td className="col-status">
                    {pr.draft ? (
                      <GitPullRequest size={14} className="list-view-status-draft" />
                    ) : (
                      <PRStateIcon state={pr.state} />
                    )}
                  </td>
                  <td className="col-title">
                    <span className="col-number">#{pr.number}</span> {pr.title}
                    {pr.draft && (
                      <span className="repo-pr-draft-badge" style={{ marginLeft: 6 }}>
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="col-author">
                    {pr.authorAvatarUrl && (
                      <img src={pr.authorAvatarUrl} alt={pr.author} className="list-view-avatar" />
                    )}
                    {pr.author}
                  </td>
                  <td className="col-date">{formatDistanceToNow(pr.updatedAt)}</td>
                  <td>
                    {(pr.approvalCount ?? 0) > 0 && (
                      <span className="list-view-approvals">
                        <ThumbsUp size={12} />
                        {pr.approvalCount}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="repo-prs-list">
          {prs.map(pr => (
            <button
              key={pr.number}
              type="button"
              className={`repo-pr-item${pr.draft ? ' repo-pr-item--draft' : ''}`}
              onClick={() => handlePRClick(pr)}
            >
              <div className="repo-pr-header">
                <div className="repo-pr-title-row">
                  <GitPullRequest size={16} className="repo-pr-icon" />
                  <span className="repo-pr-title">{pr.title}</span>
                  {pr.draft && <span className="repo-pr-draft-badge">Draft</span>}
                  <ExternalLink size={14} className="external-link-icon" />
                </div>
                {pr.labels.length > 0 && (
                  <div className="repo-pr-labels">
                    {pr.labels.map(label => (
                      <span
                        key={label.name}
                        className="repo-pr-label"
                        style={getLabelStyle(label.color)}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="repo-pr-branch-flow">
                <GitBranch size={12} />
                <span>
                  into <strong>{pr.baseBranch}</strong> from <strong>{pr.headBranch}</strong>
                </span>
              </div>
              <div className="repo-pr-meta">
                <span className="repo-pr-number">#{pr.number}</span>
                <span className="repo-pr-author">
                  {pr.authorAvatarUrl && (
                    <img src={pr.authorAvatarUrl} alt={pr.author} className="repo-pr-avatar" />
                  )}
                  {pr.author}
                </span>
                <span className="repo-pr-date">
                  <Clock size={12} />
                  {formatDistanceToNow(pr.createdAt)}
                </span>
                <span className="repo-pr-updated">updated {formatDistanceToNow(pr.updatedAt)}</span>
                {(pr.approvalCount ?? 0) > 0 && (
                  <span className="repo-pr-approvals">
                    <ThumbsUp size={12} />
                    {pr.approvalCount}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
