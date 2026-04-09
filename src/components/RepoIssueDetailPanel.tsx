import { useCallback, useEffect, useRef, useState } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import remarkGemoji from 'remark-gemoji'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Tag,
  UserRound,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoIssueDetail } from '../api/github'
import { dataCache } from '../services/dataCache'
import { formatDateFull, formatDistanceToNow } from '../utils/dateUtils'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
import './RepoIssueDetailPanel.css'

interface RepoIssueDetailPanelProps {
  owner: string
  repo: string
  issueNumber: number
}

function IssueStateBadge({ state }: { state: string }) {
  const isOpen = state === 'open'
  return (
    <span className={`repo-issue-detail-state ${isOpen ? 'open' : 'closed'}`}>
      {isOpen ? <CircleDot size={13} /> : <CheckCircle2 size={13} />}
      {isOpen ? 'Open' : 'Closed'}
    </span>
  )
}

export function RepoIssueDetailPanel({ owner, repo, issueNumber }: RepoIssueDetailPanelProps) {
  const cacheKey = `repo-issue:${owner}/${repo}/${issueNumber}`
  const cachedEntry = dataCache.get<RepoIssueDetail>(cacheKey)
  const [detail, setDetail] = useState<RepoIssueDetail | null>(cachedEntry?.data || null)
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchIssueDetail = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoIssueDetail>(cacheKey)
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
            return await client.fetchRepoIssueDetail(owner, repo, issueNumber)
          },
          { name: `repo-issue-${owner}-${repo}-${issueNumber}` }
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
    [accounts, cacheKey, issueNumber, owner, repo]
  )

  useEffect(() => {
    fetchIssueDetail()
  }, [fetchIssueDetail])

  if (loading && !detail) {
    return (
      <div className="repo-issue-detail-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading issue…</p>
        <p className="repo-issue-detail-loading-sub">
          {owner}/{repo} #{issueNumber}
        </p>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="repo-issue-detail-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load issue</p>
        <p className="error-detail">{error}</p>
        <button className="repo-issue-detail-refresh" onClick={() => fetchIssueDetail(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (!detail) return null

  return (
    <div className="repo-issue-detail-panel">
      <div className="repo-issue-detail-hero">
        <div className="repo-issue-detail-hero-main">
          <div className="repo-issue-detail-kicker">
            <span className="repo-issue-detail-kicker-slug">
              {owner} / {repo}
            </span>
            <IssueStateBadge state={detail.state} />
          </div>
          <h1>
            #{detail.number} {detail.title}
          </h1>
          <div className="repo-issue-detail-meta-strip">
            <span>
              <UserRound size={13} /> {detail.author}
            </span>
            <span>
              <Clock size={13} /> opened {formatDistanceToNow(detail.createdAt)}
            </span>
            <span>
              <MessageSquare size={13} /> {detail.commentCount} comments
            </span>
            {detail.closedAt && (
              <span>
                <CalendarClock size={13} /> closed {formatDistanceToNow(detail.closedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="repo-issue-detail-hero-actions">
          <button
            className="repo-issue-detail-btn ghost"
            onClick={() => fetchIssueDetail(true)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            className="repo-issue-detail-btn primary"
            onClick={() => window.shell?.openExternal(detail.url)}
          >
            <ExternalLink size={14} />
            Open on GitHub
          </button>
        </div>
      </div>

      <div className="repo-issue-detail-layout">
        <section className="repo-issue-detail-main-card">
          <div className="repo-issue-detail-card-title">Issue Narrative</div>
          {detail.body.trim() ? (
            <div className="repo-issue-detail-markdown" data-color-mode="dark">
              <MarkdownPreview
                source={detail.body}
                remarkPlugins={[remarkGemoji]}
                style={{ backgroundColor: 'transparent', color: 'inherit' }}
              />
            </div>
          ) : (
            <div className="repo-issue-detail-empty-body">
              No description was provided for this issue.
            </div>
          )}
        </section>

        <aside className="repo-issue-detail-sidebar">
          <div className="repo-issue-detail-facts-card">
            <div className="repo-issue-detail-card-title">Issue Facts</div>
            <div className="repo-issue-detail-facts-grid">
              <div className="repo-issue-detail-fact">
                <span className="label">Created</span>
                <span className="value">{formatDateFull(detail.createdAt)}</span>
              </div>
              <div className="repo-issue-detail-fact">
                <span className="label">Updated</span>
                <span className="value">{formatDateFull(detail.updatedAt)}</span>
              </div>
              <div className="repo-issue-detail-fact">
                <span className="label">State reason</span>
                <span className="value">{detail.stateReason || '—'}</span>
              </div>
              <div className="repo-issue-detail-fact">
                <span className="label">Milestone</span>
                <span className="value">{detail.milestone?.title || 'None'}</span>
              </div>
            </div>
          </div>

          <div className="repo-issue-detail-facts-card">
            <div className="repo-issue-detail-card-title">Labels</div>
            {detail.labels.length > 0 ? (
              <div className="repo-issue-detail-labels">
                {detail.labels.map(label => (
                  <span
                    key={label.name}
                    className="repo-issue-detail-label"
                    style={{
                      backgroundColor: `#${label.color}20`,
                      color: `#${label.color}`,
                      borderColor: `#${label.color}40`,
                    }}
                  >
                    <Tag size={10} />
                    {label.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="repo-issue-detail-empty-meta">No labels</div>
            )}
          </div>

          <div className="repo-issue-detail-facts-card">
            <div className="repo-issue-detail-card-title">Assignees</div>
            {detail.assignees.length > 0 ? (
              <div className="repo-issue-detail-assignees">
                {detail.assignees.map(assignee => (
                  <div key={assignee.login} className="repo-issue-detail-assignee">
                    <img src={assignee.avatarUrl} alt={assignee.login} />
                    <span title={assignee.login}>
                      {assignee.name ? `${assignee.name} (${assignee.login})` : assignee.login}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="repo-issue-detail-empty-meta">No assignees</div>
            )}
          </div>
        </aside>
      </div>

      <section className="repo-issue-detail-comments-card">
        <div className="repo-issue-detail-comments-header">
          <div className="repo-issue-detail-card-title">Discussion</div>
          <span className="repo-issue-detail-comments-count">{detail.comments.length} replies</span>
        </div>

        {detail.comments.length === 0 ? (
          <div className="repo-issue-detail-empty-comments">No comments yet.</div>
        ) : (
          <div className="repo-issue-detail-comments-list">
            {detail.comments.map(comment => (
              <article key={comment.id} className="repo-issue-detail-comment">
                <div className="repo-issue-detail-comment-head">
                  <div className="repo-issue-detail-comment-author">
                    {comment.authorAvatarUrl && (
                      <img src={comment.authorAvatarUrl} alt={comment.author} />
                    )}
                    <div>
                      <div className="name">{comment.author}</div>
                      <div
                        className="time"
                        title={formatDateFull(
                          comment.updatedAt > comment.createdAt
                            ? comment.updatedAt
                            : comment.createdAt
                        )}
                      >
                        {formatDistanceToNow(
                          comment.updatedAt > comment.createdAt
                            ? comment.updatedAt
                            : comment.createdAt
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="repo-issue-detail-link-btn"
                    onClick={() => window.shell?.openExternal(comment.url)}
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
                <div
                  className="repo-issue-detail-markdown repo-issue-detail-comment-body"
                  data-color-mode="dark"
                >
                  <MarkdownPreview
                    source={comment.body || '_No comment body provided._'}
                    remarkPlugins={[remarkGemoji]}
                    style={{ backgroundColor: 'transparent', color: 'inherit' }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
