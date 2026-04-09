import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCode2,
  GitCommit,
  GitMerge,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoCommitDetail } from '../api/github'
import { dataCache } from '../services/dataCache'
import { formatDistanceToNow } from '../utils/dateUtils'
import { getDiffLineClass } from '../utils/diffUtils'
import { formatFileStatus } from '../utils/githubUrl'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'

interface RepoCommitDetailPanelProps {
  owner: string
  repo: string
  sha: string
}

export function RepoCommitDetailPanel({ owner, repo, sha }: RepoCommitDetailPanelProps) {
  const cacheKey = `repo-commit:${owner}/${repo}/${sha}`
  const cachedEntry = dataCache.get<RepoCommitDetail>(cacheKey)
  const [detail, setDetail] = useState<RepoCommitDetail | null>(cachedEntry?.data || null)
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchCommitDetail = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoCommitDetail>(cacheKey)
        if (cached?.data) {
          setDetail(cached.data)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchRepoCommitDetail(owner, repo, sha)
          },
          { name: `repo-commit-${owner}-${repo}-${sha}` }
        )
        setDetail(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [owner, repo, sha, accounts, cacheKey]
  )

  useEffect(() => {
    fetchCommitDetail()
  }, [fetchCommitDetail])

  useEffect(() => {
    setExpandedFiles(new Set())
  }, [sha])

  const toggleFile = useCallback((filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }, [])

  if (loading && !detail) {
    return (
      <div className="repo-commits-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading commit...</p>
        <p className="repo-commits-loading-sub">
          {owner}/{repo}@{sha.slice(0, 7)}
        </p>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="repo-commits-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load commit</p>
        <p className="error-detail">{error}</p>
        <button className="repo-commits-refresh-btn" onClick={() => fetchCommitDetail(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
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
            onClick={() => fetchCommitDetail(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && detail && (
        <div className="repo-commits-loading-indicator" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" />
          <span>Refreshing commit details...</span>
        </div>
      )}

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

      <div className="repo-commit-files">
        {detail.files.map(file => (
          <div
            key={file.filename}
            className={`repo-detail-card repo-commit-file-card ${expandedFiles.has(file.filename) ? 'repo-commit-file-card-expanded' : 'repo-commit-file-card-collapsed'}`}
          >
            <div
              className="repo-commit-file-header repo-commit-file-toggle"
              onClick={() => toggleFile(file.filename)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleFile(file.filename)
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={expandedFiles.has(file.filename)}
            >
              <div className="repo-commit-file-header-main">
                <span className="repo-commit-file-chevron">
                  {expandedFiles.has(file.filename) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </span>
                <span className={`repo-commit-file-status repo-commit-file-status-${file.status}`}>
                  {formatFileStatus(file.status)}
                </span>
                <h3>{file.filename}</h3>
                {file.previousFilename && (
                  <span className="repo-commit-file-previous">from {file.previousFilename}</span>
                )}
              </div>
              <div className="repo-commit-file-header-meta">
                <span className="repo-commit-file-stat repo-commit-file-stat-added">
                  +{file.additions}
                </span>
                <span className="repo-commit-file-stat repo-commit-file-stat-removed">
                  -{file.deletions}
                </span>
                <span className="repo-commit-file-stat">{file.changes} changes</span>
                {file.blobUrl && (
                  <button
                    type="button"
                    className="repo-commit-file-open-btn"
                    onClick={event => {
                      event.stopPropagation()
                      window.shell?.openExternal(file.blobUrl!)
                    }}
                    title="Open file on GitHub"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>

            {expandedFiles.has(file.filename) ? (
              file.patch ? (
                <div className="repo-commit-diff" role="presentation">
                  {(() => {
                    let charOffset = 0
                    return file.patch.split('\n').map(line => {
                      const key = `${file.filename}-line-${charOffset}-${line.slice(0, 20)}`
                      charOffset += line.length + 1
                      return (
                        <Fragment key={key}>
                          <div className={getDiffLineClass(line)}>{line || ' '}</div>
                        </Fragment>
                      )
                    })
                  })()}
                </div>
              ) : (
                <div className="repo-commit-diff-empty">
                  GitHub did not provide a patch preview for this file. This usually means the file
                  is binary, too large, or the change is a pure metadata rename.
                </div>
              )
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
