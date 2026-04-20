import { useMemo, useRef } from 'react'
import {
  CheckCircle2,
  Eye,
  GitPullRequest,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRReviewComment, PRReviewSummary, PRReviewThread } from '../api/github'
import { usePRThreadsPanel } from '../hooks/usePRThreadsPanel'
import { ReviewThreadCard } from './pr-threads/ReviewThreadCard'
import { ReviewSummaryCard } from './pr-threads/ReviewSummaryCard'
import { CommentCard } from './pr-threads/CommentCard'
import './PRThreadsPanel.css'

interface PRThreadsPanelProps {
  pr: PRDetailInfo
}

type TimelineEntry =
  | { type: 'thread'; timestamp: string; data: PRReviewThread }
  | { type: 'comment'; timestamp: string; data: PRReviewComment }
  | { type: 'review'; timestamp: string; data: PRReviewSummary }

function buildTimeline(
  threads: PRReviewThread[],
  comments: PRReviewComment[],
  reviews: PRReviewSummary[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const thread of threads) {
    /* v8 ignore start */
    const ts = thread.comments[0]?.createdAt ?? ''
    /* v8 ignore stop */
    if (ts) entries.push({ type: 'thread', timestamp: ts, data: thread })
  }
  for (const comment of comments) {
    const commentTs = comment.updatedAt > comment.createdAt ? comment.updatedAt : comment.createdAt
    /* v8 ignore start */
    if (commentTs) entries.push({ type: 'comment', timestamp: commentTs, data: comment })
    /* v8 ignore stop */
  }
  for (const review of reviews) {
    const reviewTs = review.updatedAt > review.createdAt ? review.updatedAt : review.createdAt
    /* v8 ignore start */
    if (reviewTs) entries.push({ type: 'review', timestamp: reviewTs, data: review })
    /* v8 ignore stop */
  }
  // Reviews come before their child threads/comments when timestamps are within 60s
  // (GitHub creates thread comments moments before the parent review's submittedAt)
  const typeOrder: Record<TimelineEntry['type'], number> = { review: 0, comment: 1, thread: 2 }
  entries.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime()
    const bTime = new Date(b.timestamp).getTime()
    const timeDiff = aTime - bTime
    if (Math.abs(timeDiff) < 60_000) {
      const typeDiff = typeOrder[a.type] - typeOrder[b.type]
      return typeDiff !== 0 ? typeDiff : timeDiff
    }
    return timeDiff
  })
  return entries
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const groups = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const key = formatDateHeader(entry.timestamp)
    const group = groups.get(key)
    if (group) {
      group.push(entry)
    } else {
      groups.set(key, [entry])
    }
  }
  return groups
}

export function PRThreadsPanel({ pr }: PRThreadsPanelProps) {
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const {
    loading,
    error,
    data,
    filter,
    setFilter,
    showResolved,
    setShowResolved,
    commentText,
    setCommentText,
    sendingComment,
    latestReview,
    needsRefresh,
    activeThreads,
    resolvedThreads,
    filteredThreads,
    fetchThreads,
    handleReplyAdded,
    handleResolveToggled,
    handleAddComment,
    handleReactToComment,
    openLatestReview,
    requestReReview,
  } = usePRThreadsPanel(pr)

  const timeline = useMemo(() => {
    if (!data) return []
    const visibleThreads =
      filter === 'all'
        ? filteredThreads.filter(t => !t.isResolved || showResolved)
        : filteredThreads
    // When filtering by thread status, only show threads — comments/reviews are not thread-specific
    const comments = filter === 'all' ? data.issueComments : []
    const reviews = filter === 'all' ? data.reviews : []
    return buildTimeline(visibleThreads, comments, reviews)
  }, [data, filter, filteredThreads, showResolved])

  const dateGroups = useMemo(() => groupByDate(timeline), [timeline])

  if (loading && !data) {
    return (
      <div className="pr-threads-loading">
        <Loader2 size={24} className="spin" />
        <p>Loading conversations…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pr-threads-error">
        <p>Failed to load conversations</p>
        <p className="pr-threads-error-detail">
          {/* v8 ignore start */}
          {error || 'Unknown error'}
          {/* v8 ignore stop */}
        </p>
        <button className="pr-threads-retry" onClick={fetchThreads}>
          Retry
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="pr-threads-loading">
        <Loader2 size={24} className="spin" />
        <p>Loading conversations…</p>
      </div>
    )
  }

  return (
    <div className="pr-threads-container">
      {latestReview && (
        <div
          className={`pr-thread-review-context ${needsRefresh ? 'needs-refresh' : 'up-to-date'}`}
        >
          <div className="pr-thread-review-context-left">
            <Sparkles size={14} />
            <span>
              Last AI review{' '}
              {new Date(latestReview.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            <span className="pr-thread-review-sha">
              {latestReview.reviewedHeadSha
                ? latestReview.reviewedHeadSha.slice(0, 12)
                : 'unknown sha'}
            </span>
            {needsRefresh ? (
              <span className="pr-thread-review-badge">Refresh needed</span>
            ) : (
              <span className="pr-thread-review-badge">Up to date</span>
            )}
          </div>
          <div className="pr-thread-review-context-actions">
            <button className="pr-thread-review-btn" onClick={openLatestReview}>
              Open review
            </button>
            <button className="pr-thread-review-btn" onClick={requestReReview}>
              Re-review
            </button>
          </div>
        </div>
      )}

      {/* Summary bar + filters */}
      <div className="pr-threads-timeline-header">
        <div className="pr-threads-section-title">
          <GitPullRequest size={16} />
          <span>Timeline</span>
          {data.threads.length > 0 && (
            <span className="pr-threads-summary">
              {activeThreads.length > 0 && (
                <span className="pr-threads-active-count">{activeThreads.length} unresolved</span>
              )}
              {resolvedThreads.length > 0 && (
                <span className="pr-threads-resolved-count">
                  <CheckCircle2 size={12} />
                  {resolvedThreads.length} resolved
                </span>
              )}
            </span>
          )}
        </div>

        {data.threads.length > 0 && (
          <div className="pr-threads-toolbar">
            <div className="pr-threads-filters">
              <button
                className={`pr-threads-filter ${filter === 'all' ? 'active' : ''}`}
                /* v8 ignore start */
                onClick={() => setFilter('all')}
                /* v8 ignore stop */
              >
                All ({data.threads.length})
              </button>
              <button
                className={`pr-threads-filter ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                <Eye size={11} />
                Active ({activeThreads.length})
              </button>
              <button
                /* v8 ignore start */
                className={`pr-threads-filter ${filter === 'resolved' ? 'active' : ''}`}
                /* v8 ignore stop */
                onClick={() => setFilter('resolved')}
              >
                <CheckCircle2 size={11} />
                Resolved ({resolvedThreads.length})
              </button>
            </div>
            {resolvedThreads.length > 0 && filter === 'all' && (
              <button
                className="pr-threads-toggle-resolved"
                onClick={() => setShowResolved(!showResolved)}
              >
                {showResolved ? 'Hide' : 'Show'} resolved
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chronological timeline */}
      {timeline.length > 0 ? (
        <div className="pr-timeline">
          {[...dateGroups.entries()].map(([dateLabel, entries]) => (
            <details key={dateLabel} className="pr-timeline-date-group" open>
              <summary className="pr-timeline-date-header">
                <div className="pr-timeline-date-line" />
                <span className="pr-timeline-date-label">{dateLabel}</span>
                <div className="pr-timeline-date-line" />
              </summary>
              <div className="pr-timeline-entries">
                {entries.map(entry => (
                  <div key={`${entry.type}-${entry.data.id}`} className="pr-timeline-entry">
                    <div className="pr-timeline-rail">
                      <div className={`pr-timeline-dot pr-timeline-dot-${entry.type}`} />
                      <div className="pr-timeline-connector" />
                    </div>
                    <div className="pr-timeline-content">
                      <div className="pr-timeline-meta">
                        <span className="pr-timeline-time">{formatTime(entry.timestamp)}</span>
                        <span className="pr-timeline-type-badge">
                          {entry.type === 'thread' ? 'review thread' : entry.type}
                        </span>
                      </div>
                      {entry.type === 'thread' && (
                        <ReviewThreadCard
                          thread={entry.data}
                          pr={pr}
                          onReplyAdded={handleReplyAdded}
                          onResolveToggled={handleResolveToggled}
                          onReactToComment={handleReactToComment}
                        />
                      )}
                      {entry.type === 'comment' && (
                        <CommentCard comment={entry.data} onReact={handleReactToComment} />
                      )}
                      {entry.type === 'review' && <ReviewSummaryCard review={entry.data} />}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="pr-threads-empty-state">
          <MessageCircle size={32} />
          <p>No conversations yet</p>
        </div>
      )}

      <div className="pr-threads-add-comment">
        <div className="pr-threads-add-comment-header">Leave a comment</div>
        <textarea
          ref={commentTextareaRef}
          className="pr-threads-comment-input"
          placeholder="Add a comment…"
          value={commentText}
          /* v8 ignore start */
          onChange={e => setCommentText(e.target.value)}
          /* v8 ignore stop */
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleAddComment()
            }
          }}
          rows={3}
          disabled={sendingComment}
        />
        <div className="pr-threads-comment-actions">
          <span className="thread-reply-hint">Ctrl+Enter to send</span>
          <button
            className="pr-threads-comment-submit"
            onClick={handleAddComment}
            disabled={!commentText.trim() || sendingComment}
          >
            {sendingComment ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}
