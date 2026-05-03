import {
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  RotateCw,
  Sparkles,
  ThumbsUp,
} from 'lucide-react'

interface PRDetailContextMenuProps {
  x: number
  y: number
  youApproved: boolean
  copilotReviewState: string
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  onRequestCopilotReview: () => void
  onApprove: () => void
  onNudge: () => void
  onRefresh: () => void
  onCopyLink: () => void
  onOpenExternal: () => void
  onStartRalphReview: () => void
  onClose: () => void
}

export function PRDetailContextMenu({
  x,
  y,
  youApproved,
  copilotReviewState,
  nudgeState,
  onRequestCopilotReview,
  onApprove,
  onNudge,
  onRefresh,
  onCopyLink,
  onOpenExternal,
  onStartRalphReview,
  onClose,
}: PRDetailContextMenuProps) {
  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="context-menu" style={{ top: y, left: x }}>
        <button onClick={onRequestCopilotReview} disabled={copilotReviewState !== 'idle'}>
          <Sparkles size={14} />
          Request Copilot Review
        </button>
        <button onClick={onStartRalphReview}>
          <RotateCw size={14} />
          Start Ralph PR Review
        </button>
        <button onClick={onApprove} disabled={youApproved}>
          <ThumbsUp size={14} />
          {youApproved ? 'Already Approved' : 'Approve'}
        </button>
        <button onClick={onNudge} disabled={nudgeState === 'sending' || nudgeState === 'sent'}>
          <MessageSquare size={14} />
          {nudgeState === 'sent' ? 'Nudge Sent' : 'Nudge Author via Slack'}
        </button>
        <div className="context-menu-separator" />
        <button onClick={onRefresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onOpenExternal}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
    </>
  )
}
