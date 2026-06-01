import {
  Copy,
  ExternalLink,
  MessageSquare,
  Rabbit,
  RefreshCw,
  RotateCw,
  Sparkles,
  ThumbsUp,
} from 'lucide-react'
import type { AIReviewState } from '../hooks/useAIReviewMonitor'

interface AIReviewProviderEntry {
  id: string
  name: string
  state: AIReviewState
  onRequest: () => void
}

interface PRDetailContextMenuProps {
  x: number
  y: number
  youApproved: boolean
  copilotReviewState: string
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  aiReviewProviders?: AIReviewProviderEntry[]
  onRequestCopilotReview: () => void
  onApprove: () => void
  onNudge: () => void
  onRefresh: () => void
  onCopyLink: () => void
  onOpenExternal: () => void
  onStartRalphReview: () => void
  onClose: () => void
}

const EMPTY_AI_REVIEW_PROVIDERS: AIReviewProviderEntry[] = []

function providerIcon(id: string) {
  if (id === 'coderabbit') return <Rabbit size={14} />
  return <Sparkles size={14} />
}

export function PRDetailContextMenu({
  x,
  y,
  youApproved,
  copilotReviewState,
  nudgeState,
  aiReviewProviders = EMPTY_AI_REVIEW_PROVIDERS,
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
        <button
          type="button"
          onClick={onRequestCopilotReview}
          disabled={copilotReviewState !== 'idle'}
        >
          <Sparkles size={14} />
          Request Copilot Review
        </button>
        {aiReviewProviders.flatMap(p =>
          p.id === 'copilot'
            ? []
            : [
                <button
                  type="button"
                  key={p.id}
                  onClick={p.onRequest}
                  disabled={p.state !== 'idle'}
                >
                  {providerIcon(p.id)}
                  {p.state === 'monitoring'
                    ? `Waiting for ${p.name}…`
                    : p.state === 'done'
                      ? `${p.name} review complete!`
                      : `Request ${p.name} Review`}
                </button>,
              ]
        )}
        <button type="button" onClick={onStartRalphReview}>
          <RotateCw size={14} />
          Start Ralph PR Review
        </button>
        <button type="button" onClick={onApprove} disabled={youApproved}>
          <ThumbsUp size={14} />
          {youApproved ? 'Already Approved' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onNudge}
          disabled={nudgeState === 'sending' || nudgeState === 'sent'}
        >
          <MessageSquare size={14} />
          {nudgeState === 'sent' ? 'Nudge Sent' : 'Nudge Author via Slack'}
        </button>
        <div className="context-menu-separator" />
        <button type="button" onClick={onRefresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <button type="button" onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button type="button" onClick={onOpenExternal}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
    </>
  )
}
