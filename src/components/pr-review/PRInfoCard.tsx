import { GitPullRequest, User, ExternalLink } from 'lucide-react'

interface PRInfoCardProps {
  prTitle: string
  org: string
  repo: string
  prNumber: number
  author: string
  prUrl: string
}

export function PRInfoCard({ prTitle, org, repo, prNumber, author, prUrl }: PRInfoCardProps) {
  return (
    <div className="pr-review-pr-card">
      <div className="pr-review-pr-header">
        <GitPullRequest size={16} />
        <span className="pr-review-pr-title">{prTitle}</span>
      </div>
      <div className="pr-review-pr-meta">
        <span className="pr-review-pr-repo">
          {org}/{repo}
        </span>
        <span className="pr-review-pr-number">#{prNumber}</span>
        <span className="pr-review-pr-author">
          <User size={12} />
          {author}
        </span>
        <a
          className="pr-review-pr-link"
          onClick={e => {
            e.preventDefault()
            window.shell?.openExternal(prUrl)
          }}
          title="Open PR in browser"
        >
          <ExternalLink size={12} />
          View PR
        </a>
      </div>
    </div>
  )
}
