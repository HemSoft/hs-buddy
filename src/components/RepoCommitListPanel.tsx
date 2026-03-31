import { useState, useEffect, useCallback, useRef } from 'react'
import { GitCommit, ExternalLink, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoCommit } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { dataCache } from '../services/dataCache'
import { getErrorMessage, isAbortError } from '../utils/errorUtils'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'

interface RepoCommitListPanelProps {
  owner: string
  repo: string
  onOpenCommit?: (sha: string) => void
}

export function RepoCommitListPanel({ owner, repo, onOpenCommit }: RepoCommitListPanelProps) {
  const cacheKey = `repo-commits:${owner}/${repo}`
  const cachedEntry = dataCache.get<RepoCommit[]>(cacheKey)
  const [commits, setCommits] = useState<RepoCommit[]>(cachedEntry?.data || [])
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchCommits = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoCommit[]>(cacheKey)
        if (cached?.data) {
          setCommits(cached.data)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoCommits(owner, repo)
          },
          { name: `repo-commits-${owner}-${repo}` }
        )
        setCommits(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [owner, repo, accounts, cacheKey]
  )

  useEffect(() => {
    fetchCommits()
  }, [fetchCommits])

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
    return (
      <div className="repo-commits-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading commits...</p>
        <p className="repo-commits-loading-sub">
          {owner}/{repo}
        </p>
      </div>
    )
  }

  if (error && commits.length === 0) {
    return (
      <div className="repo-commits-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load commits</p>
        <p className="error-detail">{error}</p>
        <button className="repo-commits-refresh-btn" onClick={() => fetchCommits(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
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
            onClick={() => fetchCommits(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && commits.length > 0 && (
        <div className="repo-commits-loading-indicator" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" />
          <span>Refreshing commit list...</span>
        </div>
      )}

      {commits.length === 0 ? (
        <div className="repo-commits-empty">
          <GitCommit size={48} />
          <p>No commits found</p>
          <p className="empty-subtitle">This repository does not have any visible commits yet.</p>
        </div>
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
