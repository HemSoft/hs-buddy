import { useCallback } from 'react'
import { GitCommit, ExternalLink, RefreshCw } from 'lucide-react'
import { useGitHubData } from '../hooks/useGitHubData'
import type { RepoCommit } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import {
  PanelLoadingState,
  PanelErrorState,
  InlineRefreshIndicator,
  PanelEmptyState,
} from './shared/PanelStates'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'

interface RepoCommitListPanelProps {
  owner: string
  repo: string
  onOpenCommit?: (sha: string) => void
}

export function RepoCommitListPanel({ owner, repo, onOpenCommit }: RepoCommitListPanelProps) {
  const { data, loading, error, refresh } = useGitHubData<RepoCommit[]>({
    cacheKey: `repo-commits:${owner}/${repo}`,
    taskName: `repo-commits-${owner}-${repo}`,
    fetchFn: client => client.fetchRepoCommits(owner, repo),
  })
  const commits = data ?? []

  const handleCommitClick = useCallback(
    (commit: RepoCommit) => {
      if (onOpenCommit) {
        onOpenCommit(commit.sha)
        return
      }
      window.shell?.openExternal(commit.url)
    },
    [onOpenCommit]
  )

  if (loading && commits.length === 0) {
    return <PanelLoadingState message="Loading commits..." subtitle={`${owner}/${repo}`} />
  }

  if (error && commits.length === 0) {
    return <PanelErrorState title="Failed to load commits" error={error} onRetry={refresh} />
  }

  return (
    <div className="repo-commits-container">
      <div className="repo-commits-header">
        <div className="repo-commits-header-left">
          <h2>
            <GitCommit size={20} />
            <span className="repo-commits-owner">{owner}</span>
            <span className="repo-commits-separator">/</span>
            <span className="repo-commits-name">{repo}</span>
            <span className="repo-commits-label">Commits</span>
          </h2>
          <p className="repo-commits-subtitle">Recent commit activity for this repository.</p>
        </div>
        <div className="repo-commits-header-actions">
          <span className="repo-commits-count">{commits.length} recent</span>
          <button
            className="repo-commits-refresh-btn"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && commits.length > 0 && (
        <InlineRefreshIndicator message="Refreshing commit list..." />
      )}

      {commits.length === 0 ? (
        <PanelEmptyState
          icon={<GitCommit size={48} />}
          message="No commits found"
          subtitle="This repository does not have any visible commits yet."
        />
      ) : (
        <div className="repo-commits-page-list">
          {commits.map(commit => (
            <div
              key={commit.sha}
              className="repo-commit-item repo-commit-item-page"
              onClick={() => handleCommitClick(commit)}
              title={commit.message}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleCommitClick(commit)
                }
              }}
            >
              <div className="repo-commit-main">
                <span className="repo-commit-sha">{commit.sha.slice(0, 7)}</span>
                <span className="repo-commit-msg">{commit.message}</span>
                <ExternalLink size={14} className="external-link-icon" />
              </div>
              <div className="repo-commit-meta">
                {commit.authorAvatarUrl && (
                  <img
                    src={commit.authorAvatarUrl}
                    alt={commit.author}
                    className="repo-commit-avatar"
                  />
                )}
                <span className="repo-commit-author">{commit.author}</span>
                <span className="repo-commit-date">{formatDistanceToNow(commit.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
