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
import { formatTime } from '../utils/dateUtils'
import { MS_PER_MINUTE } from '../constants'
import { usePRThreadsPanel } from '../hooks/usePRThreadsPanel'
import { modLabel } from '../utils/platform'
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

function latestTimestamp(updatedAt: string, createdAt: string): string {
  return updatedAt > createdAt ? updatedAt : createdAt
}

function collectThreadEntries(threads: PRReviewThread[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const thread of threads) {
    /* v8 ignore start */
    const ts = thread.comments[0]?.createdAt ?? ''
    /* v8 ignore stop */
    if (ts) entries.push({ type: 'thread', timestamp: ts, data: thread })
  }
  return entries
}

function collectCommentEntries(comments: PRReviewComment[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const comment of comments) {
    const ts = latestTimestamp(comment.updatedAt, comment.createdAt)
    /* v8 ignore start */
    if (ts) entries.push({ type: 'comment', timestamp: ts, data: comment })
    /* v8 ignore stop */
  }
  return entries
}

function collectReviewEntries(reviews: PRReviewSummary[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const review of reviews) {
    const ts = latestTimestamp(review.updatedAt, review.createdAt)
    /* v8 ignore start */
    if (ts) entries.push({ type: 'review', timestamp: ts, data: review })
    /* v8 ignore stop */
  }
  return entries
}

const TIMELINE_TYPE_ORDER: Record<TimelineEntry['type'], number> = {
  review: 0,
  comment: 1,
  thread: 2,
}

function sortTimelineEntries(entries: TimelineEntry[]): void {
  // Reviews come before their child threads/comments when timestamps are within 60s
  // (GitHub creates thread comments moments before the parent review's submittedAt)
  entries.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime()
    const bTime = new Date(b.timestamp).getTime()
    const timeDiff = aTime - bTime
    if (Math.abs(timeDiff) < MS_PER_MINUTE) {
      const typeDiff = TIMELINE_TYPE_ORDER[a.type] - TIMELINE_TYPE_ORDER[b.type]
      return typeDiff !== 0 ? typeDiff : timeDiff
    }
    return timeDiff
  })
}

function buildTimeline(
  threads: PRReviewThread[],
  comments: PRReviewComment[],
  reviews: PRReviewSummary[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...collectThreadEntries(threads),
    ...collectCommentEntries(comments),
    ...collectReviewEntries(reviews),
  ]
  sortTimelineEntries(entries)
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

function formatTimeLabel(iso: string): string {
  return formatTime(new Date(iso), { numeric: true })
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

function AIReviewBanner({
  latestReview,
  needsRefresh,
  openLatestReview,
  requestReReview,
}: {
  latestReview: NonNullable<ReturnType<typeof usePRThreadsPanel>['latestReview']>
  needsRefresh: boolean
  openLatestReview: () => void
  requestReReview: () => void
}) {
  return (
    <div className={`pr-thread-review-context ${needsRefresh ? 'needs-refresh' : 'up-to-date'}`}>
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
          {latestReview.reviewedHeadSha ? latestReview.reviewedHeadSha.slice(0, 12) : 'unknown sha'}
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
  )
}

function TimelineEntryContent({
  entry,
  pr,
  handleReplyAdded,
  handleResolveToggled,
  handleReactToComment,
}: {
  entry: TimelineEntry
  pr: PRDetailInfo
  handleReplyAdded: ReturnType<typeof usePRThreadsPanel>['handleReplyAdded']
  handleResolveToggled: ReturnType<typeof usePRThreadsPanel>['handleResolveToggled']
  handleReactToComment: ReturnType<typeof usePRThreadsPanel>['handleReactToComment']
}) {
  switch (entry.type) {
    case 'thread':
      return (
        <ReviewThreadCard
          thread={entry.data}
          pr={pr}
          onReplyAdded={handleReplyAdded}
          onResolveToggled={handleResolveToggled}
          onReactToComment={handleReactToComment}
        />
      )
    case 'comment':
      return <CommentCard comment={entry.data} onReact={handleReactToComment} />
    case 'review':
      return <ReviewSummaryCard review={entry.data} />
  }
}

function filterBtnClass(current: string, target: string): string {
  return `pr-threads-filter ${current === target ? 'active' : ''}`
}

function ThreadsTimelineHeader({
  threads,
  filter,
  setFilter,
  activeThreads,
  resolvedThreads,
  showResolved,
  setShowResolved,
}: {
  threads: PRReviewThread[]
  filter: string
  setFilter: (f: 'all' | 'active' | 'resolved') => void
  activeThreads: PRReviewThread[]
  resolvedThreads: PRReviewThread[]
  showResolved: boolean
  setShowResolved: (v: boolean) => void
}) {
  return (
    <div className="pr-threads-timeline-header">
      <div className="pr-threads-section-title">
        <GitPullRequest size={16} />
        <span>Timeline</span>
        {threads.length > 0 && (
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

      {threads.length > 0 && (
        <div className="pr-threads-toolbar">
          <div className="pr-threads-filters">
            <button
              className={filterBtnClass(filter, 'all')}
              /* v8 ignore start */
              onClick={() => setFilter('all')}
              /* v8 ignore stop */
            >
              All ({threads.length})
            </button>
            <button
              className={filterBtnClass(filter, 'active')}
              onClick={() => setFilter('active')}
            >
              <Eye size={11} />
              Active ({activeThreads.length})
            </button>
            <button
              /* v8 ignore start */
              className={filterBtnClass(filter, 'resolved')}
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
  )
}

function PRCommentForm({
  commentTextareaRef,
  commentText,
  setCommentText,
  sendingComment,
  handleAddComment,
}: {
  commentTextareaRef: React.RefObject<HTMLTextAreaElement | null>
  commentText: string
  setCommentText: (v: string) => void
  sendingComment: boolean
  handleAddComment: () => void
}) {
  return (
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
        <span className="thread-reply-hint">{modLabel}+Enter to send</span>
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
  )
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
          {error}
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
        <AIReviewBanner
          latestReview={latestReview}
          needsRefresh={needsRefresh}
          openLatestReview={openLatestReview}
          requestReReview={requestReReview}
        />
      )}

      <ThreadsTimelineHeader
        threads={data.threads}
        filter={filter}
        setFilter={setFilter}
        activeThreads={activeThreads}
        resolvedThreads={resolvedThreads}
        showResolved={showResolved}
        setShowResolved={setShowResolved}
      />

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
                        <span className="pr-timeline-time">{formatTimeLabel(entry.timestamp)}</span>
                        <span className="pr-timeline-type-badge">
                          {entry.type === 'thread' ? 'review thread' : entry.type}
                        </span>
                      </div>
                      <TimelineEntryContent
                        entry={entry}
                        pr={pr}
                        handleReplyAdded={handleReplyAdded}
                        handleResolveToggled={handleResolveToggled}
                        handleReactToComment={handleReactToComment}
                      />
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

      <PRCommentForm
        commentTextareaRef={commentTextareaRef}
        commentText={commentText}
        setCommentText={setCommentText}
        sendingComment={sendingComment}
        handleAddComment={handleAddComment}
      />
    </div>
  )
}
