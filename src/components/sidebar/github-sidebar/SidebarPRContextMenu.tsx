import { ExternalLink, Copy, Sparkles, Star, ThumbsUp, Loader2 } from 'lucide-react'
import type { PullRequest } from '../../../types/pullRequest'

interface SidebarPRContextMenuProps {
  pr: PullRequest
  x: number
  y: number
  approvingPrKeys: Set<string>
  bookmarkedRepoKeys: Set<string>
  onOpen: () => void
  onCopyLink: () => void
  onAIReview: () => void
  onApprove: () => Promise<void>
  onBookmark: () => void
  onClose: () => void
}

function getApproveLabel(iApproved: boolean, isApproving: boolean): string {
  if (iApproved) return 'Already Approved'
  return isApproving ? 'Approving…' : 'Approve'
}

function shouldDisableApprove(iApproved: boolean, isApproving: boolean): boolean {
  return iApproved || isApproving
}

function getSidebarBookmarkState(isBookmarked: boolean, repository: string) {
  return {
    fill: isBookmarked ? 'currentColor' : 'none',
    label: isBookmarked ? `Unbookmark ${repository}` : `Bookmark ${repository}`,
  }
}

export function SidebarPRContextMenu({
  pr,
  x,
  y,
  approvingPrKeys,
  bookmarkedRepoKeys,
  onOpen,
  onCopyLink,
  onAIReview,
  onApprove,
  onBookmark,
  onClose,
}: SidebarPRContextMenuProps) {
  const prKey = `${pr.source}-${pr.repository}-${pr.id}`
  const isApproving = approvingPrKeys.has(prKey)
  const isBookmarked = bookmarkedRepoKeys.has(`${pr.org || ''}/${pr.repository}`)
  const bookmarkState = getSidebarBookmarkState(isBookmarked, pr.repository)

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="context-menu" style={{ top: y, left: x }}>
        <button onClick={onOpen}>
          <ExternalLink size={14} />
          Open Pull Request
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onAIReview}>
          <Sparkles size={14} />
          Request AI Review
        </button>
        <button onClick={onApprove} disabled={shouldDisableApprove(!!pr.iApproved, isApproving)}>
          {isApproving ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />}
          {getApproveLabel(!!pr.iApproved, isApproving)}
        </button>
        <button onClick={onBookmark}>
          <Star size={14} fill={bookmarkState.fill} />
          {bookmarkState.label}
        </button>
      </div>
    </>
  )
}
