import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, ExternalLink, GitCommit, MessageCircle, History, Loader2 } from 'lucide-react'
import { GitHubClient, type PRHistorySummary } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import { formatDistanceToNow } from '../utils/dateUtils'
import './PullRequestHistoryPanel.css'

interface PullRequestHistoryPanelProps {
  pr: PRDetailInfo
  embedded?: boolean
  focus?: 'all' | 'commits'
  onLoaded?: (history: PRHistorySummary) => void
}

function formatDate(date: string | null): string {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match || !match[1] || !match[2]) {
    return null
  }

  return { owner: match[1], repo: match[2] }
}

export function PullRequestHistoryPanel({
  pr,
  embedded = false,
  focus = 'all',
  onLoaded,
}: PullRequestHistoryPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<PRHistorySummary | null>(null)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) {
        throw new Error('Could not parse owner/repo from PR URL')
      }

      const result = await enqueueRef.current(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRHistory(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-history-${pr.repository}-${pr.id}` }
      )

      setHistory(result)
      onLoaded?.(result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accounts, pr.id, pr.repository, pr.url, onLoaded])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  if (loading) {
    return (
      <div className="pr-history-loading">
        <Loader2 size={28} className="spin" />
        <p>Loading PR history…</p>
      </div>
    )
  }

  if (error || !history) {
    return (
      <div className="pr-history-error">
        <p className="error-message">Failed to load PR history</p>
        <p className="error-detail">{error || 'Unknown error'}</p>
        <button className="pr-history-retry" onClick={fetchHistory}>Retry</button>
      </div>
    )
  }

  const timeline = history.timeline ?? []
  const commitTimeline = timeline.filter(event => event.type === 'commit')

  return (
    <div className={`pr-history-container ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="pr-history-header">
          <div className="pr-history-title-wrap">
            <h2 className="pr-history-title">
              <History size={18} />
              PR History
            </h2>
            <div className="pr-history-subtitle">
              <span>{pr.org || pr.source}</span>
              <span className="pr-history-dot">·</span>
              <span>{pr.repository}</span>
              <span className="pr-history-dot">·</span>
              <span>#{pr.id}</span>
            </div>
          </div>
          <button className="pr-history-open" onClick={() => window.shell.openExternal(pr.url)}>
            <ExternalLink size={14} />
            Open PR
          </button>
        </div>
      )}
      {embedded && (
        <div className="pr-history-inline-title">
          <History size={16} />
          PR History
        </div>
      )}

      {focus === 'all' && (
        <>
          <div className="pr-history-grid">
            <div className="pr-history-card">
              <div className="label">Created</div>
              <div className="value">{formatDate(history.createdAt)}</div>
            </div>
            <div className="pr-history-card">
              <div className="label">Last Updated</div>
              <div className="value">{formatDate(history.updatedAt)}</div>
            </div>
            <div className="pr-history-card">
              <div className="label">Merged</div>
              <div className="value">{formatDate(history.mergedAt)}</div>
            </div>
          </div>

          <div className="pr-history-metrics">
            <div className="metric-row">
              <span className="metric-label"><GitCommit size={14} /> Commits</span>
              <span className="metric-value">{history.commitCount}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label"><MessageCircle size={14} /> Comments (Total)</span>
              <span className="metric-value">{history.totalComments}</span>
            </div>
            <div className="metric-row nested">
              <span className="metric-label">Issue comments</span>
              <span className="metric-value">{history.issueCommentCount}</span>
            </div>
            <div className="metric-row nested">
              <span className="metric-label">Review comments</span>
              <span className="metric-value">{history.reviewCommentCount}</span>
            </div>
          </div>

          <div className="pr-history-thread-status">
            <h3>Review Thread Status</h3>
            <div className="thread-grid">
              <div className="thread-card">
                <div className="thread-label">Total</div>
                <div className="thread-value">{history.threadsTotal}</div>
              </div>
              <div className="thread-card">
                <div className="thread-label">Outdated</div>
                <div className="thread-value">{history.threadsOutdated}</div>
              </div>
              <div className="thread-card">
                <div className="thread-label">Addressed</div>
                <div className="thread-value">{history.threadsAddressed}</div>
              </div>
              <div className="thread-card">
                <div className="thread-label">Unaddressed</div>
                <div className="thread-value">{history.threadsUnaddressed}</div>
              </div>
            </div>
          </div>

          <div className="pr-history-reviewers">
            <h3>Assigned Reviewers</h3>
            {history.reviewers.length === 0 ? (
              <div className="pr-history-empty">No assigned reviewers</div>
            ) : (
              <div className="reviewer-list">
                {history.reviewers.map(reviewer => (
                  <div key={reviewer.login} className="reviewer-item">
                    <div className="reviewer-left">
                      {reviewer.avatarUrl ? (
                        <img src={reviewer.avatarUrl} alt={reviewer.login} className="reviewer-avatar" />
                      ) : (
                        <div className="reviewer-avatar reviewer-avatar-fallback">
                          {reviewer.login.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="reviewer-name">{reviewer.login}</span>
                    </div>
                    <div className="reviewer-right">
                      <span className={`reviewer-status reviewer-status-${reviewer.status}`}>
                        {reviewer.status}
                      </span>
                      {reviewer.updatedAt && (
                        <span className="reviewer-time">{formatDistanceToNow(reviewer.updatedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {focus === 'commits' && (
        <div className="pr-history-metrics">
          <div className="metric-row">
            <span className="metric-label"><GitCommit size={14} /> Commits</span>
            <span className="metric-value">{history.commitCount}</span>
          </div>
        </div>
      )}

      <div className="pr-history-timeline">
        <h3>{focus === 'commits' ? 'Commit Timeline' : 'Activity Timeline'}</h3>
        {(focus === 'commits' ? commitTimeline : timeline).length === 0 ? (
          <div className="pr-history-empty">No timeline events</div>
        ) : (
          <div className="timeline-list">
            {(focus === 'commits' ? commitTimeline : timeline).map(event => (
              <div key={event.id} className="timeline-item">
                <div className="timeline-meta">
                  <span className="timeline-type">{event.type}</span>
                  <span className="timeline-dot">•</span>
                  <span className="timeline-author">{event.author}</span>
                  <span className="timeline-dot">•</span>
                  <span className="timeline-time" title={formatDate(event.occurredAt)}>
                    {formatDistanceToNow(event.occurredAt)}
                  </span>
                </div>
                <div className="timeline-summary">
                  {event.url ? (
                    <a
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        if (event.url) {
                          window.shell.openExternal(event.url)
                        }
                      }}
                    >
                      {event.summary}
                    </a>
                  ) : (
                    event.summary
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {focus === 'all' && (
        <div className="pr-history-footer">
          <Clock size={13} />
          Thread status is derived from GitHub review thread resolution/outdated state.
        </div>
      )}
    </div>
  )
}
