import { Star, GitFork, Eye, CircleDot, GitPullRequest, Code2, GitBranch } from 'lucide-react'
import type { RepoDetail } from '../../api/github'
import { formatSize } from './repoDetailUtils'

interface RepoStatsBarProps {
  detail: RepoDetail
}

export function RepoStatsBar({ detail }: RepoStatsBarProps) {
  return (
    <div className="repo-detail-stats-bar">
      <div className="repo-stat" title="Stars">
        <Star size={14} />
        <span className="repo-stat-value">{detail.stargazersCount.toLocaleString()}</span>
        <span className="repo-stat-label">stars</span>
      </div>
      <div className="repo-stat" title="Forks">
        <GitFork size={14} />
        <span className="repo-stat-value">{detail.forksCount.toLocaleString()}</span>
        <span className="repo-stat-label">forks</span>
      </div>
      <div className="repo-stat" title="Watchers">
        <Eye size={14} />
        <span className="repo-stat-value">{detail.watchersCount.toLocaleString()}</span>
        <span className="repo-stat-label">watching</span>
      </div>
      <div className="repo-stat" title="Open Issues">
        <CircleDot size={14} />
        <span className="repo-stat-value">{detail.openIssuesCount.toLocaleString()}</span>
        <span className="repo-stat-label">issues</span>
      </div>
      {detail.openPRCount > 0 && (
        <div className="repo-stat" title="Open Pull Requests">
          <GitPullRequest size={14} />
          <span className="repo-stat-value">{detail.openPRCount.toLocaleString()}</span>
          <span className="repo-stat-label">PRs</span>
        </div>
      )}
      <div className="repo-stat" title="Repository Size">
        <Code2 size={14} />
        <span className="repo-stat-value">{formatSize(detail.sizeKB)}</span>
      </div>
      <div className="repo-stat" title="Default Branch">
        <GitBranch size={14} />
        <span className="repo-stat-value">{detail.defaultBranch}</span>
      </div>
    </div>
  )
}
