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
  reviewStateKnown?: boolean
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

function ApprovalMenuItem({
  youApproved,
  reviewStateKnown,
  onApprove,
}: Pick<PRDetailContextMenuProps, 'youApproved' | 'reviewStateKnown' | 'onApprove'>) {
  const label =
    reviewStateKnown === false
      ? 'Approval Status Unknown'
      : youApproved
        ? 'Already Approved'
        : 'Approve'
  return (
    <button type="button" onClick={onApprove} disabled={reviewStateKnown === false || youApproved}>
      <ThumbsUp size={14} />
      {label}
    </button>
  )
}

function AIReviewProviderItems({ providers }: { providers: AIReviewProviderEntry[] }) {
  return providers.flatMap(provider =>
    provider.id === 'copilot'
      ? []
      : [
          <button
            type="button"
            key={provider.id}
            onClick={provider.onRequest}
            disabled={provider.state !== 'idle'}
          >
            {providerIcon(provider.id)}
            {provider.state === 'monitoring'
              ? `Waiting for ${provider.name}…`
              : provider.state === 'done'
                ? `${provider.name} review complete!`
                : `Request ${provider.name} Review`}
          </button>,
        ]
  )
}

export function PRDetailContextMenu({
  x,
  y,
  youApproved,
  reviewStateKnown,
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
        <AIReviewProviderItems providers={aiReviewProviders} />
        <button type="button" onClick={onStartRalphReview}>
          <RotateCw size={14} />
          Start Ralph PR Review
        </button>
        <ApprovalMenuItem
          youApproved={youApproved}
          reviewStateKnown={reviewStateKnown}
          onApprove={onApprove}
        />
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
