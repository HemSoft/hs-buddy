import { Clock, ExternalLink, FileCode2, GitCommit, GitMerge, RefreshCw } from 'lucide-react'
import { useGitHubData } from '../hooks/useGitHubData'
import type { RepoCommitDetail } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { PanelLoadingState, PanelErrorState, InlineRefreshIndicator } from './shared/PanelStates'
import { ExpandableFileList } from './shared/ExpandableFileList'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'

interface RepoCommitDetailPanelProps {
  owner: string
  repo: string
  sha: string
}

export function RepoCommitDetailPanel({ owner, repo, sha }: RepoCommitDetailPanelProps) {
  const {
    data: detail,
    loading,
    error,
    refresh,
  } = useGitHubData<RepoCommitDetail>({
    cacheKey: `repo-commit:${owner}/${repo}/${sha}`,
    taskName: `repo-commit-${owner}-${repo}-${sha}`,
    /* v8 ignore next */
    fetchFn: client => client.fetchRepoCommitDetail(owner, repo, sha),
  })

  if (loading && !detail) {
    return (
      <PanelLoadingState
        message="Loading commit..."
        subtitle={`${owner}/${repo}@${sha.slice(0, 7)}`}
      />
    )
  }

  if (error && !detail) {
    return <PanelErrorState title="Failed to load commit" error={error} onRetry={refresh} />
  }

  if (!detail) return null

  return (
    <div className="repo-commit-detail-container">
      <div className="repo-commit-detail-header">
        <div className="repo-commit-detail-header-left">
          <div className="repo-commit-detail-kicker">
            <GitCommit size={16} />
            <span>
              {owner}/{repo}
            </span>
          </div>
          <h2>{detail.messageHeadline}</h2>
          <div className="repo-commit-detail-meta-row">
            <span className="repo-commit-sha">{detail.sha}</span>
            <span className="repo-commit-detail-time">
              <Clock size={12} />
              {formatDistanceToNow(detail.committedDate)}
            </span>
            <span className="repo-commit-detail-time-label">committed</span>
          </div>
        </div>
        <div className="repo-commit-detail-actions">
          <button
            className="repo-detail-action-btn"
            onClick={() => window.shell?.openExternal(detail.url)}
          >
            <ExternalLink size={14} />
            Open on GitHub
          </button>
          <button
            className="repo-detail-action-btn repo-detail-refresh-btn"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && detail && <InlineRefreshIndicator message="Refreshing commit details..." />}

      <div className="repo-commit-detail-summary-grid">
        <div className="repo-detail-card repo-commit-detail-card">
          <div className="repo-detail-card-header">
            <GitCommit size={16} />
            <h3>Commit</h3>
          </div>
          <div className="repo-commit-detail-identity">
            {detail.authorAvatarUrl && (
              <img
                src={detail.authorAvatarUrl}
                alt={detail.author}
                className="repo-commit-detail-avatar"
              />
            )}
            <div>
              <div className="repo-commit-detail-author">{detail.author}</div>
              <div className="repo-commit-detail-dates">
                Authored {formatDistanceToNow(detail.authoredDate)}
              </div>
            </div>
          </div>
          {detail.message !== detail.messageHeadline && (
            <pre className="repo-commit-message-body">{detail.message}</pre>
          )}
        </div>

        <div className="repo-detail-card repo-commit-detail-card">
          <div className="repo-detail-card-header">
            <FileCode2 size={16} />
            <h3>Change Summary</h3>
          </div>
          <div className="repo-commit-stats-grid">
            <div className="repo-commit-stat-box">
              <span className="repo-commit-stat-label">Files</span>
              <span className="repo-commit-stat-value">{detail.files.length}</span>
            </div>
            <div className="repo-commit-stat-box repo-commit-stat-box-added">
              <span className="repo-commit-stat-label">Additions</span>
              <span className="repo-commit-stat-value">+{detail.stats.additions}</span>
            </div>
            <div className="repo-commit-stat-box repo-commit-stat-box-removed">
              <span className="repo-commit-stat-label">Deletions</span>
              <span className="repo-commit-stat-value">-{detail.stats.deletions}</span>
            </div>
            <div className="repo-commit-stat-box">
              <span className="repo-commit-stat-label">Total</span>
              <span className="repo-commit-stat-value">{detail.stats.total}</span>
            </div>
          </div>
          {detail.parents.length > 0 && (
            <div className="repo-commit-parents">
              <div className="repo-commit-parents-title">
                <GitMerge size={14} />
                Parents
              </div>
              {detail.parents.map(parent => (
                <button
                  key={parent.sha}
                  className="repo-commit-parent-link"
                  onClick={() => window.shell?.openExternal(parent.url)}
                >
                  {parent.sha.slice(0, 7)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExpandableFileList files={detail.files} resetKey={sha} />
    </div>
  )
}
