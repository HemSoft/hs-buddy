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

function getUnresolvedLabel(pr: PullRequest, hasUnresolved: boolean): string {
  if (hasUnresolved) {
    return `Address Unresolved Comments (${pr.threadsUnaddressed})`
  }
  return 'No Unresolved Comments'
}

function getBookmarkLabel(pr: PullRequest, isBookmarked: boolean): string {
  if (isBookmarked) {
    return `Unbookmark ${pr.repository}`
  }
  return `Bookmark ${pr.repository}`
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
  const unresolvedCount = pr.threadsUnaddressed ?? 0
  const hasUnresolved = unresolvedCount > 0

  return (
    <>
      <div className="pr-context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="pr-context-menu" style={{ top: y, left: x }}>
        <button type="button" onClick={onAIReview}>
          <Sparkles size={14} />
          Request AI Review
        </button>
        <button type="button" onClick={onRequestCopilotReview}>
          <RotateCw size={14} />
          Request Copilot Review
        </button>
        <button type="button" onClick={onAddressComments} disabled={!hasUnresolved}>
          <MessageSquareWarning size={14} />
          {getUnresolvedLabel(pr, hasUnresolved)}
        </button>
        <button type="button" onClick={onApprove} disabled={!!pr.iApproved}>
          <ThumbsUp size={14} />
          {pr.iApproved ? 'Already Approved' : 'Approve'}
        </button>
        <button type="button" onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button type="button" onClick={onBookmark}>
          <Star size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
          {getBookmarkLabel(pr, isBookmarked)}
        </button>
      </div>
    </>
  )
}
