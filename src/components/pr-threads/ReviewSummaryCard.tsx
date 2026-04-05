import MarkdownPreview from '@uiw/react-markdown-preview'
import remarkGemoji from 'remark-gemoji'
import { CheckCircle2, MessageCircle, XCircle } from 'lucide-react'
import type { PRReviewSummary } from '../../api/github'
import { formatDistanceToNow } from '../../utils/dateUtils'

function ReviewStateBadge({ state }: { state: string }) {
  switch (state) {
    case 'APPROVED':
      return (
        <span className="review-state-badge review-state-approved">
          <CheckCircle2 size={12} />
          Approved
        </span>
      )
    case 'CHANGES_REQUESTED':
      return (
        <span className="review-state-badge review-state-changes-requested">
          <XCircle size={12} />
          Changes requested
        </span>
      )
    case 'COMMENTED':
      return (
        <span className="review-state-badge review-state-commented">
          <MessageCircle size={12} />
          Reviewed
        </span>
      )
    default:
      return (
        <span className="review-state-badge review-state-commented">
          <MessageCircle size={12} />
          {state.charAt(0) + state.slice(1).toLowerCase()}
        </span>
      )
  }
}

export function ReviewSummaryCard({ review }: { review: PRReviewSummary }) {
  return (
    <div className="thread-comment review-summary-card">
      <div className="thread-comment-avatar-col">
        {review.authorAvatarUrl ? (
          <img
            src={review.authorAvatarUrl}
            alt={review.author}
            className="thread-comment-avatar"
          />
        ) : (
          <div className="thread-comment-avatar-placeholder">
            {review.author.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="thread-comment-content">
        <div className="thread-comment-header">
          <span className="thread-comment-username">{review.author}</span>
          <ReviewStateBadge state={review.state} />
          <span
            className="thread-comment-time"
            title={new Date(review.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(review.createdAt)}
          </span>
          <button
            type="button"
            className="review-summary-link"
            onClick={() => window.shell.openExternal(review.url)}
          >
            View on GitHub
          </button>
        </div>
        <div className="thread-comment-body thread-comment-markdown" data-color-mode="dark">
          <MarkdownPreview
            source={review.body}
            remarkPlugins={[remarkGemoji]}
            style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: '13px' }}
          />
        </div>
      </div>
    </div>
  )
}
