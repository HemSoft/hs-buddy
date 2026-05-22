import { Copy, MessageSquareWarning, RotateCw, Sparkles, Star, ThumbsUp } from 'lucide-react'
import type { PullRequest } from '../../types/pullRequest'

interface PRContextMenuProps {
  x: number
  y: number
  pr: PullRequest
  bookmarkedRepoKeys: Set<string>
  onAIReview: () => void
  onRequestCopilotReview: () => void
  onAddressComments: () => void
  onApprove: () => void
  onCopyLink: () => void
  onBookmark: () => void
  onClose: () => void
}

function hasUnresolvedComments(pr: PullRequest): boolean {
  return (pr.threadsUnaddressed ?? 0) > 0
}

function getAddressCommentsLabel(pr: PullRequest, hasUnresolved: boolean): string {
  return hasUnresolved
    ? `Address Unresolved Comments (${pr.threadsUnaddressed})`
    : 'No Unresolved Comments'
}

function getApproveLabel(pr: PullRequest): string {
  return pr.iApproved ? 'Already Approved' : 'Approve'
}

function getBookmarkState(pr: PullRequest, isBookmarked: boolean) {
  return {
    fill: isBookmarked ? 'currentColor' : 'none',
    label: isBookmarked ? `Unbookmark ${pr.repository}` : `Bookmark ${pr.repository}`,
  }
}

export function PRContextMenu({
  x,
  y,
  pr,
  bookmarkedRepoKeys,
  onAIReview,
  onRequestCopilotReview,
  onAddressComments,
  onApprove,
  onCopyLink,
  onBookmark,
  onClose,
}: PRContextMenuProps) {
  const repoKey = `${pr.org}/${pr.repository}`
  const isBookmarked = bookmarkedRepoKeys.has(repoKey)
  const hasUnresolved = hasUnresolvedComments(pr)
  const bookmarkState = getBookmarkState(pr, isBookmarked)

  return (
    <>
      <div className="pr-context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="pr-context-menu" style={{ top: y, left: x }}>
        <button onClick={onAIReview}>
          <Sparkles size={14} />
          Request AI Review
        </button>
        <button onClick={onRequestCopilotReview}>
          <RotateCw size={14} />
          Request Copilot Review
        </button>
        <button onClick={onAddressComments} disabled={!hasUnresolved}>
          <MessageSquareWarning size={14} />
          {getAddressCommentsLabel(pr, hasUnresolved)}
        </button>
        <button onClick={onApprove} disabled={!!pr.iApproved}>
          <ThumbsUp size={14} />
          {getApproveLabel(pr)}
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onBookmark}>
          <Star size={14} fill={bookmarkState.fill} />
          {bookmarkState.label}
        </button>
      </div>
    </>
  )
}
