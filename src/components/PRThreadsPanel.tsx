import { useRef } from 'react'
import { CheckCircle2, Eye, FileText, Loader2, MessageCircle, Send, Sparkles } from 'lucide-react'
import type { PRDetailInfo } from '../utils/prDetailView'
import { usePRThreadsPanel } from '../hooks/usePRThreadsPanel'
import { ReviewThreadCard } from './pr-threads/ReviewThreadCard'
import { ReviewSummaryCard } from './pr-threads/ReviewSummaryCard'
import { CommentCard } from './pr-threads/CommentCard'
import './PRThreadsPanel.css'

interface PRThreadsPanelProps {
  pr: PRDetailInfo
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
        <p className="pr-threads-error-detail">{error || 'Unknown error'}</p>
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

      <div className="pr-threads-section-title">
        <MessageCircle size={16} />
        <span>Conversations</span>
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
        <div className="pr-threads-section">
          <div className="pr-threads-toolbar">
            <div className="pr-threads-filters">
              <button
                className={`pr-threads-filter ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
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
                className={`pr-threads-filter ${filter === 'resolved' ? 'active' : ''}`}
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
          <div className="pr-threads-list">
            {filteredThreads
              .filter(t => filter !== 'all' || !t.isResolved || showResolved)
              .map(thread => (
                <ReviewThreadCard
                  key={thread.id}
                  thread={thread}
                  pr={pr}
                  onReplyAdded={handleReplyAdded}
                  onResolveToggled={handleResolveToggled}
                  onReactToComment={handleReactToComment}
                />
              ))}
            {filteredThreads.length === 0 && (
              <div className="pr-threads-empty">No {filter === 'all' ? '' : filter} threads</div>
            )}
          </div>
        </div>
      )}

      {data.issueComments.length > 0 && (
        <details className="pr-threads-section pr-threads-collapsible" open>
          <summary className="pr-threads-comments-title">
            <MessageCircle size={14} />
            {data.issueComments.length} {data.issueComments.length === 1 ? 'comment' : 'comments'}
          </summary>
          <div className="pr-threads-comments">
            {data.issueComments.map(c => (
              <CommentCard key={c.id} comment={c} onReact={handleReactToComment} />
            ))}
          </div>
        </details>
      )}

      {data.reviews.length > 0 && (
        <details className="pr-threads-section pr-threads-collapsible" open>
          <summary className="pr-threads-comments-title">
            <FileText size={14} />
            {data.reviews.length} {data.reviews.length === 1 ? 'review' : 'reviews'}
          </summary>
          <div className="pr-threads-reviews">
            {data.reviews.map(review => (
              <ReviewSummaryCard key={review.id} review={review} />
            ))}
          </div>
        </details>
      )}

      {data.threads.length === 0 &&
        data.issueComments.length === 0 &&
        data.reviews.length === 0 && (
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
          onChange={e => setCommentText(e.target.value)}
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
