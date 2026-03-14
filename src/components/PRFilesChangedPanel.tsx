import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { GitHubClient, type PRFilesChangedSummary } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { dataCache } from '../services/dataCache'
import { formatFileStatus, parseOwnerRepoFromUrl } from '../utils/githubUrl'
import type { PRDetailInfo } from '../utils/prDetailView'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'
import './PRFilesChangedPanel.css'

interface PRFilesChangedPanelProps {
  pr: PRDetailInfo
}

function getDiffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'repo-commit-diff-line repo-commit-diff-line-hunk'
  if (line.startsWith('+')) return 'repo-commit-diff-line repo-commit-diff-line-added'
  if (line.startsWith('-')) return 'repo-commit-diff-line repo-commit-diff-line-removed'
  return 'repo-commit-diff-line'
}

export function PRFilesChangedPanel({ pr }: PRFilesChangedPanelProps) {
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const owner = ownerRepo?.owner ?? null
  const repo = ownerRepo?.repo ?? null
  const cacheKey = owner && repo ? `pr-files:${owner}/${repo}/${pr.id}` : null
  const cachedEntry = cacheKey ? dataCache.get<PRFilesChangedSummary>(cacheKey) : null
  const [detail, setDetail] = useState<PRFilesChangedSummary | null>(cachedEntry?.data || null)
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    setExpandedFiles(new Set())
  }, [pr.id, pr.url])

  const fetchFilesChanged = useCallback(
    async (forceRefresh = false) => {
      if (!owner || !repo) {
        setError('Could not parse owner/repo from PR URL')
        setLoading(false)
        return
      }

      if (!forceRefresh && cacheKey) {
        const cached = dataCache.get<PRFilesChangedSummary>(cacheKey)
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
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchPRFilesChanged(owner, repo, pr.id)
          },
          { name: `pr-files-${pr.repository}-${pr.id}` }
        )

        setDetail(result)
        if (cacheKey) {
          dataCache.set(cacheKey, result)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [accounts, cacheKey, owner, repo, pr.id, pr.repository]
  )

  useEffect(() => {
    fetchFilesChanged()
  }, [fetchFilesChanged])

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
        <p>Loading changed files...</p>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="repo-commits-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load changed files</p>
        <p className="error-detail">{error}</p>
        <button className="repo-commits-refresh-btn" onClick={() => fetchFilesChanged(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (!detail) return null

  return (
    <div className="pr-files-container">
      {loading && detail && (
        <div className="repo-commits-loading-indicator" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" />
          <span>Refreshing changed files...</span>
        </div>
      )}

      <div className="pr-files-summary-grid">
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Files</div>
          <div className="pr-files-summary-value">{detail.files.length}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-added">
          <div className="pr-files-summary-label">Additions</div>
          <div className="pr-files-summary-value">+{detail.additions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-removed">
          <div className="pr-files-summary-label">Deletions</div>
          <div className="pr-files-summary-value">-{detail.deletions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Changes</div>
          <div className="pr-files-summary-value">{detail.changes}</div>
        </div>
      </div>

      <div className="pr-files-toolbar repo-detail-card">
        <div className="pr-files-toolbar-copy">
          <FileCode2 size={16} />
          <span>Files changed</span>
        </div>
        <button className="repo-detail-action-btn" onClick={() => fetchFilesChanged(true)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {detail.files.length === 0 ? (
        <div className="repo-commits-empty">
          <FileCode2 size={28} />
          <p>No changed files were reported for this pull request.</p>
        </div>
      ) : (
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
                        if (file.blobUrl) {
                          window.shell?.openExternal(file.blobUrl)
                        }
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
                    is binary, too large, or the change is a pure rename.
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
