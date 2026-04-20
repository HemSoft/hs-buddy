import { GitMerge, GitPullRequest, GitPullRequestClosed } from 'lucide-react'

interface PRStateIconProps {
  state: string
  size?: number
  className?: string
}

export function PRStateIcon({ state, size = 14, className }: PRStateIconProps) {
  switch (state) {
    case 'merged':
      return <GitMerge size={size} className={className ?? 'list-view-status-merged'} />
    case 'closed':
      return <GitPullRequestClosed size={size} className={className ?? 'list-view-status-closed'} />
    default:
      return <GitPullRequest size={size} className={className ?? 'list-view-status-open'} />
  }
}
