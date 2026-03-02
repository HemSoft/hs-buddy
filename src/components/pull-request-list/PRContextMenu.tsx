import { Copy, Sparkles, Star, ThumbsUp } from 'lucide-react'
import type { PullRequest } from '../../types/pullRequest'

interface PRContextMenuProps {
  x: number
  y: number
  pr: PullRequest
  bookmarkedRepoKeys: Set<string>
  onAIReview: () => void
  onApprove: () => void
  onCopyLink: () => void
  onBookmark: () => void
  onClose: () => void
}

export function PRContextMenu({
  x,
  y,
  pr,
  bookmarkedRepoKeys,
  onAIReview,
  onApprove,
  onCopyLink,
  onBookmark,
  onClose,
}: PRContextMenuProps) {
  const repoKey = `${pr.org}/${pr.repository}`
  const isBookmarked = bookmarkedRepoKeys.has(repoKey)

  return (
    <>
      <div className="pr-context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="pr-context-menu" style={{ top: y, left: x }}>
        <button onClick={onAIReview}>
          <Sparkles size={14} />
          Request AI Review
        </button>
        <button onClick={onApprove} disabled={!!pr.iApproved}>
          <ThumbsUp size={14} />
          {pr.iApproved ? 'Already Approved' : 'Approve'}
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onBookmark}>
          <Star size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
          {isBookmarked ? `Unbookmark ${pr.repository}` : `Bookmark ${pr.repository}`}
        </button>
      </div>
    </>
  )
}
