import { GitMerge, GitPullRequest, GitPullRequestClosed } from 'lucide-react'

interface PRStateIconProps {
  state: string
  size?: number
  className?: string
}

const PR_STATE_ICONS = {
  merged: { Icon: GitMerge, defaultClass: 'list-view-status-merged' },
  closed: { Icon: GitPullRequestClosed, defaultClass: 'list-view-status-closed' },
} as const

const PR_STATE_DEFAULT = { Icon: GitPullRequest, defaultClass: 'list-view-status-open' } as const

export function PRStateIcon({ state, size = 14, className }: PRStateIconProps) {
  const config = Object.prototype.hasOwnProperty.call(PR_STATE_ICONS, state)
    ? PR_STATE_ICONS[state as keyof typeof PR_STATE_ICONS]
    : PR_STATE_DEFAULT
  return <config.Icon size={size} className={className ?? config.defaultClass} />
}
