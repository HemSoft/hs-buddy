import {
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  ThumbsUp,
  XCircle,
} from 'lucide-react'
import type { PullRequest } from '../../types/pullRequest'
import { formatDistanceToNow } from '../../utils/dateUtils'

interface PRItemProps {
  pr: PullRequest
  mode: string
  approving: string | null
  onApprove: (pr: PullRequest) => Promise<void> | void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onOpen: (url: string) => void
}

export function PRItem({ pr, mode, approving, onApprove, onContextMenu, onOpen }: PRItemProps) {
  const approveKey = `${pr.repository}-${pr.id}`
  const isApproving = approving === approveKey

  return (
    <div
      className="pr-item"
      onClick={() => onOpen(pr.url)}
      onContextMenu={e => onContextMenu(e, pr)}
      role="link"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(pr.url)
        }
      }}
    >
      {isApproving && (
        <div className="pr-item-approving-overlay">
          <Loader2 size={14} className="spin" /> Approving…
        </div>
      )}
      <div className="pr-item-header">
        <div className="pr-title-row">
          <GitPullRequest size={16} className="pr-icon" />
          <div className="pr-title">
            {pr.title}
            <ExternalLink size={14} className="external-link-icon" />
          </div>
        </div>
        <div className="pr-meta">
          {pr.orgAvatarUrl ? (
            <img
              src={pr.orgAvatarUrl}
              alt={pr.org || pr.source}
              className="pr-org-avatar"
              title={pr.org}
            />
          ) : (
            <span className="pr-source">{pr.source === 'GitHub' ? 'GH' : 'BB'}</span>
          )}
          <span className="pr-repo">{pr.repository}</span>
          <span className="pr-number">#{pr.id}</span>
          <span className="pr-author">
            {pr.authorAvatarUrl && (
              <img src={pr.authorAvatarUrl} alt={pr.author} className="pr-author-avatar" />
            )}
            {pr.author}
          </span>
        </div>
        {pr.baseBranch && pr.headBranch && (
          <div className="pr-branch-flow">
            <GitBranch size={12} />
            <span>
              into <strong>{pr.baseBranch}</strong> from <strong>{pr.headBranch}</strong>
            </span>
          </div>
        )}
      </div>
      <div className="pr-item-footer">
        <div className="pr-approvals">
          {pr.iApproved && <Check size={14} className="approved-icon" />}
          <span>
            {pr.approvalCount}/{pr.assigneeCount > 0 ? pr.assigneeCount : '?'} approvals
          </span>
        </div>
        {pr.threadsAddressed != null && pr.threadsUnaddressed != null && (
          <div className="pr-thread-status">
            <span className="pr-thread-badge resolved" title="Resolved review threads">
              <CheckCircle2 size={13} />
              {pr.threadsAddressed}
            </span>
            <span className="pr-thread-badge unresolved" title="Unresolved review threads">
              <XCircle size={13} />
              {pr.threadsUnaddressed}
            </span>
          </div>
        )}
        <button
          className="pr-approve-btn"
          onClick={async e => {
            e.stopPropagation()
            await onApprove(pr)
          }}
          disabled={pr.iApproved || isApproving}
          title={pr.iApproved ? 'Already approved by you' : 'Approve PR'}
        >
          {isApproving ? <Loader2 size={13} className="spin" /> : <ThumbsUp size={13} />}
          {pr.iApproved ? 'Approved' : 'Approve'}
        </button>
        <div className="pr-date">
          <Clock size={14} />
          <span>
            {formatDistanceToNow(
              mode === 'recently-merged'
                ? pr.date || pr.created || Date.now()
                : pr.created || Date.now()
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
