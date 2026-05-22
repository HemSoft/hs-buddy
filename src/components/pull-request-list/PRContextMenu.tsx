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

function getPRContextMenuState(pr: PullRequest, isBookmarked: boolean) {
  const hasUnresolved = (pr.threadsUnaddressed ?? 0) > 0
  return {
    hasUnresolved,
    addressLabel: hasUnresolved
      ? `Address Unresolved Comments (${pr.threadsUnaddressed})`
      : 'No Unresolved Comments',
    approveLabel: pr.iApproved ? 'Already Approved' : 'Approve',
    bookmarkLabel: isBookmarked ? `Unbookmark ${pr.repository}` : `Bookmark ${pr.repository}`,
    bookmarkFill: isBookmarked ? 'currentColor' : 'none',
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
  const menuState = getPRContextMenuState(pr, isBookmarked)

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
        <button onClick={onAddressComments} disabled={!menuState.hasUnresolved}>
          <MessageSquareWarning size={14} />
          {menuState.addressLabel}
        </button>
        <button onClick={onApprove} disabled={!!pr.iApproved}>
          <ThumbsUp size={14} />
          {menuState.approveLabel}
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onBookmark}>
          <Star size={14} fill={menuState.bookmarkFill} />
          {menuState.bookmarkLabel}
        </button>
      </div>
    </>
  )
}
