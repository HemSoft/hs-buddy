import { Copy, ExternalLink, Eye, Play } from 'lucide-react'
import type { RepoIssue } from '../api/github'

export interface IssueContextMenuProps {
  x: number
  y: number
  issue: RepoIssue
  owner: string
  repo: string
  onStartRalphLoop: () => void
  onViewDetails: () => void
  onCopyLink: () => void
  onOpenOnGitHub: () => void
  onClose: () => void
}

export function IssueContextMenu({
  x,
  y,
  issue,
  onStartRalphLoop,
  onViewDetails,
  onCopyLink,
  onOpenOnGitHub,
  onClose,
}: IssueContextMenuProps) {
  const isOpen = issue.state === 'open'

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="context-menu" style={{ top: y, left: x }}>
        <button onClick={onViewDetails}>
          <Eye size={14} />
          View Details
        </button>
        <button onClick={onStartRalphLoop} disabled={!isOpen}>
          <Play size={14} />
          {isOpen ? 'Start Ralph Loop' : 'Issue Closed'}
        </button>
        <button onClick={onCopyLink}>
          <Copy size={14} />
          Copy Link
        </button>
        <button onClick={onOpenOnGitHub}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
    </>
  )
}
